import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArrangementEntry, Chord, KeyName, SongCredits, Step } from './types';
import type { Section, WordGroup } from './lib/syllables';
import { parseLyricsToWordGroups, wordGroupsToBlocks } from './lib/syllables';
import type { BlockMap } from './lib/arrangement';
import { blockIdsOf, deriveFlatSyllables } from './lib/arrangement';
import { LyricsInput } from './components/LyricsInput';
import { SyllableEditor } from './components/SyllableEditor';
import { ChordTapper } from './components/ChordTapper';
import { ExportView } from './components/ExportView';
import { ArrangementEditor } from './components/ArrangementEditor';
import { ChordChartView } from './components/ChordChartView';
import { KeyControl } from './components/KeyControl';
import { CopyChordsDialog } from './components/CopyChordsDialog';
import { SongLibrary } from './components/SongLibrary';
import { SignInDialog } from './components/SignInDialog';
import { CreditsFields } from './components/CreditsFields';
import { parseChordProText } from './lib/chordproParser';
import { SONG_SCHEMA_VERSION, emptySongDocument, isBlankSong, newSongId, type SongDocument } from './lib/songDocument';
import {
  clearLocalDraft,
  loadLocalDraft,
  markUploadOffered,
  removeOldDrafts,
  saveLocalDraft,
  wasUploadOffered,
} from './lib/localDraft';
import { supabase } from './lib/supabaseClient';
import { createSupabaseSongStore } from './lib/supabaseSongStore';
import { NewerSongVersionError } from './lib/songStore';
import { createSupabasePublicSongStore } from './lib/publicSongStore';
import { PublicSongList } from './components/PublicSongList';
import { PublicSongPage } from './components/PublicSongPage';
import { PublishControl } from './components/PublishControl';
import { SideMenu, SideMenuToggle } from './components/SideMenu';
import { SongSheet } from './components/SongSheet';
import { SetList } from './components/SetList';
import { SetEditor } from './components/SetEditor';
import { SharedSetPage } from './components/SharedSetPage';
import { createSupabaseSetStore, type SongSet } from './lib/setStore';
import { makeId } from './lib/id';
import type { CarryOverReport } from './lib/carryOver';
import { carryOverBlocks, carryOverWordGroups } from './lib/carryOver';
import { ThemeSwitch } from './components/ThemeSwitch';
import { VersionPicker } from './components/VersionPicker';
import { rememberVersion, type VersionRef } from './lib/lastVersion';
import { useAuth, signOut } from './hooks/useAuth';
import { useAutosave } from './hooks/useAutosave';
import './App.css';

const songStore = supabase ? createSupabaseSongStore(supabase) : null;
const publicStore = supabase ? createSupabasePublicSongStore(supabase) : null;
const setStore = supabase ? createSupabaseSetStore(supabase) : null;
// Module-level so useAutosave gets the same function every render.
const saveToLibrary = (doc: SongDocument) => songStore!.save(doc);

// The library song open on this device, so a reload reopens it instead of dropping back to
// the list. Per device on purpose: each device can be working on a different song.
const OPEN_SONG_KEY = 'chordpro-open-song';

function rememberOpenSong(id: string | null) {
  try {
    if (id) localStorage.setItem(OPEN_SONG_KEY, id);
    else localStorage.removeItem(OPEN_SONG_KEY);
  } catch {
    // Storage unavailable — a reload just shows the library instead.
  }
}

function openSongOnReload(): string | null {
  try {
    return localStorage.getItem(OPEN_SONG_KEY);
  } catch {
    return null;
  }
}

// Whether the side menu is open, per browser. Until it's been toggled, open on a wide screen.
const MENU_OPEN_KEY = 'r4e-menu-open';

function initialMenuOpen(): boolean {
  try {
    const saved = localStorage.getItem(MENU_OPEN_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // Storage unavailable: fall back to the screen width.
  }
  return window.matchMedia('(min-width: 1200px)').matches;
}

function rememberMenuOpen(open: boolean) {
  try {
    localStorage.setItem(MENU_OPEN_KEY, open ? '1' : '0');
  } catch {
    // Not remembered; it still opens and closes.
  }
}

const initialDraft = loadLocalDraft() ?? emptySongDocument();
removeOldDrafts();

// Pages with their own addresses, so they can be shared as links: the public songs (#/public,
// #/public/<id>) and a set shared by link (#/set/<share token>). Anything else in the hash, like
// a sign-in link's token, isn't a route.
type Route = { kind: 'public'; songId: string | null } | { kind: 'set'; token: string } | null;

function parseRoute(hash: string): Route {
  const publicMatch = /^#\/public(?:\/([0-9a-f-]{36}))?\/?$/i.exec(hash);
  if (publicMatch) return { kind: 'public', songId: publicMatch[1] ?? null };
  const setMatch = /^#\/set\/([0-9a-f-]{36})\/?$/i.exec(hash);
  return setMatch ? { kind: 'set', token: setMatch[1] } : null;
}

function App() {
  const auth = useAuth();
  const userId = auth.status === 'signedIn' ? auth.user.id : null;
  // 'local' is the single signed-out draft kept in this browser, 'cloud' a library song.
  const [source, setSource] = useState<'local' | 'cloud'>('local');
  // 'view' shows a library song's chart, as public songs are shown; Edit opens the editor.
  // 'sets' and 'set' are the user's sets and one set being edited (openSet).
  const [screen, setScreen] = useState<'editor' | 'view' | 'library' | 'opening' | 'sets' | 'set'>('editor');
  const [openSet, setOpenSet] = useState<{ id: string; initial?: SongSet } | null>(null);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [draftToUpload, setDraftToUpload] = useState<SongDocument | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [route, setRoute] = useState<Route>(() => (publicStore ? parseRoute(window.location.hash) : null));
  const [isPublisher, setIsPublisher] = useState(false);
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen);

  const [songId, setSongId] = useState(initialDraft.id);
  const [step, setStep] = useState<Step>(initialDraft.step);
  const [title, setTitle] = useState(initialDraft.title);
  const [key, setKey] = useState<KeyName>(initialDraft.key);
  const [lyrics, setLyrics] = useState(initialDraft.lyrics);
  const [wordGroups, setWordGroups] = useState<WordGroup[]>(initialDraft.wordGroups);
  const [sections, setSections] = useState<Section[]>(initialDraft.sections);
  const [blocks, setBlocks] = useState<BlockMap>(initialDraft.blocks);
  const [arrangement, setArrangement] = useState<ArrangementEntry[]>(initialDraft.arrangement);
  const [palette, setPalette] = useState<Chord[]>(initialDraft.palette);
  const [credits, setCredits] = useState<SongCredits>(initialDraft.credits);
  const [workId, setWorkId] = useState(initialDraft.workId);
  const [versionName, setVersionName] = useState(initialDraft.versionName);
  const [showCredits, setShowCredits] = useState(false);
  const [showArrangement, setShowArrangement] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showCopyChords, setShowCopyChords] = useState(false);
  // Saved with the song, and shared with ExportView so the chord chart's font/spacing choice
  // stays the same regardless of which screen you download the .docx from.
  const [chartFontId, setChartFontId] = useState<string>(initialDraft.chartFontId);
  const [chartLineSpacing, setChartLineSpacing] = useState(initialDraft.lineSpacing);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  // What happened to the earlier chords when the sections were rebuilt from edited lyrics.
  const [carryReport, setCarryReport] = useState<CarryOverReport | null>(null);

  const doc = useMemo<SongDocument>(
    () => ({
      schemaVersion: SONG_SCHEMA_VERSION,
      id: songId,
      step,
      title,
      key,
      lyrics,
      wordGroups,
      sections,
      blocks,
      arrangement,
      palette,
      chartFontId,
      lineSpacing: chartLineSpacing,
      credits,
      workId,
      versionName,
    }),
    [songId, step, title, key, lyrics, wordGroups, sections, blocks, arrangement, palette, chartFontId, chartLineSpacing, credits, workId, versionName],
  );

  const editingLibrarySong = source === 'cloud' && screen === 'editor';
  // Open to view or to edit: either way it's saved, since a key, font or spacing change on the
  // chart belongs to the song.
  const libraryOpen = source === 'cloud' && (screen === 'editor' || screen === 'view');
  const autosave = useAutosave(libraryOpen ? doc : null, saveToLibrary);

  useEffect(() => {
    if (source !== 'local') return;
    // Mirrors the outcome of a write to an external system (localStorage) into state, which is
    // exactly what an effect is for — there's no render-time way to know whether the save fit.
    // oxlint-disable-next-line react/set-state-in-effect
    setDraftSaveFailed(!saveLocalDraft(doc));
  }, [source, doc]);

  function loadDocument(next: SongDocument) {
    setSongId(next.id);
    setStep(next.step);
    setTitle(next.title);
    setKey(next.key);
    setLyrics(next.lyrics);
    setWordGroups(next.wordGroups);
    setSections(next.sections);
    setBlocks(next.blocks);
    setArrangement(next.arrangement);
    setPalette(next.palette);
    setChartFontId(next.chartFontId);
    setChartLineSpacing(next.lineSpacing);
    setCredits(next.credits);
    setWorkId(next.workId);
    setVersionName(next.versionName);
    setShowArrangement(false);
    setShowCredits(false);
    setShowChart(false);
    setShowCopyChords(false);
    setCarryReport(null);
  }

  /** Gets the open library song's last edits saved before showing something else. Resolves
   * false if they couldn't be saved and the user chose to stay. */
  async function leaveLibrarySong(): Promise<boolean> {
    if (!libraryOpen) return true;
    if (await autosave.flush()) return true;
    return window.confirm("Your latest changes couldn't be saved. Leave this song anyway and lose them?");
  }

  async function openSong(id: string) {
    if (!songStore || !(await leaveLibrarySong())) return;
    setLibraryMessage(null);
    try {
      const song = await songStore.get(id);
      if (!song) {
        rememberOpenSong(null);
        setLibraryMessage("That song isn't in your library any more.");
        setScreen('library');
        return;
      }
      loadDocument(song);
      setSource('cloud');
      // A song with a chart opens on it; one still being written goes straight to the editor.
      setScreen(song.arrangement.length > 0 ? 'view' : 'editor');
      rememberOpenSong(song.id);
      rememberVersion(song.workId, { kind: 'own', id: song.id });
    } catch (err) {
      rememberOpenSong(null);
      setLibraryMessage(err instanceof NewerSongVersionError ? err.message : "Couldn't open that song. Check your connection and try again.");
      setScreen('library');
    }
  }

  async function newLibrarySong() {
    if (!(await leaveLibrarySong())) return;
    const song = emptySongDocument();
    loadDocument(song);
    setSource('cloud');
    setScreen('editor');
    // Nothing is written until something is typed, so backing out leaves no empty song behind.
    rememberOpenSong(song.id);
  }

  async function showLibrary() {
    if (!(await leaveLibrarySong())) return;
    setLibraryMessage(null);
    setScreen('library');
    rememberOpenSong(null);
  }

  async function showSets() {
    if (!(await leaveLibrarySong())) return;
    setScreen('sets');
    rememberOpenSong(null);
  }

  function newSet() {
    // Nothing is written until it's named or a song is added, so backing out leaves no empty set.
    const id = makeId();
    setOpenSet({ id, initial: { id, name: '', entries: [], shareToken: null } });
    setScreen('set');
  }

  async function handleSignOut() {
    if (!(await leaveLibrarySong())) return;
    rememberOpenSong(null);
    await signOut();
  }

  // Switch between the local draft and the library whenever someone signs in or out — here or
  // in another tab. Tracks the previous user so a token refresh or the first render does nothing.
  const prevUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (auth.status === 'loading') return;
    const prev = prevUserId.current;
    prevUserId.current = userId;
    if (prev === userId || (prev === undefined && !userId)) return;

    if (userId) {
      // Follows an external system (the auth session), which is what an effect is for.
      // oxlint-disable-next-line react/set-state-in-effect
      setSource('cloud');
      const reopen = openSongOnReload();
      // 'opening' hides the editor, which still holds the signed-out draft, until the song arrives.
      setScreen(reopen ? 'opening' : 'library');
      if (reopen) void openSong(reopen);
      // First sign-in on this device: offer to bring the signed-out draft along so it isn't lost.
      const local = loadLocalDraft();
      if (local && !isBlankSong(local) && !wasUploadOffered(local.id)) setDraftToUpload(local);
    } else {
      loadDocument(loadLocalDraft() ?? emptySongDocument());
      setSource('local');
      setScreen('editor');
      setDraftToUpload(null);
    }
    // Only sign-in changes should trigger this; the handlers it calls read current state anyway.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status, userId]);

  async function uploadDraft(draft: SongDocument) {
    if (!songStore) return;
    setUploadFailed(false);
    try {
      await songStore.save(draft);
    } catch {
      setUploadFailed(true);
      return;
    }
    markUploadOffered(draft.id);
    // It lives in the library now; keeping a copy here too would just be a second, diverging version.
    clearLocalDraft();
    setDraftToUpload(null);
    await openSong(draft.id);
  }

  function skipUpload(draft: SongDocument) {
    markUploadOffered(draft.id);
    setDraftToUpload(null);
  }

  const flatSyllables = useMemo(() => deriveFlatSyllables(blocks, arrangement), [blocks, arrangement]);

  // Re-derives title/key/blocks/arrangement from hand-edited ChordPro text, so the visual chart
  // and Word doc export (both driven by blocks/arrangement, not the raw text) stay in sync with
  // manual edits instead of silently going stale.
  function applyChordProEdits(text: string, fallbackTitle = title, fallbackKey = key) {
    const parsed = parseChordProText(text, fallbackTitle, fallbackKey);
    setTitle(parsed.title);
    setKey(parsed.key);
    setBlocks(Object.fromEntries(parsed.blocks.map((b) => [b.id, b])));
    setArrangement(parsed.arrangement);
    if (parsed.credits) setCredits(parsed.credits);
  }

  function startOver() {
    // Signed in, the finished song stays in the library; signed out, the one draft is replaced.
    if (source === 'cloud') {
      void newLibrarySong();
      return;
    }
    loadDocument(emptySongDocument());
    clearLocalDraft();
  }

  // Back/forward and hand-edited addresses move between the public pages and the app.
  useEffect(() => {
    if (!publicStore) return;
    const sync = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  // Only publishers see Publish; the database enforces the same list on every write.
  useEffect(() => {
    if (!userId || !publicStore) return;
    let cancelled = false;
    publicStore
      .isPublisher()
      .then((allowed) => !cancelled && setIsPublisher(allowed))
      .catch(() => !cancelled && setIsPublisher(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function goToPublic(songId: string | null = null) {
    if (!route && !(await leaveLibrarySong())) return;
    window.history.pushState(null, '', songId ? `#/public/${songId}` : '#/public');
    setRoute({ kind: 'public', songId });
  }

  function leavePublic() {
    window.history.pushState(null, '', window.location.pathname + window.location.search);
    setRoute(null);
  }

  /** A private, editable copy of a public song, as the user's own version of the same song
   * (keeping its version name), opened in My Songs. */
  async function copyPublicSong(publicDoc: SongDocument) {
    if (!songStore) return;
    const copy: SongDocument = { ...publicDoc, id: newSongId(), step: 'export' };
    await songStore.save(copy);
    leavePublic();
    await openSong(copy.id);
  }

  /** Opens a version chosen from a song page's dropdown, in My Songs or in Public songs. */
  function openVersion(version: VersionRef) {
    if (version.kind === 'public') {
      void goToPublic(version.id);
      return;
    }
    if (route) leavePublic();
    void openSong(version.id);
  }

  /** Copies the open library version under a new name, as another version of the same song. */
  async function newVersion(name: string) {
    if (!songStore) return;
    const copy: SongDocument = { ...doc, id: newSongId(), versionName: name };
    await songStore.save(copy);
    await openSong(copy.id);
  }

  /** Deletes the open library version, then opens another of the user's versions of the same
   * song, or goes back to My Songs if that was the last. */
  async function deleteVersion() {
    if (!songStore || !(await leaveLibrarySong())) return;
    await songStore.delete(songId);
    const others = (await songStore.listVersions(workId)).filter((v) => v.id !== songId);
    if (others.length > 0) await openSong(others[0].id);
    else {
      setScreen('library');
      rememberOpenSong(null);
    }
  }

  // Signed in, only a library song is ever shown in the editor — never the local draft for a
  // moment while switching over, where an edit would end up in the wrong place.
  const showEditor = !route && auth.status !== 'loading' && (userId ? editingLibrarySong : source === 'local');

  function toggleMenu(open = !menuOpen) {
    setMenuOpen(open);
    rememberMenuOpen(open);
  }

  return (
    <div className={`layout ${menuOpen ? 'menu-open' : ''}`}>
      <SideMenu
        open={menuOpen}
        onClose={() => toggleMenu(false)}
        items={[
          {
            label: userId ? 'My songs' : 'My song',
            active: !route && screen !== 'sets' && screen !== 'set',
            onSelect: () => {
              if (route) leavePublic();
              if (userId) void showLibrary();
            },
          },
          ...(setStore && userId
            ? [
                {
                  label: 'Sets',
                  active: !route && (screen === 'sets' || screen === 'set'),
                  onSelect: () => {
                    if (route) leavePublic();
                    void showSets();
                  },
                },
              ]
            : []),
          ...(publicStore ? [{ label: 'Public songs', active: route?.kind === 'public', onSelect: () => void goToPublic() }] : []),
        ]}
      />
      <div className="app">
        <header className="app-header">
          <SideMenuToggle open={menuOpen} onToggle={() => toggleMenu()} />
          <h1 title="Rehearsing for Eternity">
            <img className="app-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
            R4E ChordPro
          </h1>
          <div className="header-right">
            {showEditor && (
              <ol className="steps">
                {(['input', 'edit-syllables', 'chords', 'export'] as Step[]).map((s, i) => (
                  <li key={s} className={s === step ? 'active' : undefined}>
                    {i + 1}
                  </li>
                ))}
              </ol>
            )}
            {auth.status === 'signedOut' && (
              <button className="secondary" onClick={() => setShowSignIn(true)}>
                Sign in
              </button>
            )}
            {auth.status === 'signedIn' && (
              <div className="account">
                <span className="account-email" title={auth.user.email}>
                  {auth.user.email}
                </span>
                <button className="secondary" onClick={() => void handleSignOut()}>
                  Sign out
                </button>
              </div>
            )}
            <ThemeSwitch />
          </div>
        </header>

        {showSignIn && auth.status === 'signedOut' && <SignInDialog onClose={() => setShowSignIn(false)} />}

        {draftToUpload && (
          <div className="arrangement-overlay">
            <div className="arrangement-panel dialog-panel" role="dialog" aria-modal="true">
              <h2>Add your song to your library?</h2>
              <p className="hint">
                &ldquo;{draftToUpload.title.trim() || 'Untitled'}&rdquo; was saved in this browser before you signed in.
                Add it to your library so you can open it on any device. If you don&rsquo;t, it stays here and comes
                back when you sign out.
              </p>
              {uploadFailed && <p className="hint library-error">Couldn&rsquo;t upload it. Check your connection and try again.</p>}
              <div className="actions">
                <button onClick={() => void uploadDraft(draftToUpload)}>Add to library</button>
                <button className="secondary" onClick={() => skipUpload(draftToUpload)}>
                  Not now
                </button>
              </div>
            </div>
          </div>
        )}

        {!route && (auth.status === 'loading' || (userId && screen === 'opening')) && <p className="hint">Loading&hellip;</p>}

        {route?.kind === 'set' && setStore && <SharedSetPage key={route.token} store={setStore} token={route.token} />}

        {!route && setStore && userId && screen === 'sets' && (
          <SetList
            store={setStore}
            onOpen={(id) => {
              setOpenSet({ id });
              setScreen('set');
            }}
            onNew={newSet}
          />
        )}
        {!route && setStore && songStore && userId && screen === 'set' && openSet && (
          <SetEditor
            key={openSet.id}
            setStore={setStore}
            songStore={songStore}
            setId={openSet.id}
            initialSet={openSet.initial}
            onBack={() => setScreen('sets')}
          />
        )}

        {route?.kind === 'public' && publicStore && route.songId && (
          <PublicSongPage
            key={route.songId}
            store={publicStore}
            id={route.songId}
            userId={userId}
            onBack={() => void goToPublic()}
            onCopyToLibrary={copyPublicSong}
            onSignIn={() => setShowSignIn(true)}
            songStore={userId ? songStore : null}
            onSelectVersion={openVersion}
          />
        )}
        {route?.kind === 'public' && publicStore && !route.songId && (
          <PublicSongList store={publicStore} onOpen={(id) => void goToPublic(id)} />
        )}

        {!route && songStore && userId && screen === 'library' && (
          <SongLibrary
            store={songStore}
            message={libraryMessage}
            onOpen={(id) => void openSong(id)}
            onNew={() => void newLibrarySong()}
            publicStore={isPublisher ? publicStore : null}
            onViewPublic={(id) => void goToPublic(id)}
          />
        )}

        {!route && userId && screen === 'view' && (
          <SongSheet
            key={songId}
            title={title}
            songKey={key}
            onSongKeyChange={setKey}
            blocks={blocks}
            arrangement={arrangement}
            credits={credits}
            fontId={chartFontId}
            onFontIdChange={setChartFontId}
            lineSpacing={chartLineSpacing}
            onLineSpacingChange={setChartLineSpacing}
            back={
              <button className="secondary" onClick={() => void showLibrary()}>
                &larr; My songs
              </button>
            }
            versions={
              <VersionPicker
                // Reloads the list when a version is added, removed or moved to another song.
                key={`${songId}:${workId}`}
                workId={workId}
                current={{ kind: 'own', id: songId }}
                currentName={versionName}
                songStore={songStore}
                publicStore={publicStore}
                onSelect={openVersion}
                ownActions={{ onNew: newVersion, onRename: setVersionName, onDelete: deleteVersion, onMove: setWorkId }}
              />
            }
            actions={
              <>
                {autosave.status === 'error' && (
                  <span className="save-status save-status-error" role="status">
                    Couldn&rsquo;t save{' '}
                    <button className="link-button" onClick={() => void autosave.flush()}>
                      Retry
                    </button>
                  </span>
                )}
                {isPublisher && publicStore && (
                  <PublishControl
                    store={publicStore}
                    doc={doc}
                    onViewPublic={(id) => void goToPublic(id)}
                    onVersionNameChange={setVersionName}
                  />
                )}
                <button onClick={() => setScreen('editor')}>Edit</button>
              </>
            }
          />
        )}

        {showEditor && (
          // Keyed by song so each screen's own state (typed-but-unsubmitted text, scroll, selection)
          // starts fresh when a different song is opened instead of carrying over.
          <div key={songId}>
            {draftSaveFailed && source === 'local' && (
              <p className="hint draft-save-warning">
                Your browser's storage for this site is full, so this song isn't being saved &mdash; it will be lost if you
                reload or close the page. Export it before leaving.
              </p>
            )}

            <div className="toolbar">
              <button
                className="secondary"
                disabled={arrangement.length === 0}
                onClick={() => setShowArrangement(true)}
              >
                Arrange sections
              </button>
              <button className="secondary" disabled={arrangement.length === 0} onClick={() => setShowChart(true)}>
                View chart
              </button>
              <button
                className="secondary"
                disabled={new Set(blockIdsOf(arrangement)).size < 2}
                onClick={() => setShowCopyChords(true)}
              >
                Copy chords
              </button>
              {step !== 'input' && (
                <button className="secondary" onClick={() => setShowCredits(true)}>
                  Credits
                </button>
              )}
              {step !== 'input' && <KeyControl songKey={key} onChange={setKey} />}
              {editingLibrarySong && isPublisher && publicStore && (
                <PublishControl
                  store={publicStore}
                  doc={doc}
                  onViewPublic={(id) => void goToPublic(id)}
                  onVersionNameChange={setVersionName}
                />
              )}
              {editingLibrarySong && (
                <span className={`save-status save-status-${autosave.status}`} role="status">
                  {autosave.status === 'saved' && 'Saved'}
                  {autosave.status === 'saving' && 'Saving…'}
                  {autosave.status === 'error' && (
                    <>
                      Couldn&rsquo;t save{' '}
                      <button className="link-button" onClick={() => void autosave.flush()}>
                        Retry
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>

            {showArrangement && (
              <ArrangementEditor blocks={blocks} arrangement={arrangement} songKey={key} onChange={(b, a) => { setBlocks(b); setArrangement(a); }} onClose={() => setShowArrangement(false)} />
            )}

            {showCredits && (
              <div className="arrangement-overlay" onClick={() => setShowCredits(false)}>
                <div className="arrangement-panel dialog-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                  <div className="arrangement-panel-header">
                    <h2>Credits</h2>
                    <button className="secondary" onClick={() => setShowCredits(false)}>
                      Done
                    </button>
                  </div>
                  <p className="hint">Printed at the foot of every page of the chord chart.</p>
                  <CreditsFields credits={credits} onChange={setCredits} />
                </div>
              </div>
            )}

            {showCopyChords && (
              <CopyChordsDialog
                blocks={blocks}
                arrangement={arrangement}
                songKey={key}
                onApply={(block) => setBlocks((prev) => ({ ...prev, [block.id]: block }))}
                onClose={() => setShowCopyChords(false)}
              />
            )}

            {showChart && (
              <ChordChartView
                title={title}
                songKey={key}
                onSongKeyChange={setKey}
                blocks={blocks}
                arrangement={arrangement}
                fontId={chartFontId}
                onFontIdChange={setChartFontId}
                lineSpacing={chartLineSpacing}
                onLineSpacingChange={setChartLineSpacing}
                credits={credits}
                onClose={() => setShowChart(false)}
              />
            )}

            {step === 'input' && (
              <LyricsInput
                initialTitle={title}
                initialKey={key}
                initialLyrics={lyrics}
                credits={credits}
                onCreditsChange={setCredits}
                onChange={(t, k, l) => {
                  setTitle(t);
                  setKey(k);
                  setLyrics(l);
                }}
                onImportChordPro={(t, k, text) => {
                  // Already a chart: keep the text as the lyrics (for Back) and go straight to export.
                  setLyrics(text);
                  setWordGroups([]);
                  setSections([]);
                  applyChordProEdits(text, t, k);
                  setStep('export');
                }}
                onSubmit={(t, k, l) => {
                  setTitle(t);
                  setKey(k);
                  setLyrics(l);
                  const { groups, sections: parsedSections } = parseLyricsToWordGroups(l);
                  // Unchanged words keep the syllable splits fixed on the next step last time.
                  setWordGroups(carryOverWordGroups(wordGroups, groups));
                  setSections(parsedSections);
                  setStep('edit-syllables');
                }}
              />
            )}

            {step === 'edit-syllables' && (
              <SyllableEditor
                initialGroups={wordGroups}
                sections={sections}
                onBack={() => setStep('input')}
                onSubmit={(groups) => {
                  setWordGroups(groups);
                  const built = wordGroupsToBlocks(groups, sections, key);
                  // Chords, chord slots and the arrangement from before stay wherever the lyrics still match.
                  const carried = carryOverBlocks(blocks, arrangement, built.blocks, built.arrangement);
                  setBlocks(Object.fromEntries(carried.blocks.map((b) => [b.id, b])));
                  setArrangement(carried.arrangement);
                  setCarryReport(carried.report);
                  setStep('chords');
                }}
              />
            )}

            {step === 'chords' && carryReport && carryReport.kept + carryReport.dropped > 0 && (
              <p className="hint carry-report" role="status">
                Kept {carryReport.kept} of {carryReport.kept + carryReport.dropped}{' '}
                {carryReport.kept + carryReport.dropped === 1 ? 'chord' : 'chords'} from before.
                {carryReport.dropped > 0 &&
                  ` ${carryReport.dropped} ${carryReport.dropped === 1 ? 'was' : 'were'} on lyrics that are gone now.`}{' '}
                <button className="link-button" onClick={() => setCarryReport(null)}>
                  Dismiss
                </button>
              </p>
            )}

            {step === 'chords' && (
              <ChordTapper
                syllables={flatSyllables}
                songKey={key}
                palette={palette}
                onPaletteChange={setPalette}
                onUpdateBlocks={setBlocks}
                onBack={() => setStep('edit-syllables')}
                onSubmit={() => setStep('export')}
              />
            )}

            {step === 'export' && (
              <ExportView
                // The ChordPro text is generated once and then freely editable, so remount on a key
                // change to regenerate it with the transposed chords instead of leaving it stale.
                key={key}
                song={{ title, key, syllables: flatSyllables, credits }}
                blocks={blocks}
                arrangement={arrangement}
                fontId={chartFontId}
                onFontIdChange={setChartFontId}
                lineSpacing={chartLineSpacing}
                onLineSpacingChange={setChartLineSpacing}
                onApplyChordPro={applyChordProEdits}
                onBack={() => setStep('chords')}
                onStartOver={startOver}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
