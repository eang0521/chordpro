import { useState } from 'react';
import type { Song } from '../types';
import { songToChordPro } from '../lib/chordpro';

interface Props {
  song: Song;
  onBack: () => void;
  onStartOver: () => void;
}

export function ExportView({ song, onBack, onStartOver }: Props) {
  const [copied, setCopied] = useState(false);
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(song.title || 'song').trim().replace(/\s+/g, '_')}.cho`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel">
      <h2>5. Export</h2>
      <p className="hint">Your ChordPro file, ready to copy or download.</p>
      <pre className="chordpro-output">{text}</pre>
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button className="secondary" onClick={copy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button onClick={download}>Download .cho</button>
        <button className="secondary" onClick={onStartOver}>
          Start a new song
        </button>
      </div>
    </div>
  );
}
