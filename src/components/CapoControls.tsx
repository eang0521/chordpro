import type { KeyName } from '../types';
import { MAX_CAPO } from '../lib/setStore';
import { capoShapeKey } from '../lib/chordChart';

/** Switches a set between standard charts (for most of the band) and capo charts (for a guitarist
 * with a capo), each song's capo set in the set as its default. */
export function CapoChartsSwitch({ capoCharts, onChange }: { capoCharts: boolean; onChange: (capoCharts: boolean) => void }) {
  return (
    <span className="capo-switch" role="group" aria-label="Chart type">
      <button className={`secondary ${capoCharts ? '' : 'chart-toggle-active'}`} aria-pressed={!capoCharts} onClick={() => onChange(false)}>
        Standard charts
      </button>
      <button
        className={`secondary ${capoCharts ? 'chart-toggle-active' : ''}`}
        aria-pressed={capoCharts}
        onClick={() => onChange(true)}
        title="Each song's chords as the shapes played with its capo"
      >
        Capo charts
      </button>
    </span>
  );
}

/** A song's capo: 0 (none) up to MAX_CAPO, each with the key(s) its chord shapes are in
 * ("3 (C-D)"). `keys` are the keys the song is played in, in order. */
export function CapoSelect({ capo, keys, onChange }: { capo: number; keys: KeyName[]; onChange: (capo: number) => void }) {
  return (
    <label className="set-entry-key">
      <span>Capo</span>
      <select value={capo} onChange={(e) => onChange(Number(e.target.value))}>
        {Array.from({ length: MAX_CAPO + 1 }, (_, c) => (
          <option key={c} value={c}>
            {c ? `${c} (${keys.map((k) => capoShapeKey(k, c)).join('-')})` : 'None'}
          </option>
        ))}
      </select>
    </label>
  );
}
