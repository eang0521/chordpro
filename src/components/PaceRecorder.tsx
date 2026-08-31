import { useEffect, useRef, useState } from 'react';
import type { SyllableToken } from '../types';
import { LyricFlow } from './LyricFlow';

interface Props {
  syllables: SyllableToken[];
  onUpdateToken: (blockId: string, localIndex: number, updater: (tok: SyllableToken) => SyllableToken) => void;
  onBack: () => void;
  onSubmit: () => void;
  onSkip: () => void;
}

export function PaceRecorder({ syllables, onUpdateToken, onBack, onSubmit, onSkip }: Props) {
  const [index, setIndex] = useState(-1);
  const startRef = useRef<number | null>(null);

  const finished = index >= syllables.length - 1 && index !== -1;

  function tap() {
    if (finished) return;
    const now = performance.now();
    if (index === -1) {
      startRef.current = now;
      const first = syllables[0];
      onUpdateToken(first.blockId, first.localIndex, (tok) => ({ ...tok, offsetMs: 0 }));
      setIndex(0);
      return;
    }
    const nextIndex = index + 1;
    const offsetMs = startRef.current == null ? 0 : now - startRef.current;
    const next = syllables[nextIndex];
    onUpdateToken(next.blockId, next.localIndex, (tok) => ({ ...tok, offsetMs }));
    setIndex(nextIndex);
  }

  function restart() {
    syllables.forEach((s) => onUpdateToken(s.blockId, s.localIndex, (tok) => ({ ...tok, offsetMs: null })));
    setIndex(-1);
    startRef.current = null;
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        tap();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, finished, syllables]);

  return (
    <div className="panel">
      <h2>3. Record the pace</h2>
      <p className="hint">
        Press <kbd>Space</kbd> (or click the lyrics) once per syllable, at whatever pace you want the
        song sung. The gaps between your taps become the song's timing. Don't care about timing?{' '}
        <button className="link-button" onClick={onSkip}>
          Skip this step
        </button>{' '}
        and just place chords.
      </p>
      <div className="recorder-status">
        {index === -1 && <span>Ready &mdash; first tap starts the clock.</span>}
        {index >= 0 && !finished && (
          <span>
            Syllable {index + 1} / {syllables.length}
          </span>
        )}
        {finished && <span>Done &mdash; all {syllables.length} syllables timed.</span>}
      </div>
      <div className="tap-zone" onClick={tap}>
        <LyricFlow syllables={syllables} currentIndex={index} />
      </div>
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button className="secondary" onClick={restart}>
          Restart recording
        </button>
        <button disabled={!finished} onClick={onSubmit}>
          Continue to chords &rarr;
        </button>
      </div>
    </div>
  );
}
