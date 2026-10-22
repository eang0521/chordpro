import type { SetSongDocument } from '../lib/setStore';
import { ChordChartView } from './ChordChartView';

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
