// US Letter page geometry and shared chart styling, used by both the Word doc generator (which
// needs sizes in twips, Word's native unit) and the on-screen page preview (which needs CSS px
// and hex colors), so what you see in "View chart" genuinely matches what the downloaded .docx
// will look like.

import type { SectionType } from '../types';

export const PAGE_WIDTH_TWIPS = 12240; // 8.5in
export const PAGE_HEIGHT_TWIPS = 15840; // 11in
export const MARGIN_TWIPS = 1080; // 0.75in, all sides

export const FONT_SIZE_PT = 11;

// Section label column is a fixed physical width — wide enough for "Pre-Chorus 2" without
// wrapping — with the chords/lyrics filling the rest of the content width beside it.
export const LABEL_COLUMN_TWIPS = 1800; // 1.25in
export const CONTENT_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - 2 * MARGIN_TWIPS;
export const LYRIC_COLUMN_TWIPS = CONTENT_WIDTH_TWIPS - LABEL_COLUMN_TWIPS;

// Base vertical spacing (twips) at a 1.0x line-spacing multiplier: the gap after a line-pair
// that isn't the last in its section, and the (larger) gap after a section's last line-pair.
export const BASE_LINE_GAP_TWIPS = 120;
export const BASE_SECTION_GAP_TWIPS = 280;

export const CHORD_COLOR = '2563EB';
export const SECTION_COLORS: Record<SectionType, string> = {
  verse: '2563EB',
  chorus: 'B45309',
  bridge: '7E22CE',
  other: '6B7280',
};

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
export const LABEL_COLUMN_PX = twipsToPreviewPx(LABEL_COLUMN_TWIPS);
export const LYRIC_COLUMN_PX = twipsToPreviewPx(LYRIC_COLUMN_TWIPS);
export const LINE_GAP_PX = twipsToPreviewPx(BASE_LINE_GAP_TWIPS);
export const SECTION_GAP_PX = twipsToPreviewPx(BASE_SECTION_GAP_TWIPS);
