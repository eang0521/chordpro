// US Letter page geometry, shared between the Word doc generator (which needs it in twips,
// Word's native unit) and the on-screen page preview (which needs it in CSS px), so what you
// see in "View chart" genuinely matches what the downloaded .docx will look like.

export const PAGE_WIDTH_TWIPS = 12240; // 8.5in
export const PAGE_HEIGHT_TWIPS = 15840; // 11in
export const MARGIN_TWIPS = 1440; // 1in, all sides

export const FONT_SIZE_PT = 11;

const TWIPS_PER_INCH = 1440;
// On-screen preview scale — 72px/in means 1pt of text is exactly 1px, so the preview's font
// size can equal FONT_SIZE_PT directly without a separate conversion.
const PREVIEW_PX_PER_INCH = 72;

function twipsToPreviewPx(twips: number): number {
  return (twips / TWIPS_PER_INCH) * PREVIEW_PX_PER_INCH;
}

export const PAGE_WIDTH_PX = twipsToPreviewPx(PAGE_WIDTH_TWIPS);
export const PAGE_HEIGHT_PX = twipsToPreviewPx(PAGE_HEIGHT_TWIPS);
export const MARGIN_PX = twipsToPreviewPx(MARGIN_TWIPS);
export const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - 2 * MARGIN_PX;
export const CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - 2 * MARGIN_PX;
