import type { Paragraph } from 'docx';
import type { KeyName, SectionType } from '../types';
import type { BlockMap } from './arrangement';
import { buildChartRows } from './chordChart';

const MONO_FONT = 'Consolas';

const SECTION_COLORS: Record<SectionType, string> = {
  verse: '2563EB',
  chorus: 'B45309',
  bridge: '7E22CE',
  other: '6B7280',
};

/** Builds a downloadable .docx chord chart: title, key, and every section with its chords
 * placed directly above the lyrics they belong to (monospace, so the spacing lines up). */
export async function generateWordDoc(
  title: string,
  key: KeyName,
  blocks: BlockMap,
  arrangement: string[],
): Promise<Blob> {
  // Loaded on demand — the docx package is sizable and most sessions never export a Word doc.
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');
  const rows = buildChartRows(blocks, arrangement, key);

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title || 'Untitled' })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: `Key: ${key}`, italics: true, color: '6B7280' })],
    }),
  ];

  rows.forEach((row) => {
    if (row.kind === 'heading') {
      children.push(
        new Paragraph({
          spacing: { before: 280, after: 80 },
          children: [
            new TextRun({
              text: row.label,
              bold: true,
              color: SECTION_COLORS[row.type],
            }),
          ],
        }),
      );
      return;
    }

    if (row.line.chordLine.trim()) {
      children.push(
        new Paragraph({
          spacing: { after: 0 },
          children: [new TextRun({ text: row.line.chordLine, font: MONO_FONT, bold: true, color: '2563EB' })],
        }),
      );
    }
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: row.line.lyricLine || ' ', font: MONO_FONT })],
      }),
    );
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}
