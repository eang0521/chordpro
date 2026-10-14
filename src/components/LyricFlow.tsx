import { useEffect, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { KeyName, SyllableToken } from '../types';
import { formatChord, transposeKey } from '../lib/musicTheory';
import { buildRows } from '../lib/lyricRows';

interface Props {
  syllables: SyllableToken[];
  currentIndex: number;
  /** First and last index of a highlighted range, if more than the current syllable is highlighted. */
  selection?: [number, number] | null;
  /**
   * How to follow the current syllable: 'center' keeps its line in the middle (for tapping
   * through the song); 'reveal' only scrolls when the line is off-screen, and then just enough to
   * show it (for clicking and highlighting, so the lyrics don't jump out from under the mouse).
   */
  scrollMode?: 'center' | 'reveal';
  songKey?: KeyName;
  showChords?: boolean;
  onSyllableMouseDown?: (index: number, e: MouseEvent) => void;
  onSyllableMouseEnter?: (index: number) => void;
}

/** Walks up from an element to find its nearest vertically-scrollable ancestor. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

/** Shared flowing lyric renderer used by the chord tapper. */
export function LyricFlow({
  syllables,
  currentIndex,
  selection,
  scrollMode = 'center',
  songKey,
  showChords = false,
  onSyllableMouseDown,
  onSyllableMouseEnter,
}: Props) {
  const currentLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (currentIndex < 0) return;
    const lineEl = currentLineRef.current;
    if (!lineEl) return;

    // Scroll only the nearest scrollable ancestor (the lyric panel), never the page itself,
    // and clamp so we never scroll past the top/bottom of the content.
    const container = findScrollParent(lineEl);
    if (!container) {
      lineEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();
    const offsetWithinContainer = lineRect.top - containerRect.top + container.scrollTop;
    let target: number;
    if (scrollMode === 'reveal') {
      // Leave it alone while it's on screen; otherwise bring it just inside the nearer edge.
      const margin = 8;
      if (lineRect.top >= containerRect.top + margin && lineRect.bottom <= containerRect.bottom - margin) return;
      target =
        lineRect.top < containerRect.top + margin
          ? offsetWithinContainer - margin
          : offsetWithinContainer + lineRect.height - container.clientHeight + margin;
    } else {
      target = offsetWithinContainer - container.clientHeight / 2 + lineRect.height / 2;
    }
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const clamped = Math.max(0, Math.min(maxScroll, target));
    container.scrollTo({ top: clamped, behavior: 'smooth' });
    // Follows the cursor only; scrollMode is read at the time it moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const rows = buildRows(syllables);
  const currentRowIndex = rows.findIndex((row) => row.kind === 'line' && row.indexes.includes(currentIndex));
  const interactive = !!onSyllableMouseDown;

  function renderSyllable(i: number, isLineFirst: boolean): ReactNode {
    const syl = syllables[i];
    const nodes: ReactNode[] = [];
    if (!isLineFirst && syl.isWordStart) nodes.push(' ');

    const chordLabel =
      showChords && songKey && syl.chord
        ? `${syl.bar ? '| ' : ''}${formatChord(transposeKey(songKey, syl.keyShift ?? 0), syl.chord)}`
        : null;

    const classes = ['syllable'];
    if (syl.isChordSlot) classes.push('syllable-slot');
    if (i === currentIndex) classes.push('current');
    else if (selection && i >= selection[0] && i <= selection[1]) classes.push('selected');
    else if (i < currentIndex) classes.push('past');

    nodes.push(
      <span
        className={`syl-wrap ${interactive ? 'syl-wrap-clickable' : ''}`}
        key={syl.id}
        onMouseDown={onSyllableMouseDown ? (e) => onSyllableMouseDown(i, e) : undefined}
        onMouseEnter={onSyllableMouseEnter ? () => onSyllableMouseEnter(i) : undefined}
      >
        {showChords && (
          <span className={`chord-label ${chordLabel ? '' : 'chord-label-empty'}`}>{chordLabel ?? ''}</span>
        )}
        <span className={classes.join(' ')}>{syl.isChordSlot ? ' ' : syl.text}</span>
      </span>,
    );
    return nodes;
  }

  return (
    <div className="lyric-flow">
      {rows.map((row, ri) =>
        row.kind === 'keyChange' ? (
          <div className="key-change-heading" key={row.key}>
            Key change{songKey ? <> to {transposeKey(songKey, row.keyShift)}</> : null}
          </div>
        ) : row.kind === 'section' ? (
          <div className={`section-heading section-${row.section.type}`} key={row.key}>
            {row.section.label}
          </div>
        ) : (
          <div className="lyric-line-row" key={row.key} ref={ri === currentRowIndex ? currentLineRef : undefined}>
            {row.indexes.map((i, idxInLine) => renderSyllable(i, idxInLine === 0))}
          </div>
        ),
      )}
    </div>
  );
}
