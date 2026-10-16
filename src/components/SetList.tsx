import { useCallback, useEffect, useState } from 'react';
import type { SetStore, SetSummary } from '../lib/setStore';
import { formatEdited } from '../lib/dates';

interface Props {
  store: SetStore;
  onOpen: (id: string) => void;
  onNew: () => void;
}

const nameOf = (set: SetSummary) => set.name.trim() || 'Untitled set';

/** The user's sets, newest edit first. */
export function SetList({ store, onOpen, onNew }: Props) {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SetSummary | null>(null);

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
          <button onClick={onNew}>New set</button>
        </div>
      </div>

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

      {sets && sets.length > 0 && (
        <ul className="library-list">
          {sets.map((set) => (
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
