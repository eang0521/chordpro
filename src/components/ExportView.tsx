import { useState } from 'react';
import type { Song } from '../types';
import { songToChordPro } from '../lib/chordpro';
import type { BlockMap } from '../lib/arrangement';
import { generateWordDoc } from '../lib/wordDoc';
import { downloadBlob, slugifyFilename } from '../lib/download';
import { CHORD_FONT_OPTIONS } from '../lib/chordFonts';

interface Props {
  song: Song;
  blocks: BlockMap;
  arrangement: string[];
  fontId: string;
  onFontIdChange: (id: string) => void;
  lineSpacing: number;
  onLineSpacingChange: (value: number) => void;
  onBack: () => void;
  onStartOver: () => void;
}

export function ExportView({
  song,
  blocks,
  arrangement,
  fontId,
  onFontIdChange,
  lineSpacing,
  onLineSpacingChange,
  onBack,
  onStartOver,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [text, setText] = useState(() => songToChordPro(song));

  function resetText() {
    setText(songToChordPro(song));
  }

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
      <p className="hint">
        Your ChordPro file, ready to copy or download &mdash; edit it directly if you need to tweak anything. (The
        Word doc export below uses the song's chords and lyrics, not your edits here.)
      </p>
      <textarea
        className="chordpro-output"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button className="secondary" onClick={copy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button onClick={download}>Download .cho</button>
        <button className="secondary" onClick={resetText}>
          Reset edits
        </button>
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
            min={0.7}
            max={1.2}
            step={0.05}
            value={lineSpacing}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onLineSpacingChange(Math.min(1.2, Math.max(0.7, v)));
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
