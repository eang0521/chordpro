import type { ArrangementEntry, Block, KeyName, SectionType, SongCredits } from '../types';
import { hyphenateWord, normalizeApostrophes } from './syllables';
import { keyFromName, parseChord, semitonesBetween } from './musicTheory';
import { makeKeyChange } from './arrangement';
import { makeId } from './id';
import { makeChordLine } from './chordSlots';

export interface ParsedChordProSong {
  title: string;
  key: KeyName;
  /** The blocks in order, with any key changes between them. */
  arrangement: ArrangementEntry[];
  blocks: Block[];
  /** From {lyricist}, {composer} and {copyright}; null when the text has none of them, so
   * credits typed into the app aren't wiped by text that never mentioned them. */
  credits: SongCredits | null;
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
    if (match[0] === '|') continue; // a bar line, not a lyric
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
const CREDIT_RE = /^\{(lyricist|composer|copyright):\s*(.*)\}$/i;
const START_SECTION_RE = /^\{start_of_(verse|chorus|bridge|instrumental):\s*(.*)\}$/i;
const END_SECTION_RE = /^\{end_of_(?:verse|chorus|bridge|instrumental)\}$/i;
const COMMENT_RE = /^\{comment:\s*(.*)\}$/i;
const ANY_DIRECTIVE_RE = /^\{.*\}$/;

// Signs that pasted text is ChordPro rather than plain lyrics: a {directive} on its own line, or
// a [chord] in brackets (a letter chord like [G] or [F#m7/C#], or a number chord like [5sus]).
// Only chord-like text may follow the root, so bracketed headings like [Chorus] or [Bridge] in
// plain lyrics don't count.
const DIRECTIVE_LINE_RE = /^\s*\{\s*(?:title|t|subtitle|st|key|lyricist|composer|copyright|start_of_\w+|end_of_\w+|so[cvb]|eo[cvb]|comment|c|ci)\s*[:}]/im;
const INLINE_CHORD_RE =
  /\[\s*\|?\s*(?:[A-G][#b]?|[#b]?[1-7])(?:maj|min|m|dim|aug|sus|add|M|\d|[#b+\-°ø()])*(?:\/(?:[A-G][#b]?|[#b]?[1-7]))?\s*\]/;

/** True if pasted text looks like ChordPro, so it can be imported as a finished chart. */
export function looksLikeChordPro(text: string): boolean {
  return DIRECTIVE_LINE_RE.test(text) || INLINE_CHORD_RE.test(text);
}

/**
 * Parses hand-edited ChordPro text back into the app's structured song model, so the visual
 * chart and Word doc export stay in sync with manual text edits instead of only the raw .cho
 * download. Falls back gracefully on anything it can't confidently parse (an unrecognized
 * {directive}, a bracketed label that isn't a chord symbol, a
 * missing title/key) rather than failing outright — this is a best-effort re-derivation, not
 * strict validation. Section content is re-syllabified fresh from the edited text.
 */
export function parseChordProText(text: string, fallbackTitle: string, fallbackKey: KeyName): ParsedChordProSong {
  let title = fallbackTitle;
  let key: KeyName = fallbackKey;
  // The key chords are being read in: the song's key until a later {key} changes it.
  let currentKey: KeyName = fallbackKey;
  const creditFields: Partial<Record<'lyricist' | 'composer' | 'copyright', string>> = {};

  const blocks: Block[] = [];
  const arrangement: ArrangementEntry[] = [];
  let currentBlock: Block | null = null;

  function startBlock(type: SectionType, label: string) {
    currentBlock = { id: makeId(), type, label, syllables: [] };
    blocks.push(currentBlock);
    arrangement.push(currentBlock.id);
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
      const creditMatch = CREDIT_RE.exec(trimmed);
      if (creditMatch) {
        creditFields[creditMatch[1].toLowerCase() as 'lyricist' | 'composer' | 'copyright'] = creditMatch[2].trim();
        return;
      }
      const keyMatch = KEY_RE.exec(trimmed);
      if (keyMatch) {
        const matchedKey = keyFromName(keyMatch[1]);
        if (!matchedKey) return;
        if (blocks.length === 0) {
          key = matchedKey; // before any lyrics: the song's key
        } else {
          // Partway through: a key change. The next section starts fresh in the new key.
          arrangement.push(makeKeyChange(semitonesBetween(key, matchedKey)));
          currentBlock = null;
        }
        currentKey = matchedKey;
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

      // A lyric line, a line of lyrics plus trailing chords, or a chord-only line like
      // "[Am7] | [G/B] | [C] [C/E] | [F]".
      const { plain, chords } = stripChordsWithOffsets(rawLine);
      if (plain.trim().length === 0 && chords.length === 0) return;

      if (!currentBlock) startBlock('other', '');
      const block = currentBlock!;
      const spans = splitLineIntoSyllableSpans(plain);

      // A chord sitting on a letter goes on that syllable; one sitting on a space, a bar line or
      // the end of the line has no lyric under it, so it becomes a chord slot.
      type Item = { offset: number } & (
        | { kind: 'span'; span: SyllableSpan }
        | { kind: 'slot'; label: string }
        | { kind: 'bar' }
      );
      const items: Item[] = spans.map((span) => ({ kind: 'span', span, offset: span.end - span.text.length }));
      const labelBySpan = new Map<SyllableSpan, string>();
      chords.forEach((chord) => {
        const under = plain[chord.offset];
        if (under === undefined || /\s/.test(under) || under === '|') {
          items.push({ kind: 'slot', label: chord.label, offset: chord.offset });
        } else {
          const span = findSpanForOffset(spans, chord.offset);
          if (span) labelBySpan.set(span, chord.label);
        }
      });
      for (const m of plain.matchAll(/(?<=^|\s)\|(?=\s|$)/g)) items.push({ kind: 'bar', offset: m.index });
      // By position; a bar sharing a slot's position was written after that slot's chord.
      items.sort((a, b) => a.offset - b.offset || (a.kind === 'bar' ? 1 : 0) - (b.kind === 'bar' ? 1 : 0));

      let pendingBar = false;
      let lineStart = true;
      items.forEach((item) => {
        if (item.kind === 'bar') {
          pendingBar = true;
          return;
        }
        let label = item.kind === 'slot' ? item.label : labelBySpan.get(item.span);
        // "[|C]" is another way to write a bar line before a chord.
        if (label?.startsWith('|')) {
          pendingBar = true;
          label = label.slice(1).trim();
        }
        const chord = label ? parseChord(currentKey, label) : null;
        block.syllables.push({
          id: makeId(),
          text: item.kind === 'span' ? item.span.text : '',
          isWordStart: item.kind === 'span' ? item.span.isWordStart : true,
          isLineStart: lineStart,
          chord,
          ...(pendingBar && chord ? { bar: true } : {}),
          ...(item.kind === 'slot' ? { isChordSlot: true } : {}),
          blockId: block.id,
          localIndex: block.syllables.length,
        });
        if (chord) pendingBar = false;
        lineStart = false;
      });
    });

  // An instrumental section whose chords haven't been filled in yet exports with no lines; give
  // it back its empty chord slots rather than letting it drop out of the song.
  blocks.forEach((block) => {
    if (block.type === 'instrumental' && block.syllables.length === 0) {
      block.syllables = makeChordLine(block.id).map((tok, i) => ({ ...tok, localIndex: i }));
    }
  });

  return { title, key, blocks, arrangement, credits: creditsFrom(creditFields) };
}

function creditsFrom(fields: Partial<Record<'lyricist' | 'composer' | 'copyright', string>>): SongCredits | null {
  const { lyricist = '', composer = '', copyright = '' } = fields;
  if (!lyricist && !composer && !copyright) return null;
  // Only the same writers for both print as "Words and music by"; just one of the two is a
  // "Words by" or "Music by" credit on its own.
  const separate = (lyricist || composer) && lyricist.toLowerCase() !== composer.toLowerCase();
  return !separate
    ? { wordsBy: lyricist, musicBy: '', separateMusic: false, copyright }
    : { wordsBy: lyricist, musicBy: composer, separateMusic: true, copyright };
}
