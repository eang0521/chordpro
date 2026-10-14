import { useMemo, useState } from 'react';
import type { Section, WordGroup } from '../lib/syllables';
import { groupSectionsByLine, joinSyllablesForEditing, splitEditedWord } from '../lib/syllables';

interface Props {
  initialGroups: WordGroup[];
  sections: Section[];
  onBack: () => void;
  onSubmit: (groups: WordGroup[]) => void;
}

export function SyllableEditor({ initialGroups, sections, onBack, onSubmit }: Props) {
  const [groups, setGroups] = useState<WordGroup[]>(initialGroups);

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
        add or remove &middot; marks to change where it breaks. Section headings (Verse, Chorus,
        Bridge, etc.) are detected automatically and aren't tapped or charted. An instrumental heading
        (Intro, Turn, Midtro, Tag, Outro, ...) with no lyrics under it becomes a line of empty chord
        slots to fill in on the next step.
      </p>
      <div className="syllable-editor">
        {lineIndexes.map((lineIndex) => (
          <div key={lineIndex}>
            {(sectionsByLine.get(lineIndex) ?? []).map((s, i, all) => (
              <SectionHeading key={i} section={s} empty={i < all.length - 1} />
            ))}
            <div className="syllable-line">
              {groups
                .filter((g) => g.lineIndex === lineIndex)
                .map((g) => {
                  const value = joinSyllablesForEditing(g.syllables);
                  return (
                    <input
                      key={g.id}
                      className="syllable-word-input"
                      value={value}
                      onChange={(e) => updateWord(g.id, e.target.value)}
                      style={{ width: `${Math.max(value.length, 2) + 1}ch` }}
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
        <button disabled={!canContinue} onClick={() => onSubmit(groups)}>
          Continue to chords &rarr;
        </button>
      </div>
    </div>
  );
}

/** A detected heading. `empty` means no lyrics follow it before the next heading. */
function SectionHeading({ section, empty }: { section: Section; empty: boolean }) {
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
