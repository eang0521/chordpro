import type { SongDocument } from '../lib/songDocument';
import { ChordChartView } from './ChordChartView';

const noop = () => {};

interface Props {
  /** The set's songs in order, each already in the set's key; null for one still loading or deleted. */
  songs: (SongDocument | null)[];
}

/** Every song in a set as its chart prints, one after another, as the set's PDF lays them out. */
export function SetCharts({ songs }: Props) {
  if (songs.length === 0) return null;
  return (
    <div className="set-charts">
      {songs.map((doc, i) =>
        doc ? (
          <ChordChartView
            key={i}
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
          />
        ) : null,
      )}
    </div>
  );
}
