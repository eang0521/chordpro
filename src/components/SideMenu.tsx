import { useEffect } from 'react';

export interface SideMenuItem {
  label: string;
  active: boolean;
  onSelect: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: SideMenuItem[];
}

// Below this width the menu slides over the page instead of sitting beside it (see App.css).
const OVERLAY_QUERY = '(max-width: 1199px)';

/**
 * The app's main navigation, down the left side. On a wide screen it sits beside the page and
 * stays open until collapsed; on a narrower one it slides over the page and closes once
 * something is picked.
 */
export function SideMenu({ open, onClose, items }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.matchMedia(OVERLAY_QUERY).matches) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <nav id="side-menu" className={`side-menu ${open ? 'open' : ''}`} aria-label="Main" aria-hidden={!open} inert={!open}>
        {/* Where the header's toggle would be, which the menu covers on a narrow screen. */}
        <SideMenuToggle open onToggle={onClose} />
        <ul>
          {items.map((item) => (
            <li key={item.label}>
              <button
                className={item.active ? 'active' : undefined}
                aria-current={item.active ? 'page' : undefined}
                onClick={() => {
                  item.onSelect();
                  if (window.matchMedia(OVERLAY_QUERY).matches) onClose();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {open && <div className="side-menu-backdrop" onClick={onClose} />}
    </>
  );
}

/** The menu's open/closed toggle, shown at the start of the header. */
export function SideMenuToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      className="side-menu-toggle"
      aria-label={open ? 'Close menu' : 'Open menu'}
      title={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-controls="side-menu"
      onClick={onToggle}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
