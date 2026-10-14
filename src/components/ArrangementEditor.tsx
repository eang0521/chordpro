import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ArrangementEntry, Block, KeyName, SectionType } from '../types';
import type { BlockMap } from '../lib/arrangement';
import {
  blockIdsOf,
  duplicateArrangementItem,
  isKeyChange,
  keyShiftBefore,
  makeKeyChange,
  moveArrangementItem,
  removeArrangementItem,
  unlinkArrangementItem,
} from '../lib/arrangement';
import { makeInstrumentalBlock } from '../lib/chordSlots';
import { KEY_NAMES, semitonesBetween, transposeKey } from '../lib/musicTheory';

interface Props {
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
  songKey: KeyName;
  onChange: (blocks: BlockMap, arrangement: ArrangementEntry[]) => void;
  onClose: () => void;
}

/** "up a whole step", "down a half step", ... for a change of `semitones` (0-11) up. */
function describeInterval(semitones: number): string {
  if (semitones === 0) return 'same key';
  const up = semitones <= 6;
  const steps = up ? semitones : 12 - semitones;
  const size = steps === 1 ? 'a half step' : steps === 2 ? 'a whole step' : `${steps} half steps`;
  return `${up ? 'up' : 'down'} ${size}`;
}

const TYPE_OPTIONS: { value: SectionType; label: string }[] = [
  { value: 'verse', label: 'Verse' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'other', label: 'Other' },
];

function previewText(block: Block): string {
  if (block.syllables.every((s) => s.isChordSlot)) return '(chords only)';
  let text = '';
  block.syllables.forEach((s, i) => {
    if (s.isWordStart && i !== 0) text += ' ';
    text += s.text;
  });
  if (!text) return '(no lyrics)';
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

export function ArrangementEditor({ blocks, arrangement, songKey, onChange, onClose }: Props) {
  const [draggedAt, setDraggedAt] = useState<number | null>(null);

  function move(from: number, to: number) {
    onChange(blocks, moveArrangementItem(arrangement, from, to));
  }

  function duplicate(at: number) {
    onChange(blocks, duplicateArrangementItem(arrangement, at));
  }

  function remove(at: number) {
    const result = removeArrangementItem(blocks, arrangement, at);
    onChange(result.blocks, result.arrangement);
  }

  function unlink(at: number) {
    const result = unlinkArrangementItem(blocks, arrangement, at);
    onChange(result.blocks, result.arrangement);
  }

  /** Adds a chord-only section (intro, turn, tag...) at the end; drag it where it belongs. */
  function addInstrumental() {
    const block = makeInstrumentalBlock();
    onChange({ ...blocks, [block.id]: block }, [...arrangement, block.id]);
  }

  /** Inserts a key change before position `at`, defaulting to up a whole step from the key there. */
  function addKeyChange(at: number) {
    const next = [...arrangement];
    next.splice(at, 0, makeKeyChange(keyShiftBefore(arrangement, at) + 2));
    onChange(blocks, next);
  }

  function setKeyChangeTarget(at: number, key: KeyName) {
    const next = arrangement.map((entry, i) =>
      i === at && isKeyChange(entry) ? { ...entry, semitones: semitonesBetween(songKey, key) } : entry,
    );
    onChange(blocks, next);
  }

  function renameBlock(blockId: string, label: string) {
    onChange({ ...blocks, [blockId]: { ...blocks[blockId], label } }, arrangement);
  }

  function retypeBlock(blockId: string, type: SectionType) {
    onChange({ ...blocks, [blockId]: { ...blocks[blockId], type } }, arrangement);
  }

  // How many times each block currently appears, so we can tell the user edits are shared.
  const occurrenceCounts = new Map<string, number>();
  blockIdsOf(arrangement).forEach((id) => occurrenceCounts.set(id, (occurrenceCounts.get(id) ?? 0) + 1));
  const sectionCount = blockIdsOf(arrangement).length;

  /** The parts every card shares: drag handle and up/down arrows. */
  function renderCard(i: number, key: string, extraClass: string, body: ReactNode, actions: ReactNode) {
    return (
      <div
        key={key}
        className={`arrangement-card ${extraClass} ${draggedAt === i ? 'dragging' : ''}`}
        draggable
        onDragStart={() => setDraggedAt(i)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (draggedAt !== null) move(draggedAt, i);
          setDraggedAt(null);
        }}
        onDragEnd={() => setDraggedAt(null)}
      >
        <span className="arrangement-card-handle" title="Drag to reorder">
          &#8942;&#8942;
        </span>
        <div className="arrangement-card-move">
          <button className="secondary arrangement-card-step" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up">
            &#9650;
          </button>
          <button
            className="secondary arrangement-card-step"
            disabled={i === arrangement.length - 1}
            onClick={() => move(i, i + 1)}
            aria-label="Move down"
          >
            &#9660;
          </button>
        </div>
        <div className="arrangement-card-body">{body}</div>
        <div className="arrangement-card-actions">{actions}</div>
      </div>
    );
  }

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel" onClick={(e) => e.stopPropagation()}>
        <div className="arrangement-panel-header">
          <h2>Arrange sections</h2>
          <button className="secondary" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="hint">
          Drag a card (or use the arrows) to reorder the song. Duplicate a section to reuse it elsewhere
          &mdash; every copy stays linked, so editing its lyrics or chords anywhere updates all
          of its occurrences. Need one copy to differ (e.g. a final chorus with a small change)? Click{' '}
          <strong>Unlink</strong> on it to give it its own independent content first. <strong>Key change</strong>{' '}
          adds a key change before a section; everything after it is played in the new key, chords included.
        </p>
        <button className="secondary arrangement-add" onClick={addInstrumental}>
          + Add instrumental section
        </button>
        <div className="arrangement-list">
          {arrangement.map((entry, i) => {
            if (isKeyChange(entry)) {
              const from = transposeKey(songKey, keyShiftBefore(arrangement, i));
              const to = transposeKey(songKey, entry.semitones);
              return renderCard(
                i,
                entry.id,
                'arrangement-key-change',
                <div className="arrangement-card-fields">
                  <span className="arrangement-key-change-title">Key change to</span>
                  <select value={to} onChange={(e) => setKeyChangeTarget(i, e.target.value as KeyName)} aria-label="New key">
                    {KEY_NAMES.map((k) => (
                      <option key={k} value={k}>
                        {k} Major
                      </option>
                    ))}
                  </select>
                  <span className="arrangement-card-preview">
                    from {from}, {describeInterval(semitonesBetween(from, to))}
                  </span>
                </div>,
                <button className="secondary" onClick={() => remove(i)}>
                  Remove
                </button>,
              );
            }
            const blockId = entry;
            const block = blocks[blockId];
            if (!block) return null;
            const linked = (occurrenceCounts.get(blockId) ?? 0) > 1;
            return renderCard(
              i,
              `${blockId}-${i}`,
              '',
              <>
                <div className="arrangement-card-fields">
                  <select
                    className={`section-select section-${block.type}`}
                    value={block.type}
                    onChange={(e) => retypeBlock(blockId, e.target.value as SectionType)}
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="arrangement-label-input"
                    value={block.label}
                    placeholder="Label (e.g. Verse 1)"
                    onChange={(e) => renameBlock(blockId, e.target.value)}
                  />
                  {linked && <span className="arrangement-linked-badge">linked</span>}
                </div>
                <div className="arrangement-card-preview">{previewText(block)}</div>
              </>,
              <>
                <button className="secondary" onClick={() => duplicate(i)}>
                  Duplicate
                </button>
                {linked && (
                  <button className="secondary" onClick={() => unlink(i)}>
                    Unlink
                  </button>
                )}
                <button className="secondary" onClick={() => addKeyChange(i)} title="Change key before this section">
                  Key change
                </button>
                <button className="secondary" onClick={() => remove(i)} disabled={sectionCount <= 1}>
                  Remove
                </button>
              </>,
            );
          })}
        </div>
      </div>
    </div>
  );
}
