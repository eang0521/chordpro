import type { PDFFont } from 'pdf-lib';
import type { ArrangementEntry, KeyName, SongCredits } from '../types';
import type { BlockMap } from './arrangement';
import type { ChartToken } from './chordChart';
import { buildChartRows, groupIntoSections, isChordOnly, keyHeaderText, placeChords } from './chordChart';
import { fetchFontFile, getChordFontOption } from './chordFonts';
import { creditLines } from './credits';
import type { TextMeasure } from './pageLayout';
import {
  CHORD_LINE_PT,
  CHORD_SIZE_PT,
  CONTENT_WIDTH_TWIPS,
  CREDIT_BOTTOM_TWIPS,
  CREDIT_LINE_PT,
  CREDIT_SIZE_PT,
  HEADER_TOP_TWIPS,
  KEY_SIZE_PT,
  LABEL_SIZE_PT,
  LYRIC_LINE_PT,
  LYRIC_SIZE_PT,
  MARGIN_SIDE_TWIPS,
  MARGIN_TOP_TWIPS,
  PAGE_HEIGHT_TWIPS,
  PAGE_WIDTH_TWIPS,
  SECTION_GAP_PT,
  TITLE_GAP_PT,
  TITLE_SIZE_PT,
  creditFooter,
  labelColumnTwips,
} from './pageLayout';
import { paginateByHeight } from './pagination';

const pt = (twips: number) => twips / 20;
const PAGE_WIDTH = pt(PAGE_WIDTH_TWIPS);
const PAGE_HEIGHT = pt(PAGE_HEIGHT_TWIPS);
const MARGIN_SIDE = pt(MARGIN_SIDE_TWIPS);
const MARGIN_TOP = pt(MARGIN_TOP_TWIPS);
const TITLE_LINE_PT = TITLE_SIZE_PT * 1.15; // matches the preview's title line-height

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

/** One printed line-pair: optional chords above a lyric line, positioned in points. */
interface PrintedLine {
  lyricLine: string;
  chords: { offsetPt: number; label: string }[];
}

/** A unit of the page layout: the title, or one lyric line (which may wrap into several printed
 * lines) of a section. */
type LayoutItem =
  | { kind: 'title'; height: number }
  | { kind: 'row'; height: number; label: string | null; lines: PrintedLine[] };

/** Breaks a line's tokens at word boundaries so each piece fits `width`, so long lines wrap
 * instead of running off the page. A single word wider than the line stays whole. */
function wrapTokens(tokens: ChartToken[], width: number, measure: TextMeasure): ChartToken[][] {
  const words: ChartToken[][] = [];
  tokens.forEach((tok, i) => {
    if (i === 0 || tok.isWordStart) words.push([tok]);
    else words[words.length - 1].push(tok);
  });
  const textOf = (toks: ChartToken[]) => toks.map((t, i) => (i > 0 && t.isWordStart ? ' ' : '') + t.text).join('');

  const pieces: ChartToken[][] = [];
  let current: ChartToken[] = [];
  words.forEach((word) => {
    const candidate = [...current, ...word];
    if (current.length > 0 && measure(textOf(candidate), LYRIC_SIZE_PT, 'bold') > width) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current.length > 0) pieces.push(current);
  // A wrapped piece starts its own line, so its first syllable shouldn't get a leading space.
  return pieces.map((piece) => piece.map((t, i) => (i === 0 ? { ...t, isWordStart: false } : t)));
}

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
): Promise<Blob> {
  // Loaded on demand, like the docx package — most sessions never export a PDF.
  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title || 'Untitled');

  const option = getChordFontOption(fontId);
  const files = option.files;
  const sources = files
    ? await Promise.all([files.regular, files.bold, files.italic].map(fetchFontFile))
    : [PDF_FONTS[option.id].regular, PDF_FONTS[option.id].bold, PDF_FONTS[option.id].italic];
  // Subsetting keeps only the characters the chart uses, so embedding stays small.
  const [regular, bold, italic] = await Promise.all(sources.map((src) => doc.embedFont(src, { subset: true })));
  const fonts: Record<'' | 'bold' | 'italic', PDFFont> = { '': regular, bold, italic };

  // A font only covers some characters (the built-in ones just Western European), so swap
  // anything else for a close stand-in rather than failing the whole export.
  const supported = new Set(fonts[''].getCharacterSet());
  const clean = (text: string) =>
    [...text.replace(/♯/g, '#').replace(/♭/g, 'b')]
      .map((c) => (supported.has(c.codePointAt(0)!) ? c : '?'))
      .join('');
  const measure: TextMeasure = (text, sizePt, style) => fonts[style].widthOfTextAtSize(clean(text), sizePt);

  const sections = groupIntoSections(buildChartRows(blocks, arrangement, key));
  const labelCol = pt(labelColumnTwips(sections.map((s) => s.label), measure));
  const lyricWidth = pt(CONTENT_WIDTH_TWIPS) - labelCol;
  const footer = creditFooter(creditLines(credits), measure);
  const contentHeight = PAGE_HEIGHT - MARGIN_TOP - pt(footer.marginBottomTwips);
  const footerTop = PAGE_HEIGHT - pt(CREDIT_BOTTOM_TWIPS) - footer.lines.length * CREDIT_LINE_PT;
  const chordLine = CHORD_LINE_PT * lineSpacing;
  const lyricLine = LYRIC_LINE_PT * lineSpacing;
  const sectionGap = SECTION_GAP_PT * lineSpacing;

  // Lay out every item with its height, grouped by section so pagination keeps sections whole.
  const items: LayoutItem[] = [{ kind: 'title', height: TITLE_LINE_PT + TITLE_GAP_PT }];
  const groups: number[][] = [[0]];
  sections.forEach((section) => {
    const group: number[] = [];
    if (section.lineRows.length === 0) {
      group.push(items.length);
      items.push({ kind: 'row', height: lyricLine + sectionGap, label: section.label, lines: [] });
    }
    section.lineRows.forEach((row, i) => {
      // A wrapped line's repeat mark ("2x") goes at the end of its last piece.
      const pieces = wrapTokens(row.tokens, lyricWidth, measure);
      const lines = pieces.map((piece, p) => placeChords(piece, measure, p === pieces.length - 1 ? row.repeat : undefined));
      const isLast = i === section.lineRows.length - 1;
      const height =
        // A chord-only line takes just the lyric line's height (its chords sit on it).
        lines.reduce((sum, line) => sum + (line.chords.length > 0 && !isChordOnly(line) ? chordLine : 0) + lyricLine, 0) +
        (isLast ? sectionGap : 0);
      group.push(items.length);
      items.push({ kind: 'row', height, label: i === 0 ? section.label : null, lines });
    });
    groups.push(group);
  });
  // Nothing follows the last section, so its gap shouldn't push it onto another page (the
  // preview's measurement leaves it off too, so both paginate alike).
  const lastItem = items[items.length - 1];
  if (lastItem.kind === 'row') lastItem.height -= sectionGap;

  const black = rgb(0.1, 0.1, 0.1);
  // Positions are tracked down from the page top; PDF coordinates run up from the bottom.
  const draw = (page: ReturnType<typeof doc.addPage>, text: string, x: number, baseline: number, size: number, style: '' | 'bold' | 'italic') =>
    page.drawText(clean(text), { x, y: PAGE_HEIGHT - baseline, size, font: fonts[style], color: black });

  paginateByHeight(
    items.map((item) => item.height),
    groups,
    contentHeight,
  ).forEach((indices, pageIndex) => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    footer.lines.forEach((line, i) => {
      const x = (PAGE_WIDTH - measure(line, CREDIT_SIZE_PT, '')) / 2;
      draw(page, line, x, baselineIn(footerTop + i * CREDIT_LINE_PT, CREDIT_LINE_PT, CREDIT_SIZE_PT), CREDIT_SIZE_PT, '');
    });
    // The key header goes on the first page only.
    if (pageIndex === 0) {
      draw(page, keyHeaderText(sections, key), MARGIN_SIDE, pt(HEADER_TOP_TWIPS) + KEY_SIZE_PT * 0.8, KEY_SIZE_PT, 'italic');
    }

    let top = MARGIN_TOP;
    indices.forEach((index) => {
      const item = items[index];
      if (item.kind === 'title') {
        const text = (title || 'Untitled').toUpperCase();
        const x = (PAGE_WIDTH - measure(text, TITLE_SIZE_PT, 'bold')) / 2;
        draw(page, text, x, baselineIn(top, TITLE_LINE_PT, TITLE_SIZE_PT), TITLE_SIZE_PT, 'bold');
      } else {
        let lineTop = top;
        if (item.lines.length === 0 && item.label) {
          draw(page, item.label.toUpperCase(), MARGIN_SIDE, baselineIn(lineTop, lyricLine, LABEL_SIZE_PT), LABEL_SIZE_PT, 'bold');
        }
        item.lines.forEach((line, li) => {
          if (isChordOnly(line)) {
            const baseline = baselineIn(lineTop, lyricLine, CHORD_SIZE_PT);
            line.chords.forEach((c) => draw(page, c.label, MARGIN_SIDE + labelCol + c.offsetPt, baseline, CHORD_SIZE_PT, 'italic'));
            if (li === 0 && item.label) {
              draw(page, item.label.toUpperCase(), MARGIN_SIDE, baselineIn(lineTop, lyricLine, LABEL_SIZE_PT), LABEL_SIZE_PT, 'bold');
            }
            lineTop += lyricLine;
            return;
          }
          if (line.chords.length > 0) {
            const baseline = baselineIn(lineTop, chordLine, CHORD_SIZE_PT);
            line.chords.forEach((c) => draw(page, c.label, MARGIN_SIDE + labelCol + c.offsetPt, baseline, CHORD_SIZE_PT, 'italic'));
            lineTop += chordLine;
          }
          if (li === 0 && item.label) {
            draw(page, item.label.toUpperCase(), MARGIN_SIDE, baselineIn(lineTop, lyricLine, LABEL_SIZE_PT), LABEL_SIZE_PT, 'bold');
          }
          draw(page, line.lyricLine, MARGIN_SIDE + labelCol, baselineIn(lineTop, lyricLine, LYRIC_SIZE_PT), LYRIC_SIZE_PT, 'bold');
          lineTop += lyricLine;
        });
      }
      top += item.height;
    });
  });

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
