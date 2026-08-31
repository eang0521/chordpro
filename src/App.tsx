import { useEffect, useMemo, useState } from 'react';
import type { KeyName, Step, SyllableToken } from './types';
import type { Section, WordGroup } from './lib/syllables';
import { parseLyricsToWordGroups, wordGroupsToBlocks } from './lib/syllables';
import type { BlockMap } from './lib/arrangement';
import { deriveFlatSyllables, updateBlockToken } from './lib/arrangement';
import { LyricsInput } from './components/LyricsInput';
import { SyllableEditor } from './components/SyllableEditor';
import { PaceRecorder } from './components/PaceRecorder';
import { PlaybackChordEditor } from './components/PlaybackChordEditor';
import { ExportView } from './components/ExportView';
import { Metronome } from './components/Metronome';
import { ArrangementEditor } from './components/ArrangementEditor';
import { ChordChartView } from './components/ChordChartView';
import './App.css';

const STORAGE_KEY = 'chordpro-draft-v2';

interface StoredDraft {
  step: Step;
  title: string;
  key: KeyName;
  lyrics: string;
  wordGroups: WordGroup[];
  sections: Section[];
  blocks: BlockMap;
  arrangement: string[];
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
  const [showArrangement, setShowArrangement] = useState(false);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    const draft: StoredDraft = { step, title, key, lyrics, wordGroups, sections, blocks, arrangement };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [step, title, key, lyrics, wordGroups, sections, blocks, arrangement]);

  const flatSyllables = useMemo(() => deriveFlatSyllables(blocks, arrangement), [blocks, arrangement]);

  function updateToken(blockId: string, localIndex: number, updater: (tok: SyllableToken) => SyllableToken) {
    setBlocks((prev) => updateBlockToken(prev, blockId, localIndex, updater));
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
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>ChordPro Tapper</h1>
        <ol className="steps">
          {(['input', 'edit-syllables', 'record', 'playback', 'export'] as Step[]).map((s, i) => (
            <li key={s} className={s === step ? 'active' : undefined}>
              {i + 1}
            </li>
          ))}
        </ol>
      </header>

      <div className="toolbar">
        <Metronome />
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
      </div>

      {showArrangement && (
        <ArrangementEditor blocks={blocks} arrangement={arrangement} onChange={(b, a) => { setBlocks(b); setArrangement(a); }} onClose={() => setShowArrangement(false)} />
      )}

      {showChart && (
        <ChordChartView title={title} songKey={key} blocks={blocks} arrangement={arrangement} onClose={() => setShowChart(false)} />
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
            setStep('record');
          }}
        />
      )}

      {step === 'record' && (
        <PaceRecorder
          syllables={flatSyllables}
          onUpdateToken={updateToken}
          onBack={() => setStep('edit-syllables')}
          onSubmit={() => setStep('playback')}
          onSkip={() => setStep('playback')}
        />
      )}

      {step === 'playback' && (
        <PlaybackChordEditor
          syllables={flatSyllables}
          songKey={key}
          onUpdateToken={updateToken}
          onBack={() => setStep('record')}
          onSubmit={() => setStep('export')}
        />
      )}

      {step === 'export' && (
        <ExportView
          song={{ title, key, syllables: flatSyllables }}
          blocks={blocks}
          arrangement={arrangement}
          onBack={() => setStep('playback')}
          onStartOver={startOver}
        />
      )}
    </div>
  );
}

export default App;
