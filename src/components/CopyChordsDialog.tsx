import { useMemo, useState } from 'react';
import type { ArrangementEntry, Block, Chord, KeyName, SyllableToken } from '../types';
import type { BlockMap } from '../lib/arrangement';
import { blockIdsOf } from '../lib/arrangement';
import type { LineMapping } from '../lib/copyChords';
import { applyCopy, defaultMappings, previewLine, splitLines } from '../lib/copyChords';
import { formatChord } from '../lib/musicTheory';

interface Props {
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
  songKey: KeyName;
  onApply: (block: Block) => void;
  onClose: () => void;
}

const TYPE_NAMES = { verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', instrumental: 'Instrumental', other: 'Section' };

function hasChords(block: Block): boolean {
  return block.syllables.some((s) => s.chord);
}

/** Picks a sensible starting pair: the first section with chords, copied onto the next section of
 * the same type (preferring one that has no chords yet). */
function defaultPair(ids: string[], blocks: BlockMap): [string, string] {
  const source = ids.find((id) => hasChords(blocks[id])) ?? ids[0];
  const others = ids.filter((id) => id !== source);
  const sameType = others.filter((id) => blocks[id].type === blocks[source].type);
  const target = sameType.find((id) => !hasChords(blocks[id])) ?? sameType[0] ?? others[0];
  return [source, target];
}

function renderLine(tokens: SyllableToken[], chords: (Chord | null)[], bars: boolean[], songKey: KeyName) {
  return tokens.map((tok, i) => (
    <span key={tok.id}>
      {i > 0 && tok.isWordStart ? ' ' : null}
      <span className="syl-wrap">
        <span className={`chord-label ${chords[i] ? '' : 'chord-label-empty'}`}>
          {chords[i] ? `${bars[i] ? '| ' : ''}${formatChord(songKey, chords[i])}` : ''}
        </span>
        <span className={`syllable past ${tok.isChordSlot ? 'syllable-slot' : ''}`}>{tok.text}</span>
      </span>
    </span>
  ));
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function CopyChordsDialog({ blocks, arrangement, songKey, onApply, onClose }: Props) {
  // Each block once, in the order it first appears in the song.
  const blockIds = useMemo(
    () => [...new Set(blockIdsOf(arrangement))].filter((id) => blocks[id] && blocks[id].syllables.length > 0),
    [arrangement, blocks],
  );

  // Names sections for the pickers, numbering any that would otherwise read the same.
  const names = useMemo(() => {
    const base = blockIds.map((id) => blocks[id].label || TYPE_NAMES[blocks[id].type]);
    return new Map(
      blockIds.map((id, i) => {
        const same = base.filter((b) => b === base[i]).length;
        const nth = base.slice(0, i + 1).filter((b) => b === base[i]).length;
        return [id, same > 1 ? `${base[i]} (${nth})` : base[i]];
      }),
    );
  }, [blockIds, blocks]);

  const [initialSource, initialTarget] = defaultPair(blockIds, blocks);
  const [sourceId, setSourceId] = useState(initialSource);
  const [targetId, setTargetId] = useState(initialTarget);
  const source = blocks[sourceId];
  const target = blocks[targetId];
  const sourceLines = useMemo(() => splitLines(source), [source]);
  const targetLines = useMemo(() => splitLines(target), [target]);
  const [mappings, setMappings] = useState<LineMapping[]>(() =>
    defaultMappings(sourceLines.length, targetLines.length),
  );

  function choose(nextSource: string, nextTarget: string) {
    setSourceId(nextSource);
    setTargetId(nextTarget);
    setMappings(defaultMappings(splitLines(blocks[nextSource]).length, splitLines(blocks[nextTarget]).length));
  }

  function updateMapping(line: number, change: Partial<LineMapping>) {
    setMappings((prev) => prev.map((m, i) => (i === line ? { ...m, ...change } : m)));
  }

  const previews = targetLines.map((line, i) => {
    const m = mappings[i];
    return m?.sourceLine != null ? previewLine(sourceLines[m.sourceLine], line, m.shift) : null;
  });

  const mismatched = previews.filter((p) => p?.mismatch).length;
  const droppedTotal = previews.reduce((sum, p) => sum + (p?.dropped ?? 0), 0);
  const skipped = previews.filter((p) => !p).length;
  const lineCountDiffers = sourceLines.length !== targetLines.length;
  const linkedCount = arrangement.filter((id) => id === targetId).length;
  const sameBlock = sourceId === targetId;

  function apply() {
    onApply(applyCopy(source, target, mappings));
    onClose();
  }

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel copy-chords-panel" onClick={(e) => e.stopPropagation()}>
        <div className="arrangement-panel-header">
          <h2>Copy chords</h2>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="hint">
          Copies chords syllable-for-syllable from one section onto another. If a line has a different number of
          syllables, pick which source line it takes chords from, or shift its chords earlier or later until they
          line up. Copied lines replace the chords already on them.
        </p>

        <div className="copy-chords-pickers">
          <label>
            <span>From</span>
            <select value={sourceId} onChange={(e) => choose(e.target.value, targetId)}>
              {blockIds.map((id) => (
                <option key={id} value={id}>
                  {names.get(id)}
                  {hasChords(blocks[id]) ? '' : ' (no chords)'}
                </option>
              ))}
            </select>
          </label>
          <span className="copy-chords-arrow">&rarr;</span>
          <label>
            <span>To</span>
            <select value={targetId} onChange={(e) => choose(sourceId, e.target.value)}>
              {blockIds.map((id) => (
                <option key={id} value={id}>
                  {names.get(id)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sameBlock ? (
          <p className="copy-chords-alert">Pick two different sections.</p>
        ) : (
          <>
            {(mismatched > 0 || droppedTotal > 0 || lineCountDiffers) && (
              <div className="copy-chords-alert" role="alert">
                {lineCountDiffers && (
                  <div>
                    {names.get(sourceId)} has {pluralize(sourceLines.length, 'line')} but {names.get(targetId)} has{' '}
                    {targetLines.length}.
                  </div>
                )}
                {mismatched > 0 && (
                  <div>
                    {pluralize(mismatched, 'line')} {mismatched === 1 ? 'has' : 'have'} a different syllable count
                    &mdash; check the chords land where you want them.
                  </div>
                )}
                {droppedTotal > 0 && (
                  <div>
                    {pluralize(droppedTotal, 'chord')} won&rsquo;t fit and will be left out &mdash; shift the line to
                    bring {droppedTotal === 1 ? 'it' : 'them'} back.
                  </div>
                )}
              </div>
            )}
            {mismatched === 0 && droppedTotal === 0 && !lineCountDiffers && (
              <p className="copy-chords-ok">Every line has the same number of syllables.</p>
            )}
            {linkedCount > 1 && (
              <p className="hint">
                {names.get(targetId)} appears {linkedCount} times in the song &mdash; every occurrence gets the chords.
              </p>
            )}

            <div className="copy-lines">
              {targetLines.map((line, i) => {
                const m = mappings[i];
                const preview = previews[i];
                const from = m.sourceLine != null ? sourceLines[m.sourceLine] : null;
                const status = !preview
                  ? 'skipped'
                  : preview.dropped > 0 || preview.mismatch
                    ? 'warn'
                    : 'ok';
                return (
                  <div className={`copy-line copy-line-${status}`} key={line[0].id}>
                    <div className="copy-line-controls">
                      <strong>Line {i + 1}</strong>
                      <select
                        value={m.sourceLine ?? ''}
                        onChange={(e) =>
                          updateMapping(i, {
                            sourceLine: e.target.value === '' ? null : Number(e.target.value),
                            shift: 0,
                          })
                        }
                        aria-label={`Source line for line ${i + 1}`}
                      >
                        {sourceLines.map((_, si) => (
                          <option key={si} value={si}>
                            from line {si + 1}
                          </option>
                        ))}
                        <option value="">don&rsquo;t copy</option>
                      </select>
                      {from && (
                        <span className="copy-shift">
                          <button
                            className="secondary"
                            onClick={() => updateMapping(i, { shift: m.shift - 1 })}
                            disabled={m.shift <= -from.length + 1}
                            aria-label="Shift chords one syllable earlier"
                            title="Shift chords one syllable earlier"
                          >
                            &#9664;
                          </button>
                          <span className="copy-shift-value">
                            {m.shift === 0 ? 'no shift' : `shift ${m.shift > 0 ? '+' : ''}${m.shift}`}
                          </span>
                          <button
                            className="secondary"
                            onClick={() => updateMapping(i, { shift: m.shift + 1 })}
                            disabled={m.shift >= line.length - 1}
                            aria-label="Shift chords one syllable later"
                            title="Shift chords one syllable later"
                          >
                            &#9654;
                          </button>
                        </span>
                      )}
                      {preview && (
                        <span className="copy-line-status">
                          {preview.mismatch
                            ? `${from!.length} → ${line.length} syllables`
                            : `${line.length} syllables`}
                          {preview.dropped > 0 && ` · ${pluralize(preview.dropped, 'chord')} left out`}
                        </span>
                      )}
                    </div>
                    {from && (
                      <div className="copy-lyrics copy-lyrics-source">
                        {renderLine(from, from.map((t) => t.chord), from.map((t) => !!t.bar), songKey)}
                      </div>
                    )}
                    <div className="copy-lyrics">
                      {preview
                        ? renderLine(line, preview.chords, preview.bars, songKey)
                        : renderLine(line, line.map((t) => t.chord), line.map((t) => !!t.bar), songKey)}
                    </div>
                  </div>
                );
              })}
            </div>
            {sourceLines.length > targetLines.length && (
              <p className="hint">
                {names.get(sourceId)}&rsquo;s extra {sourceLines.length - targetLines.length === 1 ? 'line' : 'lines'}{' '}
                won&rsquo;t be copied unless you pick {sourceLines.length - targetLines.length === 1 ? 'it' : 'them'}{' '}
                for a line above.
              </p>
            )}
          </>
        )}

        <div className="actions">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={sameBlock || skipped === targetLines.length} onClick={apply}>
            Copy chords to {names.get(targetId)}
          </button>
        </div>
      </div>
    </div>
  );
}
