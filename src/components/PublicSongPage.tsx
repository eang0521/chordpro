import { useEffect, useMemo, useState } from 'react';
import type { KeyName } from '../types';
import type { PublicSong, PublicSongStore } from '../lib/publicSongStore';
import type { SongDocument } from '../lib/songDocument';
import { NewerSongVersionError } from '../lib/songStore';
import { deriveFlatSyllables } from '../lib/arrangement';
import { ChordChartView } from './ChordChartView';
import { ExportView } from './ExportView';
import { KeyControl } from './KeyControl';

interface Props {
  store: PublicSongStore;
  id: string;
  /** The signed-in user, or null when signed out. */
  userId: string | null;
  onBack: () => void;
  /** Makes an editable copy in the user's own library. */
  onCopyToLibrary: (doc: SongDocument) => Promise<void>;
  onSignIn: () => void;
}

/**
 * A published song, laid out like the app's own export step but read-only: the chart, the
 * ChordPro text and the downloads. Changing the key, font or spacing here only changes what
 * you see and download — nothing is saved back to the public song.
 */
export function PublicSongPage({ store, id, userId, onBack, onCopyToLibrary, onSignIn }: Props) {
  const [song, setSong] = useState<PublicSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<KeyName>('C');
  const [fontId, setFontId] = useState('');
  const [lineSpacing, setLineSpacing] = useState(1);
  const [showChart, setShowChart] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store
      .get(id)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setError("That song isn't in the public songs any more.");
          return;
        }
        setSong(loaded);
        setKey(loaded.doc.key);
        setFontId(loaded.doc.chartFontId);
        setLineSpacing(loaded.doc.lineSpacing);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof NewerSongVersionError ? err.message : "Couldn't open that song. Check your connection and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [store, id]);

  const doc = song?.doc;
  const flatSyllables = useMemo(() => (doc ? deriveFlatSyllables(doc.blocks, doc.arrangement) : []), [doc]);

  async function copyToLibrary() {
    if (!doc) return;
    setCopying(true);
    setCopyFailed(false);
    try {
      // The key, font and spacing as shown here, so the copy starts out the way it was viewed.
      await onCopyToLibrary({ ...doc, key, chartFontId: fontId, lineSpacing });
    } catch {
      setCopyFailed(true);
      setCopying(false);
    }
  }

  async function remove() {
    setRemoveFailed(false);
    try {
      await store.unpublish(id);
      onBack();
    } catch {
      setRemoveFailed(true);
      setConfirmRemove(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className="secondary" onClick={onBack}>
          &larr; Public songs
        </button>
        {doc && (
          <>
            <button className="secondary" disabled={doc.arrangement.length === 0} onClick={() => setShowChart(true)}>
              View chart
            </button>
            <KeyControl songKey={key} onChange={setKey} />
            <span className="toolbar-spacer" />
            {userId ? (
              <button onClick={() => void copyToLibrary()} disabled={copying}>
                {copying ? 'Copying…' : 'Copy to My Songs'}
              </button>
            ) : (
              <button className="secondary" onClick={onSignIn}>
                Sign in to copy and edit
              </button>
            )}
            {userId && song?.publisherId === userId && (
              <button className="secondary danger" onClick={() => setConfirmRemove(true)}>
                Remove from public songs
              </button>
            )}
          </>
        )}
      </div>

      {copyFailed && <p className="hint library-error">Couldn&rsquo;t copy it to your songs. Try again.</p>}
      {removeFailed && <p className="hint library-error">Couldn&rsquo;t remove it. Try again.</p>}
      {error && <p className="hint library-error">{error}</p>}
      {!doc && !error && <p className="hint">Loading&hellip;</p>}

      {doc && (
        <ExportView
          // Remount on a key change so the ChordPro text is regenerated in the new key.
          key={key}
          readOnly
          song={{ title: doc.title, key, syllables: flatSyllables, credits: doc.credits }}
          blocks={doc.blocks}
          arrangement={doc.arrangement}
          fontId={fontId}
          onFontIdChange={setFontId}
          lineSpacing={lineSpacing}
          onLineSpacingChange={setLineSpacing}
        />
      )}

      {doc && showChart && (
        <ChordChartView
          title={doc.title}
          songKey={key}
          onSongKeyChange={setKey}
          blocks={doc.blocks}
          arrangement={doc.arrangement}
          fontId={fontId}
          onFontIdChange={setFontId}
          lineSpacing={lineSpacing}
          onLineSpacingChange={setLineSpacing}
          credits={doc.credits}
          onClose={() => setShowChart(false)}
        />
      )}

      {confirmRemove && doc && (
        <div className="arrangement-overlay" onClick={() => setConfirmRemove(false)}>
          <div className="arrangement-panel dialog-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Remove &ldquo;{doc.title || 'Untitled'}&rdquo; from public songs?</h2>
            <p className="hint">
              Nobody will be able to find it here any more. Your own copy in My Songs isn&rsquo;t affected, and you can
              publish it again later.
            </p>
            <div className="actions">
              <button className="danger-solid" onClick={() => void remove()}>
                Remove
              </button>
              <button className="secondary" autoFocus onClick={() => setConfirmRemove(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
