import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyName } from '../types';
import type { SetEntry, SetSongDocument, SetStore, SongSet } from '../lib/setStore';
import { inChartMode, shareSetUrl } from '../lib/setStore';
import { versionSuffix, type SongStore, type SongSummary } from '../lib/songStore';
import type { SongDocument } from '../lib/songDocument';
import { KEY_NAMES } from '../lib/musicTheory';
import { songKeysOf } from '../lib/chordChart';
import { makeId } from '../lib/id';
import { downloadSetPdf } from '../lib/setPdf';
import { useAutosave } from '../hooks/useAutosave';
import { CapoChartsSwitch, CapoSelect, SetCharts } from './SetCharts';

interface Props {
  setStore: SetStore;
  songStore: SongStore;
  setId: string;
  /** A new set, not saved yet (nothing is written until it's changed). */
  initialSet?: SongSet;
  onBack: () => void;
}

// With the version's name, since a set can hold more than one version of a song.
const titleOf = (song: SongSummary) => `${song.title.trim() || 'Untitled'}${versionSuffix(song)}`;
const byTitle = (a: SongSummary, b: SongSummary) => titleOf(a).localeCompare(titleOf(b), undefined, { numeric: true, sensitivity: 'base' });

/** One set: its name, its songs in order with the key each is played in, sharing and printing. */
export function SetEditor({ setStore, songStore, setId, initialSet, onBack }: Props) {
  const [set, setSet] = useState<SongSet | null>(initialSet ?? null);
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [copied, setCopied] = useState(false);
  // Standard charts, or each song with its capo (which is its default for anyone viewing the set).
  const [capoCharts, setCapoCharts] = useState(false);
  const save = useCallback((s: SongSet) => setStore.save(s), [setStore]);
  const autosave = useAutosave(set, save);
  // Leaving some other way than Back (the menu, say) still saves the last change.
  const flushRef = useRef(autosave.flush);
  useEffect(() => {
    flushRef.current = autosave.flush;
  });
  useEffect(() => () => void flushRef.current(), []);

  useEffect(() => {
    let cancelled = false;
    const loadSet = initialSet ? Promise.resolve(initialSet) : setStore.get(setId);
    Promise.all([loadSet, songStore.list()])
      .then(([loaded, list]) => {
        if (cancelled) return;
        if (!loaded) setError("That set isn't in your sets any more.");
        else setSet(loaded);
        setSongs(list);
      })
      .catch(() => !cancelled && setError("Couldn't open that set. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
    // Loads once per set; initialSet is only ever the set this was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setStore, songStore, setId]);

  // Each song's full chart, loaded once per song as it's added, for the charts below the list.
  const [docs, setDocs] = useState<Map<string, SongDocument | null>>(new Map());
  const entryIds = set?.entries.map((e) => e.songId).join(',') ?? '';
  useEffect(() => {
    const missing = [...new Set(entryIds.split(',').filter(Boolean))].filter((id) => !docs.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map((id) => songStore.get(id).catch(() => null))).then((loaded) => {
      if (!cancelled) setDocs((prev) => new Map([...prev, ...missing.map((id, i) => [id, loaded[i]] as const)]));
    });
    return () => {
      cancelled = true;
    };
    // docs: only read to skip the songs already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIds, songStore]);
  // Each in the key it's played in for this set, with its capo.
  const charts = useMemo(
    () =>
      (set?.entries ?? []).map((e): SetSongDocument | null => {
        const doc = docs.get(e.songId);
        return doc ? { ...doc, key: e.key, capo: e.capo } : null;
      }),
    [set?.entries, docs],
  );

  const songsById = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs]);
  const sortedSongs = useMemo(() => [...(songs ?? [])].sort(byTitle), [songs]);

  async function leave() {
    if ((await autosave.flush()) || window.confirm("Your latest changes to this set couldn't be saved. Leave anyway and lose them?")) {
      onBack();
    }
  }

  const update = (change: Partial<SongSet>) => setSet((prev) => (prev ? { ...prev, ...change } : prev));
  const setEntries = (fn: (entries: SetEntry[]) => SetEntry[]) => setSet((prev) => (prev ? { ...prev, entries: fn(prev.entries) } : prev));

  function move(from: number, to: number) {
    setEntries((entries) => {
      if (to < 0 || to >= entries.length) return entries;
      const next = [...entries];
      const [entry] = next.splice(from, 1);
      next.splice(to, 0, entry);
      return next;
    });
  }

  async function shareLink(currentSet: SongSet) {
    const next = { ...currentSet, shareToken: currentSet.shareToken ?? makeId() };
    setSet(next);
    try {
      // Saved straight away, so the link works the moment it's copied.
      await setStore.save(next);
      await navigator.clipboard.writeText(shareSetUrl(next.shareToken!));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function print(currentSet: SongSet) {
    setPrinting(true);
    setError(null);
    try {
      const docs = await Promise.all(currentSet.entries.map((e) => songStore.get(e.songId)));
      const inKey = currentSet.entries.flatMap((entry, i): SetSongDocument[] => {
        const doc = docs[i];
        return doc ? [{ ...doc, key: entry.key, capo: entry.capo }] : [];
      });
      await downloadSetPdf(currentSet.name, inChartMode(inKey, capoCharts));
    } catch {
      setError("Couldn't make the PDF. Check your connection and try again.");
    } finally {
      setPrinting(false);
    }
  }

  const back = (
    <button className="secondary" onClick={() => void leave()}>
      &larr; Sets
    </button>
  );

  if (!set) {
    return (
      <div>
        <div className="toolbar">{back}</div>
        {error ? <p className="hint library-error">{error}</p> : <p className="hint">Loading&hellip;</p>}
      </div>
    );
  }

  const link = set.shareToken ? shareSetUrl(set.shareToken) : null;

  return (
    <div>
      <div className="toolbar">
        {back}
        <span className="toolbar-spacer" />
        <span className={`save-status save-status-${autosave.status}`} role="status">
          {autosave.status === 'saved' && 'Saved'}
          {autosave.status === 'saving' && 'Saving…'}
          {autosave.status === 'error' && (
            <>
              Couldn&rsquo;t save{' '}
              <button className="link-button" onClick={() => void autosave.flush()}>
                Retry
              </button>
            </>
          )}
        </span>
        {!link && (
          <button className="secondary" onClick={() => void shareLink(set)}>
            Share link
          </button>
        )}
        <CapoChartsSwitch capoCharts={capoCharts} onChange={setCapoCharts} />
        <button disabled={printing || set.entries.length === 0} onClick={() => void print(set)}>
          {printing ? 'Making PDF…' : 'Download PDF'}
        </button>
      </div>

      {error && <p className="hint library-error">{error}</p>}

      <div className="panel set-editor">
        <label className="field">
          <span>Set name</span>
          <input
            value={set.name}
            placeholder="Sunday, October 19"
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>

        {link && (
          <div className="set-share">
            <span className="set-share-label">Anyone with this link can see and print this set</span>
            <div className="set-share-row">
              <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Share link" />
              <button
                className="secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                }
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button className="secondary danger" onClick={() => update({ shareToken: null })}>
                Stop sharing
              </button>
            </div>
          </div>
        )}

        {set.entries.length === 0 && <p className="hint">No songs yet. Add them below, in the order they&rsquo;ll be played.</p>}

        {set.entries.length > 0 && (
          <ol className="set-entries">
            {set.entries.map((entry, i) => {
              const song = songsById.get(entry.songId);
              return (
                <li key={`${entry.songId}-${i}`} className="set-entry">
                  <span className="set-entry-number">{i + 1}</span>
                  <span className="set-entry-title">
                    {song ? titleOf(song) : songs ? <em className="set-entry-missing">Deleted song</em> : '…'}
                  </span>
                  <label className="set-entry-key">
                    <span>Key</span>
                    <select
                      value={entry.key}
                      onChange={(e) =>
                        setEntries((entries) => entries.map((x, j) => (j === i ? { ...x, key: e.target.value as KeyName } : x)))
                      }
                    >
                      {KEY_NAMES.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* For a guitarist with a capo, set while showing capo charts: the chart shows the
                      chord shapes they play. It's the song's default capo for anyone viewing the
                      set, who can change it for themselves. */}
                  {capoCharts && (
                    <CapoSelect
                      capo={entry.capo ?? 0}
                      keys={charts[i] ? songKeysOf(charts[i].blocks, charts[i].arrangement, entry.key) : [entry.key]}
                      onChange={(capo) =>
                        setEntries((entries) =>
                          entries.map((x, j) => (j === i ? (capo ? { ...x, capo } : { songId: x.songId, key: x.key }) : x)),
                        )
                      }
                    />
                  )}
                  <span className="set-entry-actions">
                    <button className="secondary" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                      &#9650;
                    </button>
                    <button
                      className="secondary"
                      aria-label="Move down"
                      title="Move down"
                      disabled={i === set.entries.length - 1}
                      onClick={() => move(i, i + 1)}
                    >
                      &#9660;
                    </button>
                    <button
                      className="secondary danger"
                      aria-label="Remove from set"
                      title="Remove from set"
                      onClick={() => setEntries((entries) => entries.filter((_, j) => j !== i))}
                    >
                      &times;
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <label className="field set-add">
          <span>Add a song</span>
          <select
            value=""
            disabled={!songs || songs.length === 0}
            onChange={(e) => {
              const song = songsById.get(e.target.value);
              // Starts in the key the song is written in; change it here for this set only.
              if (song) setEntries((entries) => [...entries, { songId: song.id, key: song.keys[0] ?? 'C' }]);
            }}
          >
            <option value="">{songs && songs.length === 0 ? 'Your library is empty' : 'Choose a song…'}</option>
            {sortedSongs.map((song) => (
              <option key={song.id} value={song.id}>
                {titleOf(song)}
                {song.keys[0] ? ` (${song.keys.join('-')})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SetCharts songs={inChartMode(charts, capoCharts)} />
    </div>
  );
}
