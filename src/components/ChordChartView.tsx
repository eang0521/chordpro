import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { KeyName } from '../types';
import type { BlockMap } from '../lib/arrangement';
import type { ChartRow } from '../lib/chordChart';
import { buildChartRows } from '../lib/chordChart';
import { generateWordDoc } from '../lib/wordDoc';
import { downloadBlob, slugifyFilename } from '../lib/download';
import { CHORD_FONT_OPTIONS, DEFAULT_CHORD_FONT_ID, getChordFontOption } from '../lib/chordFonts';
import { CONTENT_HEIGHT_PX, CONTENT_WIDTH_PX, FONT_SIZE_PT, MARGIN_PX, PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from '../lib/pageLayout';
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

function renderChartRow(row: ChartRow, key: number | string): ReactNode {
  if (row.kind === 'heading') {
    return (
      <div className={`section-heading section-${row.type}`} key={key}>
        {row.label}
      </div>
    );
  }
  return (
    <div className="chart-line-row" key={key}>
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

export function ChordChartView({ title, songKey, blocks, arrangement, onClose }: Props) {
  const [fontId, setFontId] = useState<string>(DEFAULT_CHORD_FONT_ID);
  const [lineSpacing, setLineSpacing] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [pageMode, setPageMode] = useState(false);
  const rows = useMemo(() => buildChartRows(blocks, arrangement, songKey), [blocks, arrangement, songKey]);
  const font = getChordFontOption(fontId);

  // Measure each row's real rendered height (in a hidden, page-content-width container) so we
  // can greedily pack rows into US-Letter pages, matching the margins the Word export uses.
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [pages, setPages] = useState<number[][]>([]);

  useLayoutEffect(() => {
    // getBoundingClientRect().height excludes margins (and adjacent margins can collapse), so
    // measure top-to-top distance between consecutive rows instead — that's the browser's
    // actual resolved spacing, which top/bottom padding on a row alone wouldn't capture.
    const tops = rows.map((_, i) => rowRefs.current[i]?.getBoundingClientRect().top ?? 0);
    const heights = rows.map((_, i) => {
      if (i + 1 < rows.length) return tops[i + 1] - tops[i];
      return rowRefs.current[i]?.getBoundingClientRect().height ?? 0;
    });
    setPages(paginateByHeight(heights, CONTENT_HEIGHT_PX));
  }, [rows, font.cssFont, lineSpacing]);

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
                min={0.8}
                max={1.2}
                step={0.05}
                value={lineSpacing}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) setLineSpacing(Math.min(1.2, Math.max(0.8, v)));
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

        {rows.length === 0 && <p className="hint">Nothing to show yet &mdash; split some lyrics into syllables first.</p>}

        {/* Hidden measurement pass: same width as a page's printable area, so wrapping (and
            therefore each row's true height) matches what page mode will actually show. */}
        <div
          className="chart-measure"
          style={{ fontFamily: font.cssFont, fontSize: FONT_SIZE_PT, width: CONTENT_WIDTH_PX, ...lineSpacingVar(lineSpacing) }}
        >
          {rows.map((row, i) => (
            <div key={i} ref={(el) => { rowRefs.current[i] = el; }}>
              {renderChartRow(row, i)}
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
                  {indices.map((i) => renderChartRow(rows[i], i))}
                </div>
                <div className="chart-page-footer">
                  Page {pageIndex + 1} of {pages.length}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="chord-chart" style={{ fontFamily: font.cssFont, ...lineSpacingVar(lineSpacing) }}>
            {rows.map((row, i) => renderChartRow(row, i))}
          </div>
        )}
      </div>
    </div>
  );
}
