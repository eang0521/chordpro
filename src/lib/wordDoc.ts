import type { Paragraph, TabStopDefinition } from 'docx';
import type { KeyName, SectionType } from '../types';
import type { BlockMap } from './arrangement';
import type { ChartToken } from './chordChart';
import { buildChartRows } from './chordChart';
import { getChordFontOption } from './chordFonts';
import { FONT_SIZE_PT, MARGIN_TWIPS, PAGE_HEIGHT_TWIPS, PAGE_WIDTH_TWIPS } from './pageLayout';

const CHORD_COLOR = '2563EB';
const FONT_SIZE_HALF_PT = FONT_SIZE_PT * 2; // docx sizes are in half-points
const MIN_GAP_TWIPS = 90; // guards against two chords landing on/behind the same tab stop

const SECTION_COLORS: Record<SectionType, string> = {
  verse: '2563EB',
  chorus: 'B45309',
  bridge: '7E22CE',
  other: '6B7280',
};

function pxToTwips(px: number): number {
  return Math.round(px * 15); // 1css px = 0.75pt = 15 twips, at the standard 96dpi CSS reference
}

/** Measures text width in a given font/size using an offscreen canvas — the only reliable way
 * to know how wide text will render in a proportional font, so chords can be tab-stopped to
 * line up above the right syllable instead of just the right character column. */
function measureTextWidthPx(text: string, fontFamily: string, fontSizePt: number): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * fontSizePt * 0.6;
  const fontSizePx = fontSizePt * (96 / 72);
  ctx.font = `${fontSizePx}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

/** Monospace layout: pad the chord line with spaces so it lines up by character column —
 * simple and exact, and safe from font-substitution issues since any monospace fallback
 * preserves the alignment. */
function buildMonospacePair(tokens: ChartToken[]): { chordLine: string; lyricLine: string } {
  let lyricLine = '';
  let chordLine = '';
  tokens.forEach((tok, i) => {
    if (tok.isWordStart && i !== 0) lyricLine += ' ';
    const startCol = lyricLine.length;
    lyricLine += tok.text;
    if (tok.chordLabel) {
      const writePos = Math.max(chordLine.length, startCol);
      chordLine = chordLine.padEnd(writePos, ' ') + tok.chordLabel;
    }
  });
  return { chordLine, lyricLine };
}

/** Proportional-font layout: measure the true pixel width of the lyric text up to each chorded
 * syllable and convert to a Word tab-stop position, so the chord still lands above the right
 * syllable even though characters aren't a fixed width. */
function buildProportionalChords(
  tokens: ChartToken[],
  fontName: string,
): { lyricLine: string; chords: { twips: number; label: string }[] } {
  let lyricLine = '';
  const chords: { twips: number; label: string }[] = [];
  tokens.forEach((tok, i) => {
    if (tok.isWordStart && i !== 0) lyricLine += ' ';
    if (tok.chordLabel) {
      const widthPx = measureTextWidthPx(lyricLine, fontName, FONT_SIZE_PT);
      chords.push({ twips: pxToTwips(widthPx), label: tok.chordLabel });
    }
    lyricLine += tok.text;
  });
  for (let i = 1; i < chords.length; i++) {
    if (chords[i].twips <= chords[i - 1].twips) chords[i].twips = chords[i - 1].twips + MIN_GAP_TWIPS;
  }
  return { lyricLine, chords };
}

/** Builds a downloadable .docx chord chart: title, key, and every section with its chords
 * placed directly above the lyrics they belong to, in the chosen font. */
export async function generateWordDoc(
  title: string,
  key: KeyName,
  blocks: BlockMap,
  arrangement: string[],
  fontId: string,
): Promise<Blob> {
  // Loaded on demand — the docx package is sizable and most sessions never export a Word doc.
  const { Document, HeadingLevel, Packer, Paragraph, Tab, TabStopType, TextRun } = await import('docx');
  const font = getChordFontOption(fontId);
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
          children: [new TextRun({ text: row.label, bold: true, color: SECTION_COLORS[row.type] })],
        }),
      );
      return;
    }

    if (font.id === 'mono') {
      const { chordLine, lyricLine } = buildMonospacePair(row.tokens);
      if (chordLine.trim()) {
        children.push(
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({ text: chordLine, font: font.wordFont, bold: true, color: CHORD_COLOR, size: FONT_SIZE_HALF_PT }),
            ],
          }),
        );
      }
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: lyricLine || ' ', font: font.wordFont, size: FONT_SIZE_HALF_PT })],
        }),
      );
      return;
    }

    const { lyricLine, chords } = buildProportionalChords(row.tokens, font.wordFont);
    if (chords.length > 0) {
      const tabStops: TabStopDefinition[] = chords.map((c) => ({ type: TabStopType.LEFT, position: c.twips }));
      children.push(
        new Paragraph({
          spacing: { after: 0 },
          tabStops,
          children: chords.map(
            (c) =>
              new TextRun({
                children: [new Tab(), c.label],
                bold: true,
                color: CHORD_COLOR,
                font: font.wordFont,
                size: FONT_SIZE_HALF_PT,
              }),
          ),
        }),
      );
    }
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: lyricLine || ' ', font: font.wordFont, size: FONT_SIZE_HALF_PT })],
      }),
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
            margin: { top: MARGIN_TWIPS, right: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
