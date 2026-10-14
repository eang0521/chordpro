import type { Block, Chord, SyllableToken } from '../types';

/** How one target line gets its chords: from which source line, nudged by how many syllables. */
export interface LineMapping {
  /** Index of the source line to copy from, or null to leave this target line's chords alone. */
  sourceLine: number | null;
  /** Syllables to shift the copied chords by — positive moves them later in the line. */
  shift: number;
}

export interface LinePreview {
  /** The chord each target syllable will end up with. */
  chords: (Chord | null)[];
  /** Source chords that land before the start or past the end of the target line and are lost. */
  dropped: number;
  /** True if the source and target lines have different syllable counts. */
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

/** Copies chords syllable-for-syllable from one line onto another, offset by `shift`. */
export function previewLine(source: SyllableToken[], target: SyllableToken[], shift: number): LinePreview {
  const chords: (Chord | null)[] = target.map(() => null);
  let dropped = 0;
  source.forEach((tok, i) => {
    if (!tok.chord) return;
    const j = i + shift;
    if (j < 0 || j >= target.length) dropped += 1;
    else chords[j] = tok.chord;
  });
  return { chords, dropped, mismatch: source.length !== target.length };
}

/** Returns the target block with every mapped line's chords replaced by the copied ones. */
export function applyCopy(source: Block, target: Block, mappings: LineMapping[]): Block {
  const sourceLines = splitLines(source);
  const syllables = splitLines(target).flatMap((line, li) => {
    const mapping = mappings[li];
    const sourceLine = mapping?.sourceLine != null ? sourceLines[mapping.sourceLine] : undefined;
    if (!sourceLine) return line;
    const { chords } = previewLine(sourceLine, line, mapping.shift);
    return line.map((tok, i) => ({ ...tok, chord: chords[i] }));
  });
  return { ...target, syllables };
}
