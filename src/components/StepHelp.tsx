import { useState, type ReactNode } from 'react';

const STORAGE_PREFIX = 'r4e-help-open-';

function loadOpen(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) === '1';
  } catch {
    return false;
  }
}

/**
 * A step's fuller instructions, folded away under the one line that covers the basics. Whether
 * it's open is remembered per browser, so someone who wants it open keeps it open.
 */
export function StepHelp({ id, label = 'More tips', children }: { id: string; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => loadOpen(id));

  return (
    <details
      className="step-help"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        try {
          localStorage.setItem(STORAGE_PREFIX + id, next ? '1' : '0');
        } catch {
          // Not remembered; it still opens and closes.
        }
      }}
    >
      {/* Keep focus off the toggle, so a following Space on the chords step taps on instead of
          closing it again. */}
      <summary onMouseDown={(e) => e.preventDefault()}>{label}</summary>
      <div className="step-help-body">{children}</div>
    </details>
  );
}
