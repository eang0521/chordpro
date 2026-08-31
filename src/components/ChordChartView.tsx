import { useState } from 'react';
import type { KeyName } from '../types';
import type { BlockMap } from '../lib/arrangement';
import { buildChartRows } from '../lib/chordChart';
import { generateWordDoc } from '../lib/wordDoc';
import { downloadBlob, slugifyFilename } from '../lib/download';

interface Props {
  title: string;
  songKey: KeyName;
  blocks: BlockMap;
  arrangement: string[];
  onClose: () => void;
}

export function ChordChartView({ title, songKey, blocks, arrangement, onClose }: Props) {
  const [generating, setGenerating] = useState(false);
  const rows = buildChartRows(blocks, arrangement, songKey);

  async function downloadDocx() {
    setGenerating(true);
    try {
      const blob = await generateWordDoc(title, songKey, blocks, arrangement);
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
            <button className="secondary" disabled={generating} onClick={downloadDocx}>
              {generating ? 'Generating…' : 'Download .docx'}
            </button>
            <button className="secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
        <div className="chord-chart">
          {rows.length === 0 && <p className="hint">Nothing to show yet &mdash; split some lyrics into syllables first.</p>}
          {rows.map((row, i) =>
            row.kind === 'heading' ? (
              <div className={`section-heading section-${row.type}`} key={i}>
                {row.label}
              </div>
            ) : (
              <div className="chart-line" key={i}>
                {row.line.chordLine.trim() && <div className="chart-line-chords">{row.line.chordLine}</div>}
                <div className="chart-line-lyrics">{row.line.lyricLine || ' '}</div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
