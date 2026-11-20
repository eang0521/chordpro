import { useEffect, useMemo, useState } from 'react';
import type { SetSongDocument } from '../lib/setStore';
import type { SetView } from '../hooks/useSetView';
import { DEFAULT_LYRICS_OPTIONS, setLyricsText, songLyricsText, type LyricsTextOptions } from '../lib/lyricsText';

const OPTIONS_KEY = 'chordpro.setLyricsOptions';

/** The viewer's last lyrics options: a convenience for whoever runs slides every week. */
function loadOptions(): LyricsTextOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? 'null') as Partial<LyricsTextOptions> | null;
    return { ...DEFAULT_LYRICS_OPTIONS, ...(saved ?? {}) };
  } catch {
    return DEFAULT_LYRICS_OPTIONS;
  }
}

function saveOptions(options: LyricsTextOptions) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Private windows and blocked storage: the options just aren't remembered.
  }
}

/** Which copy button last worked ('all' or a song's position), shown as "Copied" for a moment. */
type CopiedTarget = 'all' | number | null;

/**
 * A set's songs as plain lyrics, no chords, in order: for whoever puts the words on screen, to copy
 * into their slide software one song at a time or the whole set at once.
 */
export function SetLyrics({ songs }: { songs: (SetSongDocument | null)[] }) {
  const [options, setOptions] = useState(loadOptions);
  const [copied, setCopied] = useState<CopiedTarget>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  const lyrics = useMemo(
    () =>
      songs.map((doc) => (doc ? { title: doc.title, lyrics: songLyricsText(doc.blocks, doc.arrangement, options) } : null)),
    [songs, options],
  );

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  function change(patch: Partial<LyricsTextOptions>) {
    const next = { ...options, ...patch };
    setOptions(next);
    saveOptions(next);
  }

  function copy(text: string, target: CopiedTarget) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyFailed(false);
        setCopied(target);
      })
      .catch(() => setCopyFailed(true));
  }

  const present = lyrics.filter((s): s is { title: string; lyrics: string } => s !== null);
  if (present.length === 0) return null;

  return (
    <div className="panel set-lyrics">
      <div className="set-lyrics-header">
        <label className="set-lyrics-option">
          <input type="checkbox" checked={options.sectionNames} onChange={(e) => change({ sectionNames: e.target.checked })} />
          Section names
        </label>
        <label className="set-lyrics-option" title="Each section every time it's sung, rather than once">
          <input type="checkbox" checked={options.repeats} onChange={(e) => change({ repeats: e.target.checked })} />
          Repeated sections
        </label>
        <span className="toolbar-spacer" />
        <button onClick={() => copy(setLyricsText(present), 'all')}>{copied === 'all' ? 'Copied' : 'Copy all lyrics'}</button>
      </div>
      {copyFailed && <p className="hint library-error">Couldn&rsquo;t copy. Select the lyrics and copy them yourself.</p>}

      {lyrics.map((song, i) =>
        song ? (
          <section key={i} className="set-lyrics-song">
            <div className="set-lyrics-song-header">
              <h3>
                {i + 1}. {song.title.trim() || 'Untitled'}
              </h3>
              <button className="secondary" disabled={!song.lyrics} onClick={() => copy(song.lyrics, i)}>
                {copied === i ? 'Copied' : 'Copy'}
              </button>
            </div>
            {song.lyrics ? <pre className="set-lyrics-text">{song.lyrics}</pre> : <p className="hint">No lyrics.</p>}
          </section>
        ) : null,
      )}
    </div>
  );
}

/** Switches a set between its chord charts and its lyrics alone. */
export function SetViewSwitch({ view, onChange }: { view: SetView; onChange: (view: SetView) => void }) {
  return (
    <div className="set-view-switch capo-switch" role="group" aria-label="Show">
      <button className={`secondary ${view === 'charts' ? 'chart-toggle-active' : ''}`} aria-pressed={view === 'charts'} onClick={() => onChange('charts')}>
        Chord charts
      </button>
      <button
        className={`secondary ${view === 'lyrics' ? 'chart-toggle-active' : ''}`}
        aria-pressed={view === 'lyrics'}
        onClick={() => onChange('lyrics')}
        title="Just the words, to copy into slides"
      >
        Lyrics only
      </button>
    </div>
  );
}
