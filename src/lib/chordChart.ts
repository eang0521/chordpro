import type { ArrangementEntry, KeyName, SectionType } from '../types';
import { formatChord, transposeKey } from './musicTheory';
import { buildRows } from './lyricRows';
import type { BlockMap } from './arrangement';
import { deriveFlatSyllables } from './arrangement';
import type { TextMeasure } from './pageLayout';
import { CHORD_SIZE_PT, LYRIC_SIZE_PT } from './pageLayout';

export interface ChartToken {
  key: string;
  text: string;
  isWordStart: boolean;
  /** Includes a leading "| " when a bar line comes before the chord. */
  chordLabel: string | null;
  /** A chord with no lyric under it. */
  isSlot: boolean;
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

export interface ChartKeyChangeRow {
  kind: 'keyChange';
  /** The key the song changes to. */
  key: KeyName;
}

export type ChartRow = ChartHeadingRow | ChartLineRow | ChartKeyChangeRow;

/**
 * Builds the chart as raw per-syllable tokens (text, word-boundary, resolved chord), with no
 * baked-in layout — each renderer (the on-screen preview, the Word export) lays these out in
 * whatever way suits its medium (CSS positioning for the browser, measured tab stops or
 * monospace padding for Word).
 */
export function buildChartRows(blocks: BlockMap, arrangement: ArrangementEntry[], key: KeyName): ChartRow[] {
  const flat = deriveFlatSyllables(blocks, arrangement);
  const rows = buildRows(flat);
  return rows.map((row) => {
    if (row.kind === 'keyChange') {
      return { kind: 'keyChange', key: transposeKey(key, row.keyShift) };
    }
    if (row.kind === 'section') {
      return { kind: 'heading', type: row.section.type, label: row.section.label };
    }
    const tokens = row.indexes.map((i) => {
      const syl = flat[i];
      return {
        key: syl.id,
        text: syl.text,
        isWordStart: syl.isWordStart,
        // Chords are spelled in the key this part of the song is played in.
        chordLabel: syl.chord
          ? `${syl.bar ? '| ' : ''}${formatChord(transposeKey(key, syl.keyShift ?? 0), syl.chord)}`
          : null,
        isSlot: !!syl.isChordSlot,
      };
    });
    return { kind: 'line', key: row.key, tokens };
  });
}

export interface DocSection {
  label: string;
  type: SectionType;
  lineRows: ChartLineRow[];
  /** Set when the song changes key right before this section: the new key. */
  keyChange?: KeyName;
}

/** Groups the flat chart rows back into one entry per section, since both the Word doc and the
 * on-screen preview put each section's label beside its lyrics/chords rather than above them.
 * Lines before the first heading (or a song with none at all) become a single section with a
 * blank label. */
export function groupIntoSections(rows: ChartRow[]): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection | null = null;
  let keyChange: KeyName | undefined;
  function start(label: string, type: SectionType) {
    current = { label, type, lineRows: [], ...(keyChange ? { keyChange } : {}) };
    sections.push(current);
    keyChange = undefined;
  }
  rows.forEach((row) => {
    if (row.kind === 'keyChange') {
      keyChange = row.key;
    } else if (row.kind === 'heading') {
      start(row.label, row.type);
    } else {
      // A key change always starts a new section, even an unlabeled one, so it has somewhere to print.
      if (!current || keyChange) start('', 'other');
      current!.lineRows.push(row);
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

/** Every key the song is played in, in order: just the song's key unless it changes key partway. */
export function songKeys(sections: DocSection[], songKey: KeyName): KeyName[] {
  const keys: KeyName[] = [songKey];
  sections.forEach((s) => {
    if (s.keyChange && s.keyChange !== keys[keys.length - 1]) keys.push(s.keyChange);
  });
  return keys;
}

/** `songKeys` straight from the song's blocks and arrangement. */
export function songKeysOf(blocks: BlockMap, arrangement: ArrangementEntry[], songKey: KeyName): KeyName[] {
  return songKeys(groupIntoSections(buildChartRows(blocks, arrangement, songKey)), songKey);
}

/**
 * The page header's key: "Key of C", or every key the song is played in, in order, when it
 * changes key partway ("Key: F-G"). Key changes print only here, not in the chart itself.
 */
export function keyHeaderText(sections: DocSection[], songKey: KeyName): string {
  const keys = songKeys(sections, songKey);
  return keys.length === 1 ? `Key of ${songKey}` : `Key: ${keys.join('-')}`;
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

/** True for a line of chords with no lyrics (a turn, an intro...), which prints as a single
 * line of chords where the lyrics would go instead of chords over a blank lyric line. */
export function isChordOnly(line: PlacedLine): boolean {
  return line.lyricLine.trim() === '' && line.chords.length > 0;
}

const CHORD_MIN_GAP_PT = 4; // keeps a wide chord from running into the next one
// Chords with no lyric under them are spaced out like counted beats ("G   C   | Csus   | C").
const SLOT_GAP_PT = 14;

/** Positions each chord at the true rendered width of the bold lyric text before its syllable,
 * so it lands above the right letter in any (proportional) font. The lyrics are never spread
 * apart to make room — a chord that would collide with the previous one is nudged right instead,
 * like a printed chart. Shared by the Word export (as tab stops) and the on-screen preview. */
export function placeChords(tokens: ChartToken[], measure: TextMeasure): PlacedLine {
  let lyricLine = '';
  const chords: PlacedLine['chords'] = [];
  let nextFreePt = 0;
  // Index of the line's last syllable with lyrics: slots after it are trailing chords.
  const lastLyric = tokens.reduce((last, tok, i) => (!tok.isSlot && tok.text ? i : last), -1);
  tokens.forEach((tok, i) => {
    if (tok.isSlot) {
      // Takes no room in the lyrics. Between two words ("...ies [C/E] Your") its chord starts where
      // the previous word ends, so it sits on the space just left of the next word. After the last
      // word it's a trailing chord, spaced out like counted beats.
      if (!tok.chordLabel) return;
      const trailing = i > lastLyric;
      const wordsEnd = lyricLine ? measure(lyricLine, LYRIC_SIZE_PT, 'bold') : 0;
      const at = Math.max(trailing && lyricLine ? wordsEnd + SLOT_GAP_PT : wordsEnd, nextFreePt);
      chords.push({ offsetPt: at, label: tok.chordLabel });
      nextFreePt = at + measure(tok.chordLabel, CHORD_SIZE_PT, 'italic') + (trailing ? SLOT_GAP_PT : CHORD_MIN_GAP_PT);
      return;
    }
    if (tok.isWordStart && i !== 0 && lyricLine) lyricLine += ' ';
    if (tok.chordLabel) {
      const at = Math.max(measure(lyricLine, LYRIC_SIZE_PT, 'bold'), nextFreePt);
      chords.push({ offsetPt: at, label: tok.chordLabel });
      nextFreePt = at + measure(tok.chordLabel, CHORD_SIZE_PT, 'italic') + CHORD_MIN_GAP_PT;
    }
    lyricLine += tok.text;
  });
  return { lyricLine, chords };
}
