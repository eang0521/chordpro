import type { DocSection } from './chordChart';
import { isChordOnly, layoutLine } from './chordChart';
import type { TextMeasure } from './pageLayout';
import { CHORD_LINE_PT, LYRIC_LINE_PT, SECTION_GAP_PT, TITLE_GAP_PT, TITLE_SIZE_PT } from './pageLayout';

export const TITLE_LINE_PT = TITLE_SIZE_PT * 1.15; // matches the preview's title line-height

// A point of slack past the page's content area (it lands in the bottom margin, invisibly): the
// preview measures rounded line heights, which can come out a fraction of a point shorter than
// these exact ones, and a chart that fits on screen shouldn't spill a section onto another page.
export const PAGE_FIT_SLACK_PT = 1;

/** One printed line-pair: optional chords above a lyric line, positioned in points. */
export interface PrintedLine {
  lyricLine: string;
  chords: { offsetPt: number; label: string }[];
}

/** A unit of the page layout: the title, or one lyric line (which may wrap into several printed
 * lines) of a section. */
export type LayoutItem =
  | { kind: 'title'; height: number }
  | { kind: 'row'; height: number; label: string | null; lines: PrintedLine[]; gapBefore: number };

/**
 * Lays out the chart as items with their heights in points, grouped by section so pagination
 * keeps sections whole. `measure` places the chords; `pageMeasure` decides where lines wrap (see
 * the PDF export for why those can differ).
 */
export function layoutChartItems(
  sections: DocSection[],
  measure: TextMeasure,
  pageMeasure: TextMeasure,
  lyricWidth: number,
  lineSpacing: number,
): { items: LayoutItem[]; groups: number[][] } {
  const chordLine = CHORD_LINE_PT * lineSpacing;
  const lyricLine = LYRIC_LINE_PT * lineSpacing;
  const sectionGap = SECTION_GAP_PT * lineSpacing;

  const items: LayoutItem[] = [{ kind: 'title', height: TITLE_LINE_PT + TITLE_GAP_PT }];
  const groups: number[][] = [[0]];
  sections.forEach((section) => {
    const group: number[] = [];
    if (section.lineRows.length === 0) {
      group.push(items.length);
      items.push({ kind: 'row', height: lyricLine + sectionGap, label: section.label, lines: [], gapBefore: 0 });
    }
    section.lineRows.forEach((row, i) => {
      const lines = layoutLine(row.tokens, measure, lyricWidth, row.repeat, pageMeasure);
      const isLast = i === section.lineRows.length - 1;
      // A blank line splitting the section into parts: the same space as between sections.
      const gapBefore = row.gapBefore && i > 0 ? sectionGap : 0;
      const height =
        gapBefore +
        // A chord-only line takes just the lyric line's height (its chords sit on it).
        lines.reduce((sum, line) => sum + (line.chords.length > 0 && !isChordOnly(line) ? chordLine : 0) + lyricLine, 0) +
        (isLast ? sectionGap : 0);
      group.push(items.length);
      items.push({ kind: 'row', height, label: i === 0 ? section.label : null, lines, gapBefore });
    });
    groups.push(group);
  });
  // Nothing follows the last section, so its gap shouldn't push it onto another page (the
  // preview's measurement leaves it off too, so both paginate alike).
  const lastItem = items[items.length - 1];
  if (lastItem.kind === 'row') lastItem.height -= sectionGap;
  return { items, groups };
}
