import type { KeyName, SectionType } from '../types';
import { formatChord } from './musicTheory';
import { buildRows } from './lyricRows';
import type { BlockMap } from './arrangement';
import { deriveFlatSyllables } from './arrangement';
import { CHORD_SIZE_PT, LYRIC_SIZE_PT, measureTextPt } from './pageLayout';

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
        chordLabel: syl.chord ? formatChord(key, syl.chord) : null,
      };
    });
    return { kind: 'line', key: row.key, tokens };
  });
}

export interface DocSection {
  label: string;
  type: SectionType;
  lineRows: ChartLineRow[];
}

/** Groups the flat chart rows back into one entry per section, since both the Word doc and the
 * on-screen preview put each section's label beside its lyrics/chords rather than above them.
 * Lines before the first heading (or a song with none at all) become a single section with a
 * blank label. */
export function groupIntoSections(rows: ChartRow[]): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection | null = null;
  rows.forEach((row) => {
    if (row.kind === 'heading') {
      current = { label: row.label, type: row.type, lineRows: [] };
      sections.push(current);
    } else {
      if (!current) {
        current = { label: '', type: 'other', lineRows: [] };
        sections.push(current);
      }
      current.lineRows.push(row);
    }
  });
  return sections;
}

export interface SectionDisplayRow {
  key: string;
  section: DocSection;
  row: ChartLineRow | null;
  isFirstInSection: boolean;
  isLastInSection: boolean;
}

/** Flattens sections into one entry per line-row (or a single blank entry for a label-only
 * section), so a renderer can lay out a fixed-width label column beside the lyrics/chords —
 * showing the label only on the section's first row, so it visually spans the section the same
 * way a table cell's label sits beside multiple lines of content in the Word doc. */
export function flattenSections(sections: DocSection[]): SectionDisplayRow[] {
  return sections.flatMap((section, si): SectionDisplayRow[] => {
    if (section.lineRows.length === 0) {
      return [{ key: `s${si}`, section, row: null, isFirstInSection: true, isLastInSection: true }];
    }
    return section.lineRows.map((row, i) => ({
      key: row.key,
      section,
      row,
      isFirstInSection: i === 0,
      isLastInSection: i === section.lineRows.length - 1,
    }));
  });
}

export interface PlacedLine {
  lyricLine: string;
  /** Each chord's left edge, in points from the start of the lyric text. */
  chords: { offsetPt: number; label: string }[];
}

const CHORD_MIN_GAP_PT = 4; // keeps a wide chord from running into the next one

/** Positions each chord at the true rendered width of the bold lyric text before its syllable,
 * so it lands above the right letter in any (proportional) font. The lyrics are never spread
 * apart to make room — a chord that would collide with the previous one is nudged right instead,
 * like a printed chart. Shared by the Word export (as tab stops) and the on-screen preview. */
export function placeChords(tokens: ChartToken[], fontFamily: string): PlacedLine {
  let lyricLine = '';
  const chords: PlacedLine['chords'] = [];
  let nextFreePt = 0;
  tokens.forEach((tok, i) => {
    if (tok.isWordStart && i !== 0) lyricLine += ' ';
    if (tok.chordLabel) {
      const at = Math.max(measureTextPt(lyricLine, fontFamily, LYRIC_SIZE_PT, 'bold'), nextFreePt);
      chords.push({ offsetPt: at, label: tok.chordLabel });
      nextFreePt = at + measureTextPt(tok.chordLabel, fontFamily, CHORD_SIZE_PT, 'italic') + CHORD_MIN_GAP_PT;
    }
    lyricLine += tok.text;
  });
  return { lyricLine, chords };
}
