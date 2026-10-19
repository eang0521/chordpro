import type { Song } from '../types';
import { formatChord, transposeKey } from './musicTheory';

type WrappedSectionType = 'verse' | 'chorus' | 'bridge' | 'instrumental';

/** ChordPro's standard credit directives. Words and music by the same people sets both. */
function creditDirectives(song: Song): string[] {
  const c = song.credits;
  if (!c) return [];
  const words = c.wordsBy.trim();
  const music = c.separateMusic ? c.musicBy.trim() : words;
  const copyright = c.copyright.trim();
  const custom = c.useCustomWriters ? c.customWriters?.trim() : '';
  return [
    ...(words ? [`{lyricist: ${words}}`] : []),
    ...(music ? [`{composer: ${music}}`] : []),
    // Custom wording for the credit line ("Original words by ..."), kept as written.
    ...(custom ? [`{meta: writers ${custom}}`] : []),
    ...(copyright ? [`{copyright: ${copyright}}`] : []),
  ];
}

export function songToChordPro(song: Song): string {
  const lines: string[] = [`{title: ${song.title || 'Untitled'}}`, `{key: ${song.key}}`, ...creditDirectives(song), ''];

  let currentLine = '';
  let openSection: WrappedSectionType | null = null;
  let repeat = 1;

  function flushLine() {
    if (currentLine.length > 0) lines.push(currentLine);
    currentLine = '';
  }

  function closeOpenSection() {
    if (openSection) {
      lines.push(`{end_of_${openSection}}`);
      openSection = null;
    }
  }

  song.syllables.forEach((syl, i) => {
    if (syl.localIndex === 0) repeat = syl.section?.repeat ?? 1;
    // A repeated section ends its last line with "(2x)", which the parser reads back.
    const next = song.syllables[i + 1];
    const endsRepeatedSection = repeat > 1 && (!next || next.localIndex === 0);
    const markRepeat = () => {
      if (endsRepeatedSection) currentLine += `${currentLine ? ' ' : ''}(${repeat}x)`;
    };
    // A key change is a {key} directive partway through the song; chords after it are spelled
    // in the new key.
    if (syl.keyChange) {
      flushLine();
      closeOpenSection();
      if (lines[lines.length - 1] !== '') lines.push('');
      lines.push(`{key: ${transposeKey(song.key, syl.keyShift ?? 0)}}`);
    }
    if (syl.section && syl.section.label) {
      flushLine();
      closeOpenSection();
      if (lines[lines.length - 1] !== '' && !syl.keyChange) lines.push('');

      if (syl.section.type === 'other') {
        lines.push(`{comment: ${syl.section.label}}`);
      } else {
        lines.push(`{start_of_${syl.section.type}: ${syl.section.label}}`);
        openSection = syl.section.type;
      }
    } else if (syl.isLineStart && i !== 0) {
      flushLine();
      // A blank line inside the section splits it into parts (read back the same way).
      if (syl.gapBefore) lines.push('');
    }

    // An empty chord slot is just a placeholder for a chord that hasn't been placed yet.
    if (syl.isChordSlot && !syl.chord) {
      markRepeat();
      return;
    }
    if (syl.isWordStart && currentLine.length > 0) currentLine += ' ';
    // Chords with no lyric under them (slots) are written as "[G] | [C]", the usual ChordPro way
    // to write a turnaround or instrumental line.
    if (syl.bar && syl.chord) currentLine += '| ';
    // A chord partway into the syllable goes back where it was written ("J[E]esus").
    const at = syl.chord ? Math.min(syl.chordOffset ?? 0, syl.text.length) : 0;
    currentLine += syl.text.slice(0, at);
    if (syl.chord) currentLine += `[${formatChord(transposeKey(song.key, syl.keyShift ?? 0), syl.chord)}]`;
    currentLine += syl.text.slice(at);
    markRepeat();
  });
  flushLine();
  closeOpenSection();

  return lines.join('\n');
}
