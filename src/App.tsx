import { useEffect, useState } from 'react';
import type { KeyName, Step, SyllableToken } from './types';
import type { Section, WordGroup } from './lib/syllables';
import { parseLyricsToWordGroups, wordGroupsToSyllables } from './lib/syllables';
import { LyricsInput } from './components/LyricsInput';
import { SyllableEditor } from './components/SyllableEditor';
import { PaceRecorder } from './components/PaceRecorder';
import { PlaybackChordEditor } from './components/PlaybackChordEditor';
import { ExportView } from './components/ExportView';
import { Metronome } from './components/Metronome';
import './App.css';

const STORAGE_KEY = 'chordpro-draft-v1';

interface StoredDraft {
  step: Step;
  title: string;
  key: KeyName;
  lyrics: string;
  wordGroups: WordGroup[];
  sections: Section[];
  syllables: SyllableToken[];
}

function loadDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDraft;
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
  const [syllables, setSyllables] = useState<SyllableToken[]>(initialDraft?.syllables ?? []);

  useEffect(() => {
    const draft: StoredDraft = { step, title, key, lyrics, wordGroups, sections, syllables };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [step, title, key, lyrics, wordGroups, sections, syllables]);

  function startOver() {
    setStep('input');
    setTitle('');
    setKey('C');
    setLyrics('');
    setWordGroups([]);
    setSections([]);
    setSyllables([]);
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
      </div>

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
            setSyllables(wordGroupsToSyllables(groups, sections));
            setStep('record');
          }}
        />
      )}

      {step === 'record' && (
        <PaceRecorder
          syllables={syllables}
          onBack={() => setStep('edit-syllables')}
          onSubmit={(recorded) => {
            setSyllables(recorded);
            setStep('playback');
          }}
        />
      )}

      {step === 'playback' && (
        <PlaybackChordEditor
          syllables={syllables}
          songKey={key}
          onBack={() => setStep('record')}
          onSubmit={(finished) => {
            setSyllables(finished);
            setStep('export');
          }}
        />
      )}

      {step === 'export' && (
        <ExportView song={{ title, key, syllables }} onBack={() => setStep('playback')} onStartOver={startOver} />
      )}
    </div>
  );
}

export default App;
