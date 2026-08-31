import { useState } from 'react';
import type { ReactNode } from 'react';
import type { KeyName } from '../types';
import type { BlockMap } from '../lib/arrangement';
import { buildChartRows } from '../lib/chordChart';
import { generateWordDoc } from '../lib/wordDoc';
import { downloadBlob, slugifyFilename } from '../lib/download';
import { CHORD_FONT_OPTIONS, DEFAULT_CHORD_FONT_ID, getChordFontOption } from '../lib/chordFonts';

interface Props {
  title: string;
  songKey: KeyName;
  blocks: BlockMap;
  arrangement: string[];
  onClose: () => void;
}

export function ChordChartView({ title, songKey, blocks, arrangement, onClose }: Props) {
  const [fontId, setFontId] = useState<string>(DEFAULT_CHORD_FONT_ID);
  const [generating, setGenerating] = useState(false);
  const rows = buildChartRows(blocks, arrangement, songKey);
  const font = getChordFontOption(fontId);

  async function downloadDocx() {
    setGenerating(true);
    try {
      const blob = await generateWordDoc(title, songKey, blocks, arrangement, fontId);
      downloadBlob(blob, `${slugifyFilename(title)}.docx`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel chart-panel" onClick={(e) => e.stopPropagation()}>
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
            <button className="secondary" disabled={generating} onClick={downloadDocx}>
              {generating ? 'Generating…' : 'Download .docx'}
            </button>
            <button className="secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
        <div className="chord-chart" style={{ fontFamily: font.cssFont }}>
          {rows.length === 0 && <p className="hint">Nothing to show yet &mdash; split some lyrics into syllables first.</p>}
          {rows.map((row, i) =>
            row.kind === 'heading' ? (
              <div className={`section-heading section-${row.type}`} key={i}>
                {row.label}
              </div>
            ) : (
              <div className="chart-line-row" key={row.key}>
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
            ),
          )}
        </div>
      </div>
    </div>
  );
}
