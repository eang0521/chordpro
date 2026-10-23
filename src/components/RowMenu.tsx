import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';

export interface RowMenuItem {
  label: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A row's less-used actions behind a "⋯" button, so a long list isn't a wall of buttons. Closes
 * on picking one, clicking elsewhere, or Escape.
 */
export function RowMenu({ label, items, disabled }: { label: string; items: RowMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeKey(open ? () => setOpen(false) : null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="row-menu" ref={ref}>
      <button
        className="secondary row-menu-toggle"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        &#8943;
      </button>
      {open && (
        <ul className="row-menu-list" role="menu">
          {items.map((item, i) => (
            <li key={i} role="none">
              <button
                role="menuitem"
                className={`row-menu-item ${item.danger ? 'danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
