import { useEffect, useRef, useState } from 'react';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;
const BEATS_PER_MEASURE = 4;
const MIN_BPM = 30;
const MAX_BPM = 300;

function getAudioContextCtor(): typeof AudioContext | null {
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function clampBpm(value: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
}

function playClick(ctx: AudioContext, time: number, accent: boolean) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1500 : 900;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.6, time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

/**
 * A simple audible metronome using the standard "lookahead" scheduling technique:
 * clicks are scheduled ~100ms ahead on the AudioContext clock and re-checked every 25ms,
 * which keeps it drift-free in a way a plain setInterval tick can't.
 */
export function useMetronome(initialBpm = 100) {
  const [bpm, setBpmState] = useState(clampBpm(initialBpm));
  const [running, setRunning] = useState(false);
  const [activeBeat, setActiveBeat] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatCountRef = useRef(0);
  const bpmRef = useRef(bpm);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  function scheduler() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
      const beat = beatCountRef.current % BEATS_PER_MEASURE;
      playClick(ctx, nextNoteTimeRef.current, beat === 0);
      const delayMs = Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000);
      window.setTimeout(() => setActiveBeat(beat), delayMs);
      nextNoteTimeRef.current += 60 / bpmRef.current;
      beatCountRef.current += 1;
    }
    timerRef.current = window.setTimeout(scheduler, LOOKAHEAD_MS);
  }

  function stop() {
    setRunning(false);
    setActiveBeat(null);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function start() {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    const ctx = audioCtxRef.current ?? new Ctor();
    audioCtxRef.current = ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    beatCountRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    setRunning(true);
    scheduler();
  }

  function toggle() {
    if (running) stop();
    else start();
  }

  function setBpm(value: number) {
    setBpmState(clampBpm(value));
  }

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      audioCtxRef.current?.close();
    },
    [],
  );

  return { bpm, setBpm, running, activeBeat, toggle, beatsPerMeasure: BEATS_PER_MEASURE, minBpm: MIN_BPM, maxBpm: MAX_BPM };
}
