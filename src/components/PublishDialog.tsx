import { useState } from 'react';
import type { FormEvent } from 'react';
import type { PublicSongStore } from '../lib/publicSongStore';
import type { SongDocument } from '../lib/songDocument';
import { creditLines } from '../lib/credits';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface Props {
  store: PublicSongStore;
  /** The library song to publish, exactly as it should appear publicly. */
  doc: SongDocument;
  /** Saves the library song under a new version name, so both copies carry it. */
  onRename: (versionName: string) => Promise<void>;
  /** With the version name it was published under. */
  onPublished: (publicId: string, versionName: string) => void;
  onClose: () => void;
}

/** Confirms publishing a library song (a draft), then does it. The version must be named first,
 * so the public versions of a song can be told apart (rather than each showing as "Original"). */
export function PublishDialog({ store, doc, onRename, onPublished, onClose }: Props) {
  useEscapeKey(onClose);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [versionName, setVersionName] = useState(doc.versionName);

  async function publish(e: FormEvent) {
    e.preventDefault();
    const name = versionName.trim();
    if (!name) return;
    setBusy(true);
    setFailed(false);
    try {
      if (name !== doc.versionName) await onRename(name);
      onPublished(await store.publish({ ...doc, versionName: name }), name);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <form
        className="arrangement-panel dialog-panel"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void publish(e)}
      >
        <h2>Publish &ldquo;{doc.title.trim() || 'Untitled'}&rdquo;?</h2>
        <p className="hint">
          Anyone can find, view and download it, signed in or not. You can keep editing it: your changes go live as
          they save. For bigger changes, make a new version to work on first.
        </p>
        <label className="field">
          <span>Version name</span>
          <input
            autoFocus
            value={versionName}
            onChange={(e) => setVersionName(e.target.value)}
            placeholder="e.g. Original Hymn, Passion, Acoustic"
          />
        </label>
        {creditLines(doc.credits).length === 0 && (
          <p className="hint library-error">
            This song has no writers or copyright yet. Add them with Credits first so the chart is properly attributed.
          </p>
        )}
        {failed && <p className="hint library-error">Couldn&rsquo;t publish it. Check your connection and try again.</p>}
        <div className="actions">
          <button type="submit" disabled={busy || !versionName.trim()}>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
