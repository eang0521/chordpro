import { downloadBlob } from './download';
import { generateSongsPdf } from './pdfDoc';
import type { SetSongDocument } from './setStore';
import type { PrintOptions } from './pageLayout';

/** Downloads a set's songs as one PDF, in order, each in its own font and spacing, and with its
 * capo if it has one, all on the sheet `printOptions` gives (each song fitting to the page, or
 * not, as it's set to). */
export async function downloadSetPdf(name: string, songs: SetSongDocument[], printOptions: PrintOptions): Promise<void> {
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
      printOptions: { ...printOptions, fitToPage: doc.printOptions.fitToPage },
    })),
  );
  // Drops the characters Windows and macOS don't allow in file names.
  downloadBlob(blob, `${title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled set'}.pdf`);
}
