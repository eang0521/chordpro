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
export const TITLE_GAP_PT = 14;

// Section label column: 1in like the reference charts, widened for the whole song if some label
// (e.g. "PRE-CHORUS 2") wouldn't otherwise fit before the lyrics start.
export const MIN_LABEL_COLUMN_TWIPS = 1440;
export const LABEL_GAP_TWIPS = 200;

export const CONTENT_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - 2 * MARGIN_SIDE_TWIPS;

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

/** Measures text width (in points) in a given CSS font via an offscreen canvas — the only
 * reliable way to know how wide text will render in a proportional font. */
export function measureTextPt(text: string, fontFamily: string, sizePt: number, style = ''): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * sizePt * 0.6;
  ctx.font = `${style} 100px ${fontFamily}`;
  return (ctx.measureText(text).width / 100) * sizePt;
}

/** Width of the section-label column for a song: at least 1in, wider if a label needs it. */
export function labelColumnTwips(labels: string[], fontFamily: string): number {
  const widest = Math.max(0, ...labels.map((l) => measureTextPt(l.toUpperCase(), fontFamily, LABEL_SIZE_PT, 'bold')));
  return Math.max(MIN_LABEL_COLUMN_TWIPS, Math.ceil(widest * 20) + LABEL_GAP_TWIPS);
}
