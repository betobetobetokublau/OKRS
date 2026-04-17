'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedModalProps {
  open: boolean;
  onClose: () => void;
  /** Max width of the card; default 480px. */
  width?: number | string;
  children: React.ReactNode;
  /** If true, clicking the backdrop won't close. */
  disableBackdropClose?: boolean;
  zIndex?: number;
}

/**
 * Drop-in replacement for the "fixed backdrop + Polaris-Card form" pattern
 * that every modal in the app uses. Adds an enter+exit animation (backdrop
 * fade, card scale + fade) without requiring any extra library.
 *
 * Consumers still own the form state; this only wraps the chrome:
 *
 *   <AnimatedModal open={show} onClose={...}>
 *     <form>...</form>
 *   </AnimatedModal>
 */
export function AnimatedModal({
  open,
  onClose,
  width = 480,
  children,
  disableBackdropClose,
  zIndex = 300,
}: AnimatedModalProps) {
  // `mounted` keeps the element in the tree long enough for the exit
  // animation to play; `entered` flips the CSS class from entering to exiting.
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const exitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exitTimeout.current) {
      clearTimeout(exitTimeout.current);
      exitTimeout.current = null;
    }
    if (open) {
      setMounted(true);
      // Next frame — let the DOM commit the "before" state so the transition
      // to "entered" actually animates.
      requestAnimationFrame(() => setEntered(true));
    } else if (mounted) {
      setEntered(false);
      exitTimeout.current = setTimeout(() => {
        setMounted(false);
        exitTimeout.current = null;
      }, 180);
    }
  }, [open, mounted]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      onClick={(e) => {
        if (disableBackdropClose) return;
        // Only close if the click was on the backdrop itself, not propagated
        // from the card.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
        opacity: entered ? 1 : 0,
        transition: 'opacity 160ms ease-out',
      }}
    >
      <div
        className="Polaris-Card"
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '2.4rem',
          borderRadius: '12px',
          opacity: entered ? 1 : 0,
          transform: entered ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.96)',
          transition: 'opacity 180ms ease-out, transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          backgroundColor: '#ffffff',
        }}
      >
        {children}
      </div>
    </div>
  );
}
