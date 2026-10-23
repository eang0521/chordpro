import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ArrangementEntry, KeyName, SongCredits } from '../types';
import type { BlockMap } from '../lib/arrangement';
import type { PlacedLine, SectionDisplayRow } from '../lib/chordChart';
import { buildChartRows, capoShapeKey, flattenSections, groupIntoSections, isChordOnly, keyHeaderText, layoutLine, pageLabelText, songKeys } from '../lib/chordChart';
import { generateWordDoc } from '../lib/wordDoc';
import { generatePdf } from '../lib/pdfDoc';
import { chartFilename, downloadBlob } from '../lib/download';
import { CHORD_FONT_OPTIONS, getChordFontOption, loadChordFont } from '../lib/chordFonts';
import { creditLines } from '../lib/credits';
import {
  CHORD_SIZE_PT,
  CONTENT_WIDTH_PX,
  CREDIT_BOTTOM_TWIPS,
  CREDIT_LINE_PT,
  CREDIT_SIZE_PT,
  HEADER_TOP_PX,
  LYRIC_SIZE_PT,
  MARGIN_SIDE_PX,
  MARGIN_TOP_PX,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_PX,
  creditFooter,
  labelColumnTwips,
  measureInFont,
  twipsToPreviewPx,
  MAX_LINE_SPACING,
  MIN_LINE_SPACING,
  clampLineSpacing,
  TITLE_GAP_PT,
  titleSizePt,
} from '../lib/pageLayout';
import { PAGE_FIT_SLACK_PT, TITLE_LINE_PT } from '../lib/chartLayout';
import { fitLineSpacing, paginateByHeight } from '../lib/pagination';
import { KeyControl } from './KeyControl';
import { CapoSelect } from './CapoControls';
import { transposeKey } from '../lib/musicTheory';

interface Props {
  title: string;
  songKey: KeyName;
  onSongKeyChange: (key: KeyName) => void;
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
  fontId: string;
  onFontIdChange: (id: string) => void;
  lineSpacing: number;
  onLineSpacingChange: (value: number) => void;
  credits: SongCredits;
  /** Closes the dialog. Not used when `inline`. */
  onClose?: () => void;
  /** Shown in the page itself rather than as a dialog, opening on the page layout. */
  inline?: boolean;
  /** Just the pages, as they print, with no controls (a set's charts). Implies `inline`. */
  pagesOnly?: boolean;
  /** A guitarist's capo: the chords are spelled as the shapes they play, and the header gives both
   * keys (see keyHeaderText). */
  capo?: number;
  /** Offers a capo picker beside the key, for a capo chart. */
  onCapoChange?: (capo: number) => void;
}

const FIT_MAX_PAGES = 2;
// Fit to page aims this far short of a full page. The browser rounds each line's height a hair as
// it lays the chart out, so the preview can measure a fraction of a point less than the PDF's
// exact arithmetic; a fit right at the edge could then fit on screen but not in the PDF.
const FIT_SAFETY_PT = 1.5;

/** Sets the --line-spacing CSS custom property (not a typed React.CSSProperties key). */
function lineSpacingVar(value: number): Record<string, string> {
  return { '--line-spacing': String(value) };
}

// The title header is its own item so it can be measured and paginated exactly like a
// section row — it only ever lands on page 1, but reusing the same measurement pass keeps the
// pagination math in one place instead of special-casing the first page's available height.
type PageItem = { kind: 'header' } | { kind: 'row'; display: SectionDisplayRow };

/** Chords sit at the same measured offsets the Word export uses for its tab stops, absolutely
 * positioned over unspread lyric text, so the preview matches the doc letter for letter. */
function renderLinePair(placed: PlacedLine, key: number): ReactNode {
  const { lyricLine, chords, indentPt } = placed;
  if (isChordOnly(placed)) {
    // A chord-only line (a turn, an intro...) takes the lyric line's place, in chord type.
    return (
      <div className="chart-line-row" key={key}>
        <div className="chart-chord-only">
          &nbsp;
          {chords.map((c, i) => (
            <span className="chart-chord-label" key={i} style={{ left: `${c.offsetPt / CHORD_SIZE_PT}em` }}>
              {c.label}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="chart-line-row" key={key}>
      {chords.length > 0 && (
        <div className="chart-chord-line">
          &nbsp;
          {chords.map((c, i) => (
            // The label's own font is the chord size, so its em offset is in chord points.
            <span className="chart-chord-label" key={i} style={{ left: `${c.offsetPt / CHORD_SIZE_PT}em` }}>
              {c.label}
            </span>
          ))}
        </div>
      )}
      {/* The lyrics' own font is the lyric size, so the indent in em is in lyric points. */}
      <div className="chart-syllable" style={indentPt ? { paddingLeft: `${indentPt / LYRIC_SIZE_PT}em` } : undefined}>
        {lyricLine || ' '}
      </div>
    </div>
  );
}

/** Renders one line-pair beside the section-label column, matching the Word doc: the label
 * (shown only on the section's first row) sits on the lyric line, below a spacer the height of
 * the chord line. The label column width is in em of the lyric size, so it matches the doc's
 * physical width in page mode (where 1em = the lyric point size) and scales with the compact view. */
function renderDisplayRow(display: SectionDisplayRow, labelColEm: number, fontFamily: string): ReactNode {
  const gapClass = `${display.isLastInSection ? 'chart-gap-section' : 'chart-gap-line'}${
    display.row?.gapBefore && !display.isFirstInSection ? ' chart-gap-before' : ''
  }`;
  // Laid out within the page width beside the label column, wrapping where the PDF and Word
  // export do (1pt = 1px here), so the pages measured for Fit to page match what prints.
  const lines = display.row
    ? layoutLine(display.row.tokens, measureInFont(fontFamily), CONTENT_WIDTH_PX - labelColEm * LYRIC_SIZE_PT, display.row.repeat)
    : [];
  // Only lines with lyrics get a chord line above them; a chord-only line draws its chords on the
  // lyric line itself, so the label beside it needs no spacer.
  const first = lines[0];
  const hasChords = !!first && first.chords.length > 0 && !isChordOnly(first);
  return (
    <div className={`chart-section-row ${gapClass}`} key={display.key}>
      <div className="chart-label-col" style={{ width: `${labelColEm}em` }}>
        {display.isFirstInSection && display.section.label && (
          <>
            {hasChords && <div className="chart-chord-line">&nbsp;</div>}
            <div className="chart-syllable">
              <span className="chart-section-label">{display.section.label}</span>
            </div>
          </>
        )}
      </div>
      <div className="chart-content-col">{lines.length > 0 ? lines.map(renderLinePair) : <>&nbsp;</>}</div>
    </div>
  );
}

/** The title at its fitted size (`sizePt`), in a line box that stays the usual height, as in the
 * PDF and Word export. */
function renderTitle(title: string, sizePt: number): ReactNode {
  const style = { fontSize: `${sizePt / LYRIC_SIZE_PT}em`, lineHeight: TITLE_LINE_PT / sizePt, marginBottom: `${TITLE_GAP_PT / sizePt}em` };
  return (
    <div className="chart-doc-title" key="header" style={style}>
      {title || 'Untitled'}
    </div>
  );
}

function renderPageItem(item: PageItem, title: string, titleSize: number, labelColEm: number, fontFamily: string): ReactNode {
  return item.kind === 'header' ? renderTitle(title, titleSize) : renderDisplayRow(item.display, labelColEm, fontFamily);
}

export function ChordChartView({
  title,
  songKey,
  onSongKeyChange,
  blocks,
  arrangement,
  fontId,
  onFontIdChange,
  lineSpacing,
  onLineSpacingChange,
  credits,
  onClose,
  inline: inlineProp = false,
  pagesOnly = false,
  capo = 0,
  onCapoChange,
}: Props) {
  const inline = inlineProp || pagesOnly;
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pageMode, setPageMode] = useState(inline);
  const [fitMessage, setFitMessage] = useState<string | null>(null);
  const shapeKey = capoShapeKey(songKey, capo);
  const sections = useMemo(
    () => groupIntoSections(buildChartRows(blocks, arrangement, shapeKey)),
    [blocks, arrangement, shapeKey],
  );
  const displayRows = useMemo(() => flattenSections(sections), [sections]);
  const keyHeader = keyHeaderText(sections, shapeKey, capo);
  // The keys the song is played in (not the capo shapes), for the file names.
  const playedKeys = songKeys(sections, shapeKey).map((k) => transposeKey(k, capo));
  const pageItems = useMemo<PageItem[]>(
    () => [{ kind: 'header' }, ...displayRows.map((display) => ({ kind: 'row' as const, display }))],
    [displayRows],
  );
  const font = getChordFontOption(fontId);
  // Chord positions are measured on a canvas, which uses a fallback font until a bundled font
  // has loaded — so re-measure (and re-render) once it's in.
  const [fontLoads, setFontLoads] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadChordFont(font)
      .then(() => !cancelled && setFontLoads((n) => n + 1))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [font]);
  const labelColEm = useMemo(() => {
    const labels = [...new Set(displayRows.map((d) => d.section.label))];
    return labelColumnTwips(labels, measureInFont(font.wordFont)) / 20 / LYRIC_SIZE_PT;
    // fontLoads: the same font measures differently once it has actually loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows, font.wordFont, fontLoads]);
  // The credits footer, and the page height left for the song above it.
  const footer = useMemo(
    () => creditFooter(creditLines(credits), measureInFont(font.wordFont)),
    // fontLoads: as above, measure again once the font has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [credits, font.wordFont, fontLoads],
  );
  // Long titles shrink to fit on one line, measured as the PDF and Word export measure them.
  const titleSize = useMemo(
    () => titleSizePt(title, measureInFont(font.wordFont)),
    // fontLoads: as above, measure again once the font has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, font.wordFont, fontLoads],
  );
  const marginBottomPx = twipsToPreviewPx(footer.marginBottomTwips);
  const contentHeightPx = PAGE_HEIGHT_PX - MARGIN_TOP_PX - marginBottomPx;

  // Measure each page item's real rendered height (in a hidden, page-content-width container) so
  // we can greedily pack them into US-Letter pages, matching the margins the Word export uses.
  const measureRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [pages, setPages] = useState<number[][]>([]);

  // On a screen narrower than a page (a phone), the pages are shrunk to fit its width, like a PDF
  // viewer, rather than being cut off.
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [pageScale, setPageScale] = useState(1);
  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const fit = () => setPageScale(Math.min(1, el.clientWidth / PAGE_WIDTH_PX));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageMode]);

  // Page items grouped by song section (the title on its own), so a section is never split
  // across pages.
  const groups = useMemo(() => {
    const result: number[][] = [];
    pageItems.forEach((item, i) => {
      const prev = pageItems[i - 1];
      const sameSection = item.kind === 'row' && prev?.kind === 'row' && prev.display.section === item.display.section;
      if (sameSection) result[result.length - 1].push(i);
      else result.push([i]);
    });
    return result;
  }, [pageItems]);

  function measureHeights(): number[] {
    // getBoundingClientRect().height excludes margins (and adjacent margins can collapse), so
    // measure top-to-top distance between consecutive items instead — that's the browser's
    // actual resolved spacing, which top/bottom padding on an item alone wouldn't capture.
    const tops = pageItems.map((_, i) => itemRefs.current[i]?.getBoundingClientRect().top ?? 0);
    return pageItems.map((_, i) => {
      if (i + 1 < pageItems.length) return tops[i + 1] - tops[i];
      return itemRefs.current[i]?.getBoundingClientRect().height ?? 0;
    });
  }

  useLayoutEffect(() => {
    // The same room per page as the PDF and Word export allow, so a section that only just fits
    // (or only just doesn't) breaks onto the same page here as it does there.
    setPages(paginateByHeight(measureHeights(), groups, contentHeightPx + PAGE_FIT_SLACK_PT));
    // measureHeights only reads the DOM rendered from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageItems, groups, font.cssFont, lineSpacing, fontLoads, contentHeightPx, titleSize]);

  /** Picks the roomiest line spacing that still fits the song on one page (or two if it must),
   * by re-measuring the hidden layout at each candidate spacing. */
  function fitToPage() {
    const container = measureRef.current;
    if (!container) return;
    const measureAt = (spacing: number) => {
      container.style.setProperty('--line-spacing', String(spacing));
      return measureHeights();
    };
    const fit = fitLineSpacing(measureAt, groups, contentHeightPx - FIT_SAFETY_PT, FIT_MAX_PAGES, MIN_LINE_SPACING, MAX_LINE_SPACING);
    container.style.setProperty('--line-spacing', String(lineSpacing));
    if (fit) {
      onLineSpacingChange(fit.spacing);
      setFitMessage(`Fits on ${fit.pages} ${fit.pages === 1 ? 'page' : 'pages'} at ${fit.spacing.toFixed(2)} spacing`);
    } else {
      onLineSpacingChange(MIN_LINE_SPACING);
      setFitMessage(`Too long for ${FIT_MAX_PAGES} pages even at the tightest spacing`);
    }
    setPageMode(true);
  }

  async function downloadDocx() {
    setGenerating(true);
    try {
      const blob = await generateWordDoc(title, songKey, blocks, arrangement, fontId, lineSpacing, credits, capo);
      downloadBlob(blob, chartFilename(title, playedKeys, 'docx'));
    } finally {
      setGenerating(false);
    }
  }

  async function downloadPdf() {
    setGeneratingPdf(true);
    try {
      const blob = await generatePdf(title, songKey, blocks, arrangement, fontId, lineSpacing, credits, capo);
      downloadBlob(blob, chartFilename(title, playedKeys, 'pdf'));
    } finally {
      setGeneratingPdf(false);
    }
  }

  const panel = (
    <div
      className={inline ? 'chart-inline' : `arrangement-panel chart-panel ${pageMode ? 'chart-panel-wide' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {!pagesOnly && (
        <div className="arrangement-panel-header">
          <h2>
            {title || 'Untitled'} <span className="chart-key">({songKey}{capo ? `, capo ${capo}` : ''})</span>
          </h2>
          <div className="chart-panel-actions">
            <KeyControl songKey={songKey} onChange={onSongKeyChange} />
            {onCapoChange && <CapoSelect capo={capo} keys={playedKeys} onChange={onCapoChange} />}
            <select className="chart-font-select" value={fontId} onChange={(e) => onFontIdChange(e.target.value)}>
              {CHORD_FONT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label className="chart-line-spacing">
              <span>Line spacing</span>
              <input
                type="number"
                min={MIN_LINE_SPACING}
                max={MAX_LINE_SPACING}
                step={0.05}
                value={lineSpacing}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) onLineSpacingChange(clampLineSpacing(v));
                  setFitMessage(null);
                }}
              />
            </label>
            <button className="secondary" onClick={fitToPage} title="Set the line spacing so the song fits on 1 page, or 2 if it must">
              Fit to page
            </button>
            <button className={`secondary ${pageMode ? 'chart-toggle-active' : ''}`} onClick={() => setPageMode((v) => !v)}>
              {pageMode ? 'Compact view' : 'Show page layout'}
            </button>
            <button className="secondary" disabled={generating} onClick={downloadDocx}>
              {generating ? 'Generating…' : 'Download .docx'}
            </button>
            <button className="secondary" disabled={generatingPdf} onClick={downloadPdf}>
              {generatingPdf ? 'Generating…' : 'Download PDF'}
            </button>
            {!inline && (
              <button className="secondary" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {fitMessage && <p className="hint chart-fit-message">{fitMessage}</p>}

      {displayRows.length === 0 && <p className="hint">Nothing to show yet &mdash; split some lyrics into syllables first.</p>}

      {/* Hidden measurement pass: same width as a page's printable area, so wrapping (and
          therefore each item's true height) matches what page mode will actually show. */}
      <div
        ref={measureRef}
        className="chart-measure"
        style={{ fontFamily: font.cssFont, fontSize: LYRIC_SIZE_PT, width: CONTENT_WIDTH_PX, ...lineSpacingVar(lineSpacing) }}
      >
        {pageItems.map((item, i) => (
          <div key={i} ref={(el) => { itemRefs.current[i] = el; }}>
            {renderPageItem(item, title, titleSize, labelColEm, font.wordFont)}
          </div>
        ))}
      </div>

      {pageMode ? (
        <div className="chart-pages" ref={pagesRef}>
          {pages.map((indices, pageIndex) => (
            // Takes the shrunk page's size, since a CSS scale leaves the page's layout box full size.
            <div className="chart-page-frame" style={{ width: PAGE_WIDTH_PX * pageScale, height: PAGE_HEIGHT_PX * pageScale }} key={pageIndex}>
              <div
                className="chart-page"
                style={{
                  width: PAGE_WIDTH_PX,
                  height: PAGE_HEIGHT_PX,
                  ...(pageScale < 1 ? { transform: `scale(${pageScale})`, transformOrigin: 'top left' } : {}),
                }}
              >
                <div
                  className="chart-page-content"
                  style={{
                    fontFamily: font.cssFont,
                    fontSize: LYRIC_SIZE_PT,
                    padding: `${MARGIN_TOP_PX}px ${MARGIN_SIDE_PX}px ${marginBottomPx}px`,
                    ...lineSpacingVar(lineSpacing),
                  }}
                >
                  {/* Only the first page has the key, like the Word and PDF exports; a multi-page
                      chart labels every page at the top right, level with it. */}
                  {pageIndex === 0 && (
                    <div className="chart-page-header" style={{ top: HEADER_TOP_PX, left: MARGIN_SIDE_PX }}>
                      {keyHeader}
                    </div>
                  )}
                  {pages.length > 1 && (
                    <div className="chart-page-header" style={{ top: HEADER_TOP_PX, right: MARGIN_SIDE_PX }}>
                      {pageLabelText(title, pageIndex, pages.length)}
                    </div>
                  )}
                  {/* Until it's re-paginated, a chart that just lost rows can have page breaks
                      for rows it no longer has. */}
                  {indices.filter((i) => i < pageItems.length).map((i) => (
                    <div key={i}>{renderPageItem(pageItems[i], title, titleSize, labelColEm, font.wordFont)}</div>
                  ))}
                </div>
                {footer.lines.length > 0 && (
                  // Wrapped exactly where the Word doc and PDF wrap it, so the line count (and
                  // so the room left for the song) matches.
                  <div
                    className="chart-page-credits"
                    style={{
                      fontFamily: font.cssFont,
                      fontSize: CREDIT_SIZE_PT,
                      lineHeight: `${CREDIT_LINE_PT}px`,
                      bottom: twipsToPreviewPx(CREDIT_BOTTOM_TWIPS),
                      left: MARGIN_SIDE_PX,
                      right: MARGIN_SIDE_PX,
                    }}
                  >
                    {footer.lines.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="chord-chart" style={{ fontFamily: font.cssFont, ...lineSpacingVar(lineSpacing) }}>
          <div className="chart-page-header">{keyHeader}</div>
          {renderTitle(title, titleSize)}
          {displayRows.map((display) => renderDisplayRow(display, labelColEm, font.wordFont))}
          {footer.lines.length > 0 && (
            <div className="chart-compact-credits">
              {creditLines(credits).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (inline) return panel;
  return (
    <div className="arrangement-overlay" onClick={onClose}>
      {panel}
    </div>
  );
}
