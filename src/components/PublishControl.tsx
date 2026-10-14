import { useEffect, useState } from 'react';
import type { PublicSongStore } from '../lib/publicSongStore';
import type { SongDocument } from '../lib/songDocument';
import { creditLines } from '../lib/credits';

interface Props {
  store: PublicSongStore;
  /** The open library song, as it is right now. */
  doc: SongDocument;
  onViewPublic: (publicId: string) => void;
}

/**
 * For publishers: puts a snapshot of the open library song in the public songs, or updates the
 * snapshot already there. Later edits stay private until published again. Mount it keyed by
 * song id, so it looks up the right song's status.
 */
export function PublishControl({ store, doc, onViewPublic }: Props) {
  // undefined while checking; null when this song isn't published.
  const [published, setPublished] = useState<{ id: string; updatedAt: string } | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store
      .findPublished(doc.id)
      .then((found) => !cancelled && setPublished(found))
      .catch(() => !cancelled && setPublished(null));
    return () => {
      cancelled = true;
    };
    // Only on opening a song: the status changes here only through publish() below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  async function publish() {
    setBusy(true);
    setFailed(false);
    try {
      const id = await store.publish(doc);
      setPublished({ id, updatedAt: new Date().toISOString() });
      setConfirming(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (published === undefined) return null;
  const hasCredits = creditLines(doc.credits).length > 0;

  return (
    <>
      <button className="secondary" onClick={() => setConfirming(true)}>
        {published ? 'Update public version' : 'Publish'}
      </button>
      {published && (
        <button className="link-button publish-view" onClick={() => onViewPublic(published.id)}>
          View public page
        </button>
      )}

      {confirming && (
        <div className="arrangement-overlay" onClick={() => setConfirming(false)}>
          <div className="arrangement-panel dialog-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{published ? 'Update the public version?' : 'Publish to public songs?'}</h2>
            <p className="hint">
              {published
                ? 'The public page will show this song exactly as it is now.'
                : 'Anyone with the link can view and download it, signed in or not. It stays a snapshot: later edits stay private until you update it.'}
            </p>
            {!hasCredits && (
              <p className="hint library-error">
                This song has no writers or copyright yet. Add them with Credits first so the chart is properly
                attributed.
              </p>
            )}
            {failed && <p className="hint library-error">Couldn&rsquo;t publish it. Check your connection and try again.</p>}
            <div className="actions">
              <button disabled={busy} onClick={() => void publish()}>
                {busy ? 'Publishing…' : published ? 'Update' : 'Publish'}
              </button>
              <button className="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
