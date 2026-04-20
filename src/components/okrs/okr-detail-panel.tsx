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
  // `shown` drives whether the DOM is mounted; `closing` triggers the exit
  // animation. On close we don't unmount until the exit keyframe finishes,
  // so the panel visibly slides out (vs. the old transition-on-state-change
  // which often didn't fire because React committed both states in one frame).
  const [shown, setShown] = useState<PanelTarget>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (target) {
      // Incoming: replace whatever was shown and cancel any pending close.
      setClosing(false);
      setShown(target);
    } else if (shown) {
      // Outgoing: trigger exit animation, unmount after it completes.
      setClosing(true);
      const timer = setTimeout(() => {
        setShown(null);
        setClosing(false);
      }, 260);
      return () => clearTimeout(timer);
    }
  }, [target, shown]);

  useEffect(() => {
    if (!shown || closing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, closing, onClose]);

  if (!shown) return null;

  const typeLabel = shown.type === 'kpi' ? 'KPI' : shown.type === 'objective' ? 'Objetivo' : 'Tarea';

  return (
    <>
      {/* Backdrop */}
      <div
        className={closing ? 'anim-backdrop-exit' : 'anim-backdrop'}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 200,
        }}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        className={closing ? 'anim-panel-exit' : 'anim-panel-enter'}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(560px, 100%)',
          backgroundColor: 'white',
          zIndex: 201,
          boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
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
          {shown.type === 'kpi' && (
            <KpiDetailPanelBody
              kpiId={shown.id}
              departments={departments}
              canEdit={canEdit}
              onChanged={onChanged}
            />
          )}
          {shown.type === 'objective' && (
            <ObjectiveDetailPanelBody
              objectiveId={shown.id}
              departments={departments}
              canEdit={canEdit}
              onChanged={onChanged}
            />
          )}
          {shown.type === 'task' && (
            <TaskDetailPanelBody
              taskId={shown.id}
              canEdit={canEdit}
              onChanged={onChanged}
            />
          )}
        </div>
      </aside>
    </>
  );
}
