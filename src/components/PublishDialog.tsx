import { useState } from 'react';
import type { PublicSongStore } from '../lib/publicSongStore';
import type { SongDocument } from '../lib/songDocument';
import { creditLines } from '../lib/credits';

interface Props {
  store: PublicSongStore;
  /** The library song to publish, exactly as it should appear publicly. */
  doc: SongDocument;
  /** Already public, so this updates the snapshot rather than adding it. */
  update: boolean;
  onPublished: (publicId: string) => void;
  onClose: () => void;
}

/** Confirms publishing (or updating) a library song's public snapshot, then does it. Shared by
 * the editor's Publish button and the Your songs list. */
export function PublishDialog({ store, doc, update, onPublished, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function publish() {
    setBusy(true);
    setFailed(false);
    try {
      onPublished(await store.publish(doc));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel dialog-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>
          {update ? 'Update the public version of' : 'Publish'} &ldquo;{doc.title.trim() || 'Untitled'}&rdquo;?
        </h2>
        <p className="hint">
          {update
            ? 'The public page will show this song exactly as it is now.'
            : 'Anyone with the link can view and download it, signed in or not. It stays a snapshot: later edits stay private until you update it.'}
        </p>
        {creditLines(doc.credits).length === 0 && (
          <p className="hint library-error">
            This song has no writers or copyright yet. Add them with Credits first so the chart is properly attributed.
          </p>
        )}
        {failed && <p className="hint library-error">Couldn&rsquo;t publish it. Check your connection and try again.</p>}
        <div className="actions">
          <button disabled={busy} onClick={() => void publish()}>
            {busy ? 'Publishing…' : update ? 'Update' : 'Publish'}
          </button>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
