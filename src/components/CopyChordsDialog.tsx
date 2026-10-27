import { useMemo, useState } from 'react';
import type { ArrangementEntry, Block, KeyName, SyllableToken } from '../types';
import type { BlockMap } from '../lib/arrangement';
import { blockIdsOf } from '../lib/arrangement';
import type { LineMapping, LinePreview } from '../lib/copyChords';
import { applyCopy, defaultMappings, previewLine, splitLines } from '../lib/copyChords';
import { chordMarkLabel } from '../lib/chordSlots';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface Props {
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
  songKey: KeyName;
  /** Called once for each section copied onto. */
  onApply: (block: Block) => void;
  onClose: () => void;
}

const TYPE_NAMES = { verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', instrumental: 'Instrumental', other: 'Section' };
const TYPE_PLURALS = { verse: 'verses', chorus: 'choruses', bridge: 'bridges', instrumental: 'instrumentals', other: 'sections' };

function hasChords(block: Block): boolean {
  return block.syllables.some((s) => s.chord);
}

/** A sensible start: the first section with chords, copied onto every other section of the same
 * type (Verse 1 onto the other verses), or else onto the next section. */
function defaultSelection(ids: string[], blocks: BlockMap): [string, string[]] {
  const source = ids.find((id) => hasChords(blocks[id])) ?? ids[0];
  const others = ids.filter((id) => id !== source);
  const sameType = others.filter((id) => blocks[id].type === blocks[source].type);
  return [source, sameType.length > 0 ? sameType : others.slice(0, 1)];
}

function renderLine(tokens: SyllableToken[], songKey: KeyName) {
  return tokens.map((tok, i) => (
    <span key={tok.id}>
      {i > 0 && tok.isWordStart ? ' ' : null}
      <span className="syl-wrap">
        <span className={`chord-label ${chordMarkLabel(tok, songKey) ? '' : 'chord-label-empty'}`}>
          {chordMarkLabel(tok, songKey) ?? ''}
        </span>
        <span className={`syllable past ${tok.isChordSlot ? 'syllable-slot' : ''}`}>{tok.text}</span>
      </span>
    </span>
  ));
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** How copying onto one section would go, line by line, and what's worth a look. */
interface TargetPlan {
  lines: SyllableToken[][];
  mappings: LineMapping[];
  previews: (LinePreview | null)[];
  mismatched: number;
  dropped: number;
  skipped: number;
  lineCountDiffers: boolean;
  /** Something to check before copying: a line count or syllable count that differs, or chords
   * that won't fit. */
  needsLook: boolean;
}

function planFor(sourceLines: SyllableToken[][], target: Block, mappings: LineMapping[]): TargetPlan {
  const lines = splitLines(target);
  const previews = lines.map((line, i) => {
    const m = mappings[i];
    return m?.sourceLine != null ? previewLine(sourceLines[m.sourceLine], line, m.shift) : null;
  });
  const mismatched = previews.filter((p) => p?.mismatch).length;
  const dropped = previews.reduce((sum, p) => sum + (p?.dropped ?? 0), 0);
  const lineCountDiffers = sourceLines.length !== lines.length;
  return {
    lines,
    mappings,
    previews,
    mismatched,
    dropped,
    skipped: previews.filter((p) => !p).length,
    lineCountDiffers,
    needsLook: mismatched > 0 || dropped > 0 || lineCountDiffers,
  };
}

export function CopyChordsDialog({ blocks, arrangement, songKey, onApply, onClose }: Props) {
  useEscapeKey(onClose);
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

  const [initialSource, initialTargets] = defaultSelection(blockIds, blocks);
  const [sourceId, setSourceId] = useState(initialSource);
  const [targetIds, setTargetIds] = useState<string[]>(initialTargets);
  // Each target's line choices and shifts, once changed from the defaults.
  const [mappingsById, setMappingsById] = useState<Record<string, LineMapping[]>>({});
  // The target being looked at, and the ones already looked at.
  const [shownId, setShownId] = useState<string | null>(initialTargets[0] ?? null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set(initialTargets.slice(0, 1)));

  const source = blocks[sourceId];
  const sourceLines = useMemo(() => splitLines(source), [source]);
  const others = useMemo(() => blockIds.filter((id) => id !== sourceId), [blockIds, sourceId]);
  // In song order, whatever order they were ticked in.
  const targets = useMemo(() => others.filter((id) => targetIds.includes(id)), [others, targetIds]);

  const plans = useMemo(
    () =>
      new Map(
        targets.map((id) => {
          const mappings = mappingsById[id] ?? defaultMappings(sourceLines.length, splitLines(blocks[id]).length);
          return [id, planFor(sourceLines, blocks[id], mappings)];
        }),
      ),
    [targets, mappingsById, sourceLines, blocks],
  );

  const shown = shownId && plans.has(shownId) ? shownId : (targets[0] ?? null);
  const shownIndex = shown ? targets.indexOf(shown) : -1;

  function show(id: string | null) {
    setShownId(id);
    if (id) setSeen((prev) => new Set(prev).add(id));
  }

  function chooseSource(next: string) {
    setSourceId(next);
    setMappingsById({});
    // Copying from a section can't also copy onto it.
    const kept = targetIds.filter((id) => id !== next);
    setTargetIds(kept);
    setSeen(new Set(kept.slice(0, 1)));
    setShownId(kept[0] ?? null);
  }

  function setTargets(next: string[]) {
    setTargetIds(next);
    if (!shown || !next.includes(shown)) show(others.find((id) => next.includes(id)) ?? null);
  }

  function toggleTarget(id: string) {
    if (targetIds.includes(id)) setTargets(targetIds.filter((t) => t !== id));
    else {
      setTargetIds([...targetIds, id]);
      // A newly ticked section is shown straight away, ready to check.
      show(id);
    }
  }

  function updateMapping(id: string, line: number, change: Partial<LineMapping>) {
    const current = plans.get(id)!.mappings;
    setMappingsById((prev) => ({ ...prev, [id]: current.map((m, i) => (i === line ? { ...m, ...change } : m)) }));
  }

  function apply() {
    targets.forEach((id) => {
      const plan = plans.get(id)!;
      if (plan.skipped < plan.lines.length) onApply(applyCopy(source, blocks[id], plan.mappings));
    });
    onClose();
  }

  const sameType = others.filter((id) => blocks[id].type === source.type);
  const toCopy = targets.filter((id) => plans.get(id)!.skipped < plans.get(id)!.lines.length);
  const toCheck = targets.filter((id) => plans.get(id)!.needsLook);
  const unseenToCheck = toCheck.filter((id) => !seen.has(id));
  const plan = shown ? plans.get(shown)! : null;
  const linkedCount = shown ? arrangement.filter((id) => id === shown).length : 0;

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel copy-chords-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="arrangement-panel-header">
          <h2>Copy chords</h2>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="hint">
          Copies chords syllable-for-syllable from one section onto others, along with its chord slots (chords with no
          lyric under them, like a turnaround at the end of a line). If a line has a different number of syllables, pick
          which source line it takes chords from, or shift its chords earlier or later until they line up. Copied lines
          replace the chords already on them.
        </p>

        <div className="copy-chords-pickers">
          <label>
            <span>From</span>
            <select value={sourceId} onChange={(e) => chooseSource(e.target.value)}>
              {blockIds.map((id) => (
                <option key={id} value={id}>
                  {names.get(id)}
                  {hasChords(blocks[id]) ? '' : ' (no chords)'}
                </option>
              ))}
            </select>
          </label>
          <span className="copy-chords-arrow">&rarr;</span>
          <fieldset className="copy-chords-targets">
            <legend>To</legend>
            <div className="copy-chords-target-list">
              {others.map((id) => (
                <label key={id} className="copy-chords-target">
                  <input type="checkbox" checked={targetIds.includes(id)} onChange={() => toggleTarget(id)} />
                  {names.get(id)}
                </label>
              ))}
            </div>
            <div className="copy-chords-quick">
              {sameType.length > 1 && (
                <button className="link-button" onClick={() => setTargets(sameType)}>
                  All other {TYPE_PLURALS[source.type]}
                </button>
              )}
              {others.length > 1 && (
                <button className="link-button" onClick={() => setTargets(others)}>
                  All
                </button>
              )}
              {targets.length > 0 && (
                <button className="link-button" onClick={() => setTargets([])}>
                  None
                </button>
              )}
            </div>
          </fieldset>
        </div>

        {targets.length === 0 ? (
          <p className="copy-chords-alert">Pick at least one section to copy onto.</p>
        ) : (
          <>
            {targets.length > 1 && (
              <>
                <p className={toCheck.length > 0 ? 'copy-chords-summary-warn' : 'copy-chords-ok'} role="status">
                  {toCheck.length === 0
                    ? `All ${targets.length} sections line up syllable for syllable.`
                    : `${pluralize(toCheck.length, 'section')} of ${targets.length} ${toCheck.length === 1 ? 'needs' : 'need'} a look${
                        unseenToCheck.length > 0 ? ` (${unseenToCheck.length} not checked yet)` : ''
                      }.`}
                </p>
                {/* One tab per section being copied onto: ✓ lines up, ⚠ worth a look, and a dot
                    until it's been looked at. */}
                <div className="copy-target-tabs" role="tablist" aria-label="Sections to check">
                  {targets.map((id) => {
                    const p = plans.get(id)!;
                    return (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={id === shown}
                        className={`copy-target-tab ${id === shown ? 'active' : ''} ${p.needsLook ? 'warn' : 'ok'} ${seen.has(id) ? '' : 'unseen'}`}
                        title={p.needsLook ? 'Worth a look before copying' : 'Every line lines up'}
                        onClick={() => show(id)}
                      >
                        <span aria-hidden>{p.needsLook ? '⚠' : '✓'}</span> {names.get(id)}
                        {!seen.has(id) && <span className="copy-target-unseen" aria-label="not checked yet" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {plan && shown && (
              <TargetReview
                name={names.get(shown)!}
                sourceName={names.get(sourceId)!}
                sourceLines={sourceLines}
                plan={plan}
                linkedCount={linkedCount}
                songKey={songKey}
                onMappingChange={(line, change) => updateMapping(shown, line, change)}
              />
            )}

            {targets.length > 1 && (
              <div className="actions copy-target-nav">
                <button className="secondary" disabled={shownIndex <= 0} onClick={() => show(targets[shownIndex - 1])}>
                  &larr; Previous section
                </button>
                <button
                  className="secondary"
                  disabled={shownIndex >= targets.length - 1}
                  onClick={() => show(targets[shownIndex + 1])}
                >
                  Next section &rarr;
                </button>
              </div>
            )}
          </>
        )}

        <div className="actions">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={toCopy.length === 0} onClick={apply}>
            {toCopy.length === 1 ? `Copy chords to ${names.get(toCopy[0])}` : `Copy chords to ${toCopy.length} sections`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One section being copied onto: what doesn't line up, and each line with its source line,
 * line choice and shift. */
function TargetReview({
  name,
  sourceName,
  sourceLines,
  plan,
  linkedCount,
  songKey,
  onMappingChange,
}: {
  name: string;
  sourceName: string;
  sourceLines: SyllableToken[][];
  plan: TargetPlan;
  linkedCount: number;
  songKey: KeyName;
  onMappingChange: (line: number, change: Partial<LineMapping>) => void;
}) {
  const { lines, mappings, previews, mismatched, dropped, lineCountDiffers } = plan;
  return (
    <>
      <h3 className="copy-target-heading">
        {sourceName} &rarr; {name}
      </h3>
      {plan.needsLook ? (
        <div className="copy-chords-alert" role="alert">
          {lineCountDiffers && (
            <div>
              {sourceName} has {pluralize(sourceLines.length, 'line')} but {name} has {lines.length}.
            </div>
          )}
          {mismatched > 0 && (
            <div>
              {pluralize(mismatched, 'line')} {mismatched === 1 ? 'has' : 'have'} a different syllable count &mdash; check
              the chords land where you want them.
            </div>
          )}
          {dropped > 0 && (
            <div>
              {pluralize(dropped, 'chord')} won&rsquo;t fit and will be left out &mdash; shift the line to bring{' '}
              {dropped === 1 ? 'it' : 'them'} back.
            </div>
          )}
        </div>
      ) : (
        <p className="copy-chords-ok">Every line has the same number of syllables.</p>
      )}
      {linkedCount > 1 && (
        <p className="hint">
          {name} appears {linkedCount} times in the song &mdash; every occurrence gets the chords.
        </p>
      )}

      <div className="copy-lines">
        {lines.map((line, i) => {
          const m = mappings[i];
          const preview = previews[i];
          const from = m.sourceLine != null ? sourceLines[m.sourceLine] : null;
          const status = !preview ? 'skipped' : preview.dropped > 0 || preview.mismatch ? 'warn' : 'ok';
          return (
            <div className={`copy-line copy-line-${status}`} key={line[0].id}>
              <div className="copy-line-controls">
                <strong>Line {i + 1}</strong>
                <select
                  value={m.sourceLine ?? ''}
                  onChange={(e) =>
                    onMappingChange(i, {
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
                      onClick={() => onMappingChange(i, { shift: m.shift - 1 })}
                      disabled={!preview || m.shift <= -preview.sourceLyricCount + 1}
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
                      onClick={() => onMappingChange(i, { shift: m.shift + 1 })}
                      disabled={!preview || m.shift >= preview.targetLyricCount - 1}
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
                      ? `${preview.sourceLyricCount} → ${preview.targetLyricCount} syllables`
                      : `${preview.targetLyricCount} syllables`}
                    {preview.dropped > 0 && ` · ${pluralize(preview.dropped, 'chord')} left out`}
                  </span>
                )}
              </div>
              {from && <div className="copy-lyrics copy-lyrics-source">{renderLine(from, songKey)}</div>}
              <div className="copy-lyrics">{renderLine(preview ? preview.tokens : line, songKey)}</div>
            </div>
          );
        })}
      </div>
      {sourceLines.length > lines.length && (
        <p className="hint">
          {sourceName}&rsquo;s extra {sourceLines.length - lines.length === 1 ? 'line' : 'lines'} won&rsquo;t be copied
          unless you pick {sourceLines.length - lines.length === 1 ? 'it' : 'them'} for a line above.
        </p>
      )}
    </>
  );
}
