import { useState } from 'react';
import type { ArrangementEntry, Song } from '../types';
import { songToChordPro } from '../lib/chordpro';
import type { BlockMap } from '../lib/arrangement';
import { generateWordDoc } from '../lib/wordDoc';
import { generatePdf } from '../lib/pdfDoc';
import { chartFilename, downloadBlob } from '../lib/download';
import { songKeysOf } from '../lib/chordChart';
import { CHORD_FONT_OPTIONS } from '../lib/chordFonts';
import { MAX_LINE_SPACING, MIN_LINE_SPACING, clampLineSpacing } from '../lib/pageLayout';
import { creditLines } from '../lib/credits';

interface Props {
  song: Song;
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
  fontId: string;
  onFontIdChange: (id: string) => void;
  lineSpacing: number;
  onLineSpacingChange: (value: number) => void;
  // Not needed (and never called) in read-only mode.
  onApplyChordPro?: (text: string) => void;
  onBack?: () => void;
  onStartOver?: () => void;
  /** For a public song: view, copy and download only — no editing, no other steps. */
  readOnly?: boolean;
}

export function ExportView({
  song,
  blocks,
  arrangement,
  fontId,
  onFontIdChange,
  lineSpacing,
  onLineSpacingChange,
  onApplyChordPro,
  onBack,
  onStartOver,
  readOnly = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [applied, setApplied] = useState(false);
  const [text, setText] = useState(() => songToChordPro(song));
  const filename = (extension: string) => chartFilename(song.title, songKeysOf(blocks, arrangement, song.key), extension);

  function resetText() {
    setText(songToChordPro(song));
  }

  function applyEdits() {
    onApplyChordPro?.(text);
    setApplied(true);
    setTimeout(() => setApplied(false), 1500);
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
    downloadBlob(blob, filename('cho'));
  }

  async function downloadDocx() {
    setGeneratingDocx(true);
    try {
      const blob = await generateWordDoc(song.title, song.key, blocks, arrangement, fontId, lineSpacing, song.credits);
      downloadBlob(blob, filename('docx'));
    } finally {
      setGeneratingDocx(false);
    }
  }

  async function downloadPdf() {
    setGeneratingPdf(true);
    try {
      const blob = await generatePdf(song.title, song.key, blocks, arrangement, fontId, lineSpacing, song.credits);
      downloadBlob(blob, filename('pdf'));
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div className="panel">
      {readOnly ? (
        <>
          <h2>{song.title || 'Untitled'}</h2>
          {creditLines(song.credits).map((line) => (
            <p className="hint public-song-credit" key={line}>
              {line}
            </p>
          ))}
        </>
      ) : (
        <>
          <h2>4. Export</h2>
          <p className="hint">Download the chord chart to print or share, or the ChordPro file for other apps.</p>
        </>
      )}
      <div className="actions export-downloads">
        <button disabled={generatingPdf} onClick={downloadPdf}>
          {generatingPdf ? 'Generating…' : 'Download PDF'}
        </button>
        <button className="secondary" disabled={generatingDocx} onClick={downloadDocx}>
          {generatingDocx ? 'Generating…' : 'Download .docx'}
        </button>
        <button className="secondary" onClick={download}>
          Download .cho
        </button>
        <select
          className="chart-font-select"
          aria-label="Chart font"
          value={fontId}
          onChange={(e) => onFontIdChange(e.target.value)}
        >
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
            }}
          />
        </label>
      </div>

      <h3 className="export-subheading">ChordPro text</h3>
      {!readOnly && (
        <p className="hint">
          Edit it here to tweak anything, then Apply to chart so the chart and the PDF and Word downloads match.
        </p>
      )}
      <textarea
        className="chordpro-output"
        value={text}
        readOnly={readOnly}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="actions export-text-actions">
        <button className="secondary" onClick={copy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        {!readOnly && (
          <>
            <button className="secondary" onClick={applyEdits}>
              {applied ? 'Applied!' : 'Apply to chart'}
            </button>
            <button className="secondary" onClick={resetText}>
              Reset edits
            </button>
          </>
        )}
      </div>

      {!readOnly && (
        <div className="actions export-footer">
          <button className="secondary" onClick={onBack}>
            &larr; Back
          </button>
          <span className="toolbar-spacer" />
          <button className="secondary" onClick={onStartOver}>
            Start a new song
          </button>
        </div>
      )}
    </div>
  );
}
