import type { Block, SyllableToken } from '../types';
import type { BlockMap } from './arrangement';
import { makeId } from './id';

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
    next[localIndex] = { ...follower, isLineStart: true };
  }
  return withSyllables(blocks, block, next);
}

/** A new instrumental section with one line of empty chord slots. */
export function makeInstrumentalBlock(label = 'Instrumental'): Block {
  const id = makeId();
  return { id, type: 'instrumental', label, syllables: renumber(makeChordLine(id)) };
}
