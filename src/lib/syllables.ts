import Hypher from 'hypher';
import englishPatterns from 'hyphenation.en-us';
import type { SyllableToken } from '../types';
import { makeId } from './id';

const hypher = new Hypher(englishPatterns);

/** A word's editable syllable breakdown, grouped by the line it appears on. */
export interface WordGroup {
  id: string;
  lineIndex: number;
  syllables: string[];
}

/** Splits one word into syllables, keeping any leading/trailing punctuation attached to its edge syllable. */
function hyphenateWord(word: string): string[] {
  const match = word.match(/^([^A-Za-z0-9]*)([A-Za-z0-9'-]*)([^A-Za-z0-9]*)$/);
  if (!match) return [word];
  const [, lead, core, trail] = match;
  if (!core) return [word];

  const parts = hypher.hyphenate(core);
  if (parts.length === 0) return [word];

  const result = [...parts];
  result[0] = lead + result[0];
  result[result.length - 1] = result[result.length - 1] + trail;
  return result;
}

/** Parses raw multi-line lyrics text into editable word groups, one per whitespace-separated word. */
export function parseLyricsToWordGroups(text: string): WordGroup[] {
  const groups: WordGroup[] = [];
  const lines = text.split('\n');
  lines.forEach((line, lineIndex) => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    words.forEach((word) => {
      groups.push({ id: makeId(), lineIndex, syllables: hyphenateWord(word) });
    });
  });
  return groups;
}

/** Flattens editable word groups into the sequential syllable list used for recording/playback/export. */
export function wordGroupsToSyllables(groups: WordGroup[]): SyllableToken[] {
  const tokens: SyllableToken[] = [];
  let prevLineIndex: number | null = null;
  groups.forEach((group) => {
    const isNewLine = group.lineIndex !== prevLineIndex;
    prevLineIndex = group.lineIndex;
    group.syllables
      .filter((s) => s.length > 0)
      .forEach((text, i) => {
        tokens.push({
          id: makeId(),
          text,
          isWordStart: i === 0,
          isLineStart: i === 0 && isNewLine,
          offsetMs: null,
          chordDegrees: [],
        });
      });
  });
  return tokens;
}

/** Reconstructs editable word groups from a flat syllable list (e.g. when navigating back to edit). */
export function syllablesToWordGroups(syllables: SyllableToken[]): WordGroup[] {
  const groups: WordGroup[] = [];
  let lineIndex = -1;
  let current: WordGroup | null = null;
  syllables.forEach((syl) => {
    if (syl.isLineStart) lineIndex += 1;
    if (syl.isWordStart || !current) {
      current = { id: makeId(), lineIndex: Math.max(lineIndex, 0), syllables: [] };
      groups.push(current);
    }
    current.syllables.push(syl.text);
  });
  return groups;
}

/** Splits a manually-edited "syl·la·ble" string back into an array of syllable strings. */
export function splitEditedWord(value: string): string[] {
  return value
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function joinSyllablesForEditing(syllables: string[]): string {
  return syllables.join('·');
}
