import { useMetronome } from '../hooks/useMetronome';

export function Metronome() {
  const { bpm, setBpm, running, activeBeat, toggle, beatsPerMeasure, minBpm, maxBpm } = useMetronome(100);

  return (
    <div className="metronome">
      <button className="secondary metronome-toggle" onClick={toggle} aria-pressed={running}>
        {running ? 'Stop' : 'Metronome'} {running ? '⏹' : '▶'}
      </button>
      <div className="metronome-bpm">
        <button className="secondary metronome-step" onClick={() => setBpm(bpm - 5)} aria-label="Decrease tempo">
          &minus;
        </button>
        <input
          type="number"
          min={minBpm}
          max={maxBpm}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value) || minBpm)}
        />
        <span className="metronome-bpm-label">BPM</span>
        <button className="secondary metronome-step" onClick={() => setBpm(bpm + 5)} aria-label="Increase tempo">
          +
        </button>
      </div>
      <div className="metronome-beats">
        {Array.from({ length: beatsPerMeasure }).map((_, i) => (
          <span
            key={i}
            className={`metronome-dot ${i === 0 ? 'accent' : ''} ${running && activeBeat === i ? 'active' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}
