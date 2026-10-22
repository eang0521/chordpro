import type { Block, KeyName, SyllableToken } from '../types';
import type { BlockMap } from './arrangement';
import { makeId } from './id';
import { formatChord, transposeKey } from './musicTheory';

/** What a beat mark (see SyllableToken.beat) prints as. */
export const BEAT_MARK = '/';

/** The chord (or beat mark) printed over a syllable, in the key it's played in, with a leading
 * "| " for a bar line and in parentheses if marked so ("(G)"); null when there's neither. */
export function chordMarkLabel(syl: SyllableToken, songKey: KeyName): string | null {
  const mark = syl.chord
    ? withParen(formatChord(transposeKey(songKey, syl.keyShift ?? 0), syl.chord), syl.paren)
    : syl.beat && syl.isChordSlot
      ? BEAT_MARK
      : null;
  return mark ? `${syl.bar ? '| ' : ''}${mark}` : null;
}

/** A chord's name, in parentheses when `paren` is set. */
export function withParen(chord: string, paren: boolean | undefined): string {
  return paren ? `(${chord})` : chord;
}

/** Splits parentheses off a typed or written chord: "(G)" is G in parentheses. */
export function splitParen(text: string): { text: string; paren: boolean } {
  const match = /^\(\s*(.*?)\s*\)$/.exec(text.trim());
  return match ? { text: match[1], paren: true } : { text: text.trim(), paren: false };
}

/** How many empty chord slots a new chord-only line (or instrumental section) starts with. */
export const DEFAULT_SLOT_COUNT = 4;

export function makeChordSlot(blockId: string, isLineStart: boolean): SyllableToken {
  return {
    id: makeId(),
    text: '',
    isWordStart: true,
    isLineStart,
    chord: null,
    isChordSlot: true,
    blockId,
    localIndex: 0, // set by renumber()
  };
}

/** A line of empty chord slots. */
export function makeChordLine(blockId: string, count = DEFAULT_SLOT_COUNT): SyllableToken[] {
  return Array.from({ length: count }, (_, i) => makeChordSlot(blockId, i === 0));
}

function renumber(syllables: SyllableToken[]): SyllableToken[] {
  return syllables.map((tok, i) => (tok.localIndex === i ? tok : { ...tok, localIndex: i }));
}

function withSyllables(blocks: BlockMap, block: Block, syllables: SyllableToken[]): BlockMap {
  return { ...blocks, [block.id]: { ...block, syllables: renumber(syllables) } };
}

/** Inserts tokens right after `afterLocalIndex` in a block. */
export function insertTokens(blocks: BlockMap, blockId: string, afterLocalIndex: number, tokens: SyllableToken[]): BlockMap {
  const block = blocks[blockId];
  if (!block) return blocks;
  const next = [...block.syllables];
  next.splice(afterLocalIndex + 1, 0, ...tokens);
  return withSyllables(blocks, block, next);
}

/** Index just past the end of the line containing `localIndex`. */
export function lineEnd(block: Block, localIndex: number): number {
  let end = localIndex + 1;
  while (end < block.syllables.length && !block.syllables[end].isLineStart) end++;
  return end;
}

/**
 * Removes a token (meant for chord slots). The next token on the same line takes over as the
 * line's start if needed. Refuses to empty a block entirely, since an empty block would vanish
 * from the song.
 */
export function removeToken(blocks: BlockMap, blockId: string, localIndex: number): BlockMap {
  const block = blocks[blockId];
  if (!block || block.syllables.length <= 1) return blocks;
  const removed = block.syllables[localIndex];
  const next = block.syllables.filter((_, i) => i !== localIndex);
  const follower = next[localIndex];
  if (removed?.isLineStart && follower && !follower.isLineStart) {
    next[localIndex] = { ...follower, isLineStart: true, ...(removed.gapBefore ? { gapBefore: true } : {}) };
  }
  return withSyllables(blocks, block, next);
}

/** A new instrumental section with one line of empty chord slots. */
export function makeInstrumentalBlock(label = 'Instrumental'): Block {
  const id = makeId();
  return { id, type: 'instrumental', label, syllables: renumber(makeChordLine(id)) };
}
