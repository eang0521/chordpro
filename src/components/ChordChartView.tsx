import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { KeyName } from '../types';
import type { BlockMap } from '../lib/arrangement';
import type { ChartLineRow, SectionDisplayRow } from '../lib/chordChart';
import { buildChartRows, flattenSections, groupIntoSections } from '../lib/chordChart';
import { generateWordDoc } from '../lib/wordDoc';
import { downloadBlob, slugifyFilename } from '../lib/download';
import { CHORD_FONT_OPTIONS, DEFAULT_CHORD_FONT_ID, getChordFontOption } from '../lib/chordFonts';
import {
  CONTENT_HEIGHT_PX,
  CONTENT_WIDTH_PX,
  FONT_SIZE_PT,
  LABEL_COLUMN_PX,
  LYRIC_COLUMN_PX,
  MARGIN_PX,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_PX,
  SECTION_COLORS,
} from '../lib/pageLayout';
import { paginateByHeight } from '../lib/pagination';

interface Props {
  title: string;
  songKey: KeyName;
  blocks: BlockMap;
  arrangement: string[];
  onClose: () => void;
}

/** Sets the --line-spacing CSS custom property (not a typed React.CSSProperties key). */
function lineSpacingVar(value: number): Record<string, string> {
  return { '--line-spacing': String(value) };
}

// The title/key header is its own item so it can be measured and paginated exactly like a
// section row — it only ever lands on page 1, but reusing the same measurement pass keeps the
// pagination math in one place instead of special-casing the first page's available height.
type PageItem = { kind: 'header' } | { kind: 'row'; display: SectionDisplayRow };

function renderLinePair(row: ChartLineRow): ReactNode {
  return (
    <div className="chart-line-row">
      {row.tokens.flatMap((tok, ti): ReactNode[] => {
        const nodes: ReactNode[] = [];
        if (ti > 0 && tok.isWordStart) nodes.push(' ');
        nodes.push(
          <span className="chart-syl-wrap" key={tok.key}>
            <span className={`chart-chord-label ${tok.chordLabel ? '' : 'chart-chord-label-empty'}`}>
              {tok.chordLabel ?? ''}
            </span>
            <span className="chart-syllable">{tok.text}</span>
          </span>,
        );
        return nodes;
      })}
    </div>
  );
}

/** Renders one section's label beside its lyrics/chords, matching the Word doc's two-column
 * table layout: a narrow label column (shown only on the section's first row) beside a wider
 * content column. `pageAccurate` locks both columns to the doc's true physical widths — the
 * compact view instead lets the label column grow for long labels and the content column flow
 * freely, since it isn't trying to simulate the printed page width. */
function renderDisplayRow(display: SectionDisplayRow, pageAccurate: boolean): ReactNode {
  const gapClass = display.isLastInSection ? 'chart-gap-section' : 'chart-gap-line';
  const labelStyle = pageAccurate
    ? { width: LABEL_COLUMN_PX, flexShrink: 0 }
    : { minWidth: LABEL_COLUMN_PX, flexShrink: 0 };
  const contentStyle = pageAccurate ? { width: LYRIC_COLUMN_PX } : undefined;
  return (
    <div className={`chart-section-row ${gapClass}`} key={display.key}>
      <div className="chart-label-col" style={labelStyle}>
        {display.isFirstInSection && display.section.label && (
          <span className="chart-section-label" style={{ color: `#${SECTION_COLORS[display.section.type]}` }}>
            {display.section.label}
          </span>
        )}
      </div>
      <div className="chart-content-col" style={contentStyle}>
        {display.row ? renderLinePair(display.row) : <>&nbsp;</>}
      </div>
    </div>
  );
}

function renderHeader(title: string, songKey: KeyName): ReactNode {
  return (
    <div className="chart-doc-header" key="header">
      <span className="chart-doc-title">{title || 'Untitled'}</span>
      <span className="chart-doc-key">Key: {songKey}</span>
    </div>
  );
}

function renderPageItem(item: PageItem, title: string, songKey: KeyName, pageAccurate: boolean): ReactNode {
  return item.kind === 'header' ? renderHeader(title, songKey) : renderDisplayRow(item.display, pageAccurate);
}

export function ChordChartView({ title, songKey, blocks, arrangement, onClose }: Props) {
  const [fontId, setFontId] = useState<string>(DEFAULT_CHORD_FONT_ID);
  const [lineSpacing, setLineSpacing] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [pageMode, setPageMode] = useState(false);
  const displayRows = useMemo(
    () => flattenSections(groupIntoSections(buildChartRows(blocks, arrangement, songKey))),
    [blocks, arrangement, songKey],
  );
  const pageItems = useMemo<PageItem[]>(
    () => [{ kind: 'header' }, ...displayRows.map((display) => ({ kind: 'row' as const, display }))],
    [displayRows],
  );
  const font = getChordFontOption(fontId);

  // Measure each page item's real rendered height (in a hidden, page-content-width container) so
  // we can greedily pack them into US-Letter pages, matching the margins the Word export uses.
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [pages, setPages] = useState<number[][]>([]);

  useLayoutEffect(() => {
    // getBoundingClientRect().height excludes margins (and adjacent margins can collapse), so
    // measure top-to-top distance between consecutive items instead — that's the browser's
    // actual resolved spacing, which top/bottom padding on an item alone wouldn't capture.
    const tops = pageItems.map((_, i) => itemRefs.current[i]?.getBoundingClientRect().top ?? 0);
    const heights = pageItems.map((_, i) => {
      if (i + 1 < pageItems.length) return tops[i + 1] - tops[i];
      return itemRefs.current[i]?.getBoundingClientRect().height ?? 0;
    });
    setPages(paginateByHeight(heights, CONTENT_HEIGHT_PX));
  }, [pageItems, font.cssFont, lineSpacing]);

  async function downloadDocx() {
    setGenerating(true);
    try {
      const blob = await generateWordDoc(title, songKey, blocks, arrangement, fontId, lineSpacing);
      downloadBlob(blob, `${slugifyFilename(title)}.docx`);
    } finally {
      setGenerating(false);
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
            <select className="chart-font-select" value={fontId} onChange={(e) => setFontId(e.target.value)}>
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
                min={0.7}
                max={1.2}
                step={0.05}
                value={lineSpacing}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) setLineSpacing(Math.min(1.2, Math.max(0.7, v)));
                }}
              />
            </label>
            <button className={`secondary ${pageMode ? 'chart-toggle-active' : ''}`} onClick={() => setPageMode((v) => !v)}>
              {pageMode ? 'Compact view' : 'Show page layout'}
            </button>
            <button className="secondary" disabled={generating} onClick={downloadDocx}>
              {generating ? 'Generating…' : 'Download .docx'}
            </button>
            <button className="secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>

        {displayRows.length === 0 && <p className="hint">Nothing to show yet &mdash; split some lyrics into syllables first.</p>}

        {/* Hidden measurement pass: same width as a page's printable area, so wrapping (and
            therefore each item's true height) matches what page mode will actually show. */}
        <div
          className="chart-measure"
          style={{ fontFamily: font.cssFont, fontSize: FONT_SIZE_PT, width: CONTENT_WIDTH_PX, ...lineSpacingVar(lineSpacing) }}
        >
          {pageItems.map((item, i) => (
            <div key={i} ref={(el) => { itemRefs.current[i] = el; }}>
              {renderPageItem(item, title, songKey, true)}
            </div>
          ))}
        </div>

        {pageMode ? (
          <div className="chart-pages">
            {pages.map((indices, pageIndex) => (
              <div className="chart-page" style={{ width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX }} key={pageIndex}>
                <div
                  className="chart-page-content"
                  style={{ fontFamily: font.cssFont, fontSize: FONT_SIZE_PT, padding: MARGIN_PX, ...lineSpacingVar(lineSpacing) }}
                >
                  {indices.map((i) => (
                    <div key={i}>{renderPageItem(pageItems[i], title, songKey, true)}</div>
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
            {displayRows.map((display) => renderDisplayRow(display, false))}
          </div>
        )}
      </div>
    </div>
  );
}
