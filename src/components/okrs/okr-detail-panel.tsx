'use client';

import { useEffect, useState } from 'react';
import { KpiDetailPanelBody } from './kpi-detail-panel-body';
import { ObjectiveDetailPanelBody } from './objective-detail-panel-body';
import { TaskDetailPanelBody } from './task-detail-panel-body';
import type { Department } from '@/types';

export type PanelTarget =
  | { type: 'kpi'; id: string }
  | { type: 'objective'; id: string }
  | { type: 'task'; id: string }
  | null;

interface OkrDetailPanelProps {
  target: PanelTarget;
  departments: Department[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const CLOSE_ICON = 'M6 18L18 6M6 6l12 12';

/**
 * Slide-in right-side panel showing the detail body for the selected OKR entity.
 * Closes on ESC, backdrop click, or the X button.
 */
export function OkrDetailPanel({ target, departments, canEdit, onClose, onChanged }: OkrDetailPanelProps) {
  // Visibility latched after first target so we can animate in/out smoothly
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (target) {
      setMounted(true);
      // Defer to next frame so the initial translateX(100%) is committed before
      // transitioning to translateX(0).
      requestAnimationFrame(() => setEntered(true));
    } else if (mounted) {
      setEntered(false);
      const timer = setTimeout(() => setMounted(false), 220);
      return () => clearTimeout(timer);
    }
  }, [target, mounted]);

  useEffect(() => {
    if (!target) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!mounted || !target) return null;

  const typeLabel = target.type === 'kpi' ? 'KPI' : target.type === 'objective' ? 'Objetivo' : 'Tarea';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 200,
          opacity: entered ? 1 : 0,
          transition: 'opacity 200ms ease',
        }}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(560px, 100%)',
          backgroundColor: 'white',
          zIndex: 201,
          boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
          transform: entered ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.2rem 1.6rem',
            borderBottom: '1px solid #dfe3e8',
            backgroundColor: '#fafbfb',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '1.2rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#637381',
            }}
          >
            {typeLabel}
          </span>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '3.2rem',
              height: '3.2rem',
              border: 'none',
              backgroundColor: 'transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#637381',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={CLOSE_ICON} />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
          {target.type === 'kpi' && (
            <KpiDetailPanelBody
              kpiId={target.id}
              departments={departments}
              canEdit={canEdit}
              onChanged={onChanged}
            />
          )}
          {target.type === 'objective' && (
            <ObjectiveDetailPanelBody
              objectiveId={target.id}
              departments={departments}
              canEdit={canEdit}
              onChanged={onChanged}
            />
          )}
          {target.type === 'task' && (
            <TaskDetailPanelBody
              taskId={target.id}
              canEdit={canEdit}
              onChanged={onChanged}
            />
          )}
        </div>
      </aside>
    </>
  );
}
