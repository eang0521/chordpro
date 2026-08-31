import type { Song } from '../types';
import { resolveChordLabel } from './musicTheory';

type WrappedSectionType = 'verse' | 'chorus' | 'bridge';

export function songToChordPro(song: Song): string {
  const lines: string[] = [`{title: ${song.title || 'Untitled'}}`, `{key: ${song.key}}`, ''];

  let currentLine = '';
  let openSection: WrappedSectionType | null = null;

  function closeOpenSection() {
    if (openSection) {
      lines.push(`{end_of_${openSection}}`);
      openSection = null;
    }
  }

  song.syllables.forEach((syl, i) => {
    if (syl.section && syl.section.label) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = '';
      }
      closeOpenSection();
      if (lines[lines.length - 1] !== '') lines.push('');

      if (syl.section.type === 'other') {
        lines.push(`{comment: ${syl.section.label}}`);
      } else {
        lines.push(`{start_of_${syl.section.type}: ${syl.section.label}}`);
        openSection = syl.section.type;
      }
    } else if (syl.isLineStart && i !== 0) {
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
  closeOpenSection();

  return lines.join('\n');
}
