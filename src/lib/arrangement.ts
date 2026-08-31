import type { Block, SyllableToken } from '../types';
import { makeId } from './id';

export type BlockMap = Record<string, Block>;

/**
 * Expands the arrangement (an ordered list of block ids, which may repeat) into the flat
 * syllable sequence used for tapping pace, placing chords, and exporting. Repeated blocks
 * are "linked": each occurrence renders the SAME underlying tokens (so edits made through
 * `updateBlockToken` show up at every occurrence), only the React key is made unique per
 * occurrence. A section heading is attached to the first token of every occurrence, not just
 * the first time the block appears.
 */
export function deriveFlatSyllables(blocks: BlockMap, arrangement: string[]): SyllableToken[] {
  const flat: SyllableToken[] = [];
  arrangement.forEach((blockId, occurrence) => {
    const block = blocks[blockId];
    if (!block) return;
    block.syllables.forEach((tok, i) => {
      flat.push({
        ...tok,
        id: `${occurrence}-${tok.id}`,
        section: i === 0 ? { type: block.type, label: block.label } : undefined,
      });
    });
  });
  return flat;
}

/** Applies an update to one token, identified by its canonical block + local index, wherever it lives. */
export function updateBlockToken(
  blocks: BlockMap,
  blockId: string,
  localIndex: number,
  updater: (tok: SyllableToken) => SyllableToken,
): BlockMap {
  const block = blocks[blockId];
  if (!block) return blocks;
  const syllables = block.syllables.map((tok, i) => (i === localIndex ? updater(tok) : tok));
  return { ...blocks, [blockId]: { ...block, syllables } };
}

export function moveArrangementItem(arrangement: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= arrangement.length || to >= arrangement.length) {
    return arrangement;
  }
  const next = [...arrangement];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Inserts another reference to the same (linked) block right after the given position. */
export function duplicateArrangementItem(arrangement: string[], at: number): string[] {
  const blockId = arrangement[at];
  if (blockId == null) return arrangement;
  const next = [...arrangement];
  next.splice(at + 1, 0, blockId);
  return next;
}

/**
 * Splits one occurrence off into its own independent block (a full copy of the current
 * lyrics/timing/chords), so it can be edited without affecting the other linked occurrences —
 * e.g. a final chorus that needs a small lyric change. No-op if this occurrence is already
 * the only one referencing its block.
 */
export function unlinkArrangementItem(blocks: BlockMap, arrangement: string[], at: number): {
  blocks: BlockMap;
  arrangement: string[];
} {
  const blockId = arrangement[at];
  const block = blockId != null ? blocks[blockId] : undefined;
  if (!block) return { blocks, arrangement };

  const otherOccurrences = arrangement.some((id, i) => id === blockId && i !== at);
  if (!otherOccurrences) return { blocks, arrangement };

  const newId = makeId();
  const copy: Block = {
    id: newId,
    type: block.type,
    label: block.label,
    syllables: block.syllables.map((tok) => ({ ...tok, id: makeId(), blockId: newId })),
  };
  const nextArrangement = arrangement.map((id, i) => (i === at ? newId : id));
  return { blocks: { ...blocks, [newId]: copy }, arrangement: nextArrangement };
}

/** Removes one occurrence from the arrangement; deletes the block itself if that was its last occurrence. */
export function removeArrangementItem(
  blocks: BlockMap,
  arrangement: string[],
  at: number,
): { blocks: BlockMap; arrangement: string[] } {
  const blockId = arrangement[at];
  if (blockId == null) return { blocks, arrangement };
  const nextArrangement = arrangement.filter((_, i) => i !== at);
  const stillUsed = nextArrangement.includes(blockId);
  if (stillUsed) return { blocks, arrangement: nextArrangement };
  const { [blockId]: _removed, ...rest } = blocks;
  return { blocks: rest, arrangement: nextArrangement };
}
