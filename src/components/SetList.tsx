import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SetStore, SetSummary } from '../lib/setStore';
import type { SongStore } from '../lib/songStore';
import { formatEdited } from '../lib/dates';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface Props {
  store: SetStore;
  /** For finding a set by the songs in it. */
  songStore: SongStore | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}

const nameOf = (set: SetSummary) => set.name.trim() || 'Untitled set';

type SortOrder = 'edited' | 'edited-asc' | 'name' | 'name-desc';

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'edited', label: 'Last edited' },
  { value: 'edited-asc', label: 'Oldest edited' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
];

const SORT_KEY = 'chordpro-sets-sort';

/** The remembered sort order for this browser (just a convenience — it's fine if it's lost). */
function loadSort(): SortOrder {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return SORT_OPTIONS.some((o) => o.value === saved) ? (saved as SortOrder) : 'edited';
  } catch {
    return 'edited';
  }
}

// Numbers sort as numbers ("Week 9" before "Week 10"), and case and accents are ignored.
const compareNames = (a: SetSummary, b: SetSummary) => nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: 'base' });

function sortSets(sets: SetSummary[], order: SortOrder): SetSummary[] {
  const sorted = [...sets];
  if (order === 'edited') sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  else if (order === 'edited-asc') sorted.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  else if (order === 'name') sorted.sort(compareNames);
  else sorted.sort((a, b) => compareNames(b, a));
  return sorted;
}

// Search ignores case and accents.
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The user's sets, sorted as they choose (newest edit first to start), and searchable by name or
 * by a song in them. */
export function SetList({ store, songStore, onOpen, onNew }: Props) {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(loadSort);
  const [query, setQuery] = useState('');
  // Each song's title, to search sets by the songs in them. Searching just names until it loads.
  const [songTitles, setSongTitles] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SetSummary | null>(null);
  useEscapeKey(confirmDelete ? () => setConfirmDelete(null) : null);

  const refresh = useCallback(async () => {
    try {
      setSets(await store.list());
      setError(null);
    } catch {
      setError("Couldn't load your sets. Check your connection and try again.");
    }
  }, [store]);

  useEffect(() => {
    // Loads from an external system (the database) — the list arrives asynchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!songStore) return;
    let cancelled = false;
    songStore
      .list()
      .then((songs) => !cancelled && setSongTitles(new Map(songs.map((s) => [s.id, s.title]))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [songStore]);

  const shown = useMemo(() => {
    if (!sets) return null;
    const q = fold(query.trim());
    const matches = (set: SetSummary) =>
      !q || fold([set.name, ...set.songIds.map((id) => songTitles.get(id) ?? '')].join(' ')).includes(q);
    return sortSets(sets.filter(matches), sortOrder);
  }, [sets, query, sortOrder, songTitles]);

  function changeSort(order: SortOrder) {
    setSortOrder(order);
    try {
      localStorage.setItem(SORT_KEY, order);
    } catch {
      // Not remembered in this browser; the list is still sorted.
    }
  }

  async function remove(set: SetSummary) {
    setConfirmDelete(null);
    setBusyId(set.id);
    try {
      await store.delete(set.id);
      await refresh();
    } catch {
      setError(`Couldn't delete "${nameOf(set)}".`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel library">
      <div className="library-header">
        <h2>Your sets</h2>
        <div className="library-header-actions">
          {sets && sets.length > 1 && (
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
          <button onClick={onNew}>New set</button>
        </div>
      </div>

      {sets && sets.length > 1 && (
        <input
          className="public-search set-search"
          type="search"
          placeholder="Search set names and songs"
          aria-label="Search sets"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {error && (
        <p className="hint library-error">
          {error}{' '}
          <button className="link-button" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      )}

      {sets === null && !error && <p className="hint">Loading your sets&hellip;</p>}
      {sets?.length === 0 && (
        <p className="hint">No sets yet. A set puts songs in order, each in its own key, and prints them as one PDF.</p>
      )}

      {shown && sets && sets.length > 0 && shown.length === 0 && <p className="hint">No sets match &ldquo;{query}&rdquo;.</p>}

      {shown && shown.length > 0 && (
        <ul className="library-list">
          {shown.map((set) => (
            <li key={set.id} className="library-item">
              <button className="library-open" disabled={busyId === set.id} onClick={() => onOpen(set.id)}>
                <span className="library-title">{nameOf(set)}</span>
                <span className="library-meta">
                  <span>
                    {set.songCount} {set.songCount === 1 ? 'song' : 'songs'}
                  </span>
                  <span>Edited {formatEdited(set.updatedAt)}</span>
                  {set.shared && <span className="library-public">Shared by link</span>}
                </span>
              </button>
              <div className="library-actions">
                <button className="secondary danger" disabled={busyId === set.id} onClick={() => setConfirmDelete(set)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmDelete && (
        <div className="arrangement-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="arrangement-panel dialog-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Delete &ldquo;{nameOf(confirmDelete)}&rdquo;?</h2>
            <p className="hint">
              The songs in it stay in your library.
              {confirmDelete.shared && ' Its share link will stop working.'} This can&rsquo;t be undone.
            </p>
            <div className="actions">
              <button className="danger-solid" onClick={() => void remove(confirmDelete)}>
                Delete set
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
