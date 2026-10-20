import { downloadBlob } from './download';
import { generateSongsPdf } from './pdfDoc';
import type { SetSongDocument } from './setStore';

/** Downloads a set's songs as one PDF, in order, each in its own font and spacing, and with its
 * capo if it has one. */
export async function downloadSetPdf(name: string, songs: SetSongDocument[]): Promise<void> {
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
      capo: doc.capo,
    })),
  );
  // Drops the characters Windows and macOS don't allow in file names.
  downloadBlob(blob, `${title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled set'}.pdf`);
}
