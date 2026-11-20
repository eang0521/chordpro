import type { PDFFont } from 'pdf-lib';
import type { ArrangementEntry, KeyName, SongCredits } from '../types';
import type { BlockMap } from './arrangement';
import { PAGE_FIT_SLACK_PT, fitChartSpacing, layoutChartItems } from './chartLayout';
import { capoShapeKey, chartSections, isChordOnly, keyHeaderText, pageLabelText, withShortLabels } from './chordChart';
import { fetchFontFile, getChordFontOption, loadChordFont } from './chordFonts';
import { creditLines } from './credits';
import type { PrintOptions, TextMeasure } from './pageLayout';
import {
  CHORD_LINE_PT,
  CREDIT_BOTTOM_TWIPS,
  LYRIC_LINE_PT,
  LYRIC_SIZE_PT,
  MARGIN_SIDE_TWIPS,
  TITLE_KEY_GAP_PT,
  collapsesVerseChords,
  creditFooter,
  labelColumnTwips,
  measureInFont,
  pageGeometry,
  titleSizePt,
} from './pageLayout';
import { paginateByHeight } from './pagination';

const pt = (twips: number) => twips / 20;
const MARGIN_SIDE = pt(MARGIN_SIDE_TWIPS);

// For the system fonts, the PDF's built-in fonts with the same metrics (Helvetica = Arial,
// Times = Times New Roman). Consolas has no built-in twin, so it prints in Courier. Bundled fonts
// (like Atkinson Hyperlegible) are embedded from their own files instead.
const PDF_FONTS: Record<string, { regular: string; bold: string; italic: string }> = {
  sans: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' },
  serif: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic' },
  mono: { regular: 'Courier', bold: 'Courier-Bold', italic: 'Courier-Oblique' },
};

/** Baseline of text set in a line box, measured down from the box's top (like CSS centering the
 * font in its line height, with the ascent taken as 80% of the size). */
function baselineIn(boxTop: number, boxHeight: number, size: number): number {
  return boxTop + (boxHeight - size) / 2 + size * 0.8;
}

/** One song's chart, as printed: its key, font and line spacing (1.0 = normal). */
export interface PdfSong {
  title: string;
  key: KeyName;
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
  fontId: string;
  /** The song's own line spacing, used unless the print options fit it to the page. */
  lineSpacing: number;
  credits?: SongCredits;
  /** A guitarist's capo: the chart shows the chord shapes they play (see keyHeaderText). */
  capo?: number;
  /** Full or half sheet (laid out larger, then shrunk to fit), whether a half sheet collapses the
   * verse chords, fitting to the page, and two half sheets per landscape page. A full sheet at
   * the song's own spacing when unset. */
  printOptions?: PrintOptions;
}

type PdfStyle = '' | 'bold' | 'italic';
type PdfLib = typeof import('pdf-lib');
type PdfDocument = Awaited<ReturnType<PdfLib['PDFDocument']['create']>>;

/**
 * Builds a downloadable PDF chord chart with the same page size, margins, type sizes and line
 * heights as the Word export, keeping each song section together on a page. Unlike the .docx,
 * a PDF carries its fonts with it, so it prints the same on any device. `lineSpacing` scales
 * every line height and gap (1.0 = normal). The writers and copyright go at the foot of every page.
 */
export async function generatePdf(
  title: string,
  key: KeyName,
  blocks: BlockMap,
  arrangement: ArrangementEntry[],
  fontId: string,
  lineSpacing = 1,
  credits?: SongCredits,
  capo = 0,
  printOptions?: PrintOptions,
): Promise<Blob> {
  return generateSongsPdf(title, [{ title, key, blocks, arrangement, fontId, lineSpacing, credits, capo, printOptions }]);
}

/**
 * Several songs' charts in one PDF (a set), one after another, each starting on a new page and
 * laid out exactly as it would be on its own. On a half sheet printed two-up, the half pages go
 * two to a landscape letter sheet (see `twoUp`). A set printed double-sided on full sheets gets
 * blank pages so it opens like a book (see `bookSlots`).
 */
export async function generateSongsPdf(documentTitle: string, songs: PdfSong[]): Promise<Blob> {
  // Loaded on demand, like the docx package — most sessions never export a PDF.
  const [pdfLib, { default: fontkit }] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]);
  const doc = await pdfLib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(documentTitle || 'Untitled');

  // Each font is embedded once, however many songs use it.
  const embedded = new Map<string, Promise<Record<PdfStyle, PDFFont>>>();
  const fontsFor = (fontId: string) => {
    if (!embedded.has(fontId)) embedded.set(fontId, embedFonts(doc, fontId));
    return embedded.get(fontId)!;
  };
  const pageCounts: number[] = [];
  for (const song of songs) {
    pageCounts.push(await addSongPages(doc, pdfLib, await fontsFor(song.fontId), song));
  }

  const twoUpPages = songs.length > 0 && songs.every((s) => s.printOptions?.paper === 'half' && s.printOptions.twoUp);
  const doubleSided = songs.length > 0 && songs.every((s) => s.printOptions?.paper === 'letter' && s.printOptions.doubleSided);
  if (doubleSided) {
    const slots = bookSlots(pageCounts, true);
    // An even number of pages, so every sheet has a front and a back.
    if (slots.length % 2 === 1) slots.push(null);
    // In order, so each blank lands at its final place.
    slots.forEach((slot, i) => {
      if (slot === null) doc.insertPage(i, [LETTER_WIDTH, LETTER_HEIGHT]);
    });
  }
  const out = twoUpPages ? await twoUp(pdfLib, doc, pageCounts, documentTitle) : doc;
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

// A letter page, in points; turned landscape, it takes two 5.5 x 8.5in half pages side by side.
const LETTER_WIDTH = 8.5 * 72;
const LETTER_HEIGHT = 11 * 72;
const SHEET_WIDTH = LETTER_HEIGHT;
const SHEET_HEIGHT = LETTER_WIDTH;

/**
 * Where each page goes when pages are seen two at a time, side by side (an open book, or two half
 * sheets on one landscape page): a page index, or null for a blank. A song longer than a page
 * starts on a left-hand page, so all of it is open at once. The blank that takes goes before the
 * one-page song just before it, when there is one, so that song sits on the right facing the
 * blank. `firstIsRight`: the first page is on its own on the right, like a book's front page.
 * Songs A (2 pages), B, C, D (1 each) and E (2) as a book: blank A A B C blank D E E.
 */
export function bookSlots(pageCounts: number[], firstIsRight: boolean): (number | null)[] {
  const slots: (number | null)[] = [];
  const isRight = (slot: number) => (slot % 2 === 0) === firstIsRight;
  let next = 0;
  // Where the song just placed went, when it was a single page.
  let singleAt = -1;
  pageCounts.forEach((count) => {
    if (count > 1 && isRight(slots.length)) {
      if (singleAt >= 0 && singleAt === slots.length - 1) slots.splice(singleAt, 0, null);
      else slots.push(null);
    }
    singleAt = count === 1 ? slots.length : -1;
    for (let i = 0; i < count; i++) slots.push(next++);
  });
  return slots;
}

/**
 * Two half pages to each landscape letter sheet, left then right, to print and cut in half. A
 * song more than a page long starts on a left half, so its pages sit side by side (see
 * bookSlots).
 */
async function twoUp(pdfLib: PdfLib, halves: PdfDocument, pageCounts: number[], title: string): Promise<PdfDocument> {
  const out = await pdfLib.PDFDocument.create();
  out.setTitle(title || 'Untitled');
  // Saved first: subset fonts are only finished when the document is saved, and embedding the
  // pages before that draws garbled text.
  const embedded = await out.embedPdf(await halves.save(), halves.getPageIndices());
  // Each half of each sheet in turn: a half page's index, or null to leave that half blank.
  const slots = bookSlots(pageCounts, false);
  for (let s = 0; s < slots.length; s += 2) {
    const sheet = out.addPage([SHEET_WIDTH, SHEET_HEIGHT]);
    [slots[s], slots[s + 1]].forEach((index, side) => {
      if (index === null || index === undefined) return;
      sheet.drawPage(embedded[index], { x: (side * SHEET_WIDTH) / 2, y: 0 });
    });
  }
  return out;
}

async function embedFonts(doc: PdfDocument, fontId: string): Promise<Record<PdfStyle, PDFFont>> {
  const option = getChordFontOption(fontId);
  const files = option.files;
  const sources = files
    ? await Promise.all([files.regular, files.bold, files.italic].map(fetchFontFile))
    : [PDF_FONTS[option.id].regular, PDF_FONTS[option.id].bold, PDF_FONTS[option.id].italic];
  // Subsetting keeps only the characters the chart uses, so embedding stays small.
  const [regular, bold, italic] = await Promise.all(sources.map((src) => doc.embedFont(src, { subset: true })));
  return { '': regular, bold, italic };
}

/** Lays one song out and adds its pages to the end of `doc`. Returns how many it added. */
async function addSongPages(
  doc: PdfDocument,
  { rgb }: PdfLib,
  fonts: Record<PdfStyle, PDFFont>,
  { title, key: playedKey, blocks, arrangement, fontId, lineSpacing: ownSpacing, credits, capo = 0, printOptions }: PdfSong,
): Promise<number> {
  const option = getChordFontOption(fontId);

  // A font only covers some characters (the built-in ones just Western European), so swap
  // anything else for a close stand-in rather than failing the whole export.
  const supported = new Set(fonts[''].getCharacterSet());
  const clean = (text: string) =>
    [...text.replace(/♯/g, '#').replace(/♭/g, 'b')]
      .map((c) => (supported.has(c.codePointAt(0)!) ? c : '?'))
      .join('');
  const measure: TextMeasure = (text, sizePt, style) => fonts[style].widthOfTextAtSize(clean(text), sizePt);

  // With a capo, the chords are spelled as the shapes the guitarist plays.
  const key = capoShapeKey(playedKey, capo);
  const paper = printOptions?.paper ?? 'letter';
  const geometry = pageGeometry(paper);
  const collapsed = chartSections(blocks, arrangement, key, !!printOptions && collapsesVerseChords(printOptions)).sections;
  const sections = geometry.shortLabels ? withShortLabels(collapsed) : collapsed;
  const MARGIN_TOP = pt(geometry.marginTopTwips);
  const creditSize = geometry.creditSizePt;
  const creditLine = geometry.creditLinePt;
  const PAGE_WIDTH = pt(geometry.widthTwips);
  const PAGE_HEIGHT = pt(geometry.heightTwips);
  const scale = geometry.scale;
  // Anything that decides how many lines the chart takes — where lyric lines wrap, the label
  // column's width, how the credits break — is measured the way the on-screen chart (and the Word
  // export) measure it: the browser's text widths include kerning, which the PDF font's don't, so
  // the two can differ by a point or so per line. That's enough to wrap one more line in the PDF
  // than Fit to page counted and spill onto another page. The PDF's own widths still place the
  // chords and centre the text, so everything lines up with what's drawn.
  await loadChordFont(option);
  const pageMeasure = measureInFont(option.wordFont);
  const labelCol = pt(labelColumnTwips(sections.map((s) => s.label), pageMeasure, geometry.minLabelColumnTwips));
  const lyricWidth = pt(geometry.contentWidthTwips) - labelCol;
  const footer = creditFooter(creditLines(credits), pageMeasure, geometry);
  const keyText = keyHeaderText(sections, key, capo);
  // On a half sheet the key ends the title line, so the title leaves room for it.
  const titleKey = geometry.keyOnTitleLine ? keyText : null;
  const titleSize = titleSizePt(title, pageMeasure, geometry, titleKey ? TITLE_KEY_GAP_PT + pageMeasure(titleKey, geometry.keySizePt, 'italic') : 0);
  const contentHeight = PAGE_HEIGHT - MARGIN_TOP - pt(footer.marginBottomTwips);
  const footerTop = PAGE_HEIGHT - pt(CREDIT_BOTTOM_TWIPS) - footer.lines.length * creditLine;
  const titleHeight = geometry.titleLinePt + geometry.titleGapPt;
  // Fit to page: the roomiest spacing that fits, worked out the same way as the preview's.
  const atOne = printOptions?.fitToPage ? layoutChartItems(sections, measure, pageMeasure, lyricWidth, 1, titleHeight) : null;
  const lineSpacing = atOne ? fitChartSpacing(atOne.items, atOne.groups, contentHeight).spacing : ownSpacing;
  const chordLine = CHORD_LINE_PT * lineSpacing;
  const lyricLine = LYRIC_LINE_PT * lineSpacing;
  const { items, groups } = layoutChartItems(sections, measure, pageMeasure, lyricWidth, lineSpacing, titleHeight);

  const black = rgb(0.1, 0.1, 0.1);
  // Positions are tracked down from the page top; PDF coordinates run up from the bottom.
  const draw = (page: ReturnType<typeof doc.addPage>, text: string, x: number, baseline: number, size: number, style: PdfStyle) =>
    page.drawText(clean(text), { x, y: PAGE_HEIGHT - baseline, size, font: fonts[style], color: black });

  const pages = paginateByHeight(
    items.map((item) => item.height),
    groups,
    contentHeight + PAGE_FIT_SLACK_PT,
  );
  const headerBaseline = pt(geometry.headerTopTwips) + geometry.keySizePt * 0.8;
  const keySize = geometry.keySizePt;
  const chordSize = geometry.chordSizePt;
  const labelSize = geometry.labelSizePt;
  pages.forEach((indices, pageIndex) => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    footer.lines.forEach((line, i) => {
      const x = (PAGE_WIDTH - measure(line, creditSize, '')) / 2;
      draw(page, line, x, baselineIn(footerTop + i * creditLine, creditLine, creditSize), creditSize, '');
    });
    // The key header goes on the first page only (unless it's on the title line).
    if (pageIndex === 0 && !titleKey) {
      draw(page, keyText, MARGIN_SIDE, headerBaseline, keySize, 'italic');
    }
    const pageLabel = pageLabelText(title, pageIndex, pages.length);
    if (pageLabel) {
      draw(page, pageLabel, PAGE_WIDTH - MARGIN_SIDE - measure(pageLabel, keySize, 'italic'), headerBaseline, keySize, 'italic');
    }

    let top = MARGIN_TOP;
    indices.forEach((index) => {
      const item = items[index];
      if (item.kind === 'title') {
        const text = (title || 'Untitled').toUpperCase();
        const titleWidth = measure(text, titleSize, 'bold');
        const keyWidth = titleKey ? TITLE_KEY_GAP_PT + measure(titleKey, keySize, 'italic') : 0;
        // The title and the key after it are centred together.
        const x = (PAGE_WIDTH - titleWidth - keyWidth) / 2;
        const baseline = baselineIn(top, geometry.titleLinePt, titleSize);
        draw(page, text, x, baseline, titleSize, 'bold');
        if (titleKey) draw(page, titleKey, x + titleWidth + TITLE_KEY_GAP_PT, baseline, keySize, 'italic');
      } else {
        let lineTop = top + item.gapBefore;
        if (item.lines.length === 0 && item.label) {
          draw(page, item.label.toUpperCase(), MARGIN_SIDE, baselineIn(lineTop, lyricLine, labelSize), labelSize, 'bold');
        }
        item.lines.forEach((line, li) => {
          if (isChordOnly(line)) {
            const baseline = baselineIn(lineTop, lyricLine, chordSize);
            line.chords.forEach((c) => draw(page, c.label, MARGIN_SIDE + labelCol + c.offsetPt, baseline, chordSize, 'italic'));
            if (li === 0 && item.label) {
              draw(page, item.label.toUpperCase(), MARGIN_SIDE, baselineIn(lineTop, lyricLine, labelSize), labelSize, 'bold');
            }
            lineTop += lyricLine;
            return;
          }
          if (line.chords.length > 0) {
            const baseline = baselineIn(lineTop, chordLine, chordSize);
            line.chords.forEach((c) => draw(page, c.label, MARGIN_SIDE + labelCol + c.offsetPt, baseline, chordSize, 'italic'));
            lineTop += chordLine;
          }
          if (li === 0 && item.label) {
            draw(page, item.label.toUpperCase(), MARGIN_SIDE, baselineIn(lineTop, lyricLine, labelSize), labelSize, 'bold');
          }
          draw(page, line.lyricLine, MARGIN_SIDE + labelCol + (line.indentPt ?? 0), baselineIn(lineTop, lyricLine, LYRIC_SIZE_PT), LYRIC_SIZE_PT, 'bold');
          lineTop += lyricLine;
        });
      }
      top += item.height;
    });
    // A half sheet: drawn at the full sheet's sizes, then shrunk onto the smaller page.
    if (scale !== 1) page.scale(scale, scale);
  });
  return pages.length;
}
