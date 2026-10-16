import { downloadBlob } from './download';
import { generateSongsPdf } from './pdfDoc';
import type { SongDocument } from './songDocument';

/** Downloads a set's songs as one PDF, in order, each in its own font and spacing. */
export async function downloadSetPdf(name: string, songs: SongDocument[]): Promise<void> {
  const title = name.trim() || 'Untitled set';
  const blob = await generateSongsPdf(
    title,
    songs.map((doc) => ({
      title: doc.title,
      key: doc.key,
      blocks: doc.blocks,
      arrangement: doc.arrangement,
      fontId: doc.chartFontId,
      lineSpacing: doc.lineSpacing,
      credits: doc.credits,
    })),
  );
  // Drops the characters Windows and macOS don't allow in file names.
  downloadBlob(blob, `${title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled set'}.pdf`);
}
