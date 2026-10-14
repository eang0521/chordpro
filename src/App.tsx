import { useEffect, useMemo, useState } from 'react';
import type { Chord, KeyName, Step } from './types';
import type { Section, WordGroup } from './lib/syllables';
import { parseLyricsToWordGroups, wordGroupsToBlocks } from './lib/syllables';
import type { BlockMap } from './lib/arrangement';
import { deriveFlatSyllables } from './lib/arrangement';
import { LyricsInput } from './components/LyricsInput';
import { SyllableEditor } from './components/SyllableEditor';
import { ChordTapper } from './components/ChordTapper';
import { ExportView } from './components/ExportView';
import { ArrangementEditor } from './components/ArrangementEditor';
import { ChordChartView } from './components/ChordChartView';
import { KeyControl } from './components/KeyControl';
import { CopyChordsDialog } from './components/CopyChordsDialog';
import { DEFAULT_CHORD_FONT_ID } from './lib/chordFonts';
import { parseChordProText } from './lib/chordproParser';
import './App.css';

const STORAGE_KEY = 'chordpro-draft-v4';
const DRAFT_KEY_PREFIX = 'chordpro-draft-';

interface StoredDraft {
  step: Step;
  title: string;
  key: KeyName;
  lyrics: string;
  wordGroups: WordGroup[];
  sections: Section[];
  blocks: BlockMap;
  arrangement: string[];
  palette: Chord[];
}

function loadDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed.blocks !== 'object' || !Array.isArray(parsed.arrangement)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Drafts saved by older versions of the app are never read again, so drop them — on GitHub Pages
 * the whole eang0521.github.io origin (every project hosted there) shares one ~5MB storage quota. */
function removeOldDrafts() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(DRAFT_KEY_PREFIX) && k !== STORAGE_KEY)
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // Storage unavailable (e.g. blocked in a private window) — nothing to clean up.
  }
}

/** Returns false instead of throwing when storage is full or unavailable, so a failed autosave
 * never takes the whole app down. */
function saveDraft(draft: StoredDraft): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

removeOldDrafts();
const initialDraft = loadDraft();

function App() {
  const [step, setStep] = useState<Step>(initialDraft?.step ?? 'input');
  const [title, setTitle] = useState(initialDraft?.title ?? '');
  const [key, setKey] = useState<KeyName>(initialDraft?.key ?? 'C');
  const [lyrics, setLyrics] = useState(initialDraft?.lyrics ?? '');
  const [wordGroups, setWordGroups] = useState<WordGroup[]>(initialDraft?.wordGroups ?? []);
  const [sections, setSections] = useState<Section[]>(initialDraft?.sections ?? []);
  const [blocks, setBlocks] = useState<BlockMap>(initialDraft?.blocks ?? {});
  const [arrangement, setArrangement] = useState<string[]>(initialDraft?.arrangement ?? []);
  const [palette, setPalette] = useState<Chord[]>(initialDraft?.palette ?? []);
  const [showArrangement, setShowArrangement] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showCopyChords, setShowCopyChords] = useState(false);
  // Shared with ExportView so the chord chart's font/spacing choice stays the same regardless of
  // which screen you download the .docx from, instead of each view defaulting independently.
  const [chartFontId, setChartFontId] = useState<string>(DEFAULT_CHORD_FONT_ID);
  const [chartLineSpacing, setChartLineSpacing] = useState(1);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);

  useEffect(() => {
    const draft: StoredDraft = { step, title, key, lyrics, wordGroups, sections, blocks, arrangement, palette };
    // Mirrors the outcome of a write to an external system (localStorage) into state, which is
    // exactly what an effect is for — there's no render-time way to know whether the save fit.
    // oxlint-disable-next-line react/set-state-in-effect
    setDraftSaveFailed(!saveDraft(draft));
  }, [step, title, key, lyrics, wordGroups, sections, blocks, arrangement, palette]);

  const flatSyllables = useMemo(() => deriveFlatSyllables(blocks, arrangement), [blocks, arrangement]);

  // Re-derives title/key/blocks/arrangement from hand-edited ChordPro text, so the visual chart
  // and Word doc export (both driven by blocks/arrangement, not the raw text) stay in sync with
  // manual edits instead of silently going stale.
  function applyChordProEdits(text: string) {
    const parsed = parseChordProText(text, title, key);
    setTitle(parsed.title);
    setKey(parsed.key);
    setBlocks(Object.fromEntries(parsed.blocks.map((b) => [b.id, b])));
    setArrangement(parsed.blocks.map((b) => b.id));
  }

  function startOver() {
    setStep('input');
    setTitle('');
    setKey('C');
    setLyrics('');
    setWordGroups([]);
    setSections([]);
    setBlocks({});
    setArrangement([]);
    setPalette([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable — there's no saved draft to clear.
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>ChordPro Tapper</h1>
        <ol className="steps">
          {(['input', 'edit-syllables', 'chords', 'export'] as Step[]).map((s, i) => (
            <li key={s} className={s === step ? 'active' : undefined}>
              {i + 1}
            </li>
          ))}
        </ol>
      </header>

      {draftSaveFailed && (
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
          disabled={new Set(arrangement).size < 2}
          onClick={() => setShowCopyChords(true)}
        >
          Copy chords
        </button>
        {step !== 'input' && <KeyControl songKey={key} onChange={setKey} />}
      </div>

      {showArrangement && (
        <ArrangementEditor blocks={blocks} arrangement={arrangement} onChange={(b, a) => { setBlocks(b); setArrangement(a); }} onClose={() => setShowArrangement(false)} />
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
          onClose={() => setShowChart(false)}
        />
      )}

      {step === 'input' && (
        <LyricsInput
          initialTitle={title}
          initialKey={key}
          initialLyrics={lyrics}
          onSubmit={(t, k, l) => {
            setTitle(t);
            setKey(k);
            setLyrics(l);
            const { groups, sections: parsedSections } = parseLyricsToWordGroups(l);
            setWordGroups(groups);
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
            const newBlocks = wordGroupsToBlocks(groups, sections);
            setBlocks(Object.fromEntries(newBlocks.map((b) => [b.id, b])));
            setArrangement(newBlocks.map((b) => b.id));
            setStep('chords');
          }}
        />
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
          song={{ title, key, syllables: flatSyllables }}
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
  );
}

export default App;
