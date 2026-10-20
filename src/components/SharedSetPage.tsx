import { useEffect, useState } from 'react';
import type { KeyName } from '../types';
import type { SetStore, SharedSet } from '../lib/setStore';
import { downloadSetPdf } from '../lib/setPdf';
import { inChartMode } from '../lib/setStore';
import { songKeysOf } from '../lib/chordChart';
import { SongSheet } from './SongSheet';
import { CapoChartsSwitch, CapoSelect, SetCharts } from './SetCharts';

interface Props {
  store: SetStore;
  token: string;
}

/**
 * A set opened from its share link, read-only: its songs in order, each in the set's key, as
 * one PDF or one chart at a time. Changing a song's key, font or spacing here only changes what
 * you see; nothing is saved.
 */
export function SharedSetPage({ store, token }: Props) {
  const [set, setSet] = useState<SharedSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  // Standard charts, or each song with its capo: the set's own to start with, changeable here.
  const [capoCharts, setCapoCharts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store
      .getShared(token)
      .then((found) => {
        if (cancelled) return;
        if (found) setSet(found);
        else setError("This set isn't shared any more. Ask whoever sent the link for a new one.");
      })
      .catch(() => !cancelled && setError("Couldn't open this set. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
  }, [store, token]);

  async function print(shared: SharedSet) {
    setPrinting(true);
    try {
      await downloadSetPdf(shared.name, inChartMode(shared.songs, capoCharts));
    } catch {
      setError("Couldn't make the PDF. Try again.");
    } finally {
      setPrinting(false);
    }
  }

  if (!set) return <p className={`hint ${error ? 'library-error' : ''}`}>{error ?? 'Loading…'}</p>;

  if (open !== null && set.songs[open]) {
    const doc = set.songs[open];
    const change = (patch: Partial<typeof doc>) =>
      setSet((prev) => (prev ? { ...prev, songs: prev.songs.map((s, i) => (i === open ? { ...s, ...patch } : s)) } : prev));
    return (
      <SongSheet
        key={open}
        title={doc.title}
        songKey={doc.key}
        onSongKeyChange={(key: KeyName) => change({ key })}
        blocks={doc.blocks}
        arrangement={doc.arrangement}
        credits={doc.credits}
        fontId={doc.chartFontId}
        onFontIdChange={(chartFontId) => change({ chartFontId })}
        lineSpacing={doc.lineSpacing}
        onLineSpacingChange={(lineSpacing) => change({ lineSpacing })}
        capo={capoCharts ? doc.capo : 0}
        back={
          <button className="secondary" onClick={() => setOpen(null)}>
            &larr; {set.name.trim() || 'Set'}
          </button>
        }
        actions={
          <>
            <button className="secondary" disabled={open === 0} onClick={() => setOpen(open - 1)}>
              Previous
            </button>
            <button className="secondary" disabled={open === set.songs.length - 1} onClick={() => setOpen(open + 1)}>
              Next
            </button>
          </>
        }
      />
    );
  }

  return (
    <div>
      <div className="panel library">
        <div className="library-header">
          <h2>{set.name.trim() || 'Untitled set'}</h2>
          <div className="library-header-actions">
            <CapoChartsSwitch capoCharts={capoCharts} onChange={setCapoCharts} />
            <button disabled={printing || set.songs.length === 0} onClick={() => void print(set)}>
              {printing ? 'Making PDF…' : 'Download PDF'}
            </button>
          </div>
        </div>
        {error && <p className="hint library-error">{error}</p>}
        {set.songs.length === 0 && <p className="hint">This set has no songs yet.</p>}
        <ol className="library-list set-shared-list">
          {set.songs.map((doc, i) => (
            <li key={i} className="library-item">
              <button className="library-open" onClick={() => setOpen(i)}>
                <span className="library-title">
                  {i + 1}. {doc.title.trim() || 'Untitled'}
                </span>
                <span className="library-meta">
                  <span>Key {songKeysOf(doc.blocks, doc.arrangement, doc.key).join('-')}</span>
                </span>
              </button>
              {/* Starts at the capo the set gives the song; a change here is just for this viewer. */}
              <CapoSelect
                capo={doc.capo ?? 0}
                keys={songKeysOf(doc.blocks, doc.arrangement, doc.key)}
                onChange={(capo) => {
                  setSet((prev) => (prev ? { ...prev, songs: prev.songs.map((s, j) => (j === i ? { ...s, capo } : s)) } : prev));
                  if (capo) setCapoCharts(true);
                }}
              />
            </li>
          ))}
        </ol>
      </div>
      <SetCharts songs={inChartMode(set.songs, capoCharts)} />
    </div>
  );
}
