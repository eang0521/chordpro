import type { Block, SyllableToken } from '../types';
import { makeId } from './id';

/** How one target line gets its chords: from which source line, nudged by how many syllables. */
export interface LineMapping {
  /** Index of the source line to copy from, or null to leave this target line's chords alone. */
  sourceLine: number | null;
  /** Syllables to shift the copied chords by — positive moves them later in the line. */
  shift: number;
}

export interface LinePreview {
  /** The target line as it will be after copying: its lyrics with the copied chords, plus the
   * source line's chord slots. */
  tokens: SyllableToken[];
  /** Source chords that land before the start or past the end of the target line and are lost. */
  dropped: number;
  /** Lyric syllables (not counting chord slots) in each line. */
  sourceLyricCount: number;
  targetLyricCount: number;
  /** True if the source and target lines have different numbers of lyric syllables. */
  mismatch: boolean;
}

/** Splits a block's syllables into lines (the first syllable always starts one). */
export function splitLines(block: Block): SyllableToken[][] {
  const lines: SyllableToken[][] = [];
  block.syllables.forEach((tok, i) => {
    if (i === 0 || tok.isLineStart) lines.push([tok]);
    else lines[lines.length - 1].push(tok);
  });
  return lines;
}

/** Pairs each target line with the source line at the same position, unshifted. */
export function defaultMappings(sourceLineCount: number, targetLineCount: number): LineMapping[] {
  return Array.from({ length: targetLineCount }, (_, i) => ({
    sourceLine: i < sourceLineCount ? i : null,
    shift: 0,
  }));
}

/** Marks chord slots copied in by a preview, so applyCopy can give them real ids. */
const COPIED_SLOT_PREFIX = 'copied-slot-';

/**
 * Copies one line's chords onto another. Lyric syllables are paired up in order (offset by
 * `shift`), ignoring chord slots on both sides; then the source line's chord slots — and the
 * chords on them — are rebuilt in the target at the same place among its lyrics: before the
 * first word, between words (moving with `shift`), or after the last word. Any slots the target
 * line had are replaced, just like its chords.
 */
export function previewLine(source: SyllableToken[], target: SyllableToken[], shift: number): LinePreview {
  const sourceLyrics = source.filter((t) => !t.isChordSlot);
  // Copied chords land at the start of their syllable: the target's words differ.
  const lyrics: SyllableToken[] = target
    .filter((t) => !t.isChordSlot)
    .map((t) => ({ ...t, chord: null, bar: false, chordOffset: undefined }));

  let dropped = 0;
  sourceLyrics.forEach((tok, i) => {
    if (!tok.chord) return;
    const j = i + shift;
    if (j < 0 || j >= lyrics.length) dropped += 1;
    else lyrics[j] = { ...lyrics[j], chord: tok.chord, bar: !!tok.bar };
  });

  // Each source slot's place: how many lyric syllables come before it. Slots at either end of
  // the line stay at that end; ones between words move with the shift but stay between words.
  const slotsAt = new Map<number, SyllableToken[]>();
  let lyricsBefore = 0;
  source.forEach((tok) => {
    if (!tok.isChordSlot) {
      lyricsBefore += 1;
      return;
    }
    let at: number;
    if (lyricsBefore === 0) at = 0;
    else if (lyricsBefore === sourceLyrics.length) at = lyrics.length;
    else at = Math.min(Math.max(lyricsBefore + shift, Math.min(1, lyrics.length)), Math.max(lyrics.length - 1, 0));
    const copy: SyllableToken = { ...tok, id: `${COPIED_SLOT_PREFIX}${tok.id}`, blockId: target[0]?.blockId ?? tok.blockId };
    slotsAt.set(at, [...(slotsAt.get(at) ?? []), copy]);
  });

  const tokens: SyllableToken[] = [];
  for (let k = 0; k <= lyrics.length; k++) {
    tokens.push(...(slotsAt.get(k) ?? []));
    if (k < lyrics.length) tokens.push(lyrics[k]);
  }
  tokens.forEach((tok, i) => (tokens[i] = { ...tok, isLineStart: i === 0 }));

  return {
    tokens,
    dropped,
    sourceLyricCount: sourceLyrics.length,
    targetLyricCount: lyrics.length,
    mismatch: sourceLyrics.length !== lyrics.length,
  };
}

/** Returns the target block with every mapped line replaced by its copied version. */
export function applyCopy(source: Block, target: Block, mappings: LineMapping[]): Block {
  const sourceLines = splitLines(source);
  const syllables = splitLines(target)
    .flatMap((line, li) => {
      const mapping = mappings[li];
      const sourceLine = mapping?.sourceLine != null ? sourceLines[mapping.sourceLine] : undefined;
      return sourceLine ? previewLine(sourceLine, line, mapping.shift).tokens : line;
    })
    .map((tok, i) => ({
      ...tok,
      id: tok.id.startsWith(COPIED_SLOT_PREFIX) ? makeId() : tok.id,
      blockId: target.id,
      localIndex: i,
    }));
  return { ...target, syllables };
}
