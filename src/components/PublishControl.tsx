import { useEffect, useState } from 'react';
import type { PublicSongStore, PublishedCopy } from '../lib/publicSongStore';
import type { SongDocument } from '../lib/songDocument';
import { PublishDialog } from './PublishDialog';

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
  const [published, setPublished] = useState<PublishedCopy | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store
      .findPublished(doc.id)
      .then((found) => !cancelled && setPublished(found))
      .catch(() => !cancelled && setPublished(null));
    return () => {
      cancelled = true;
    };
    // Only on opening a song: the status changes here only through the dialog below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  if (published === undefined) return null;

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
        <PublishDialog
          store={store}
          doc={doc}
          update={!!published}
          onPublished={(id) => {
            setPublished({ id, updatedAt: new Date().toISOString() });
            setConfirming(false);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
