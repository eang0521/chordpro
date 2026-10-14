import type { SongCredits } from '../types';

export const EMPTY_CREDITS: SongCredits = { wordsBy: '', musicBy: '', separateMusic: false, copyright: '' };

/** "2025 Group", "(c) 2025 Group" or "Copyright 2025 Group" all print as "© 2025 Group". */
export function formatCopyright(text: string): string {
  const rest = text.trim().replace(/^(?:©|\(c\)|copyright\b)\s*/i, '');
  return rest ? `© ${rest}` : '';
}

/** Ends with a period, without doubling one a name already ends with (e.g. "Inc."). */
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * The footer lines for a chart: who wrote it, then the copyright, leaving out whichever is
 * blank. "Words and music by A" when the same people wrote both, otherwise
 * "Words by A. Music by B."
 */
export function creditLines(credits: SongCredits | undefined): string[] {
  if (!credits) return [];
  const words = credits.wordsBy.trim();
  const music = credits.separateMusic ? credits.musicBy.trim() : '';
  const writers = credits.separateMusic
    ? [words && `Words by ${words}`, music && `Music by ${music}`].filter(Boolean).map(sentence).join(' ')
    : words && `Words and music by ${words}`;
  return [writers, formatCopyright(credits.copyright)].filter(Boolean);
}
