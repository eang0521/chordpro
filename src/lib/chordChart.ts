import type { KeyName, SectionType } from '../types';
import { resolveChordLabel } from './musicTheory';
import { buildRows } from './lyricRows';
import type { BlockMap } from './arrangement';
import { deriveFlatSyllables } from './arrangement';

export interface ChartToken {
  key: string;
  text: string;
  isWordStart: boolean;
  chordLabel: string | null;
}

export interface ChartHeadingRow {
  kind: 'heading';
  type: SectionType;
  label: string;
}

export interface ChartLineRow {
  kind: 'line';
  key: string;
  tokens: ChartToken[];
}

export type ChartRow = ChartHeadingRow | ChartLineRow;

/**
 * Builds the chart as raw per-syllable tokens (text, word-boundary, resolved chord), with no
 * baked-in layout — each renderer (the on-screen preview, the Word export) lays these out in
 * whatever way suits its medium (CSS positioning for the browser, measured tab stops or
 * monospace padding for Word).
 */
export function buildChartRows(blocks: BlockMap, arrangement: string[], key: KeyName): ChartRow[] {
  const flat = deriveFlatSyllables(blocks, arrangement);
  const rows = buildRows(flat);
  return rows.map((row) => {
    if (row.kind === 'section') {
      return { kind: 'heading', type: row.section.type, label: row.section.label };
    }
    const tokens = row.indexes.map((i) => {
      const syl = flat[i];
      return {
        key: syl.id,
        text: syl.text,
        isWordStart: syl.isWordStart,
        chordLabel: syl.chordDegrees.length > 0 ? resolveChordLabel(key, syl.chordDegrees) : null,
      };
    });
    return { kind: 'line', key: row.key, tokens };
  });
}
