import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SongStore, SongSummary } from '../lib/songStore';
import type { PublicSongStore, PublicSongSummary } from '../lib/publicSongStore';
import { versionLabel } from '../lib/songDocument';
import type { VersionRef } from '../lib/lastVersion';

/** What can be done to the open version when it's one of the user's own. */
export interface OwnVersionActions {
  /** Copies the open version under a new name, as another of the user's versions. */
  onNew: (name: string) => Promise<void>;
  onRename: (name: string) => void;
  onDelete: () => Promise<void>;
  /** Makes the open version a version of another song. */
  onMove: (workId: string) => void;
}

interface Props {
  workId: string;
  current: VersionRef;
  /** The open version's name as it is now, which may be newer than the saved list. */
  currentName: string;
  /** null when signed out: only the public versions are listed. */
  songStore: SongStore | null;
  publicStore: PublicSongStore | null;
  onSelect: (version: VersionRef) => void;
  /** Only when the open version is the user's own. */
  ownActions?: OwnVersionActions;
}

const refValue = (ref: VersionRef) => `${ref.kind}:${ref.id}`;

/**
 * The version dropdown on a song page: the song's public versions plus the signed-in user's own,
 * with New version / Rename / Delete / Make this a version of… for the user's own. Mount it keyed
 * by the open version, so it reloads the list after a version is added, removed or regrouped.
 */
export function VersionPicker({ workId, current, currentName, songStore, publicStore, onSelect, ownActions }: Props) {
  const [own, setOwn] = useState<SongSummary[]>([]);
  const [shared, setShared] = useState<PublicSongSummary[]>([]);
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | 'move' | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([songStore?.listVersions(workId) ?? [], publicStore?.listVersions(workId) ?? []])
      .then(([mine, pub]) => {
        if (cancelled) return;
        setOwn(mine);
        setShared(pub);
      })
      .catch(() => {
        // Without the list, the dropdown still shows the open version.
      });
    return () => {
      cancelled = true;
    };
  }, [songStore, publicStore, workId]);

  const nameOf = (ref: VersionRef, saved: string) =>
    versionLabel(ref.kind === current.kind && ref.id === current.id ? currentName : saved);
  // The open version is always listed, even before the list loads (or if it was just made).
  const ownList = current.kind === 'own' && !own.some((v) => v.id === current.id) ? [{ id: current.id, versionName: currentName }, ...own] : own;
  const publicList =
    current.kind === 'public' && !shared.some((v) => v.id === current.id) ? [{ id: current.id, versionName: currentName }, ...shared] : shared;
  const isLastOwn = current.kind === 'own' && ownList.length <= 1;

  return (
    <>
      <label className="version-picker">
        <span>Version</span>
        <select
          value={refValue(current)}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':') as [VersionRef['kind'], string];
            onSelect({ kind, id });
          }}
        >
          {ownList.length > 0 && (
            <optgroup label="Your versions">
              {ownList.map((v) => (
                <option key={v.id} value={refValue({ kind: 'own', id: v.id })}>
                  {nameOf({ kind: 'own', id: v.id }, v.versionName)}
                </option>
              ))}
            </optgroup>
          )}
          {publicList.length > 0 && (
            <optgroup label="Public versions">
              {publicList.map((v) => (
                <option key={v.id} value={refValue({ kind: 'public', id: v.id })}>
                  {nameOf({ kind: 'public', id: v.id }, v.versionName)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {ownActions && (
        <span className="version-actions">
          <button className="secondary" onClick={() => setDialog('new')}>
            New version
          </button>
          <button className="secondary" onClick={() => setDialog('rename')}>
            Rename
          </button>
          <button className="secondary" onClick={() => setDialog('move')} title="Group this with another song's versions">
            Move…
          </button>
          <button className="secondary danger" onClick={() => setDialog('delete')}>
            Delete version
          </button>
        </span>
      )}

      {ownActions && dialog === 'new' && (
        <NameDialog
          heading="New version"
          hint={`A copy of “${versionLabel(currentName)}” to change as you like. The original stays as it is.`}
          initial=""
          action="Create"
          onSave={async (name) => {
            await ownActions.onNew(name);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {ownActions && dialog === 'rename' && (
        <NameDialog
          heading="Rename version"
          hint="e.g. Original Hymn, Passion, Acoustic. A public copy keeps its old name until you update it."
          initial={currentName}
          action="Rename"
          onSave={async (name) => {
            ownActions.onRename(name);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {ownActions && dialog === 'delete' && (
        <DeleteVersionDialog
          name={versionLabel(currentName)}
          isLast={isLastOwn}
          onDelete={async () => {
            await ownActions.onDelete();
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {ownActions && dialog === 'move' && (
        <MoveDialog
          currentWorkId={workId}
          songStore={songStore}
          publicStore={publicStore}
          onMove={(target) => {
            ownActions.onMove(target);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function NameDialog({
  heading,
  hint,
  initial,
  action,
  onSave,
  onClose,
}: {
  heading: string;
  hint: string;
  initial: string;
  action: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      await onSave(name.trim());
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <form className="arrangement-panel dialog-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{heading}</h2>
        <p className="hint">{hint}</p>
        <label className="field">
          <span>Version name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Passion" />
        </label>
        {failed && <p className="hint library-error">That didn&rsquo;t work. Check your connection and try again.</p>}
        <div className="actions">
          <button type="submit" disabled={busy || !name.trim()}>
            {action}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteVersionDialog({
  name,
  isLast,
  onDelete,
  onClose,
}: {
  name: string;
  isLast: boolean;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel dialog-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Delete the &ldquo;{name}&rdquo; version?</h2>
        <p className="hint">
          {isLast
            ? 'It’s your only version of this song, so the song leaves My Songs too. '
            : 'Your other versions of this song stay. '}
          Public versions aren&rsquo;t affected, and any set that uses this version will show it as deleted. This
          can&rsquo;t be undone.
        </p>
        {failed && <p className="hint library-error">Couldn&rsquo;t delete it. Try again.</p>}
        <div className="actions">
          <button
            className="danger-solid"
            onClick={() => {
              setFailed(false);
              onDelete().catch(() => setFailed(true));
            }}
          >
            Delete version
          </button>
          <button className="secondary" autoFocus onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface SongChoice {
  workId: string;
  title: string;
  /** Where its versions are: the user's own, the public songs, or both. */
  where: string;
  versions: number;
}

/** Picks another song (the user's own or a public one) to make the open version a version of. */
function MoveDialog({
  currentWorkId,
  songStore,
  publicStore,
  onMove,
  onClose,
}: {
  currentWorkId: string;
  songStore: SongStore | null;
  publicStore: PublicSongStore | null;
  onMove: (workId: string) => void;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<SongChoice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([songStore?.list() ?? [], publicStore?.list() ?? []])
      .then(([mine, pub]) => {
        if (cancelled) return;
        const byWork = new Map<string, SongChoice>();
        const add = (workId: string, title: string, where: 'Yours' | 'Public') => {
          if (workId === currentWorkId) return;
          const existing = byWork.get(workId);
          if (existing) {
            existing.versions++;
            if (!existing.where.includes(where)) existing.where = 'Yours and public';
          } else {
            byWork.set(workId, { workId, title: title.trim() || 'Untitled', where, versions: 1 });
          }
        };
        mine.forEach((s) => add(s.workId, s.title, 'Yours'));
        pub.forEach((s) => add(s.workId, s.title, 'Public'));
        setChoices([...byWork.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [songStore, publicStore, currentWorkId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return choices?.filter((c) => !q || c.title.toLowerCase().includes(q)) ?? null;
  }, [choices, query]);

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel dialog-panel move-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="arrangement-panel-header">
          <h2>Make this a version of&hellip;</h2>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="hint">
          Pick the song this is an arrangement of. It moves into that song&rsquo;s version list, keeping its own
          chords, key and name.
        </p>
        <input className="public-search" type="search" autoFocus placeholder="Search songs" value={query} onChange={(e) => setQuery(e.target.value)} />
        {failed && <p className="hint library-error">Couldn&rsquo;t load the songs. Try again.</p>}
        {!choices && !failed && <p className="hint">Loading songs&hellip;</p>}
        {shown && shown.length === 0 && <p className="hint">No other songs{query ? ' match' : ''}.</p>}
        {shown && shown.length > 0 && (
          <ul className="library-list move-list">
            {shown.map((c) => (
              <li key={c.workId} className="library-item">
                <button className="library-open" onClick={() => onMove(c.workId)}>
                  <span className="library-title">{c.title}</span>
                  <span className="library-meta">
                    <span>{c.where}</span>
                    {c.versions > 1 && <span>{c.versions} versions</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
