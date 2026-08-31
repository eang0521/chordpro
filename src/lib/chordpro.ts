import type { Song } from '../types';
import { resolveChordLabel } from './musicTheory';

export function songToChordPro(song: Song): string {
  const lines: string[] = [`{title: ${song.title || 'Untitled'}}`, `{key: ${song.key}}`, ''];

  let currentLine = '';
  song.syllables.forEach((syl, i) => {
    if (syl.isLineStart && i !== 0) {
      lines.push(currentLine);
      currentLine = '';
    } else if (syl.isWordStart && i !== 0 && currentLine.length > 0) {
      currentLine += ' ';
    }

    const chordLabel = syl.chordDegrees.length > 0 ? resolveChordLabel(song.key, syl.chordDegrees) : null;
    if (chordLabel) currentLine += `[${chordLabel}]`;
    currentLine += syl.text;
  });
  if (currentLine.length > 0) lines.push(currentLine);

  return lines.join('\n');
}
