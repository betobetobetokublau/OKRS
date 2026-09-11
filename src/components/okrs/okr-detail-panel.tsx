'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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
  /** Gates editing of the content shown — objectives + tasks.
   *  Members generally qualify (see `canManageObjectives`). */
  canEdit: boolean;
  /** Optional stricter permission for editing the KPI detail body.
   *  Defaults to `canEdit` for backward-compat, but callers that let
   *  members edit objectives while reserving KPI edits to manager+
   *  should pass this explicitly. */
  canEditKpi?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const CLOSE_ICON = 'M6 18L18 6M6 6l12 12';

/**
 * Slide-in right-side panel showing the detail body for the selected OKR entity.
 * Closes on ESC, backdrop click, or the X button.
 *
 * Tasks can navigate in place (subtask rows, ancestor breadcrumb): the panel
 * keeps an internal stack of task ids so "← Volver" returns to the previous
 * one. A new `target` from the caller, or closing, resets the stack.
 */
export function OkrDetailPanel({ target, departments, canEdit, canEditKpi, onClose, onChanged }: OkrDetailPanelProps) {
  const kpiEditAllowed = canEditKpi ?? canEdit;
  // `shown` drives whether the DOM is mounted; `closing` triggers the exit
  // animation. On close we don't unmount until the exit keyframe finishes,
  // so the panel visibly slides out (vs. the old transition-on-state-change
  // which often didn't fire because React committed both states in one frame).
  const [shown, setShown] = useState<PanelTarget>(null);
  const [closing, setClosing] = useState(false);
  /** Task ids we navigated away from inside the panel, oldest first. */
  const [stack, setStack] = useState<string[]>([]);

  // The effect below must react to the *caller's* target only (not to the
  // in-panel navigation that also updates `shown`), so both are read via refs.
  const targetRef = useRef<PanelTarget>(target);
  targetRef.current = target;
  const shownRef = useRef<PanelTarget>(shown);
  shownRef.current = shown;
  const targetKey = target ? `${target.type}:${target.id}` : null;

  useEffect(() => {
    const next = targetRef.current;
    if (next) {
      // Incoming: replace whatever was shown and cancel any pending close.
      setClosing(false);
      setShown(next);
      setStack([]);
    } else if (shownRef.current) {
      // Outgoing: trigger exit animation, unmount after it completes.
      setClosing(true);
      const timer = setTimeout(() => {
        setShown(null);
        setStack([]);
        setClosing(false);
      }, 260);
      return () => clearTimeout(timer);
    }
  }, [targetKey]);

  const openTask = useCallback((id: string) => {
    // Read through the ref (not a setState updater) so StrictMode's
    // double-invoked updaters can't push the same id twice.
    const current = shownRef.current;
    if (!current || current.id === id) return;
    setStack((prev) => [...prev, current.id]);
    setShown({ type: 'task', id });
  }, []);

  function goBack() {
    const prev = stack[stack.length - 1];
    if (!prev) return;
    setStack((s) => s.slice(0, -1));
    setShown({ type: 'task', id: prev });
  }

  const backToId = stack[stack.length - 1] ?? null;

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
            {backToId && <BackLink taskId={backToId} onClick={goBack} />}
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
          </div>
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
              canEdit={kpiEditAllowed}
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
              key={shown.id}
              taskId={shown.id}
              canEdit={canEdit}
              onChanged={onChanged}
              onOpenTask={openTask}
            />
          )}
        </div>
      </aside>
    </>
  );
}

/** "← Volver a {título}" — resolves the previous task's title with one tiny query. */
function BackLink({ taskId, onClick }: { taskId: string; onClick: () => void }) {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('tasks')
      .select('title')
      .eq('id', taskId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setTitle((data as { title: string } | null)?.title ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: '#5c6ac4',
        fontSize: '1.3rem',
        fontWeight: 500,
        cursor: 'pointer',
        maxWidth: '40rem',
        textAlign: 'left',
      }}
    >
      <span aria-hidden>←</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Volver a {title ?? 'la tarea anterior'}
      </span>
    </button>
  );
}
