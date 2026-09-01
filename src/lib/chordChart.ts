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
