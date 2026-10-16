import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ArrangementEntry, KeyName, SongCredits } from '../types';
import type { BlockMap } from '../lib/arrangement';
import { deriveFlatSyllables } from '../lib/arrangement';
import { ChordChartView } from './ChordChartView';
import { ExportView } from './ExportView';
import { KeyControl } from './KeyControl';

interface Props {
  title: string;
  songKey: KeyName;
  onSongKeyChange: (key: KeyName) => void;
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
  credits: SongCredits;
  fontId: string;
  onFontIdChange: (id: string) => void;
  lineSpacing: number;
  onLineSpacingChange: (value: number) => void;
  /** The way back, at the start of the toolbar. */
  back: ReactNode;
  /** What can be done with the song, at the end of the toolbar. */
  actions: ReactNode;
  /** Messages about those actions (a failed save, say), shown under the toolbar. */
  notices?: ReactNode;
}

/**
 * A finished song to read: the chart in page layout, the way it prints, with the ChordPro text
 * a click away. Used for public songs and for opening a song from My Songs.
 */
export function SongSheet({
  title,
  songKey,
  onSongKeyChange,
  blocks,
  arrangement,
  credits,
  fontId,
  onFontIdChange,
  lineSpacing,
  onLineSpacingChange,
  back,
  actions,
  notices,
}: Props) {
  const [view, setView] = useState<'chart' | 'chordpro'>('chart');
  const flatSyllables = useMemo(() => deriveFlatSyllables(blocks, arrangement), [blocks, arrangement]);

  return (
    <div>
      <div className="toolbar">
        {back}
        <button className="secondary" onClick={() => setView(view === 'chart' ? 'chordpro' : 'chart')}>
          {view === 'chart' ? 'Show ChordPro' : 'Show chart'}
        </button>
        {/* The chart has its own key control. */}
        {view === 'chordpro' && <KeyControl songKey={songKey} onChange={onSongKeyChange} />}
        <span className="toolbar-spacer" />
        {actions}
      </div>
      {notices}

      {view === 'chordpro' ? (
        <ExportView
          // Remount on a key change so the ChordPro text is regenerated in the new key.
          key={songKey}
          readOnly
          song={{ title, key: songKey, syllables: flatSyllables, credits }}
          blocks={blocks}
          arrangement={arrangement}
          fontId={fontId}
          onFontIdChange={onFontIdChange}
          lineSpacing={lineSpacing}
          onLineSpacingChange={onLineSpacingChange}
        />
      ) : (
        <ChordChartView
          inline
          title={title}
          songKey={songKey}
          onSongKeyChange={onSongKeyChange}
          blocks={blocks}
          arrangement={arrangement}
          fontId={fontId}
          onFontIdChange={onFontIdChange}
          lineSpacing={lineSpacing}
          onLineSpacingChange={onLineSpacingChange}
          credits={credits}
        />
      )}
    </div>
  );
}
