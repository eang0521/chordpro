import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { KeyName, SyllableToken } from '../types';
import { resolveChordLabel } from '../lib/musicTheory';
import { buildRows } from '../lib/lyricRows';

interface Props {
  syllables: SyllableToken[];
  currentIndex: number;
  songKey?: KeyName;
  showChords?: boolean;
  onSyllableClick?: (index: number) => void;
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

/** Shared flowing lyric renderer used by the recorder and the playback/chord editor. */
export function LyricFlow({ syllables, currentIndex, songKey, showChords = false, onSyllableClick }: Props) {
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
    const target = offsetWithinContainer - container.clientHeight / 2 + lineRect.height / 2;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const clamped = Math.max(0, Math.min(maxScroll, target));
    container.scrollTo({ top: clamped, behavior: 'smooth' });
  }, [currentIndex]);

  const rows = buildRows(syllables);
  const currentRowIndex = rows.findIndex((row) => row.kind === 'line' && row.indexes.includes(currentIndex));

  function renderSyllable(i: number, isLineFirst: boolean): ReactNode {
    const syl = syllables[i];
    const nodes: ReactNode[] = [];
    if (!isLineFirst && syl.isWordStart) nodes.push(' ');

    const chordLabel =
      showChords && songKey && syl.chordDegrees.length > 0 ? resolveChordLabel(songKey, syl.chordDegrees) : null;

    const classes = ['syllable'];
    if (i === currentIndex) classes.push('current');
    else if (i < currentIndex) classes.push('past');

    nodes.push(
      <span
        className={`syl-wrap ${onSyllableClick ? 'syl-wrap-clickable' : ''}`}
        key={syl.id}
        onClick={onSyllableClick ? () => onSyllableClick(i) : undefined}
      >
        {showChords && (
          <span className={`chord-label ${chordLabel ? '' : 'chord-label-empty'}`}>{chordLabel ?? ''}</span>
        )}
        <span className={classes.join(' ')}>{syl.text}</span>
      </span>,
    );
    return nodes;
  }

  return (
    <div className="lyric-flow">
      {rows.map((row, ri) =>
        row.kind === 'section' ? (
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
