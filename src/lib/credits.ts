import type { SongCredits } from '../types';

export const EMPTY_CREDITS: SongCredits = { wordsBy: '', musicBy: '', separateMusic: false, copyright: '' };

/** "2025 Group", "(c) 2025 Group" or "Copyright 2025 Group" all print as "© 2025 Group". */
export function formatCopyright(text: string): string {
  const rest = text.trim().replace(/^(?:©|\(c\)|copyright\b)\s*/i, '');
  return rest ? `© ${rest}` : '';
}

/**
 * The footer lines for a chart: who wrote it, then the copyright, leaving out whichever is
 * blank. "Words and music by A" when the same people wrote both, otherwise
 * "Words by A, music by B".
 */
export function creditLines(credits: SongCredits | undefined): string[] {
  if (!credits) return [];
  const words = credits.wordsBy.trim();
  const music = credits.separateMusic ? credits.musicBy.trim() : '';
  let writers = '';
  if (!credits.separateMusic) writers = words && `Words and music by ${words}`;
  else if (words && music) writers = `Words by ${words}, music by ${music}`;
  else if (words) writers = `Words by ${words}`;
  else if (music) writers = `Music by ${music}`;
  return [writers, formatCopyright(credits.copyright)].filter(Boolean);
}
