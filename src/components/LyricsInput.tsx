import { useState } from 'react';
import type { KeyName } from '../types';
import { KEY_NAMES } from '../lib/musicTheory';

interface Props {
  initialTitle: string;
  initialKey: KeyName;
  initialLyrics: string;
  onSubmit: (title: string, key: KeyName, lyrics: string) => void;
}

export function LyricsInput({ initialTitle, initialKey, initialLyrics, onSubmit }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [key, setKey] = useState<KeyName>(initialKey);
  const [lyrics, setLyrics] = useState(initialLyrics);

  const canContinue = lyrics.trim().length > 0;

  return (
    <div className="panel">
      <h2>1. Song &amp; lyrics</h2>
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
      </label>
      <label className="field">
        <span>Key</span>
        <select value={key} onChange={(e) => setKey(e.target.value as KeyName)}>
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
          onChange={(e) => setLyrics(e.target.value)}
          rows={14}
          placeholder={'Paste lyrics here, one line per line of the song...'}
        />
      </label>
      <div className="actions">
        <button disabled={!canContinue} onClick={() => onSubmit(title, key, lyrics)}>
          Split into syllables &rarr;
        </button>
      </div>
    </div>
  );
}
