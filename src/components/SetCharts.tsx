import type { SetSongDocument } from '../lib/setStore';
import { MAX_CAPO } from '../lib/setStore';
import type { KeyName } from '../types';
import { capoShapeKey } from '../lib/chordChart';
import { ChordChartView } from './ChordChartView';

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

/** A song's capo in a set: 0 (none) up to MAX_CAPO, each with the key(s) its chord shapes are in
 * ("3 (C-D)"). `keys` are the keys the song is played in, in order. */
export function CapoSelect({ capo, keys, onChange }: { capo: number; keys: KeyName[]; onChange: (capo: number) => void }) {
  return (
    <label className="set-entry-key">
      <span>Capo</span>
      <select value={capo} onChange={(e) => onChange(Number(e.target.value))}>
        {Array.from({ length: MAX_CAPO + 1 }, (_, c) => (
          <option key={c} value={c}>
            {c ? `${c} (${keys.map((k) => capoShapeKey(k, c)).join('-')})` : '0'}
          </option>
        ))}
      </select>
    </label>
  );
}

const noop = () => {};

interface Props {
  /** The set's songs in order, each already in the set's key; null for one still loading or deleted. */
  songs: (SetSongDocument | null)[];
}

/** Every song in a set as its chart prints, one after another, as the set's PDF lays them out. */
export function SetCharts({ songs }: Props) {
  if (songs.length === 0) return null;
  // Keyed by song (and which time it comes up, for a song in the set twice), so a chart moves with
  // its song when the set is reordered rather than taking over another song's page breaks.
  const seen = new Map<string, number>();
  return (
    <div className="set-charts">
      {songs.map((doc) => {
        if (!doc) return null;
        const n = (seen.get(doc.id) ?? 0) + 1;
        seen.set(doc.id, n);
        return (
          <ChordChartView
            key={`${doc.id}-${n}`}
            pagesOnly
            title={doc.title}
            songKey={doc.key}
            onSongKeyChange={noop}
            blocks={doc.blocks}
            arrangement={doc.arrangement}
            fontId={doc.chartFontId}
            onFontIdChange={noop}
            lineSpacing={doc.lineSpacing}
            onLineSpacingChange={noop}
            credits={doc.credits}
            capo={doc.capo}
          />
        );
      })}
    </div>
  );
}
