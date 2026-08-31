import type { KeyName, SectionType, SyllableToken } from '../types';
import { resolveChordLabel } from './musicTheory';
import { buildRows } from './lyricRows';
import type { BlockMap } from './arrangement';
import { deriveFlatSyllables } from './arrangement';

export interface ChartLine {
  chordLine: string;
  lyricLine: string;
}

export interface ChartHeadingRow {
  kind: 'heading';
  type: SectionType;
  label: string;
}

export interface ChartLineRow {
  kind: 'line';
  line: ChartLine;
}

export type ChartRow = ChartHeadingRow | ChartLineRow;

/**
 * Lays out one lyric line as a pair of monospace strings — a chord line with each chord
 * symbol placed at the character column of the syllable it belongs to, and the lyric line
 * itself. This is the classic plain-text chord-chart convention (chords float directly above
 * the word they go with), and it's what both the on-screen preview and the Word export render.
 */
export function buildChartLine(tokens: SyllableToken[], key: KeyName): ChartLine {
  let lyricLine = '';
  let chordLine = '';
  tokens.forEach((syl, i) => {
    if (syl.isWordStart && i !== 0) lyricLine += ' ';
    const startCol = lyricLine.length;
    lyricLine += syl.text;

    const chordLabel = syl.chordDegrees.length > 0 ? resolveChordLabel(key, syl.chordDegrees) : null;
    if (chordLabel) {
      // Never overlap the previous chord — if this syllable is too close, place it right
      // after instead of exactly above.
      const writePos = Math.max(chordLine.length, startCol);
      chordLine = chordLine.padEnd(writePos, ' ') + chordLabel;
    }
  });
  return { chordLine, lyricLine };
}

/** Builds the full chart (section headings + chord/lyric line pairs) for the current arrangement. */
export function buildChartRows(blocks: BlockMap, arrangement: string[], key: KeyName): ChartRow[] {
  const flat = deriveFlatSyllables(blocks, arrangement);
  const rows = buildRows(flat);
  return rows.map((row) => {
    if (row.kind === 'section') {
      return { kind: 'heading', type: row.section.type, label: row.section.label };
    }
    const tokens = row.indexes.map((i) => flat[i]);
    return { kind: 'line', line: buildChartLine(tokens, key) };
  });
}
