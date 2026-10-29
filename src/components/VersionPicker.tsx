import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SongStore, SongSummary } from '../lib/songStore';
import type { PublicSongStore, PublicSongSummary } from '../lib/publicSongStore';
import { versionLabel } from '../lib/songDocument';
import type { VersionRef } from '../lib/lastVersion';
import { RowMenu } from './RowMenu';
import { useEscapeKey } from '../hooks/useEscapeKey';

/** What can be done to the open version when it's one of the user's own. */
export interface OwnVersionActions {
  /** The open version's public copy, when it's published. */
  publicId: string | null;
  onRename: (name: string) => void;
  onDelete: () => Promise<void>;
  /** Makes the open version a version of another song. */
  onMove: (workId: string) => void;
  /** Only for publishers. Publish opens the publish dialog. */
  onPublish?: () => void;
  onUnpublish?: () => Promise<void>;
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
  /** Copies the open version as a new draft of the user's own. Not given when signed out. */
  onCreate?: (name: string) => Promise<void>;
  /** Only when the open version is the user's own. */
  ownActions?: OwnVersionActions;
}

/** One version in the dropdown. A version the user published is listed once, as their own. */
interface Entry {
  ref: VersionRef;
  name: string;
  isPublic: boolean;
}

const refValue = (ref: VersionRef) => `${ref.kind}:${ref.id}`;

/**
 * The version dropdown on a song page: every version of the song in one list (the public ones
 * and the signed-in user's drafts), with Create new version, Publish, and the rest in a ⋯ menu.
 * Mount it keyed by the open version and its public id, so it reloads the list after a version
 * is added, removed, regrouped, published or unpublished.
 */
export function VersionPicker({ workId, current, currentName, songStore, publicStore, onSelect, onCreate, ownActions }: Props) {
  const [own, setOwn] = useState<SongSummary[]>([]);
  const [shared, setShared] = useState<PublicSongSummary[]>([]);
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | 'move' | 'unpublish' | null>(null);

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

  const publicId = ownActions?.publicId ?? null;
  const isCurrent = (ref: VersionRef) => ref.kind === current.kind && ref.id === current.id;
  // The open version is always listed, even before the list loads (or if it was just made).
  const ownList = current.kind === 'own' && !own.some((v) => v.id === current.id) ? [{ id: current.id, versionName: currentName }, ...own] : own;
  const publicList: { id: string; versionName: string; sourceSongId: string | null }[] =
    current.kind === 'public' && !shared.some((v) => v.id === current.id)
      ? [{ id: current.id, versionName: currentName, sourceSongId: null }, ...shared]
      : shared;
  // A public version that's the public copy of one of the user's own versions is listed once,
  // as theirs, so choosing it opens the copy they edit.
  const ownedBy = (v: { sourceSongId: string | null }) =>
    v.sourceSongId && ownList.some((o) => o.id === v.sourceSongId) ? v.sourceSongId : null;
  const isPublic = (ownId: string) => (current.kind === 'own' && ownId === current.id ? !!publicId : publicList.some((p) => ownedBy(p) === ownId));

  const nameOf = (ref: VersionRef, saved: string) => (isCurrent(ref) ? currentName : saved);
  // The public versions first, oldest first (the user's own among them), then their drafts.
  const entries: Entry[] = [
    ...publicList.map((v): Entry => {
      const mine = ownedBy(v);
      const ref: VersionRef = mine ? { kind: 'own', id: mine } : { kind: 'public', id: v.id };
      const saved = mine ? (ownList.find((o) => o.id === mine)?.versionName ?? v.versionName) : v.versionName;
      return { ref, name: nameOf(ref, saved), isPublic: true };
    }),
    ...ownList
      .filter((v) => !publicList.some((p) => ownedBy(p) === v.id))
      .map((v): Entry => {
        const ref: VersionRef = { kind: 'own', id: v.id };
        return { ref, name: nameOf(ref, v.versionName), isPublic: isPublic(v.id) };
      }),
  ];
  // Opened by its public link, the user's own public version still shows as theirs.
  const openCopy = current.kind === 'public' ? publicList.find((v) => v.id === current.id) : undefined;
  const openCopyOwner = openCopy ? ownedBy(openCopy) : null;
  const selected: VersionRef = openCopyOwner ? { kind: 'own', id: openCopyOwner } : current;
  // Only worth saying which is which when some aren't public.
  const tagged = entries.some((e) => !e.isPublic);
  const isLastOwn = current.kind === 'own' && ownList.length <= 1;

  return (
    <>
      <label className="version-picker">
        <span>Version</span>
        <select
          value={refValue(selected)}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':') as [VersionRef['kind'], string];
            onSelect({ kind, id });
          }}
        >
          {entries.map((e) => (
            <option key={refValue(e.ref)} value={refValue(e.ref)}>
              {`${versionLabel(e.name)}${tagged ? (e.isPublic ? ' · Public' : ' · Draft') : ''}`}
            </option>
          ))}
        </select>
      </label>
      {(onCreate || ownActions) && (
        <span className="version-actions">
          {onCreate && (
            <button className="secondary" onClick={() => setDialog('new')}>
              Create new version
            </button>
          )}
          {ownActions?.onPublish && !publicId && (
            <button className="secondary" onClick={ownActions.onPublish}>
              Publish
            </button>
          )}
          {ownActions && (
            <RowMenu
              label="More version actions"
              items={[
                { label: 'Rename', onSelect: () => setDialog('rename') },
                { label: 'Move to another song…', onSelect: () => setDialog('move') },
                ...(publicId && ownActions.onUnpublish ? [{ label: 'Unpublish', onSelect: () => setDialog('unpublish') }] : []),
                { label: 'Delete version', danger: true, onSelect: () => setDialog('delete') },
              ]}
            />
          )}
        </span>
      )}

      {onCreate && dialog === 'new' && (
        <NameDialog
          heading="Create new version"
          hint={`A copy of “${versionLabel(currentName)}” to change as you like. It starts as a draft only you can see, and the original stays as it is.`}
          initial=""
          action="Create"
          onSave={async (name) => {
            await onCreate(name);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {ownActions && dialog === 'rename' && (
        <NameDialog
          heading="Rename version"
          hint={`e.g. Original Hymn, Passion, Acoustic.${publicId ? ' It’s public, so the new name shows there too.' : ''}`}
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
          isPublic={!!publicId}
          onDelete={async () => {
            await ownActions.onDelete();
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {ownActions?.onUnpublish && dialog === 'unpublish' && (
        <UnpublishDialog
          name={versionLabel(currentName)}
          onUnpublish={async () => {
            await ownActions.onUnpublish!();
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
  useEscapeKey(onClose);
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
  isPublic,
  onDelete,
  onClose,
}: {
  name: string;
  isLast: boolean;
  isPublic: boolean;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const [failed, setFailed] = useState(false);
  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel dialog-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Delete the &ldquo;{name}&rdquo; version?</h2>
        <p className="hint">
          {isLast
            ? 'It’s your only version of this song, so the song leaves My Songs too. '
            : 'Your other versions of this song stay. '}
          {isPublic
            ? 'It’s public, so it’s removed from the public songs too. '
            : 'Public versions aren’t affected. '}
          Any set that uses this version will show it as deleted. This can&rsquo;t be undone.
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

/** Confirms taking the open version out of the public songs, back to a draft. */
function UnpublishDialog({ name, onUnpublish, onClose }: { name: string; onUnpublish: () => Promise<void>; onClose: () => void }) {
  useEscapeKey(onClose);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel dialog-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Unpublish &ldquo;{name}&rdquo;?</h2>
        <p className="hint">
          It goes back to being a draft only you can see, and its public link stops working. Copies other people
          made of it aren&rsquo;t affected. You can publish it again later.
        </p>
        {failed && <p className="hint library-error">That didn&rsquo;t work. Check your connection and try again.</p>}
        <div className="actions">
          <button
            className="danger-solid"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setFailed(false);
              onUnpublish().catch(() => {
                setFailed(true);
                setBusy(false);
              });
            }}
          >
            {busy ? 'Unpublishing…' : 'Unpublish'}
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
  useEscapeKey(onClose);
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
