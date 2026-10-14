import type { ArrangementEntry, Block, KeyChange, SyllableToken } from '../types';
import { makeId } from './id';

export type BlockMap = Record<string, Block>;

export function isKeyChange(entry: ArrangementEntry | undefined): entry is KeyChange {
  return typeof entry === 'object' && entry !== null && entry.kind === 'keyChange';
}

/** The arrangement's block ids, in order (repeats included), without its key changes. */
export function blockIdsOf(arrangement: ArrangementEntry[]): string[] {
  return arrangement.filter((e): e is string => typeof e === 'string');
}

export function makeKeyChange(semitones: number): KeyChange {
  return { kind: 'keyChange', id: makeId(), semitones: ((semitones % 12) + 12) % 12 };
}

/** Semitones above the song's key in effect just before position `at`. */
export function keyShiftBefore(arrangement: ArrangementEntry[], at: number): number {
  for (let i = Math.min(at, arrangement.length) - 1; i >= 0; i--) {
    const entry = arrangement[i];
    if (isKeyChange(entry)) return entry.semitones;
  }
  return 0;
}

/**
 * Expands the arrangement (an ordered list of block ids, which may repeat, plus key changes)
 * into the flat syllable sequence used for placing chords and exporting. Repeated blocks
 * are "linked": each occurrence renders the SAME underlying tokens (so edits made through
 * `updateBlockToken` show up at every occurrence), only the React key is made unique per
 * occurrence. A section heading is attached to the first token of every occurrence, not just
 * the first time the block appears. Every token also carries the key it's played in
 * (`keyShift`), and the first one after a key change is flagged with `keyChange`.
 */
export function deriveFlatSyllables(blocks: BlockMap, arrangement: ArrangementEntry[]): SyllableToken[] {
  const flat: SyllableToken[] = [];
  let keyShift = 0;
  let pendingKeyChange = false;
  arrangement.forEach((entry, occurrence) => {
    if (isKeyChange(entry)) {
      pendingKeyChange = entry.semitones !== keyShift || pendingKeyChange;
      keyShift = entry.semitones;
      return;
    }
    const block = blocks[entry];
    if (!block || block.syllables.length === 0) return;
    block.syllables.forEach((tok, i) => {
      flat.push({
        ...tok,
        id: `${occurrence}-${tok.id}`,
        section: i === 0 ? { type: block.type, label: block.label } : undefined,
        keyShift,
        ...(i === 0 && pendingKeyChange ? { keyChange: true } : {}),
      });
    });
    pendingKeyChange = false;
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

export function moveArrangementItem(arrangement: ArrangementEntry[], from: number, to: number): ArrangementEntry[] {
  if (from === to || from < 0 || to < 0 || from >= arrangement.length || to >= arrangement.length) {
    return arrangement;
  }
  const next = [...arrangement];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Inserts another reference to the same (linked) block right after the given position. */
export function duplicateArrangementItem(arrangement: ArrangementEntry[], at: number): ArrangementEntry[] {
  const blockId = arrangement[at];
  if (typeof blockId !== 'string') return arrangement;
  const next = [...arrangement];
  next.splice(at + 1, 0, blockId);
  return next;
}

/**
 * Splits one occurrence off into its own independent block (a full copy of the current
 * lyrics/chords), so it can be edited without affecting the other linked occurrences —
 * e.g. a final chorus that needs a small lyric change. No-op if this occurrence is already
 * the only one referencing its block.
 */
export function unlinkArrangementItem(blocks: BlockMap, arrangement: ArrangementEntry[], at: number): {
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
} {
  const blockId = arrangement[at];
  const block = typeof blockId === 'string' ? blocks[blockId] : undefined;
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

/** Removes one entry from the arrangement; deletes a block itself if that was its last occurrence. */
export function removeArrangementItem(
  blocks: BlockMap,
  arrangement: ArrangementEntry[],
  at: number,
): { blocks: BlockMap; arrangement: ArrangementEntry[] } {
  const blockId = arrangement[at];
  if (blockId == null) return { blocks, arrangement };
  const nextArrangement = arrangement.filter((_, i) => i !== at);
  if (typeof blockId !== 'string') return { blocks, arrangement: nextArrangement };
  const stillUsed = nextArrangement.includes(blockId);
  if (stillUsed) return { blocks, arrangement: nextArrangement };
  const { [blockId]: _removed, ...rest } = blocks;
  return { blocks: rest, arrangement: nextArrangement };
}
