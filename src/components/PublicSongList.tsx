import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicSongStore, PublicSongSummary } from '../lib/publicSongStore';

interface Props {
  store: PublicSongStore;
  onOpen: (id: string) => void;
}

const titleOf = (song: PublicSongSummary) => song.title.trim() || 'Untitled';

export function PublicSongList({ store, onOpen }: Props) {
  const [songs, setSongs] = useState<PublicSongSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    try {
      setSongs(await store.list());
      setError(null);
    } catch {
      setError("Couldn't load the public songs. Check your connection and try again.");
    }
  }, [store]);

  useEffect(() => {
    // Loads from an external system (the database) — the list arrives asynchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Matches the title or writers, ignoring case and accents, in title order (numbers as numbers).
  const shown = useMemo(() => {
    if (!songs) return null;
    const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const q = fold(query.trim());
    return songs
      .filter((s) => !q || fold(`${s.title} ${s.writers}`).includes(q))
      .sort((a, b) => titleOf(a).localeCompare(titleOf(b), undefined, { numeric: true, sensitivity: 'base' }));
  }, [songs, query]);

  return (
    <div className="panel library">
      <div className="library-header">
        <h2>Public songs</h2>
        {songs && songs.length > 0 && (
          <input
            className="public-search"
            type="search"
            placeholder="Search titles and writers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>

      {error && (
        <p className="hint library-error">
          {error}{' '}
          <button className="link-button" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      )}

      {songs === null && !error && <p className="hint">Loading songs&hellip;</p>}
      {songs?.length === 0 && <p className="hint">No songs have been published yet.</p>}
      {shown && songs && songs.length > 0 && shown.length === 0 && <p className="hint">No songs match &ldquo;{query}&rdquo;.</p>}

      {shown && shown.length > 0 && (
        <ul className="library-list">
          {shown.map((song) => (
            <li key={song.id} className="library-item">
              <button className="library-open" onClick={() => onOpen(song.id)}>
                <span className="library-title">{titleOf(song)}</span>
                <span className="library-meta">
                  {song.keys.length > 0 && <span>Key {song.keys.join('-')}</span>}
                  {song.writers && <span>{song.writers}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
