import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SongStore, SongSummary } from '../lib/songStore';
import { newSongId, type SongDocument } from '../lib/songDocument';
import type { PublicSongStore, PublishedCopy } from '../lib/publicSongStore';
import { PublishDialog } from './PublishDialog';
import { KEY_NAMES, semitonesBetween } from '../lib/musicTheory';
import { formatEdited } from '../lib/dates';

interface Props {
  store: SongStore;
  /** Shown above the list, e.g. why a song couldn't be opened. */
  message: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Given only to publishers: adds Publish / Update public buttons to each song. */
  publicStore?: PublicSongStore | null;
  onViewPublic?: (publicId: string) => void;
}


type SortOrder = 'edited' | 'title' | 'title-desc' | 'key';

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'edited', label: 'Last edited' },
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'title-desc', label: 'Title (Z–A)' },
  { value: 'key', label: 'Key' },
];

const SORT_KEY = 'chordpro-library-sort';

/** The remembered sort order for this browser (just a convenience — it's fine if it's lost). */
function loadSort(): SortOrder {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return SORT_OPTIONS.some((o) => o.value === saved) ? (saved as SortOrder) : 'edited';
  } catch {
    return 'edited';
  }
}

const titleOf = (song: SongSummary) => song.title.trim() || 'Untitled';
// Numbers sort as numbers ("Psalm 9" before "Psalm 150"), and case and accents are ignored.
const compareTitles = (a: SongSummary, b: SongSummary) =>
  titleOf(a).localeCompare(titleOf(b), undefined, { numeric: true, sensitivity: 'base' });
// Keys in pitch order from C (C, Db, D, ... B), going by the key each song starts in.
const keyRank = (song: SongSummary) => (song.keys[0] ? semitonesBetween(KEY_NAMES[0], song.keys[0]) : 12);

function sortSongs(songs: SongSummary[], order: SortOrder): SongSummary[] {
  const sorted = [...songs];
  if (order === 'edited') sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  else if (order === 'title') sorted.sort(compareTitles);
  else if (order === 'title-desc') sorted.sort((a, b) => compareTitles(b, a));
  else sorted.sort((a, b) => keyRank(a) - keyRank(b) || compareTitles(a, b));
  return sorted;
}

export function SongLibrary({ store, message, onOpen, onNew, publicStore, onViewPublic }: Props) {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SongSummary | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(loadSort);
  // Which of these songs are public, by library song id (empty for non-publishers).
  const [published, setPublished] = useState<Map<string, PublishedCopy>>(new Map());
  const [publishing, setPublishing] = useState<{ doc: SongDocument; update: boolean } | null>(null);
  const sortedSongs = useMemo(() => (songs ? sortSongs(songs, sortOrder) : null), [songs, sortOrder]);

  function changeSort(order: SortOrder) {
    setSortOrder(order);
    try {
      localStorage.setItem(SORT_KEY, order);
    } catch {
      // Storage unavailable — the order just won't be remembered next time.
    }
  }

  const refresh = useCallback(async () => {
    try {
      setSongs(await store.list());
      setError(null);
    } catch {
      setError("Couldn't load your songs. Check your connection and try again.");
    }
  }, [store]);

  useEffect(() => {
    // Loads from an external system (the library) — the list arrives asynchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!publicStore) return;
    let cancelled = false;
    publicStore
      .listPublished()
      .then((found) => !cancelled && setPublished(found))
      .catch(() => {
        // Without it every song just offers Publish; publishing again updates the same copy.
      });
    return () => {
      cancelled = true;
    };
  }, [publicStore]);

  async function startPublish(song: SongSummary) {
    setBusyId(song.id);
    try {
      const doc = await store.get(song.id);
      if (!doc) throw new Error('missing');
      setPublishing({ doc, update: published.has(song.id) });
    } catch {
      setError(`Couldn't open "${song.title || 'Untitled'}" to publish it.`);
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(song: SongSummary) {
    setBusyId(song.id);
    try {
      const doc = await store.get(song.id);
      if (!doc) throw new Error('missing');
      await store.save({ ...doc, id: newSongId(), title: `${doc.title.trim() || 'Untitled'} (copy)` });
      await refresh();
    } catch {
      setError(`Couldn't duplicate "${song.title || 'Untitled'}".`);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(song: SongSummary) {
    setConfirmDelete(null);
    setBusyId(song.id);
    try {
      await store.delete(song.id);
      await refresh();
    } catch {
      setError(`Couldn't delete "${song.title || 'Untitled'}".`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel library">
      <div className="library-header">
        <h2>Your songs</h2>
        <div className="library-header-actions">
          {songs && songs.length > 1 && (
            <label className="library-sort">
              <span>Sort by</span>
              <select value={sortOrder} onChange={(e) => changeSort(e.target.value as SortOrder)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={onNew}>New song</button>
        </div>
      </div>

      {message && <p className="hint library-error">{message}</p>}
      {error && (
        <p className="hint library-error">
          {error}{' '}
          <button className="link-button" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      )}

      {songs === null && !error && <p className="hint">Loading your songs&hellip;</p>}
      {songs?.length === 0 && <p className="hint">No songs yet. Start one with New song.</p>}

      {sortedSongs && sortedSongs.length > 0 && (
        <ul className="library-list">
          {sortedSongs.map((song) => (
            <li key={song.id} className="library-item">
              <button className="library-open" disabled={busyId === song.id} onClick={() => onOpen(song.id)}>
                <span className="library-title">{song.title || 'Untitled'}</span>
                <span className="library-meta">
                  {song.keys.length > 0 && <span>Key {song.keys.join('-')}</span>}
                  <span>Edited {formatEdited(song.updatedAt)}</span>
                  {published.has(song.id) && (
                    <span className="library-public">
                      Public
                      {song.updatedAt > published.get(song.id)!.updatedAt && ' (edited since)'}
                    </span>
                  )}
                </span>
              </button>
              <div className="library-actions">
                {publicStore && published.has(song.id) && onViewPublic && (
                  <button className="secondary" onClick={() => onViewPublic(published.get(song.id)!.id)}>
                    View public
                  </button>
                )}
                {publicStore && (
                  <button className="secondary" disabled={busyId === song.id} onClick={() => void startPublish(song)}>
                    {published.has(song.id) ? 'Update public' : 'Publish'}
                  </button>
                )}
                <button className="secondary" disabled={busyId === song.id} onClick={() => void duplicate(song)}>
                  Duplicate
                </button>
                <button
                  className="secondary danger"
                  disabled={busyId === song.id}
                  onClick={() => setConfirmDelete(song)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {publishing && publicStore && (
        <PublishDialog
          store={publicStore}
          doc={publishing.doc}
          update={publishing.update}
          onPublished={(id) => {
            setPublished((prev) => new Map(prev).set(publishing.doc.id, { id, updatedAt: new Date().toISOString() }));
            setPublishing(null);
          }}
          onClose={() => setPublishing(null)}
        />
      )}

      {confirmDelete && (
        <div className="arrangement-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="arrangement-panel dialog-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Delete &ldquo;{confirmDelete.title || 'Untitled'}&rdquo;?</h2>
            <p className="hint">
              It will be removed from your library on every device. This can&rsquo;t be undone.
              {published.has(confirmDelete.id) &&
                ' Its public version stays published; remove that from its public page if you want it gone too.'}
            </p>
            <div className="actions">
              <button className="danger-solid" onClick={() => void remove(confirmDelete)}>
                Delete song
              </button>
              <button className="secondary" autoFocus onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
