import { useMemo, useState } from 'react';
import type { Section, WordGroup } from '../lib/syllables';
import { joinSyllablesForEditing, splitEditedWord } from '../lib/syllables';

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

  const sectionByLine = useMemo(() => {
    const map = new Map<number, Section>();
    sections.forEach((s) => map.set(s.beforeLineIndex, s));
    return map;
  }, [sections]);

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
        Bridge, etc.) are detected automatically and aren't tapped or charted.
      </p>
      <div className="syllable-editor">
        {lineIndexes.map((lineIndex) => (
          <div key={lineIndex}>
            {sectionByLine.has(lineIndex) && (
              <div className={`section-heading section-${sectionByLine.get(lineIndex)!.type}`}>
                {sectionByLine.get(lineIndex)!.label}
              </div>
            )}
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
      </div>
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button disabled={!canContinue} onClick={() => onSubmit(groups)}>
          Continue to recording &rarr;
        </button>
      </div>
    </div>
  );
}
