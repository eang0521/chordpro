import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { KeyName } from '../types';
import type { BlockMap } from '../lib/arrangement';
import type { ChartLineRow, SectionDisplayRow } from '../lib/chordChart';
import { buildChartRows, flattenSections, groupIntoSections, isChordOnly, placeChords } from '../lib/chordChart';
import { generateWordDoc } from '../lib/wordDoc';
import { generatePdf } from '../lib/pdfDoc';
import { downloadBlob, slugifyFilename } from '../lib/download';
import { CHORD_FONT_OPTIONS, getChordFontOption, loadChordFont } from '../lib/chordFonts';
import {
  CHORD_SIZE_PT,
  CONTENT_HEIGHT_PX,
  CONTENT_WIDTH_PX,
  HEADER_TOP_PX,
  LYRIC_SIZE_PT,
  MARGIN_BOTTOM_PX,
  MARGIN_SIDE_PX,
  MARGIN_TOP_PX,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_PX,
  labelColumnTwips,
  measureInFont,
} from '../lib/pageLayout';
import { fitLineSpacing, paginateByHeight } from '../lib/pagination';
import { KeyControl } from './KeyControl';

interface Props {
  title: string;
  songKey: KeyName;
  onSongKeyChange: (key: KeyName) => void;
  blocks: BlockMap;
  arrangement: string[];
  fontId: string;
  onFontIdChange: (id: string) => void;
  lineSpacing: number;
  onLineSpacingChange: (value: number) => void;
  onClose: () => void;
}

const MIN_LINE_SPACING = 0.7;
const MAX_LINE_SPACING = 1.2;
const FIT_MAX_PAGES = 2;

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
function renderLinePair(row: ChartLineRow, fontFamily: string): ReactNode {
  const placed = placeChords(row.tokens, measureInFont(fontFamily));
  const { lyricLine, chords } = placed;
  if (isChordOnly(placed)) {
    // A chord-only line (a turn, an intro...) takes the lyric line's place, in chord type.
    return (
      <div className="chart-line-row">
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
    <div className="chart-line-row">
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
      <div className="chart-syllable">{lyricLine || ' '}</div>
    </div>
  );
}

/** Renders one line-pair beside the section-label column, matching the Word doc: the label
 * (shown only on the section's first row) sits on the lyric line, below a spacer the height of
 * the chord line. The label column width is in em of the lyric size, so it matches the doc's
 * physical width in page mode (where 1em = the lyric point size) and scales with the compact view. */
function renderDisplayRow(display: SectionDisplayRow, labelColEm: number, fontFamily: string): ReactNode {
  const gapClass = display.isLastInSection ? 'chart-gap-section' : 'chart-gap-line';
  // Only rows with lyrics get a chord line above them; a chord-only row draws its chords on the
  // lyric line itself, so its label needs no spacer.
  const tokens = display.row?.tokens ?? [];
  const hasChords = tokens.some((t) => t.chordLabel) && tokens.some((t) => !t.isSlot && t.text.trim());
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
      <div className="chart-content-col">{display.row ? renderLinePair(display.row, fontFamily) : <>&nbsp;</>}</div>
    </div>
  );
}

function renderTitle(title: string): ReactNode {
  return (
    <div className="chart-doc-title" key="header">
      {title || 'Untitled'}
    </div>
  );
}

function renderPageItem(item: PageItem, title: string, labelColEm: number, fontFamily: string): ReactNode {
  return item.kind === 'header' ? renderTitle(title) : renderDisplayRow(item.display, labelColEm, fontFamily);
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
  onClose,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pageMode, setPageMode] = useState(false);
  const [fitMessage, setFitMessage] = useState<string | null>(null);
  const displayRows = useMemo(
    () => flattenSections(groupIntoSections(buildChartRows(blocks, arrangement, songKey))),
    [blocks, arrangement, songKey],
  );
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

  // Measure each page item's real rendered height (in a hidden, page-content-width container) so
  // we can greedily pack them into US-Letter pages, matching the margins the Word export uses.
  const measureRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [pages, setPages] = useState<number[][]>([]);

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
    setPages(paginateByHeight(measureHeights(), groups, CONTENT_HEIGHT_PX));
    // measureHeights only reads the DOM rendered from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageItems, groups, font.cssFont, lineSpacing, fontLoads]);

  /** Picks the roomiest line spacing that still fits the song on one page (or two if it must),
   * by re-measuring the hidden layout at each candidate spacing. */
  function fitToPage() {
    const container = measureRef.current;
    if (!container) return;
    const measureAt = (spacing: number) => {
      container.style.setProperty('--line-spacing', String(spacing));
      return measureHeights();
    };
    const fit = fitLineSpacing(measureAt, groups, CONTENT_HEIGHT_PX, FIT_MAX_PAGES, MIN_LINE_SPACING, MAX_LINE_SPACING);
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
      const blob = await generateWordDoc(title, songKey, blocks, arrangement, fontId, lineSpacing);
      downloadBlob(blob, `${slugifyFilename(title)}.docx`);
    } finally {
      setGenerating(false);
    }
  }

  async function downloadPdf() {
    setGeneratingPdf(true);
    try {
      const blob = await generatePdf(title, songKey, blocks, arrangement, fontId, lineSpacing);
      downloadBlob(blob, `${slugifyFilename(title)}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className={`arrangement-panel chart-panel ${pageMode ? 'chart-panel-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="arrangement-panel-header">
          <h2>
            {title || 'Untitled'} <span className="chart-key">({songKey})</span>
          </h2>
          <div className="chart-panel-actions">
            <KeyControl songKey={songKey} onChange={onSongKeyChange} />
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
                  if (!Number.isNaN(v)) onLineSpacingChange(Math.min(MAX_LINE_SPACING, Math.max(MIN_LINE_SPACING, v)));
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
            <button className="secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>

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
              {renderPageItem(item, title, labelColEm, font.wordFont)}
            </div>
          ))}
        </div>

        {pageMode ? (
          <div className="chart-pages">
            {pages.map((indices, pageIndex) => (
              <div className="chart-page" style={{ width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX }} key={pageIndex}>
                <div
                  className="chart-page-content"
                  style={{
                    fontFamily: font.cssFont,
                    fontSize: LYRIC_SIZE_PT,
                    padding: `${MARGIN_TOP_PX}px ${MARGIN_SIDE_PX}px ${MARGIN_BOTTOM_PX}px`,
                    ...lineSpacingVar(lineSpacing),
                  }}
                >
                  <div className="chart-page-header" style={{ top: HEADER_TOP_PX, left: MARGIN_SIDE_PX }}>
                    Key of {songKey}
                  </div>
                  {indices.map((i) => (
                    <div key={i}>{renderPageItem(pageItems[i], title, labelColEm, font.wordFont)}</div>
                  ))}
                </div>
                <div className="chart-page-footer">
                  Page {pageIndex + 1} of {pages.length}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="chord-chart" style={{ fontFamily: font.cssFont, ...lineSpacingVar(lineSpacing) }}>
            <div className="chart-page-header">Key of {songKey}</div>
            {renderTitle(title)}
            {displayRows.map((display) => renderDisplayRow(display, labelColEm, font.wordFont))}
          </div>
        )}
      </div>
    </div>
  );
}
