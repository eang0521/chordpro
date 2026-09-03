import type { Block, KeyName, ScaleDegree, SectionType } from '../types';
import { hyphenateWord, normalizeApostrophes } from './syllables';
import { KEY_NAMES, parseChordLabel } from './musicTheory';
import { makeId } from './id';

export interface ParsedChordProSong {
  title: string;
  key: KeyName;
  blocks: Block[];
}

interface ChordSpan {
  offset: number; // character offset into the plain (bracket-stripped) line
  label: string;
}

/** Strips [Chord] markers from a raw ChordPro lyric line, returning the plain lyric text plus
 * each chord's character offset into that plain text — the position of the syllable it precedes. */
function stripChordsWithOffsets(rawLine: string): { plain: string; chords: ChordSpan[] } {
  const chords: ChordSpan[] = [];
  let plain = '';
  let i = 0;
  while (i < rawLine.length) {
    if (rawLine[i] === '[') {
      const end = rawLine.indexOf(']', i + 1);
      if (end === -1) {
        plain += rawLine.slice(i);
        break;
      }
      chords.push({ offset: plain.length, label: rawLine.slice(i + 1, end).trim() });
      i = end + 1;
    } else {
      plain += rawLine[i];
      i += 1;
    }
  }
  return { plain, chords };
}

interface SyllableSpan {
  text: string;
  end: number;
  isWordStart: boolean;
}

/** Splits a plain lyric line into syllables (reusing the same hyphenation the initial "paste
 * lyrics" step uses), tracking each syllable's end offset so chord positions can be matched
 * to the syllable they land on or just before. */
function splitLineIntoSyllableSpans(plain: string): SyllableSpan[] {
  const spans: SyllableSpan[] = [];
  const wordRe = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(plain))) {
    let cursor = match.index;
    hyphenateWord(match[0]).forEach((syl, i) => {
      if (syl.length === 0) return;
      cursor += syl.length;
      spans.push({ text: syl, end: cursor, isWordStart: i === 0 });
    });
  }
  return spans;
}

function findSpanForOffset(spans: SyllableSpan[], offset: number): SyllableSpan | null {
  return spans.find((s) => s.end > offset) ?? spans[spans.length - 1] ?? null;
}

const TITLE_RE = /^\{title:\s*(.*)\}$/i;
const KEY_RE = /^\{key:\s*(.*)\}$/i;
const START_SECTION_RE = /^\{start_of_(verse|chorus|bridge):\s*(.*)\}$/i;
const END_SECTION_RE = /^\{end_of_(?:verse|chorus|bridge)\}$/i;
const COMMENT_RE = /^\{comment:\s*(.*)\}$/i;
const ANY_DIRECTIVE_RE = /^\{.*\}$/;

/**
 * Parses hand-edited ChordPro text back into the app's structured song model, so the visual
 * chart and Word doc export stay in sync with manual text edits instead of only the raw .cho
 * download. Falls back gracefully on anything it can't confidently parse (an unrecognized
 * {directive}, a chord that isn't one of the seven diatonic degrees in the current key, a
 * missing title/key) rather than failing outright — this is a best-effort re-derivation, not
 * strict validation. Section content is re-syllabified fresh from the edited text, so any tap
 * timing recorded earlier is not preserved — there's no reliable way to match edited lyrics
 * back to the old timing.
 */
export function parseChordProText(text: string, fallbackTitle: string, fallbackKey: KeyName): ParsedChordProSong {
  let title = fallbackTitle;
  let key: KeyName = fallbackKey;

  const blocks: Block[] = [];
  let currentBlock: Block | null = null;

  function startBlock(type: SectionType, label: string) {
    currentBlock = { id: makeId(), type, label, syllables: [] };
    blocks.push(currentBlock);
  }

  normalizeApostrophes(text)
    .split('\n')
    .forEach((rawLine) => {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0) return;

      const titleMatch = TITLE_RE.exec(trimmed);
      if (titleMatch) {
        title = titleMatch[1].trim() || fallbackTitle;
        return;
      }
      const keyMatch = KEY_RE.exec(trimmed);
      if (keyMatch) {
        const candidate = keyMatch[1].trim();
        const matchedKey = KEY_NAMES.find((k) => k === candidate);
        if (matchedKey) key = matchedKey;
        return;
      }
      const startMatch = START_SECTION_RE.exec(trimmed);
      if (startMatch) {
        startBlock(startMatch[1].toLowerCase() as SectionType, startMatch[2].trim());
        return;
      }
      if (END_SECTION_RE.test(trimmed)) return;
      const commentMatch = COMMENT_RE.exec(trimmed);
      if (commentMatch) {
        startBlock('other', commentMatch[1].trim());
        return;
      }
      if (ANY_DIRECTIVE_RE.test(trimmed)) return; // unrecognized directive — skip, not lyrics

      // A real lyric line.
      const { plain, chords } = stripChordsWithOffsets(rawLine);
      if (plain.trim().length === 0) return;

      if (!currentBlock) startBlock('other', '');
      const block = currentBlock!;
      const spans = splitLineIntoSyllableSpans(plain);

      const labelBySpan = new Map<SyllableSpan, string>();
      chords.forEach((chord) => {
        const span = findSpanForOffset(spans, chord.offset);
        if (span) labelBySpan.set(span, chord.label);
      });

      spans.forEach((span, i) => {
        const label = labelBySpan.get(span);
        const chordDegrees: ScaleDegree[] = (label && parseChordLabel(key, label)) || [];
        block.syllables.push({
          id: makeId(),
          text: span.text,
          isWordStart: span.isWordStart,
          isLineStart: i === 0,
          offsetMs: null,
          chordDegrees,
          blockId: block.id,
          localIndex: block.syllables.length,
        });
      });
    });

  return { title, key, blocks };
}
