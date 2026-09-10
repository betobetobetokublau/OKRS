'use client';

import { useEffect, useRef, useState } from 'react';

interface SectionMenuProps {
  onAddBefore: () => void;
  onAddAfter: () => void;
  onDelete: () => void;
}

/** "···" popover on a section column header. */
export function SectionMenu({ onAddBefore, onAddAfter, onDelete }: SectionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Opciones de la sección"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          border: 'none',
          background: open ? '#dfe3e8' : 'transparent',
          color: '#637381',
          borderRadius: '4px',
          padding: '0 0.6rem',
          fontSize: '1.6rem',
          lineHeight: 1.2,
          cursor: 'pointer',
          letterSpacing: '1px',
        }}
      >
        ···
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.4rem',
            minWidth: '210px',
            backgroundColor: 'white',
            border: '1px solid #dfe3e8',
            borderRadius: '8px',
            boxShadow: '0 6px 20px rgba(33,43,54,0.12)',
            padding: '0.4rem',
            zIndex: 50,
          }}
        >
          <MenuItem onClick={run(onAddBefore)}>Agregar sección antes</MenuItem>
          <MenuItem onClick={run(onAddAfter)}>Agregar sección después</MenuItem>
          <div style={{ height: '1px', backgroundColor: '#f1f3f5', margin: '0.4rem 0' }} />
          <MenuItem onClick={run(onDelete)} danger>
            Eliminar sección
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '0.7rem 1rem',
        fontSize: '1.3rem',
        color: danger ? '#bf0711' : '#212b36',
        backgroundColor: hover ? (danger ? '#fbeae5' : '#f4f6f8') : 'transparent',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
