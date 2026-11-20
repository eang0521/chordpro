// US Letter page geometry and shared chart styling, used by both the Word doc generator (which
// needs sizes in twips, Word's native unit) and the on-screen page preview (which needs CSS px),
// so what you see in "View chart" genuinely matches what the downloaded .docx will look like.
//
// Sizes follow a typical printed worship chart: big centered all-caps title, "Key of X" in the
// page header, bold lyrics with smaller italic chords tight above them, and short all-caps
// section labels in a narrow left column on the lyric line.

export const PAGE_WIDTH_TWIPS = 12240; // 8.5in
export const PAGE_HEIGHT_TWIPS = 15840; // 11in
export const MARGIN_SIDE_TWIPS = 720; // 0.5in left/right
export const MARGIN_TOP_TWIPS = 1008; // 0.7in — leaves room for the "Key of X" header above
export const MARGIN_BOTTOM_TWIPS = 720; // 0.5in
export const HEADER_TOP_TWIPS = 576; // 0.4in from the page top to the header text

export const TITLE_SIZE_PT = 28;
export const KEY_SIZE_PT = 12;
export const LABEL_SIZE_PT = 12;
export const LYRIC_SIZE_PT = 14;
export const CHORD_SIZE_PT = 11;

// Fixed line heights (at a 1.0x line-spacing multiplier) rather than font-relative ones, so the
// chord line hugs the lyric beneath it the same way in Word and in the preview.
export const CHORD_LINE_PT = 14;
export const LYRIC_LINE_PT = 17;
export const SECTION_GAP_PT = 8;

// The range the line spacing multiplier can be set to (and Fit to page searches within).
export const MIN_LINE_SPACING = 0.8;
export const MAX_LINE_SPACING = 1.2;

export function clampLineSpacing(value: number): number {
  return Math.min(MAX_LINE_SPACING, Math.max(MIN_LINE_SPACING, value));
}
export const TITLE_GAP_PT = 14;

// Section label column: 1in like the reference charts, widened for the whole song if some label
// (e.g. "PRE-CHORUS 2") wouldn't otherwise fit before the lyrics start.
export const MIN_LABEL_COLUMN_TWIPS = 1440;
export const LABEL_GAP_TWIPS = 200;

export const CONTENT_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - 2 * MARGIN_SIDE_TWIPS;

/** The sheet a chart prints on: US Letter, or a half sheet of it (5.5 x 8.5in). */
export type PaperSize = 'letter' | 'half';

/** How a song's chart prints, saved with the song. */
export interface PrintOptions {
  paper: PaperSize;
  /** On a half sheet: chords on the first verse only, to save room. */
  collapseVerseChords: boolean;
  /** The line spacing is picked to fit the song on one page (two if it must), rather than the
   * song's own line spacing. */
  fitToPage: boolean;
  /** On a half sheet: two half pages side by side on each landscape letter sheet, to cut. */
  twoUp: boolean;
  /** A set on full sheets, printed on both sides to open like a book: blank pages are added so
   * every song longer than a page is open all at once (see bookSlots). */
  doubleSided: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  paper: 'letter',
  collapseVerseChords: false,
  fitToPage: true,
  twoUp: true,
  doubleSided: false,
};

/** True when the verse chords really are collapsed: only on a half sheet. */
export function collapsesVerseChords(options: PrintOptions): boolean {
  return options.paper === 'half' && options.collapseVerseChords;
}

// Credits footer (writers and copyright), small and centered at the foot of every page.
export const CREDIT_SIZE_PT = 8;
export const CREDIT_LINE_PT = 10;
export const CREDIT_BOTTOM_TWIPS = 432; // 0.3in from the page bottom to the footer's last line
const CREDIT_GAP_TWIPS = 160; // 8pt between the song and the footer

// The title's line: the preview sets it at 1.15 times the size.
export const TITLE_LINE_PT = TITLE_SIZE_PT * 1.15;
// Between the title and the key when the key goes at the end of the title line.
export const TITLE_KEY_GAP_PT = 10;

// A half sheet is laid out at the full sheet's lyric and chord sizes on a page 1/HALF_SHEET_SCALE
// times the half sheet's size, then shrunk by this much to print: 14pt lyrics print at 11.2pt and
// 11pt chords at 8.8pt. The page is narrower than a letter page, so long lines wrap sooner.
export const HALF_SHEET_SCALE = 0.8;

/** The page as it's laid out (in twips and points, before it's shrunk by `scale` to print), and
 * the parts of the chart that a half sheet sets more compactly than a full one. */
export interface PageGeometry {
  widthTwips: number;
  heightTwips: number;
  contentWidthTwips: number;
  scale: number;
  marginTopTwips: number;
  /** From the page top to the header line (the key, and "p. 1 of 2"). */
  headerTopTwips: number;
  titleSizePt: number;
  titleLinePt: number;
  titleGapPt: number;
  /** The key goes at the end of the title line instead of in the page header. */
  keyOnTitleLine: boolean;
  /** Section labels are shortened ("V1", "Ch.") and their column is narrower. */
  shortLabels: boolean;
  minLabelColumnTwips: number;
  creditSizePt: number;
  creditLinePt: number;
}

export const LETTER_GEOMETRY: PageGeometry = {
  widthTwips: PAGE_WIDTH_TWIPS,
  heightTwips: PAGE_HEIGHT_TWIPS,
  contentWidthTwips: CONTENT_WIDTH_TWIPS,
  scale: 1,
  marginTopTwips: MARGIN_TOP_TWIPS,
  headerTopTwips: HEADER_TOP_TWIPS,
  titleSizePt: TITLE_SIZE_PT,
  titleLinePt: TITLE_LINE_PT,
  titleGapPt: TITLE_GAP_PT,
  keyOnTitleLine: false,
  shortLabels: false,
  minLabelColumnTwips: MIN_LABEL_COLUMN_TWIPS,
  creditSizePt: CREDIT_SIZE_PT,
  creditLinePt: CREDIT_LINE_PT,
};

const HALF_WIDTH_TWIPS = Math.round((5.5 * 1440) / HALF_SHEET_SCALE);
const HALF_TITLE_SIZE_PT = 18;
const HALF_GEOMETRY: PageGeometry = {
  widthTwips: HALF_WIDTH_TWIPS,
  heightTwips: Math.round((8.5 * 1440) / HALF_SHEET_SCALE),
  contentWidthTwips: HALF_WIDTH_TWIPS - 2 * MARGIN_SIDE_TWIPS,
  scale: HALF_SHEET_SCALE,
  // With the key on the title line, the header only holds "p. 1 of 2", so it moves up and the
  // song starts at the side margins' 0.5in.
  marginTopTwips: MARGIN_SIDE_TWIPS,
  headerTopTwips: 300,
  titleSizePt: HALF_TITLE_SIZE_PT,
  titleLinePt: HALF_TITLE_SIZE_PT * 1.15,
  titleGapPt: 8,
  keyOnTitleLine: true,
  shortLabels: true,
  minLabelColumnTwips: 720,
  creditSizePt: 6.5,
  creditLinePt: 8,
};

export function pageGeometry(paper: PaperSize): PageGeometry {
  return paper === 'half' ? HALF_GEOMETRY : LETTER_GEOMETRY;
}


const TWIPS_PER_INCH = 1440;
// On-screen preview scale — 72px/in means 1pt of text is exactly 1px, so the preview's font
// sizes can use the pt constants above directly without a separate conversion.
const PREVIEW_PX_PER_INCH = 72;

export function twipsToPreviewPx(twips: number): number {
  return (twips / TWIPS_PER_INCH) * PREVIEW_PX_PER_INCH;
}

export const PAGE_WIDTH_PX = twipsToPreviewPx(PAGE_WIDTH_TWIPS);
export const PAGE_HEIGHT_PX = twipsToPreviewPx(PAGE_HEIGHT_TWIPS);
export const MARGIN_SIDE_PX = twipsToPreviewPx(MARGIN_SIDE_TWIPS);
export const MARGIN_TOP_PX = twipsToPreviewPx(MARGIN_TOP_TWIPS);
export const MARGIN_BOTTOM_PX = twipsToPreviewPx(MARGIN_BOTTOM_TWIPS);
export const HEADER_TOP_PX = twipsToPreviewPx(HEADER_TOP_TWIPS);
export const CONTENT_WIDTH_PX = twipsToPreviewPx(CONTENT_WIDTH_TWIPS);
export const CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - MARGIN_TOP_PX - MARGIN_BOTTOM_PX;

/** Measures text width (in points) at a size and style. The browser preview and Word export
 * measure with the canvas (`measureInFont`); the PDF export measures with the PDF's own fonts. */
export type TextMeasure = (text: string, sizePt: number, style: '' | 'bold' | 'italic') => number;

// One canvas for every measurement, and a cache of results: laying out a chart measures the same
// text many times over (each redraw, and while wrapping long lines).
let measureContext: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();
const MAX_CACHED_WIDTHS = 20000;
// A font that finishes loading measures differently from the fallback used until then.
if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => widthCache.clear());

/** Measures text width (in points) in a given CSS font via an offscreen canvas — the only
 * reliable way to know how wide text will render in a proportional font. */
export function measureTextPt(text: string, fontFamily: string, sizePt: number, style = ''): number {
  const key = `${style}|${fontFamily}|${text}`;
  let width = widthCache.get(key); // at 100px
  if (width === undefined) {
    if (measureContext === undefined) measureContext = document.createElement('canvas').getContext('2d');
    if (!measureContext) return text.length * sizePt * 0.6;
    measureContext.font = `${style} 100px ${fontFamily}`;
    width = measureContext.measureText(text).width;
    if (widthCache.size >= MAX_CACHED_WIDTHS) widthCache.clear();
    widthCache.set(key, width);
  }
  return (width / 100) * sizePt;
}

export function measureInFont(fontFamily: string): TextMeasure {
  return (text, sizePt, style) => measureTextPt(text, fontFamily, sizePt, style);
}

/** Width of the section-label column for a song: at least 1in, wider if a label needs it. */
export function labelColumnTwips(labels: string[], measure: TextMeasure, minTwips = MIN_LABEL_COLUMN_TWIPS): number {
  const widest = Math.max(0, ...labels.map((l) => measure(l.toUpperCase(), LABEL_SIZE_PT, 'bold')));
  return Math.max(minTwips, Math.ceil(widest * 20) + LABEL_GAP_TWIPS);
}

// A long title is set smaller so it stays on one line, but no smaller than this.
export const MIN_TITLE_SIZE_PT = 14;
// Room left at the title's ends: the browser's widths include kerning and the PDF's don't, so
// the PDF can set a title a point or two wider than it was measured.
const TITLE_FIT_SLACK_PT = 6;

/** The title's size, in points: the usual size, or as much smaller as it takes for the all-caps
 * title to fit on one line across the page. The preview, Word doc and PDF all measure it in the
 * browser, so they pick the same size. */
export function titleSizePt(title: string, measure: TextMeasure, geometry = LETTER_GEOMETRY, reservedPt = 0): number {
  const size = geometry.titleSizePt;
  const width = measure((title || 'Untitled').toUpperCase(), size, 'bold');
  // `reservedPt`: room kept on the line for something else, like the key after the title.
  const room = geometry.contentWidthTwips / 20 - TITLE_FIT_SLACK_PT - reservedPt;
  if (width <= room) return size;
  // Rounded down to a quarter point, so the text never ends up a hair too wide.
  return Math.max(Math.min(MIN_TITLE_SIZE_PT, size * 0.67), Math.floor(((size * room) / width) * 4) / 4);
}

/** Breaks text at spaces so each line fits `widthPt`; a single word wider than that stays whole. */
export function wrapText(text: string, widthPt: number, sizePt: number, measure: TextMeasure): string[] {
  const lines: string[] = [];
  let current = '';
  text.split(/\s+/).filter(Boolean).forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, sizePt, '') > widthPt) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
}

/** The credits as printed lines (each credit wrapped to the page width), and the bottom margin
 * that leaves room for them — the same in the preview, the Word doc and the PDF, so all three
 * paginate alike. With no credits the margin is the usual 0.5in. */
export function creditFooter(
  credits: string[],
  measure: TextMeasure,
  geometry = LETTER_GEOMETRY,
): { lines: string[]; marginBottomTwips: number } {
  const lines = credits.flatMap((c) => wrapText(c, geometry.contentWidthTwips / 20, geometry.creditSizePt, measure));
  if (lines.length === 0) return { lines, marginBottomTwips: MARGIN_BOTTOM_TWIPS };
  const footerTop = CREDIT_BOTTOM_TWIPS + lines.length * geometry.creditLinePt * 20 + CREDIT_GAP_TWIPS;
  return { lines, marginBottomTwips: Math.max(MARGIN_BOTTOM_TWIPS, footerTop) };
}
