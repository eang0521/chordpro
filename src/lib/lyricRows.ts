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
  /** A blank line before this line, splitting its section into parts. */
  gapBefore?: boolean;
}

/** A key change before the next section: `keyShift` is the new key, in semitones above the song's key. */
export interface KeyChangeRow {
  kind: 'keyChange';
  key: string;
  keyShift: number;
}

export type Row = SectionRow | LineRow | KeyChangeRow;

/**
 * Groups a flat syllable list into section-heading rows and per-line rows. Shared by the
 * interactive lyric flow (recorder/chord editor) and the static chord-chart preview/export,
 * so both agree on where lines and section headings fall.
 */
export function buildRows(syllables: SyllableToken[]): Row[] {
  const rows: Row[] = [];
  syllables.forEach((syl, i) => {
    if (syl.keyChange) rows.push({ kind: 'keyChange', key: `key-${syl.id}`, keyShift: syl.keyShift ?? 0 });
    if (syl.section) {
      if (syl.section.label) rows.push({ kind: 'section', key: `section-${syl.id}`, section: syl.section });
      rows.push({ kind: 'line', key: `line-${syl.id}`, indexes: [i] });
    } else if (syl.isLineStart) {
      rows.push({ kind: 'line', key: `line-${syl.id}`, indexes: [i], ...(syl.gapBefore ? { gapBefore: true } : {}) });
    } else {
      const lastRow = rows[rows.length - 1];
      if (lastRow.kind === 'line') lastRow.indexes.push(i);
    }
  });
  return rows;
}
