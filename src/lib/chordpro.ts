import type { Song } from '../types';
import { formatChord } from './musicTheory';

type WrappedSectionType = 'verse' | 'chorus' | 'bridge' | 'instrumental';

export function songToChordPro(song: Song): string {
  const lines: string[] = [`{title: ${song.title || 'Untitled'}}`, `{key: ${song.key}}`, ''];

  let currentLine = '';
  let openSection: WrappedSectionType | null = null;

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
    if (syl.section && syl.section.label) {
      flushLine();
      closeOpenSection();
      if (lines[lines.length - 1] !== '') lines.push('');

      if (syl.section.type === 'other') {
        lines.push(`{comment: ${syl.section.label}}`);
      } else {
        lines.push(`{start_of_${syl.section.type}: ${syl.section.label}}`);
        openSection = syl.section.type;
      }
    } else if (syl.isLineStart && i !== 0) {
      flushLine();
    }

    // An empty chord slot is just a placeholder for a chord that hasn't been placed yet.
    if (syl.isChordSlot && !syl.chord) return;
    if (syl.isWordStart && currentLine.length > 0) currentLine += ' ';
    // Chords with no lyric under them (slots) are written as "[G] | [C]", the usual ChordPro way
    // to write a turnaround or instrumental line.
    if (syl.bar && syl.chord) currentLine += '| ';
    if (syl.chord) currentLine += `[${formatChord(song.key, syl.chord)}]`;
    currentLine += syl.text;
  });
  flushLine();
  closeOpenSection();

  return lines.join('\n');
}
