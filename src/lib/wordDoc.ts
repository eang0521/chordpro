import type { Paragraph } from 'docx';
import type { KeyName } from '../types';
import type { BlockMap } from './arrangement';
import { buildChartRows, groupIntoSections, placeChords } from './chordChart';
import { getChordFontOption } from './chordFonts';
import {
  CHORD_LINE_PT,
  CHORD_SIZE_PT,
  HEADER_TOP_TWIPS,
  KEY_SIZE_PT,
  LABEL_SIZE_PT,
  LYRIC_LINE_PT,
  LYRIC_SIZE_PT,
  MARGIN_BOTTOM_TWIPS,
  MARGIN_SIDE_TWIPS,
  MARGIN_TOP_TWIPS,
  PAGE_HEIGHT_TWIPS,
  PAGE_WIDTH_TWIPS,
  SECTION_GAP_PT,
  TITLE_GAP_PT,
  TITLE_SIZE_PT,
  labelColumnTwips,
} from './pageLayout';

const halfPt = (pt: number) => pt * 2; // docx run sizes are in half-points
const twips = (pt: number) => Math.round(pt * 20);
/** Builds a downloadable .docx chord chart laid out like a typical printed worship chart: "Key
 * of X" in the page header, a centered all-caps title, then each section with its label in a
 * left column on the first lyric line and italic chords tight above the bold lyrics.
 * `lineSpacing` scales every line height and gap (1.0 = normal). */
export async function generateWordDoc(
  title: string,
  key: KeyName,
  blocks: BlockMap,
  arrangement: string[],
  fontId: string,
  lineSpacing = 1,
): Promise<Blob> {
  // Loaded on demand — the docx package is sizable and most sessions never export a Word doc.
  const { AlignmentType, Document, Header, LineRuleType, Packer, Paragraph, Tab, TabStopType, TextRun } = await import('docx');
  const font = getChordFontOption(fontId);
  const sections = groupIntoSections(buildChartRows(blocks, arrangement, key));
  const labelCol = labelColumnTwips(sections.map((s) => s.label), font.wordFont);

  const exactLine = (pt: number, afterPt = 0) => ({
    before: 0,
    after: twips(afterPt * lineSpacing),
    line: twips(pt * lineSpacing),
    lineRule: LineRuleType.EXACT,
  });
  const labelRun = (label: string) =>
    new TextRun({ text: label, bold: true, allCaps: true, size: halfPt(LABEL_SIZE_PT), font: font.wordFont });
  const lyricRun = (text: string) =>
    new TextRun({ text: text || ' ', bold: true, size: halfPt(LYRIC_SIZE_PT), font: font.wordFont });

  const body: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: twips(TITLE_GAP_PT) },
      children: [
        new TextRun({ text: title || 'Untitled', bold: true, allCaps: true, size: halfPt(TITLE_SIZE_PT), font: font.wordFont }),
      ],
    }),
  ];

  sections.forEach((section) => {
    if (section.lineRows.length === 0) {
      if (section.label) body.push(new Paragraph({ spacing: exactLine(LYRIC_LINE_PT, SECTION_GAP_PT), children: [labelRun(section.label)] }));
      return;
    }
    section.lineRows.forEach((row, i) => {
      const { lyricLine, chords } = placeChords(row.tokens, font.wordFont);
      if (chords.length > 0) {
        body.push(
          new Paragraph({
            spacing: exactLine(CHORD_LINE_PT),
            // Word measures tab stops from the left margin, so offset by the label column.
            tabStops: chords.map((c) => ({ type: TabStopType.LEFT, position: labelCol + twips(c.offsetPt) })),
            children: chords.map(
              (c) =>
                new TextRun({ children: [new Tab(), c.label], italics: true, size: halfPt(CHORD_SIZE_PT), font: font.wordFont }),
            ),
          }),
        );
      }
      const isLast = i === section.lineRows.length - 1;
      const withLabel = i === 0 && section.label;
      body.push(
        new Paragraph({
          spacing: exactLine(LYRIC_LINE_PT, isLast ? SECTION_GAP_PT : 0),
          // Hanging indent: the label sits at the margin on the first line, and the lyrics (plus
          // any wrapped continuation) start at the label column.
          indent: withLabel ? { left: labelCol, hanging: labelCol } : { left: labelCol },
          tabStops: [{ type: TabStopType.LEFT, position: labelCol }],
          children: withLabel ? [labelRun(section.label), new TextRun({ children: [new Tab()] }), lyricRun(lyricLine)] : [lyricRun(lyricLine)],
        }),
      );
    });
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: font.wordFont } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
            margin: {
              top: MARGIN_TOP_TWIPS,
              bottom: MARGIN_BOTTOM_TWIPS,
              left: MARGIN_SIDE_TWIPS,
              right: MARGIN_SIDE_TWIPS,
              header: HEADER_TOP_TWIPS,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `Key of ${key}`, italics: true, size: halfPt(KEY_SIZE_PT), font: font.wordFont })],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBlob(doc);
}
