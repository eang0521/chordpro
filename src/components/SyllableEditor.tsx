import { useMemo, useState } from 'react';
import type { Section, WordGroup } from '../lib/syllables';
import { groupSectionsByLine, joinSyllablesForEditing, splitEditedWord } from '../lib/syllables';
import { overrideKind, rememberSyllableEdits, spellingSplit, wordCore } from '../lib/syllableOverrides';

interface Props {
  initialGroups: WordGroup[];
  sections: Section[];
  onBack: () => void;
  onSubmit: (groups: WordGroup[]) => void;
}

export function SyllableEditor({ initialGroups, sections, onBack, onSubmit }: Props) {
  const [groups, setGroups] = useState<WordGroup[]>(initialGroups);

  function submit() {
    // Remember words the user re-split, so the next song starts with their version.
    const before = new Map(initialGroups.map((g) => [g.id, g.syllables]));
    rememberSyllableEdits(
      groups.map((g) => before.get(g.id) ?? g.syllables),
      groups.map((g) => g.syllables),
    );
    onSubmit(groups);
  }

  const lineIndexes = useMemo(() => {
    const seen = new Set<number>();
    groups.forEach((g) => seen.add(g.lineIndex));
    return Array.from(seen).sort((a, b) => a - b);
  }, [groups]);

  const sectionsByLine = useMemo(() => groupSectionsByLine(sections), [sections]);
  const lastLine = lineIndexes[lineIndexes.length - 1] ?? -1;
  const trailingSections = sections.filter((s) => s.beforeLineIndex > lastLine);

  function updateWord(id: string, value: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, syllables: splitEditedWord(value) } : g)),
    );
  }

  const canContinue = groups.some((g) => g.syllables.length > 0);

  return (
    <div className="panel">
      <h2>2. Review syllables</h2>
      <p className="hint">
        Each word was auto-split with a &middot; between syllables. Click into a word to fix it &mdash;
        add or remove &middot; marks to change where it breaks. Highlighted words are often sung
        differently from how they&rsquo;re spelled (eve&middot;ry, not ev&middot;e&middot;ry) or are ones you
        re-split before &mdash; hover one to see the other way, and check it fits the melody. Words you
        re-split here are remembered for your next song. Section headings (Verse, Chorus,
        Bridge, etc.) are detected automatically and aren't tapped or charted. An instrumental heading
        (Intro, Turn, Midtro, Tag, Outro, ...) with no lyrics under it becomes a line of empty chord
        slots to fill in on the next step. A line like &ldquo;Key change to D&rdquo; becomes a key change.
      </p>
      <div className="syllable-editor">
        {lineIndexes.map((lineIndex) => (
          <div key={lineIndex}>
            {(sectionsByLine.get(lineIndex) ?? []).map((s, i, all) => (
              <SectionHeading key={i} section={s} empty={all.slice(i + 1).some((later) => !later.keyChange)} />
            ))}
            <div className="syllable-line">
              {groups
                .filter((g) => g.lineIndex === lineIndex)
                .map((g) => {
                  const value = joinSyllablesForEditing(g.syllables);
                  const { core } = wordCore(g.syllables);
                  const kind = overrideKind(core);
                  const bySpelling = kind ? joinSyllablesForEditing(spellingSplit(core)) : '';
                  return (
                    <input
                      key={g.id}
                      className={`syllable-word-input ${kind ? 'syllable-word-common' : ''}`}
                      value={value}
                      onChange={(e) => updateWord(g.id, e.target.value)}
                      style={{ width: `${Math.max(value.length, 2) + 1}ch` }}
                      title={
                        kind === 'learned'
                          ? `Split the way you split it before (by spelling: ${bySpelling}). Check it fits the melody.`
                          : kind === 'common'
                            ? `Often sung this way (by spelling: ${bySpelling}). Check it fits the melody.`
                            : undefined
                      }
                    />
                  );
                })}
            </div>
          </div>
        ))}
        {trailingSections.map((s, i) => (
          <SectionHeading key={`trailing-${i}`} section={s} empty />
        ))}
      </div>
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button disabled={!canContinue} onClick={submit}>
          Continue to chords &rarr;
        </button>
      </div>
    </div>
  );
}

/** A detected heading. `empty` means no lyrics follow it before the next heading. */
function SectionHeading({ section, empty }: { section: Section; empty: boolean }) {
  if (section.keyChange) {
    return (
      <div className="key-change-heading">
        {section.keyChange.to ? `Key change to ${section.keyChange.to}` : 'Key change (up a whole step)'}
      </div>
    );
  }
  return (
    <div className={`section-heading section-${section.type}`}>
      {section.label}
      {empty && (
        <span className="section-heading-note">
          {section.type === 'instrumental' ? ' — chord slots' : ' — no lyrics, skipped'}
        </span>
      )}
    </div>
  );
}
