import type { Paragraph, TabStopDefinition } from 'docx';
import type { KeyName } from '../types';
import type { BlockMap } from './arrangement';
import type { ChartLineRow, ChartToken } from './chordChart';
import { buildChartRows, groupIntoSections } from './chordChart';
import { getChordFontOption } from './chordFonts';
import {
  BASE_LINE_GAP_TWIPS,
  BASE_SECTION_GAP_TWIPS,
  CHORD_COLOR,
  CONTENT_WIDTH_TWIPS,
  FONT_SIZE_PT,
  LABEL_COLUMN_TWIPS,
  LYRIC_COLUMN_TWIPS,
  MARGIN_TWIPS,
  PAGE_HEIGHT_TWIPS,
  PAGE_WIDTH_TWIPS,
  SECTION_COLORS,
} from './pageLayout';

const FONT_SIZE_HALF_PT = FONT_SIZE_PT * 2; // docx sizes are in half-points
const KEY_FONT_SIZE_HALF_PT = 20; // 10pt, a touch smaller than the body text
const MIN_GAP_TWIPS = 90; // guards against two chords landing on/behind the same tab stop

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
 * placed directly above the lyrics they belong to. Section names sit in a narrow left column
 * so the lyrics/chords column doesn't have to give up its own line to the heading, and every
 * text run honors the chosen font. `lineSpacing` scales the vertical gap between lines (1.0 =
 * normal; 0.7–1.2 covers "more compact" to "a bit more room"). */
export async function generateWordDoc(
  title: string,
  key: KeyName,
  blocks: BlockMap,
  arrangement: string[],
  fontId: string,
  lineSpacing = 1,
): Promise<Blob> {
  // Loaded on demand — the docx package is sizable and most sessions never export a Word doc.
  const { Document, HeadingLevel, Packer, Paragraph, Table, TableBorders, TableCell, TableRow, Tab, TabStopType, TextRun, VerticalAlign, WidthType } =
    await import('docx');
  const font = getChordFontOption(fontId);
  const sections = groupIntoSections(buildChartRows(blocks, arrangement, key));

  const lineGapTwips = Math.round(BASE_LINE_GAP_TWIPS * lineSpacing);
  const sectionGapTwips = Math.round(BASE_SECTION_GAP_TWIPS * lineSpacing);

  function buildLinePairParagraphs(row: ChartLineRow, isLast: boolean): Paragraph[] {
    const trailingGap = isLast ? sectionGapTwips : lineGapTwips;
    const paragraphs: Paragraph[] = [];

    if (font.id === 'mono') {
      const { chordLine, lyricLine } = buildMonospacePair(row.tokens);
      if (chordLine.trim()) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({ text: chordLine, font: font.wordFont, bold: true, color: CHORD_COLOR, size: FONT_SIZE_HALF_PT }),
            ],
          }),
        );
      }
      paragraphs.push(
        new Paragraph({
          spacing: { after: trailingGap },
          children: [new TextRun({ text: lyricLine || ' ', font: font.wordFont, size: FONT_SIZE_HALF_PT })],
        }),
      );
      return paragraphs;
    }

    const { lyricLine, chords } = buildProportionalChords(row.tokens, font.wordFont);
    if (chords.length > 0) {
      const tabStops: TabStopDefinition[] = chords.map((c) => ({ type: TabStopType.LEFT, position: c.twips }));
      paragraphs.push(
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
    paragraphs.push(
      new Paragraph({
        spacing: { after: trailingGap },
        children: [new TextRun({ text: lyricLine || ' ', font: font.wordFont, size: FONT_SIZE_HALF_PT })],
      }),
    );
    return paragraphs;
  }

  const tableRows = sections.map((section) => {
    const labelCell = new TableCell({
      width: { type: WidthType.DXA, size: LABEL_COLUMN_TWIPS },
      verticalAlign: VerticalAlign.TOP,
      children: [
        new Paragraph({
          children: section.label
            ? [new TextRun({ text: section.label, bold: true, color: SECTION_COLORS[section.type], font: font.wordFont, size: FONT_SIZE_HALF_PT })]
            : [],
        }),
      ],
    });

    const lyricParagraphs = section.lineRows.flatMap((row, i) =>
      buildLinePairParagraphs(row, i === section.lineRows.length - 1),
    );
    const contentCell = new TableCell({
      width: { type: WidthType.DXA, size: LYRIC_COLUMN_TWIPS },
      verticalAlign: VerticalAlign.TOP,
      children: lyricParagraphs.length > 0 ? lyricParagraphs : [new Paragraph({})],
    });

    return new TableRow({ children: [labelCell, contentCell] });
  });

  const table = new Table({
    width: { type: WidthType.DXA, size: CONTENT_WIDTH_TWIPS },
    columnWidths: [LABEL_COLUMN_TWIPS, LYRIC_COLUMN_TWIPS],
    borders: TableBorders.NONE,
    rows: tableRows,
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
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 240 },
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_TWIPS }],
            children: [
              new TextRun({ text: title || 'Untitled', font: font.wordFont }),
              new TextRun({
                children: [new Tab(), `Key: ${key}`],
                italics: true,
                color: '6B7280',
                font: font.wordFont,
                size: KEY_FONT_SIZE_HALF_PT,
              }),
            ],
          }),
          table,
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
