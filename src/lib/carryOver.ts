// Editing the lyrics (step 1) or the syllable splits (step 2) rebuilds the song's sections from
// scratch. These carry the earlier work over to the rebuilt song wherever the words still match:
// hand-fixed syllable splits, chords and bar lines, chord slots, section repeats, and the
// arrangement. Words are lined up old against new like a diff, so only what actually changed
// starts over.

import type { ArrangementEntry, Block, SyllableToken } from '../types';
import type { BlockMap } from './arrangement';
import { isKeyChange } from './arrangement';
import type { WordGroup } from './syllables';

/** Text compared loosely, so "Lord," still matches "lord" after a punctuation or case edit. */
function matchKey(text: string): string {
  const key = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return key || text;
}

/** Pairs up equal items of two sequences (longest common subsequence): [oldIndex, newIndex][]. */
function alignSequences(oldKeys: string[], newKeys: string[]): [number, number][] {
  const n = oldKeys.length;
  const m = newKeys.length;
  // Lengths of the common subsequence of each pair of suffixes.
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = oldKeys[i] === newKeys[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldKeys[i] === newKeys[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * Maps each old index to a new one: matched items to their match, and anything in between (a
 * reworded stretch) spread proportionally over the new items in the same gap, so a chord on a
 * changed word lands on the word that replaced it. Null where the gap is empty on the new side
 * (the words were deleted).
 */
function mapIndices(oldKeys: string[], newKeys: string[]): (number | null)[] {
  const pairs = alignSequences(oldKeys, newKeys);
  const map: (number | null)[] = new Array(oldKeys.length).fill(null);
  let prevOld = -1;
  let prevNew = -1;
  [...pairs, [oldKeys.length, newKeys.length] as [number, number]].forEach(([oi, ni]) => {
    const oldGap = oi - prevOld - 1;
    const newGap = ni - prevNew - 1;
    for (let k = 0; k < oldGap; k++) {
      if (newGap > 0) map[prevOld + 1 + k] = prevNew + 1 + Math.floor((k * newGap) / oldGap);
    }
    if (oi < oldKeys.length) map[oi] = ni;
    prevOld = oi;
    prevNew = ni;
  });
  return map;
}

/**
 * Keeps the syllable splits from before for every word that's unchanged (resubmitting the
 * lyrics otherwise re-splits every word automatically, undoing step 2's fixes).
 */
export function carryOverWordGroups(oldGroups: WordGroup[], newGroups: WordGroup[]): WordGroup[] {
  if (oldGroups.length === 0) return newGroups;
  const word = (g: WordGroup) => g.syllables.join('');
  const pairs = alignSequences(oldGroups.map(word), newGroups.map(word));
  const kept = new Map(pairs.map(([oi, ni]) => [ni, oldGroups[oi]]));
  return newGroups.map((group, i) => {
    const old = kept.get(i);
    return old ? { ...group, syllables: old.syllables } : group;
  });
}

/** How the carry-over went, for telling the user. */
export interface CarryOverReport {
  /** Chords from before that found a place in the new song. */
  kept: number;
  /** Chords that were on lyrics that are gone now. */
  dropped: number;
}

const lyricsOf = (block: Block) => block.syllables.filter((t) => !t.isChordSlot);
const hasLyrics = (block: Block) => block.syllables.some((t) => !t.isChordSlot);
const chordCount = (tokens: SyllableToken[]) => tokens.filter((t) => t.chord).length;

/** Pairs each new block with the old block of the same heading: the nth "Chorus" with the nth. */
function matchBlocks(oldBlocks: Block[], newBlocks: Block[]): Map<string, Block> {
  const headingKey = (b: Block) => `${b.type}|${b.label.trim().toLowerCase()}`;
  const oldByHeading = new Map<string, Block[]>();
  oldBlocks.forEach((b) => {
    const list = oldByHeading.get(headingKey(b)) ?? [];
    list.push(b);
    oldByHeading.set(headingKey(b), list);
  });
  const matches = new Map<string, Block>();
  newBlocks.forEach((b) => {
    const old = oldByHeading.get(headingKey(b))?.shift();
    if (old) matches.set(b.id, old);
  });
  return matches;
}

/** The new block's tokens with the old block's chords, bar lines and chord slots carried over. */
function carryOverTokens(oldBlock: Block, newBlock: Block, report: CarryOverReport): SyllableToken[] {
  const withBlock = (tok: SyllableToken): SyllableToken => ({ ...tok, blockId: newBlock.id });

  // A chord-only section (an intro, a turn) has nothing to line up: keep it as it was.
  if (!hasLyrics(newBlock)) {
    report.kept += chordCount(oldBlock.syllables);
    return oldBlock.syllables.map(withBlock);
  }

  const oldLyrics = lyricsOf(oldBlock);
  const tokens = newBlock.syllables.map(withBlock);
  const map = mapIndices(
    oldLyrics.map((t) => matchKey(t.text)),
    tokens.map((t) => matchKey(t.text)),
  );

  // Chords onto the matching (or replacing) syllables.
  oldLyrics.forEach((old, oi) => {
    if (!old.chord) return;
    const ni = map[oi];
    if (ni === null || tokens[ni].chord) {
      report.dropped++;
      return;
    }
    // A chord written partway into a syllable ("J[E]esus") keeps its letter only while the
    // syllable's text is unchanged; on a reworded syllable it goes to the start.
    const keepsLetter = !!old.chordOffset && tokens[ni].text === old.text;
    tokens[ni] = {
      ...tokens[ni],
      chord: old.chord,
      ...(old.bar ? { bar: true } : {}),
      ...(old.paren ? { paren: true } : {}),
      ...(keepsLetter ? { chordOffset: old.chordOffset } : {}),
    };
    report.kept++;
  });

  // Chord slots go back after the lyric they followed. A slot run that starts its own line (a
  // chord-only line) goes after the end of that lyric's line, so it doesn't split a lyric line.
  const inserts = new Map<number, SyllableToken[]>(); // new token index -> slots after it (-1: at the start)
  let lyricIndex = -1;
  let anchor = -1;
  let slotAt: number | null = null; // where the run of slots being placed goes
  oldBlock.syllables.forEach((old) => {
    if (!old.isChordSlot) {
      lyricIndex++;
      const mapped = map[lyricIndex];
      if (mapped !== null) anchor = mapped;
      slotAt = null;
      return;
    }
    if (slotAt === null) {
      slotAt = anchor;
      if (old.isLineStart && slotAt >= 0) {
        while (slotAt + 1 < tokens.length && !tokens[slotAt + 1].isLineStart) slotAt++;
      }
    }
    const list = inserts.get(slotAt) ?? [];
    list.push(withBlock(old));
    inserts.set(slotAt, list);
    if (old.chord) report.kept++;
  });

  const result: SyllableToken[] = [...(inserts.get(-1) ?? [])];
  tokens.forEach((tok, i) => {
    result.push(tok);
    result.push(...(inserts.get(i) ?? []));
  });
  return result.map((tok, i) => ({ ...tok, localIndex: i }));
}

/**
 * Carries the earlier chords, chord slots, repeats and arrangement over to sections rebuilt from
 * edited lyrics. Sections are matched by heading. The old arrangement (its order, repeated
 * sections and key changes) is kept as long as it still makes sense; a section that's new in the
 * lyrics goes in after the one before it, and a section whose heading is gone is left out.
 */
export function carryOverBlocks(
  oldBlocks: BlockMap,
  oldArrangement: ArrangementEntry[],
  newBlocks: Block[],
  newArrangement: ArrangementEntry[],
): { blocks: Block[]; arrangement: ArrangementEntry[]; report: CarryOverReport | null } {
  const oldList = Object.values(oldBlocks);
  if (oldList.length === 0) {
    return { blocks: newBlocks, arrangement: newArrangement, report: null };
  }

  const report: CarryOverReport = { kept: 0, dropped: 0 };
  const matches = matchBlocks(oldList, newBlocks);
  const blocks = newBlocks.map((b) => {
    const old = matches.get(b.id);
    if (!old) return b;
    return { ...b, ...(old.repeat ? { repeat: old.repeat } : {}), syllables: carryOverTokens(old, b, report) };
  });
  const newIdFor = new Map([...matches].map(([newId, old]) => [old.id, newId]));

  // Chord-only sections added on step 3 or in Arrange sections, which have no heading in the
  // lyrics, are kept along with their place in the arrangement.
  const extraBlocks = oldList.filter((b) => !newIdFor.has(b.id) && !hasLyrics(b));
  const extraIds = new Set(extraBlocks.map((b) => b.id));
  oldList
    .filter((b) => !newIdFor.has(b.id) && hasLyrics(b))
    .forEach((b) => (report.dropped += chordCount(b.syllables)));

  const keyChanges = (entries: ArrangementEntry[]) => entries.filter(isKeyChange).length;
  let arrangement: ArrangementEntry[];
  if (keyChanges(oldArrangement) !== keyChanges(newArrangement)) {
    // A key change line was added or removed in the lyrics: the lyrics' own order wins.
    arrangement = newArrangement;
  } else {
    arrangement = oldArrangement.flatMap((entry): ArrangementEntry[] => {
      if (isKeyChange(entry)) return [entry];
      const newId = newIdFor.get(entry);
      if (newId) return [newId];
      return extraIds.has(entry) ? [entry] : [];
    });
    // Sections new in the lyrics go in after the section before them in the lyrics.
    newArrangement.forEach((entry, i) => {
      if (isKeyChange(entry) || arrangement.includes(entry)) return;
      const before = newArrangement.slice(0, i).reverse().find((e) => !isKeyChange(e) && arrangement.includes(e));
      const at = before ? arrangement.lastIndexOf(before) + 1 : 0;
      arrangement.splice(at, 0, entry);
    });
  }

  const used = new Set(arrangement.filter((e): e is string => !isKeyChange(e)));
  const keptExtras = extraBlocks.filter((b) => used.has(b.id));
  report.kept += chordCount(keptExtras.flatMap((b) => b.syllables));
  return {
    blocks: [...blocks, ...keptExtras],
    arrangement,
    report,
  };
}
