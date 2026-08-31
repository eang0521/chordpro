import type { SectionLabel, SyllableToken } from '../types';

export interface SectionRow {
  kind: 'section';
  key: string;
  section: SectionLabel;
}

export interface LineRow {
  kind: 'line';
  key: string;
  indexes: number[];
}

export type Row = SectionRow | LineRow;

/**
 * Groups a flat syllable list into section-heading rows and per-line rows. Shared by the
 * interactive lyric flow (recorder/chord editor) and the static chord-chart preview/export,
 * so both agree on where lines and section headings fall.
 */
export function buildRows(syllables: SyllableToken[]): Row[] {
  const rows: Row[] = [];
  syllables.forEach((syl, i) => {
    if (syl.section) {
      if (syl.section.label) rows.push({ kind: 'section', key: `section-${syl.id}`, section: syl.section });
      rows.push({ kind: 'line', key: `line-${syl.id}`, indexes: [i] });
    } else if (syl.isLineStart) {
      rows.push({ kind: 'line', key: `line-${syl.id}`, indexes: [i] });
    } else {
      const lastRow = rows[rows.length - 1];
      if (lastRow.kind === 'line') lastRow.indexes.push(i);
    }
  });
  return rows;
}
