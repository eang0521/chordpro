import { useState } from 'react';
import type { Block, SectionType } from '../types';
import type { BlockMap } from '../lib/arrangement';
import { duplicateArrangementItem, moveArrangementItem, removeArrangementItem } from '../lib/arrangement';

interface Props {
  blocks: BlockMap;
  arrangement: string[];
  onChange: (blocks: BlockMap, arrangement: string[]) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: SectionType; label: string }[] = [
  { value: 'verse', label: 'Verse' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'other', label: 'Other' },
];

function previewText(block: Block): string {
  let text = '';
  block.syllables.forEach((s, i) => {
    if (s.isWordStart && i !== 0) text += ' ';
    text += s.text;
  });
  if (!text) return '(no lyrics)';
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

export function ArrangementEditor({ blocks, arrangement, onChange, onClose }: Props) {
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

  function renameBlock(blockId: string, label: string) {
    onChange({ ...blocks, [blockId]: { ...blocks[blockId], label } }, arrangement);
  }

  function retypeBlock(blockId: string, type: SectionType) {
    onChange({ ...blocks, [blockId]: { ...blocks[blockId], type } }, arrangement);
  }

  // How many times each block currently appears, so we can tell the user edits are shared.
  const occurrenceCounts = new Map<string, number>();
  arrangement.forEach((id) => occurrenceCounts.set(id, (occurrenceCounts.get(id) ?? 0) + 1));

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
          &mdash; every copy stays linked, so editing its lyrics, timing, or chords anywhere updates all
          of its occurrences.
        </p>
        <div className="arrangement-list">
          {arrangement.map((blockId, i) => {
            const block = blocks[blockId];
            if (!block) return null;
            const linked = (occurrenceCounts.get(blockId) ?? 0) > 1;
            return (
              <div
                key={`${blockId}-${i}`}
                className={`arrangement-card ${draggedAt === i ? 'dragging' : ''}`}
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
                  <button
                    className="secondary arrangement-card-step"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    aria-label="Move up"
                  >
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
                <div className="arrangement-card-body">
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
                </div>
                <div className="arrangement-card-actions">
                  <button className="secondary" onClick={() => duplicate(i)}>
                    Duplicate
                  </button>
                  <button className="secondary" onClick={() => remove(i)} disabled={arrangement.length <= 1}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
