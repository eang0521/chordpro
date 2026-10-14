import type { Paragraph } from 'docx';
import type { ArrangementEntry, KeyName, SongCredits } from '../types';
import type { BlockMap } from './arrangement';
import { buildChartRows, groupIntoSections, isChordOnly, keyHeaderText, placeChords } from './chordChart';
import { fetchFontFile, getChordFontOption, loadChordFont } from './chordFonts';
import { embedFontStyles } from './docxFonts';
import { creditLines } from './credits';
import {
  CHORD_LINE_PT,
  CHORD_SIZE_PT,
  CREDIT_BOTTOM_TWIPS,
  CREDIT_LINE_PT,
  CREDIT_SIZE_PT,
  HEADER_TOP_TWIPS,
  KEY_SIZE_PT,
  LABEL_SIZE_PT,
  LYRIC_LINE_PT,
  LYRIC_SIZE_PT,
  MARGIN_SIDE_TWIPS,
  MARGIN_TOP_TWIPS,
  PAGE_HEIGHT_TWIPS,
  PAGE_WIDTH_TWIPS,
  SECTION_GAP_PT,
  TITLE_GAP_PT,
  TITLE_SIZE_PT,
  creditFooter,
  labelColumnTwips,
  measureInFont,
} from './pageLayout';

const halfPt = (pt: number) => pt * 2; // docx run sizes are in half-points
const twips = (pt: number) => Math.round(pt * 20);
/** Builds a downloadable .docx chord chart laid out like a typical printed worship chart: "Key
 * of X" in the page header, a centered all-caps title, then each section with its label in a
 * left column on the first lyric line and italic chords tight above the bold lyrics.
 * `lineSpacing` scales every line height and gap (1.0 = normal). The writers and copyright go
 * in the footer of every page. */
export async function generateWordDoc(
  title: string,
  key: KeyName,
  blocks: BlockMap,
  arrangement: ArrangementEntry[],
  fontId: string,
  lineSpacing = 1,
  credits?: SongCredits,
): Promise<Blob> {
  // Loaded on demand — the docx package is sizable and most sessions never export a Word doc.
  const { AlignmentType, Document, Footer, Header, LineRuleType, Packer, Paragraph, Tab, TabStopType, TextRun } = await import('docx');
  const font = getChordFontOption(fontId);
  await loadChordFont(font); // measuring chord positions needs the real font loaded
  const sections = groupIntoSections(buildChartRows(blocks, arrangement, key));
  const measure = measureInFont(font.wordFont);
  const labelCol = labelColumnTwips(sections.map((s) => s.label), measure);
  const footer = creditFooter(creditLines(credits), measure);

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
      keepNext: true,
      children: [
        new TextRun({ text: title || 'Untitled', bold: true, allCaps: true, size: halfPt(TITLE_SIZE_PT), font: font.wordFont }),
      ],
    }),
  ];

  sections.forEach((section) => {
    if (section.lineRows.length === 0) {
      if (section.label) body.push(new Paragraph({ spacing: exactLine(LYRIC_LINE_PT, SECTION_GAP_PT), keepNext: true, children: [labelRun(section.label)] }));
      return;
    }
    section.lineRows.forEach((row, i) => {
      const placed = placeChords(row.tokens, measure, row.repeat);
      const { lyricLine, chords } = placed;
      const isLast = i === section.lineRows.length - 1;
      const withLabel = i === 0 && section.label;
      // Word measures tab stops from the left margin, so offset by the label column.
      const chordTabStops = chords.map((c) => ({ type: TabStopType.LEFT, position: labelCol + twips(c.offsetPt) }));
      const chordRuns = chords.map(
        (c) => new TextRun({ children: [new Tab(), c.label], italics: true, size: halfPt(CHORD_SIZE_PT), font: font.wordFont }),
      );

      if (isChordOnly(placed)) {
        // A chord-only line (a turn, an intro...) takes the lyric line's place: one line, with
        // the label (which is narrower than its column) followed by tabs to each chord.
        body.push(
          new Paragraph({
            spacing: exactLine(LYRIC_LINE_PT, isLast ? SECTION_GAP_PT : 0),
            keepNext: !isLast,
            keepLines: true,
            tabStops: chordTabStops,
            children: withLabel ? [labelRun(section.label), ...chordRuns] : chordRuns,
          }),
        );
        return;
      }

      if (chords.length > 0) {
        body.push(
          new Paragraph({
            spacing: exactLine(CHORD_LINE_PT),
            // Every line of a section keeps with the next one, so Word never splits a section
            // across pages (matching the preview's pagination).
            keepNext: true,
            keepLines: true,
            tabStops: chordTabStops,
            children: chordRuns,
          }),
        );
      }
      body.push(
        new Paragraph({
          spacing: exactLine(LYRIC_LINE_PT, isLast ? SECTION_GAP_PT : 0),
          keepNext: !isLast,
          keepLines: true,
          // Hanging indent: the label sits at the margin on the first line, and the lyrics (plus
          // any wrapped continuation) start at the label column.
          indent: withLabel ? { left: labelCol, hanging: labelCol } : { left: labelCol },
          tabStops: [{ type: TabStopType.LEFT, position: labelCol }],
          children: withLabel ? [labelRun(section.label), new TextRun({ children: [new Tab()] }), lyricRun(lyricLine)] : [lyricRun(lyricLine)],
        }),
      );
    });
  });

  // One paragraph per line, broken where the preview breaks them, so Word reserves the same room.
  // With no credits, one empty line short enough to stay inside the usual bottom margin.
  const creditsFooter = () =>
    new Footer({
      children: (footer.lines.length > 0 ? footer.lines : ['']).map(
        (line) =>
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0, line: twips(CREDIT_LINE_PT), lineRule: LineRuleType.EXACT },
            children: [new TextRun({ text: line, size: halfPt(CREDIT_SIZE_PT), font: font.wordFont })],
          }),
      ),
    });

  // A bundled font travels inside the file so the chart looks right on computers without it.
  const fontFiles = font.files
    ? await Promise.all([font.files.regular, font.files.bold, font.files.italic, font.files.boldItalic].map(fetchFontFile))
    : null;

  const doc = new Document({
    // docx types this as a Node Buffer, but only reads it as bytes, so a Uint8Array works.
    fonts: fontFiles ? [{ name: font.wordFont, data: fontFiles[0] as unknown as Buffer }] : [],
    styles: { default: { document: { run: { font: font.wordFont } } } },
    sections: [
      {
        properties: {
          // A separate first-page header, so the key header shows on page 1 only.
          titlePage: true,
          page: {
            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
            margin: {
              top: MARGIN_TOP_TWIPS,
              bottom: footer.marginBottomTwips,
              left: MARGIN_SIDE_TWIPS,
              right: MARGIN_SIDE_TWIPS,
              header: HEADER_TOP_TWIPS,
              footer: CREDIT_BOTTOM_TWIPS,
            },
          },
        },
        headers: {
          first: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: keyHeaderText(sections, key), italics: true, size: halfPt(KEY_SIZE_PT), font: font.wordFont }),
                ],
              }),
            ],
          }),
          default: new Header({ children: [new Paragraph({ children: [] })] }),
        },
        // The same footer on the first page and the rest (the first page has its own header).
        footers: { first: creditsFooter(), default: creditsFooter() },
        children: body,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  if (!fontFiles) return blob;
  const [, bold, italic, boldItalic] = fontFiles;
  return embedFontStyles(blob, font.wordFont, { Bold: bold, Italic: italic, BoldItalic: boldItalic });
}
