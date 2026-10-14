import { useState } from 'react';
import type { KeyName } from '../types';
import { KEY_NAMES } from '../lib/musicTheory';
import { looksLikeChordPro } from '../lib/chordproParser';

interface Props {
  initialTitle: string;
  initialKey: KeyName;
  initialLyrics: string;
  onSubmit: (title: string, key: KeyName, lyrics: string) => void;
  /** Pasted text that's already ChordPro skips the syllable and chord steps. */
  onImportChordPro: (title: string, key: KeyName, text: string) => void;
  /** Every edit, before Continue, so a song still on this step is autosaved too. */
  onChange: (title: string, key: KeyName, lyrics: string) => void;
}

export function LyricsInput({ initialTitle, initialKey, initialLyrics, onSubmit, onImportChordPro, onChange }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [key, setKey] = useState<KeyName>(initialKey);
  const [lyrics, setLyrics] = useState(initialLyrics);

  const canContinue = lyrics.trim().length > 0;
  const isChordPro = looksLikeChordPro(lyrics);

  return (
    <div className="panel">
      <h2>1. Song &amp; lyrics</h2>
      <label className="field">
        <span>Title</span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onChange(e.target.value, key, lyrics);
          }}
          placeholder="Song title"
        />
      </label>
      <label className="field">
        <span>Key</span>
        <select
          value={key}
          onChange={(e) => {
            setKey(e.target.value as KeyName);
            onChange(title, e.target.value as KeyName, lyrics);
          }}
        >
          {KEY_NAMES.map((k) => (
            <option key={k} value={k}>
              {k} Major
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Lyrics</span>
        <textarea
          value={lyrics}
          onChange={(e) => {
            setLyrics(e.target.value);
            onChange(title, key, e.target.value);
          }}
          rows={14}
          placeholder={'Paste lyrics here, one line per line of the song... or a ChordPro chart you already have'}
        />
      </label>
      {isChordPro && (
        <p className="hint">
          This looks like ChordPro &mdash; it&rsquo;ll be imported as a finished chart, with its chords, and go
          straight to export. Its own <code>{'{title}'}</code> and <code>{'{key}'}</code> win over the fields above.
        </p>
      )}
      <div className="actions">
        {isChordPro ? (
          <button disabled={!canContinue} onClick={() => onImportChordPro(title, key, lyrics)}>
            Import ChordPro &rarr;
          </button>
        ) : (
          <button disabled={!canContinue} onClick={() => onSubmit(title, key, lyrics)}>
            Split into syllables &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
