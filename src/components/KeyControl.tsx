import type { KeyName } from '../types';
import { KEY_NAMES, transposeKey } from '../lib/musicTheory';

interface Props {
  songKey: KeyName;
  onChange: (key: KeyName) => void;
}

/**
 * Sets the song's key. Chords are stored relative to the key, so changing it transposes every
 * chord in the song — the half-step buttons are shortcuts for moving up or down one key.
 */
export function KeyControl({ songKey, onChange }: Props) {
  return (
    <div className="key-control">
      <span>Key</span>
      <button
        className="secondary"
        onClick={() => onChange(transposeKey(songKey, -1))}
        aria-label="Transpose down a half step"
        title="Transpose down a half step"
      >
        &minus;
      </button>
      <select value={songKey} onChange={(e) => onChange(e.target.value as KeyName)} aria-label="Song key">
        {KEY_NAMES.map((k) => (
          <option key={k} value={k}>
            {k} Major
          </option>
        ))}
      </select>
      <button
        className="secondary"
        onClick={() => onChange(transposeKey(songKey, 1))}
        aria-label="Transpose up a half step"
        title="Transpose up a half step"
      >
        +
      </button>
    </div>
  );
}
