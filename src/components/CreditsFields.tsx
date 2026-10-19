import type { SongCredits } from '../types';
import { builtWritersLine, creditLines } from '../lib/credits';

interface Props {
  credits: SongCredits;
  onChange: (credits: SongCredits) => void;
}

/** Writers and copyright for the chart footer, with a preview of how it will print. */
export function CreditsFields({ credits, onChange }: Props) {
  const set = (patch: Partial<SongCredits>) => onChange({ ...credits, ...patch });
  const preview = creditLines(credits);

  return (
    <div className="credits-fields">
      <label className="credits-toggle">
        <input
          type="checkbox"
          checked={!!credits.useCustomWriters}
          onChange={(e) =>
            set({
              useCustomWriters: e.target.checked,
              // Start from the line as it prints now, so it's a matter of rewording it.
              ...(e.target.checked && !credits.customWriters?.trim() ? { customWriters: builtWritersLine(credits) } : {}),
            })
          }
        />
        <span>Write the credit line myself</span>
      </label>
      {credits.useCustomWriters ? (
        <label className="field">
          <span>Credit line</span>
          <input
            value={credits.customWriters ?? ''}
            onChange={(e) => set({ customWriters: e.target.value })}
            placeholder="e.g. Original words by Charitie Lees Bancroft; music and alternate words by Vikki Cook."
          />
        </label>
      ) : (
        <>
          <label className="field">
            <span>{credits.separateMusic ? 'Words by' : 'Words and music by'}</span>
            <input
              value={credits.wordsBy}
              onChange={(e) => set({ wordsBy: e.target.value })}
              placeholder="e.g. Jane Smith and John Doe"
            />
          </label>
          <label className="credits-toggle">
            <input
              type="checkbox"
              checked={credits.separateMusic}
              onChange={(e) => set({ separateMusic: e.target.checked })}
            />
            <span>Music by someone else</span>
          </label>
          {credits.separateMusic && (
            <label className="field">
              <span>Music by</span>
              <input value={credits.musicBy} onChange={(e) => set({ musicBy: e.target.value })} />
            </label>
          )}
        </>
      )}
      <label className="field">
        <span>Copyright</span>
        <input
          value={credits.copyright}
          onChange={(e) => set({ copyright: e.target.value })}
          placeholder="e.g. 2025 This Group Inc."
        />
      </label>
      {preview.length > 0 && (
        <div className="credits-preview" aria-label="Footer preview">
          {preview.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
