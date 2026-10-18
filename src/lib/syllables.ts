import type { ArrangementEntry, Block, KeyName, SectionType } from '../types';
import { makeId } from './id';
import { makeChordLine } from './chordSlots';
import { makeKeyChange } from './arrangement';
import { keyFromName, semitonesBetween } from './musicTheory';
import { syllabifyCore } from './syllabify';
import { applyOverride } from './syllableOverrides';

/** A word's editable syllable breakdown, grouped by the line it appears on. */
export interface WordGroup {
  id: string;
  lineIndex: number;
  syllables: string[];
  /** On a line's first word: a blank line came before this line inside its section. */
  gapBefore?: boolean;
}

/** A detected section heading (e.g. "Verse 1", "BRIDGE"), anchored to the lyric line it precedes. */
export interface Section {
  type: SectionType;
  label: string;
  beforeLineIndex: number;
  /** Set for a key change line ("Key change to D") rather than a section heading: the new key,
   * or null if the line doesn't say. */
  keyChange?: { to: KeyName | null };
}

// A line that marks a key change: "Key change", "Key change to D", "Modulate to Eb", "Key of D",
// "New key: F#". Like section headings, only a line that is nothing else counts.
const KEY_CHANGE_RE = /^(?:key\s*change|modulat(?:e|ion))(?:\s*(?:to|:|-|–)?\s*(?:the\s+)?(?:key\s+of\s+)?([A-G][#b♯♭]?))?\s*[:.!]?$/i;
const NEW_KEY_RE = /^(?:new\s+)?key(?:\s+of|\s*:)\s*([A-G][#b♯♭]?)\s*\.?$/i;

function detectKeyChange(line: string): { to: KeyName | null } | null {
  const stripped = line.replace(/^[[(]\s*/, '').replace(/\s*[\])]$/, '').trim();
  const match = KEY_CHANGE_RE.exec(stripped) ?? NEW_KEY_RE.exec(stripped);
  if (!match) return null;
  const name = match[1]?.replace('♯', '#').replace('♭', 'b');
  return { to: name ? keyFromName(name) : null };
}

const SECTION_KEYWORDS = [
  'pre-?chorus',
  'post-?chorus',
  'verse',
  'chorus',
  'bridge',
  'intro',
  'midtro',
  'outro',
  'turn(?:around)?',
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

// Headings for chord-only parts of a song. One with no lyrics under it (like "Turn" right
// before "Verse 4") still becomes a section, made of empty chord slots to fill in.
const INSTRUMENTAL_KEYWORDS = new Set(['intro', 'midtro', 'outro', 'turn', 'turnaround', 'tag', 'interlude', 'instrumental', 'ending']);

function classifySectionType(keyword: string): SectionType {
  const normalized = keyword.toLowerCase().replace(/[\s-]/g, '');
  if (normalized === 'verse') return 'verse';
  if (normalized === 'chorus') return 'chorus';
  if (normalized === 'bridge') return 'bridge';
  if (INSTRUMENTAL_KEYWORDS.has(normalized)) return 'instrumental';
  return 'other';
}

// Shorthand for a numbered verse, as in "v2", "V 3:" or "vs. 1", printed as "Verse 2". Only with
// a number: a lone "V" could be a lyric, and there's no "c2" for Chorus 2, since C2 is a chord.
const VERSE_SHORTHAND_RE = /^vs?\.?\s*(\d+)\s*[.:]?$/i;

function detectSectionHeader(line: string): { type: SectionType; label: string } | null {
  const stripped = line.replace(/^[[(]\s*/, '').replace(/\s*[\])]$/, '').trim();
  const verse = VERSE_SHORTHAND_RE.exec(stripped);
  if (verse) return { type: 'verse', label: `Verse ${Number(verse[1])}` };
  const match = stripped.match(SECTION_HEADER_RE);
  if (!match) return null;
  return { type: classifySectionType(match[1]), label: stripped };
}

// Lyrics pasted from lots of places (Genius, word processors with "smart quotes", hymnals)
// use a curly apostrophe instead of a plain one — normalize to a plain ' so "Father's"-style
// words match the word-boundary regex below instead of silently failing to split at all.
export function normalizeApostrophes(text: string): string {
  return text.replace(/[‘’ʼ`]/g, "'");
}

/** Splits one word into syllables, keeping any leading/trailing punctuation attached to its edge syllable. */
export function hyphenateWord(word: string): string[] {
  const match = word.match(/^([^A-Za-z0-9]*)([A-Za-z0-9'-]*)([^A-Za-z0-9]*)$/);
  if (!match) return [word];
  const [, lead, core, trail] = match;
  if (!core) return [word];

  // A commonly re-split word ("every" → eve·ry) or one the user re-split before wins over the
  // spelling-based split.
  const parts = applyOverride(core) ?? syllabifyCore(core);
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
  // A blank line between two lyric lines of the same section splits it into parts; blank lines
  // before a heading (or before any lyrics) are just the usual space between sections.
  let linesInSection = 0;
  let pendingGap = false;

  normalizeApostrophes(text)
    .split('\n')
    .forEach((rawLine) => {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0) {
        if (linesInSection > 0) pendingGap = true;
        return;
      }

      const keyChange = detectKeyChange(trimmed);
      if (keyChange) {
        sections.push({ type: 'other', label: trimmed, beforeLineIndex: lineIndex, keyChange });
        linesInSection = 0;
        pendingGap = false;
        return;
      }

      const header = detectSectionHeader(trimmed);
      if (header) {
        sections.push({ ...header, beforeLineIndex: lineIndex });
        linesInSection = 0;
        pendingGap = false;
        return;
      }

      trimmed
        .split(/\s+/)
        .filter(Boolean)
        .forEach((word, w) => {
          groups.push({
            id: makeId(),
            lineIndex,
            syllables: hyphenateWord(word),
            ...(w === 0 && pendingGap ? { gapBefore: true } : {}),
          });
        });
      pendingGap = false;
      linesInSection += 1;
      lineIndex += 1;
    });

  return { groups, sections };
}

/**
 * Splits editable word groups (plus detected section headings) into one Block per section —
 * each block owns its own syllable tokens, ready to be reordered/duplicated in the arrangement.
 * Lyrics before the first heading (or a song with no headings at all) become a single
 * unlabeled "other" block, so every syllable always belongs to exactly one block. Returns the
 * blocks plus the song's arrangement: the blocks in order, with any key change lines as key
 * changes between them (relative to `songKey`).
 */
export function wordGroupsToBlocks(
  groups: WordGroup[],
  sections: Section[],
  songKey: KeyName,
): { blocks: Block[]; arrangement: ArrangementEntry[] } {
  const sectionsByLine = groupSectionsByLine(sections);

  const blocks: Block[] = [];
  const arrangement: ArrangementEntry[] = [];
  let currentBlock: Block | null = null;
  let prevLineIndex: number | null = null;
  let keyShift = 0;

  function startBlock(type: SectionType, label: string) {
    currentBlock = { id: makeId(), type, label, syllables: [] };
    blocks.push(currentBlock);
    arrangement.push(currentBlock.id);
  }

  // A heading with no lyrics before the next heading: an instrumental one becomes a line of empty
  // chord slots; any other kind is dropped, as before.
  function addEmptySection(section: Section) {
    if (section.type !== 'instrumental') return;
    const id = makeId();
    const syllables = makeChordLine(id).map((tok, i) => ({ ...tok, localIndex: i }));
    blocks.push({ id, type: section.type, label: section.label, syllables });
    arrangement.push(id);
  }

  // A key change line. One that doesn't name the new key goes up a whole step, the most common
  // change (it can be adjusted in Arrange sections). One before any lyrics is ignored, since the
  // song's key is picked on the first step.
  function addKeyChange(section: Section) {
    if (blocks.length === 0) return;
    const to = section.keyChange?.to;
    keyShift = to ? semitonesBetween(songKey, to) : (keyShift + 2) % 12;
    arrangement.push(makeKeyChange(keyShift));
    currentBlock = null; // lyrics after it start a new section, even without a heading
  }

  groups.forEach((group) => {
    const isNewLine = group.lineIndex !== prevLineIndex;
    prevLineIndex = group.lineIndex;

    const lineSections = isNewLine ? sectionsByLine.get(group.lineIndex) ?? [] : [];
    // The last heading on a line owns the lyrics that follow; earlier ones have none.
    const lastHeading = lineSections.reduce((last, s, i) => (s.keyChange ? last : i), -1);
    lineSections.forEach((s, i) => {
      if (s.keyChange) addKeyChange(s);
      else if (i === lastHeading) startBlock(s.type, s.label);
      else addEmptySection(s);
    });
    if (!currentBlock) startBlock('other', '');
    const block = currentBlock!;

    group.syllables
      .filter((s) => s.length > 0)
      .forEach((text, i) => {
        const isFirstOfWord = i === 0;
        block.syllables.push({
          id: makeId(),
          text,
          isWordStart: isFirstOfWord,
          isLineStart: isFirstOfWord && isNewLine,
          chord: null,
          ...(group.gapBefore && isFirstOfWord && isNewLine && block.syllables.length > 0 ? { gapBefore: true } : {}),
          blockId: block.id,
          localIndex: block.syllables.length,
        });
      });
  });

  // Headings after the last lyric line (e.g. a key change into an outro).
  const lastLine = groups.length > 0 ? groups[groups.length - 1].lineIndex : -1;
  sections
    .filter((s) => s.beforeLineIndex > lastLine)
    .forEach((s) => (s.keyChange ? addKeyChange(s) : addEmptySection(s)));

  return { blocks, arrangement };
}

/** Sections keyed by the lyric line they precede, in order — several headings can share a line
 * when all but the last have no lyrics of their own. A key change written just after the heading
 * that owns the lyrics ("Chorus", then "Key change to D") is moved ahead of it, since it's that
 * section that's in the new key. */
export function groupSectionsByLine(sections: Section[]): Map<number, Section[]> {
  const byLine = new Map<number, Section[]>();
  sections.forEach((s) => byLine.set(s.beforeLineIndex, [...(byLine.get(s.beforeLineIndex) ?? []), s]));
  byLine.forEach((line, index) => {
    const lastHeading = line.reduce((last, s, i) => (s.keyChange ? last : i), -1);
    if (lastHeading < 0) return;
    const trailingKeyChanges = line.slice(lastHeading + 1);
    byLine.set(index, [...line.slice(0, lastHeading), ...trailingKeyChanges, line[lastHeading]]);
  });
  return byLine;
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
