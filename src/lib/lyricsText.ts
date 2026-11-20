import type { ArrangementEntry, Block } from '../types';
import type { BlockMap } from './arrangement';

export interface LyricsTextOptions {
  /** A line naming each section ("Verse 1", "Chorus") before its lyrics. */
  sectionNames: boolean;
  /** Every section each time it's sung, in order; otherwise each section once, where it's first
   * sung (what slide software usually wants: it has its own arrangement). */
  repeats: boolean;
}

export const DEFAULT_LYRICS_OPTIONS: LyricsTextOptions = { sectionNames: true, repeats: false };

/** A section's lyric lines, with '' where the section is split into parts. Chord-only lines (an
 * intro, a turn) have no lyrics, so they're left out. */
function lyricLines(block: Block): string[] {
  const lines: string[] = [];
  let line = '';
  let gapBefore = false;
  const flush = () => {
    const text = line.replace(/\s+/g, ' ').trim();
    if (text) {
      // A split only counts between lines that are kept, so a section never starts or ends blank.
      if (gapBefore && lines.length > 0) lines.push('');
      lines.push(text);
      gapBefore = false;
    }
    line = '';
  };
  block.syllables.forEach((syl, i) => {
    if (syl.isLineStart && i > 0) {
      flush();
      if (syl.gapBefore) gapBefore = true;
    }
    if (syl.isChordSlot || !syl.text) return;
    if (syl.isWordStart && line) line += ' ';
    line += syl.text;
  });
  flush();
  return lines;
}

/**
 * A song's lyrics as plain text, without chords, for pasting into slide software: its sections in
 * the order they're sung, separated by blank lines. Sections with no lyrics are left out.
 */
export function songLyricsText(blocks: BlockMap, arrangement: ArrangementEntry[], options: LyricsTextOptions): string {
  const sections: string[] = [];
  const seen = new Set<string>();
  for (const entry of arrangement) {
    if (typeof entry !== 'string') continue; // a key change
    const block = blocks[entry];
    if (!block) continue;
    if (!options.repeats && seen.has(entry)) continue;
    seen.add(entry);
    const lines = lyricLines(block);
    if (lines.length === 0) continue;
    const name = block.label.trim();
    sections.push([...(options.sectionNames && name ? [name] : []), ...lines].join('\n'));
  }
  return sections.join('\n\n');
}

/** Every song's lyrics, each under its title, for copying a whole set at once. */
export function setLyricsText(songs: { title: string; lyrics: string }[]): string {
  return songs
    .filter((s) => s.lyrics)
    .map((s) => `${s.title.trim() || 'Untitled'}\n\n${s.lyrics}`)
    .join('\n\n\n');
}
