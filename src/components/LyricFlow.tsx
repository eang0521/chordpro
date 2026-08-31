import type { ReactNode } from 'react';
import type { KeyName, SyllableToken } from '../types';
import { resolveChordLabel } from '../lib/musicTheory';

interface Props {
  syllables: SyllableToken[];
  currentIndex: number;
  songKey?: KeyName;
  showChords?: boolean;
  onSyllableClick?: (index: number) => void;
}

/** Shared flowing lyric renderer used by the recorder and the playback/chord editor. */
export function LyricFlow({ syllables, currentIndex, songKey, showChords = false, onSyllableClick }: Props) {
  const nodes: ReactNode[] = [];

  syllables.forEach((syl, i) => {
    if (syl.section) {
      nodes.push(
        <div className={`section-heading section-${syl.section.type}`} key={`section-${syl.id}`}>
          {syl.section.label}
        </div>,
      );
    } else if (syl.isLineStart && i !== 0) {
      nodes.push(<br key={`br-${syl.id}`} />);
    } else if (syl.isWordStart && i !== 0) {
      nodes.push(' ');
    }

    const chordLabel =
      showChords && songKey && syl.chordDegrees.length > 0
        ? resolveChordLabel(songKey, syl.chordDegrees)
        : null;

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
  });

  return <div className="lyric-flow">{nodes}</div>;
}
