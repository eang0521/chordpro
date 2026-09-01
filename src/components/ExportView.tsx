import { useState } from 'react';
import type { Song } from '../types';
import { songToChordPro } from '../lib/chordpro';
import type { BlockMap } from '../lib/arrangement';
import { generateWordDoc } from '../lib/wordDoc';
import { downloadBlob, slugifyFilename } from '../lib/download';
import { CHORD_FONT_OPTIONS, DEFAULT_CHORD_FONT_ID } from '../lib/chordFonts';

interface Props {
  song: Song;
  blocks: BlockMap;
  arrangement: string[];
  onBack: () => void;
  onStartOver: () => void;
}

export function ExportView({ song, blocks, arrangement, onBack, onStartOver }: Props) {
  const [copied, setCopied] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [fontId, setFontId] = useState<string>(DEFAULT_CHORD_FONT_ID);
  const [lineSpacing, setLineSpacing] = useState(1);
  const text = songToChordPro(song);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([text], { type: 'text/plain' });
    downloadBlob(blob, `${slugifyFilename(song.title)}.cho`);
  }

  async function downloadDocx() {
    setGeneratingDocx(true);
    try {
      const blob = await generateWordDoc(song.title, song.key, blocks, arrangement, fontId, lineSpacing);
      downloadBlob(blob, `${slugifyFilename(song.title)}.docx`);
    } finally {
      setGeneratingDocx(false);
    }
  }

  return (
    <div className="panel">
      <h2>5. Export</h2>
      <p className="hint">Your ChordPro file, ready to copy or download &mdash; or grab a Word doc chord chart.</p>
      <pre className="chordpro-output">{text}</pre>
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button className="secondary" onClick={copy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button onClick={download}>Download .cho</button>
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
        <button className="secondary" disabled={generatingDocx} onClick={downloadDocx}>
          {generatingDocx ? 'Generating…' : 'Download .docx'}
        </button>
        <button className="secondary" onClick={onStartOver}>
          Start a new song
        </button>
      </div>
    </div>
  );
}
