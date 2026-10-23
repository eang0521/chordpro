import type { ArrangementEntry, KeyName, SectionType } from '../types';
import { transposeKey } from './musicTheory';
import { BEAT_MARK, chordMarkLabel } from './chordSlots';
import { buildRows } from './lyricRows';
import type { BlockMap } from './arrangement';
import { deriveFlatSyllables } from './arrangement';
import type { TextMeasure } from './pageLayout';
import { CHORD_SIZE_PT, LYRIC_SIZE_PT } from './pageLayout';

export interface ChartToken {
  key: string;
  text: string;
  isWordStart: boolean;
  /** Includes a leading "| " when a bar line comes before the chord. A "/" beat mark on a slot. */
  chordLabel: string | null;
  /** A chord with no lyric under it. */
  isSlot: boolean;
  /** Letters into the syllable the chord sits over (see SyllableToken.chordOffset). */
  chordOffset?: number;
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
  /** Set on a section's last line when the section repeats: printed as "2x" after its chords. */
  repeat?: number;
  /** A blank line before this line, splitting its section into parts. */
  gapBefore?: boolean;
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
    // The last line of a section occurrence carries the section's repeat count, if it has one.
    const lastIndex = row.indexes[row.indexes.length - 1];
    const next = flat[lastIndex + 1];
    const endsSection = !next || next.localIndex === 0;
    const repeat = endsSection ? blocks[flat[lastIndex].blockId]?.repeat : undefined;
    const tokens = row.indexes.map((i) => {
      const syl = flat[i];
      return {
        key: syl.id,
        text: syl.text,
        isWordStart: syl.isWordStart,
        // Chords are spelled in the key this part of the song is played in.
        chordLabel: chordMarkLabel(syl, key),
        isSlot: !!syl.isChordSlot,
        ...(syl.chord && syl.chordOffset ? { chordOffset: Math.min(syl.chordOffset, syl.text.length) } : {}),
      };
    });
    const first = flat[row.indexes[0]];
    const gapBefore = !!first.gapBefore && first.localIndex > 0;
    return {
      kind: 'line',
      key: row.key,
      tokens,
      ...(repeat && repeat > 1 ? { repeat } : {}),
      ...(gapBefore ? { gapBefore: true } : {}),
    };
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

/** The key a capoed guitarist's chord shapes are in: `capo` semitones below the key played. */
export function capoShapeKey(key: KeyName, capo = 0): KeyName {
  return capo ? transposeKey(key, -capo) : key;
}

/**
 * The page header's key: "Key of C", or every key the song is played in, in order, when it
 * changes key partway ("Key: F-G"). Key changes print only here, not in the chart itself.
 * With a capo, `sections` and `songKey` are in the chord shapes' key, and the header gives the
 * key played and the shapes: "Key of Eb-F (C-D, capo 3)".
 */
export function keyHeaderText(sections: DocSection[], songKey: KeyName, capo = 0): string {
  const keys = songKeys(sections, songKey);
  if (capo) return `Key of ${keys.map((k) => transposeKey(k, capo)).join('-')} (${keys.join('-')}, capo ${capo})`;
  return keys.length === 1 ? `Key of ${songKey}` : `Key: ${keys.join('-')}`;
}

/** The label at the top right of each page of a multi-page chart, level with the key header:
 * "p. 1 of 3" on the first page, then "Song Name, p. 2 of 3" so a loose page can be put back.
 * Null for a single-page chart. */
export function pageLabelText(title: string, pageIndex: number, pageCount: number): string | null {
  if (pageCount < 2) return null;
  const page = `p. ${pageIndex + 1} of ${pageCount}`;
  return pageIndex === 0 ? page : `${continuedTitle(title)}, ${page}`;
}

/** How later pages name the song ahead of their page number. */
export function continuedTitle(title: string): string {
  return title.trim() || 'Untitled';
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
  /** Each chord's left edge, in points from the start of the line (where unindented lyrics start). */
  chords: { offsetPt: number; label: string }[];
  /** How far in the lyrics start, in points, when the line opens with a chord before its first
   * word (see LEAD_IN_PT). */
  indentPt?: number;
}

/** True for a line of chords with no lyrics (a turn, an intro...), which prints as a single
 * line of chords where the lyrics would go instead of chords over a blank lyric line. */
export function isChordOnly(line: PlacedLine): boolean {
  return line.lyricLine.trim() === '' && line.chords.length > 0;
}

const CHORD_MIN_GAP_PT = 4; // keeps a wide chord from running into the next one
// Chords after a line's last word are spaced out like counted beats ("G   C   | Csus   | C").
const SLOT_GAP_PT = 14;
// Room on each side of a chord that sits before a word or syllable rather than on it.
const SLOT_PAD_PT = 1.5;
// "/" beat marks sit closer to the chord they count and to each other ("G / / / | C / / /"); a bar
// line still gets the full gap, so the measures stay apart.
const BEAT_GAP_PT = 7;
// A line that starts with a chord before its first word ("[A] Before the throne") starts its words
// this far in whatever the chord, so "A" and "Asus" lines line up. A longer chord just overlaps the
// start of the words a little.
const LEAD_IN_PT = 15;

/** True for a "/" beat mark's label (with or without a bar line before it). */
function isBeatLabel(label: string): boolean {
  return label.replace(/^\|\s*/, '') === BEAT_MARK;
}

// Most spaces to add on each side of a gap when spreading lyrics apart for a chord.
const MAX_SPREAD_SPACES = 40;

/**
 * Widens the lyrics before a syllable until it starts at least at `minPt`, so its chord can sit
 * over it without running into the chord before. Inside a word the syllables are split with a
 * hyphen padded by the same number of spaces on each side, at least one ("e   -   ter - nal");
 * between words the gap just gets more spaces.
 */
function spreadTo(lyricLine: string, minPt: number, withinWord: boolean, measure: TextMeasure): string {
  for (let k = 1; k <= MAX_SPREAD_SPACES; k++) {
    const gap = ' '.repeat(k);
    const candidate = withinWord ? `${lyricLine}${gap}-${gap}` : lyricLine + gap;
    if (measure(candidate, LYRIC_SIZE_PT, 'bold') >= minPt) return candidate;
  }
  return withinWord ? `${lyricLine} - ` : lyricLine;
}

/** Positions each chord at the true rendered width of the bold lyric text before its syllable,
 * so it lands above the right letter in any (proportional) font. When a chord would run into the
 * one before it, the lyrics are spread apart (see `spreadTo`) so every chord stays over its own
 * syllable. Shared by the preview, the Word export (as tab stops) and the PDF. */
export function placeChords(tokens: ChartToken[], measure: TextMeasure, repeat?: number): PlacedLine {
  let lyricLine = '';
  const chords: PlacedLine['chords'] = [];
  let nextFreePt = 0;
  // Where the next syllable may start: past a chord that comes before it (a chord slot), so that
  // chord clearly reads as before the syllable rather than on it.
  let lyricsFromPt = 0;
  // How far in the words start: LEAD_IN_PT once a chord before the first word has been placed.
  let indentPt = 0;
  let pendingIndent = 0;
  // Lyric widths are measured from the line's start, so they include the indent.
  const lyricWidth = (text: string) => indentPt + measure(text, LYRIC_SIZE_PT, 'bold');
  const indentedMeasure: TextMeasure = (text, sizePt, style) => indentPt + measure(text, sizePt, style);
  // Index of the line's last syllable with lyrics: slots after it are trailing chords.
  const lastLyric = tokens.reduce((last, tok, i) => (!tok.isSlot && tok.text ? i : last), -1);
  // The trailing chord or beat mark just placed: where it ends, and whether it was a beat mark.
  let prevTrailing: { end: number; beat: boolean } | null = null;
  tokens.forEach((tok, i) => {
    if (tok.isSlot) {
      // A chord with no lyric under it. Before a word or syllable — at the start of the line,
      // between words ("...ies [C/E] Your"), or inside a word ("i [C] magine") — it starts just
      // past the previous word and the lyrics open up after it. After the line's last word it's a
      // trailing chord, spaced out like counted beats.
      if (!tok.chordLabel) return;
      const trailing = i > lastLyric;
      const beat = isBeatLabel(tok.chordLabel);
      const tight = trailing && prevTrailing && (beat || prevTrailing.beat) && !tok.chordLabel.startsWith('|');
      const wordsEnd = lyricLine ? lyricWidth(lyricLine) : 0;
      const free = tight && prevTrailing ? prevTrailing.end + BEAT_GAP_PT : nextFreePt;
      const at = Math.max(lyricLine ? wordsEnd + (trailing ? SLOT_GAP_PT : SLOT_PAD_PT) : 0, free);
      const end = at + measure(tok.chordLabel, CHORD_SIZE_PT, 'italic');
      chords.push({ offsetPt: at, label: tok.chordLabel });
      nextFreePt = end + (trailing ? SLOT_GAP_PT : CHORD_MIN_GAP_PT);
      prevTrailing = trailing ? { end, beat } : null;
      // Before the line's first word, the words start at the lead-in; elsewhere, just past the chord.
      if (!trailing && lyricLine) lyricsFromPt = end + SLOT_PAD_PT;
      if (!trailing && !lyricLine) pendingIndent = LEAD_IN_PT;
      return;
    }
    // Inside a word, a gap opened in the lyrics gets a hyphen ("e - ter - nal", "i - magine").
    const withinWord = !tok.isWordStart && lyricLine !== '';
    if (tok.isWordStart && i !== 0 && lyricLine) lyricLine += ' ';
    if (pendingIndent && !lyricLine) {
      indentPt = pendingIndent;
      pendingIndent = 0;
    }
    // Not enough room after the previous chord (or a chord slot just before): spread the lyrics
    // instead of pushing this syllable's chord off it.
    // A chord written partway into the syllable ("J[E]esus") sits over that letter, not its start.
    const before = tok.chordLabel && tok.chordOffset ? tok.text.slice(0, tok.chordOffset) : '';
    const beforeWidth = before
      ? lyricWidth(lyricLine + before) - lyricWidth(lyricLine)
      : 0;
    const startAt = Math.max(lyricsFromPt, tok.chordLabel ? nextFreePt - beforeWidth : 0);
    if (lyricWidth(lyricLine) < startAt) lyricLine = spreadTo(lyricLine, startAt, withinWord, indentedMeasure);
    lyricsFromPt = 0;
    if (tok.chordLabel) {
      const at = Math.max(lyricWidth(lyricLine + before), nextFreePt);
      chords.push({ offsetPt: at, label: tok.chordLabel });
      nextFreePt = at + measure(tok.chordLabel, CHORD_SIZE_PT, 'italic') + CHORD_MIN_GAP_PT;
    }
    lyricLine += tok.text;
  });
  if (repeat && repeat > 1) {
    // "2x" after everything else on the line, spaced like a trailing chord, so the player sees it
    // as they reach the end of the section.
    const label = `${repeat}x`;
    const last = chords[chords.length - 1];
    const lyricsEnd = lyricLine.trim() ? lyricWidth(lyricLine) + SLOT_GAP_PT : 0;
    const chordsEnd = last ? last.offsetPt + measure(last.label, CHORD_SIZE_PT, 'italic') + SLOT_GAP_PT : 0;
    chords.push({ offsetPt: Math.max(lyricsEnd, chordsEnd), label });
  }
  return { lyricLine, chords, ...(indentPt ? { indentPt } : {}) };
}

/** How far a placed line reaches: the end of its lyrics or of its last chord, whichever is further. */
function placedWidth(line: PlacedLine, measure: TextMeasure): number {
  const lyrics = line.lyricLine.trim() ? (line.indentPt ?? 0) + measure(line.lyricLine, LYRIC_SIZE_PT, 'bold') : 0;
  const last = line.chords[line.chords.length - 1];
  return Math.max(lyrics, last ? last.offsetPt + measure(last.label, CHORD_SIZE_PT, 'italic') : 0);
}

/**
 * Lays out one chart line within `maxWidthPt` (the page width beside the label column). A line
 * too wide for the page breaks at word boundaries into several, each with its own chords, judged
 * by its width after chords are placed and lyrics spread. The preview, Word and PDF all use this,
 * so they wrap the same lines and Fit to page measures what actually prints. A section's repeat
 * mark goes on the last piece. A single word wider than the page stays whole.
 */
export function layoutLine(
  tokens: ChartToken[],
  measure: TextMeasure,
  maxWidthPt: number,
  repeat?: number,
  // Decides where the line breaks, when that must match another output measured differently (the
  // PDF breaks lines by the browser's measurements so it wraps exactly where the preview does).
  breakMeasure: TextMeasure = measure,
): PlacedLine[] {
  const fits = (piece: ChartToken[]) =>
    placedWidth(placeChords(piece, breakMeasure, repeat), breakMeasure) <= maxWidthPt;
  // Most lines fit as they are: lay them out once.
  if (fits(tokens)) return [placeChords(tokens, measure, repeat)];

  const words: ChartToken[][] = [];
  tokens.forEach((tok, i) => {
    if (i === 0 || tok.isWordStart) words.push([tok]);
    else words[words.length - 1].push(tok);
  });

  const pieces: ChartToken[][] = [];
  let current: ChartToken[] = [];
  words.forEach((word) => {
    const candidate = [...current, ...word];
    if (current.length > 0 && placedWidth(placeChords(candidate, breakMeasure), breakMeasure) > maxWidthPt) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current.length > 0) pieces.push(current);
  if (pieces.length === 0) return [placeChords([], measure, repeat)];
  return pieces.map((piece, i) => placeChords(piece, measure, i === pieces.length - 1 ? repeat : undefined));
}
