import Hypher from 'hypher';
import englishPatterns from 'hyphenation.en-us';
import type { SectionType, SyllableToken } from '../types';
import { makeId } from './id';

const hypher = new Hypher(englishPatterns);

/** A word's editable syllable breakdown, grouped by the line it appears on. */
export interface WordGroup {
  id: string;
  lineIndex: number;
  syllables: string[];
}

/** A detected section heading (e.g. "Verse 1", "BRIDGE"), anchored to the lyric line it precedes. */
export interface Section {
  type: SectionType;
  label: string;
  beforeLineIndex: number;
}

const SECTION_KEYWORDS = [
  'pre-?chorus',
  'post-?chorus',
  'verse',
  'chorus',
  'bridge',
  'intro',
  'outro',
  'tag',
  'interlude',
  'instrumental',
  'refrain',
  'ending',
  'vamp',
  'hook',
  'breakdown',
];

// Matches a line that is ONLY a section keyword plus trailing numbering/punctuation
// (e.g. "Verse 1", "BRIDGE", "Pre-Chorus 2:", "[Tag]" once brackets are stripped) —
// never a normal lyric line, since any other trailing word fails the charset.
const SECTION_HEADER_RE = new RegExp(`^(${SECTION_KEYWORDS.join('|')})[\\s0-9ivxIVX.\\-:]*$`, 'i');

function classifySectionType(keyword: string): SectionType {
  const normalized = keyword.toLowerCase().replace(/[\s-]/g, '');
  if (normalized === 'verse') return 'verse';
  if (normalized === 'chorus') return 'chorus';
  if (normalized === 'bridge') return 'bridge';
  return 'other';
}

function detectSectionHeader(line: string): { type: SectionType; label: string } | null {
  const stripped = line.replace(/^[[(]\s*/, '').replace(/\s*[\])]$/, '').trim();
  const match = stripped.match(SECTION_HEADER_RE);
  if (!match) return null;
  return { type: classifySectionType(match[1]), label: stripped };
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

/**
 * Parses raw multi-line lyrics text into editable word groups plus any detected section
 * headings (Verse/Chorus/Bridge/etc.). Header lines are excluded from the word groups —
 * they're structural labels, not lyrics to be tapped or charted.
 */
export function parseLyricsToWordGroups(text: string): { groups: WordGroup[]; sections: Section[] } {
  const groups: WordGroup[] = [];
  const sections: Section[] = [];
  let lineIndex = 0;

  text.split('\n').forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) return;

    const header = detectSectionHeader(trimmed);
    if (header) {
      sections.push({ ...header, beforeLineIndex: lineIndex });
      return;
    }

    trimmed
      .split(/\s+/)
      .filter(Boolean)
      .forEach((word) => {
        groups.push({ id: makeId(), lineIndex, syllables: hyphenateWord(word) });
      });
    lineIndex += 1;
  });

  return { groups, sections };
}

/** Flattens editable word groups (plus section headings) into the sequential syllable list used for recording/playback/export. */
export function wordGroupsToSyllables(groups: WordGroup[], sections: Section[] = []): SyllableToken[] {
  const sectionByLine = new Map<number, Section>();
  sections.forEach((s) => sectionByLine.set(s.beforeLineIndex, s));

  const tokens: SyllableToken[] = [];
  let prevLineIndex: number | null = null;
  groups.forEach((group) => {
    const isNewLine = group.lineIndex !== prevLineIndex;
    prevLineIndex = group.lineIndex;
    group.syllables
      .filter((s) => s.length > 0)
      .forEach((text, i) => {
        const isFirstOfWord = i === 0;
        const isLineStart = isFirstOfWord && isNewLine;
        const section = isLineStart ? sectionByLine.get(group.lineIndex) : undefined;
        tokens.push({
          id: makeId(),
          text,
          isWordStart: isFirstOfWord,
          isLineStart,
          offsetMs: null,
          chordDegrees: [],
          section: section ? { type: section.type, label: section.label } : undefined,
        });
      });
  });
  return tokens;
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
