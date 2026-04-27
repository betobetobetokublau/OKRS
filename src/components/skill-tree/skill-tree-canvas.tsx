'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSkillTreeStore } from '@/stores/skill-tree-store';
import { calculateKpiProgress, calculateObjectiveProgress } from '@/lib/utils/progress';
import type { KPI, Objective, Task, Department } from '@/types';

/**
 * Radial skill tree — sectors-with-horizontal-labels design
 * (adapted from Claude Design "OKR Radial" proposal #7 "Proposal3B").
 *
 *   ┌────────────── sector per KPI ──────────────┐
 *   │                                             │
 *   │   [objective bar 1]                         │
 *   │   [objective bar 2]     outer ring          │
 *   │   [objective bar 3]    (barInner-barOuter)  │
 *   │        …                                    │
 *   │                                             │
 *   │         [ KPI label, horizontal ]           │
 *   │             ( KPI category )                │
 *   │                                             │
 *   │           ● KPI circle + progress ring      │
 *   │                                             │
 *   └─────────────────────────────────────────────┘
 *
 * Clicking a KPI focuses its sector (others dim, objective bars get their
 * names rendered as labels) and fires `onNodeClick('kpi', id)` so the parent
 * can open the detail panel. Clicking an objective bar fires
 * `onNodeClick('obj', id)`. ESC clears focus.
 */
interface SkillTreeCanvasProps {
  workspaceId: string;
  periodId: string;
  onNodeClick: (type: string, id: string) => void;
  height?: string | number;
}

interface LoadedObjective extends Objective {
  tasks?: Task[];
}

interface ViewObjective {
  id: string;
  name: string;
  progress: number;
}

interface ViewKpi {
  id: string;
  title: string;
  short: string;
  category: string;
  progress: number;
  objectives: ViewObjective[];
}

// Progress color ramp copied verbatim from the proposal: red → amber →
// yellow → green → deep green (0–25–50–70–100).
const PROGRESS_STOPS: Array<[number, [number, number, number]]> = [
  [0, [229, 72, 77]],
  [25, [245, 158, 11]],
  [50, [234, 179, 8]],
  [70, [34, 197, 94]],
  [100, [22, 163, 74]],
];

function progressColor(p: number): string {
  const clamp = Math.max(0, Math.min(100, p));
  for (let i = 0; i < PROGRESS_STOPS.length - 1; i++) {
    const [a, ca] = PROGRESS_STOPS[i];
    const [b, cb] = PROGRESS_STOPS[i + 1];
    if (clamp >= a && clamp <= b) {
      const t = (clamp - a) / (b - a);
      const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
      const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
      const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
      return `rgb(${r}, ${g}, ${bl})`;
    }
  }
  return '#22C55E';
}

function progressColorSoft(p: number, alpha = 0.08): string {
  const c = progressColor(p);
  const m = c.match(/rgb\((\d+), (\d+), (\d+)\)/);
  if (!m) return c;
  return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Wraps `text` into at most 2 lines, each up to `maxChars` wide. */
function splitTitle(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  let l1 = '';
  let l2 = '';
  for (const w of words) {
    if ((`${l1} ${w}`).trim().length <= maxChars && !l2) {
      l1 = (`${l1} ${w}`).trim();
    } else {
      l2 = (`${l2} ${w}`).trim();
    }
  }
  if (l2.length > maxChars) l2 = truncate(l2, maxChars);
  return l2 ? [l1, l2] : [truncate(text, maxChars)];
}

function annulusPath(cx: number, cy: number, rIn: number, rOut: number, a1: number, a2: number): string {
  const large = a2 - a1 > 180 ? 1 : 0;
  const [x1o, y1o] = polar(cx, cy, rOut, a1);
  const [x2o, y2o] = polar(cx, cy, rOut, a2);
  const [x1i, y1i] = polar(cx, cy, rIn, a2);
  const [x2i, y2i] = polar(cx, cy, rIn, a1);
  return `M ${x1o} ${y1o} A ${rOut} ${rOut} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${rIn} ${rIn} 0 ${large} 0 ${x2i} ${y2i} Z`;
}

// ────────────────────────── Component ──────────────────────────

export function SkillTreeCanvas({
  workspaceId,
  periodId,
  onNodeClick,
  height = '600px',
}: SkillTreeCanvasProps) {
  const { filterDepartmentId, filterKpiId } = useSkillTreeStore();
  const [kpis, setKpis] = useState<ViewKpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Zoom level expressed as a multiplier — 1.0 = "fit to viewBox" (the
  // original look). The viewBox is shrunk around its center as `zoom`
  // grows, which scales SVG content up to fill the same DOM box. Keep
  // a default that's a touch tighter than 1.0 since the radial layout
  // reads as "too zoomed out" at the original framing.
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.25;
  const ZOOM_DEFAULT = 1.3;
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const containerRef = useRef<HTMLDivElement | null>(null);

  function clampZoom(z: number) {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  }
  function setZoomRounded(z: number) {
    // Round to 2 decimals so the readout stays clean (e.g. 1.30, 1.55)
    // instead of drifting into 1.299999 territory after wheel events.
    setZoom(Math.round(clampZoom(z) * 100) / 100);
  }
  function zoomIn() {
    setZoomRounded(zoom + ZOOM_STEP);
  }
  function zoomOut() {
    setZoomRounded(zoom - ZOOM_STEP);
  }
  function resetZoom() {
    setZoom(ZOOM_DEFAULT);
  }

  // Wheel zoom — bound with `passive: false` so we can preventDefault
  // (React's synthetic onWheel can't, since wheel listeners are
  // passive by default in modern browsers). Functional setState keeps
  // the handler stable across renders.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = -e.deltaY;
      // ~0.0015 per unit of deltaY gives a tactile pace on both
      // trackpads (where deltaY is small/continuous) and mice (where
      // it's chunky).
      setZoom((prev) => {
        const next = prev + delta * 0.0015 * ZOOM_STEP;
        const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
        return Math.round(clamped * 100) / 100;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Load data.
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [kpisRes, objsRes, koRes, kdRes, deptRes] = await Promise.all([
        supabase.from('kpis').select('*').eq('workspace_id', workspaceId).eq('period_id', periodId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('objectives').select('*, tasks(*)').eq('workspace_id', workspaceId).eq('period_id', periodId),
        supabase.from('kpi_objectives').select('*'),
        supabase.from('kpi_departments').select('*'),
        supabase.from('departments').select('*').eq('workspace_id', workspaceId),
      ]);

      let kpisRaw = (kpisRes.data || []) as KPI[];
      const objectives = (objsRes.data || []) as LoadedObjective[];
      const kpiObjLinks = (koRes.data || []) as Array<{ kpi_id: string; objective_id: string }>;
      const kpiDeptLinks = (kdRes.data || []) as Array<{ kpi_id: string; department_id: string }>;
      const departments = (deptRes.data || []) as Department[];

      // Apply filters (matches the behavior of the previous canvas).
      if (filterKpiId) {
        kpisRaw = kpisRaw.filter((k) => k.id === filterKpiId);
      }
      if (filterDepartmentId) {
        const allowed = new Set(
          kpiDeptLinks.filter((kd) => kd.department_id === filterDepartmentId).map((kd) => kd.kpi_id),
        );
        kpisRaw = kpisRaw.filter((k) => k.responsible_department_id === filterDepartmentId || allowed.has(k.id));
      }

      // Group objectives by their first linked KPI.
      const kpiIds = new Set(kpisRaw.map((k) => k.id));
      const objsByKpi = new Map<string, LoadedObjective[]>();
      objectives.forEach((obj) => {
        const link = kpiObjLinks.find((ko) => ko.objective_id === obj.id && kpiIds.has(ko.kpi_id));
        if (!link) return;
        const arr = objsByKpi.get(link.kpi_id) || [];
        arr.push(obj);
        objsByKpi.set(link.kpi_id, arr);
      });

      // Build view models: each KPI gets its roll-up progress + its
      // objectives with their computed progress.
      const view: ViewKpi[] = kpisRaw.map((kpi) => {
        const linkedObjs = objsByKpi.get(kpi.id) || [];
        const dept = kpi.responsible_department_id
          ? departments.find((d) => d.id === kpi.responsible_department_id)
          : null;
        const kpiProgress = calculateKpiProgress(
          kpi,
          linkedObjs.map((o) => ({ objective: o, tasks: o.tasks || [] })),
        );
        return {
          id: kpi.id,
          title: kpi.title,
          short: kpi.title,
          category: dept?.name ?? 'KPI',
          progress: kpiProgress,
          objectives: linkedObjs.map((o) => ({
            id: o.id,
            name: o.title,
            progress: calculateObjectiveProgress(o, o.tasks || []),
          })),
        };
      });

      setKpis(view);
      setLoading(false);
    }
    load();
  }, [workspaceId, periodId, filterDepartmentId, filterKpiId]);

  // ESC clears focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocusedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const overall = useMemo(() => {
    if (!kpis.length) return 0;
    return Math.round(kpis.reduce((a, k) => a + k.progress, 0) / kpis.length);
  }, [kpis]);

  if (loading) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F3F5F8',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
        }}
      >
        <span style={{ color: '#637381' }}>Cargando skill tree...</span>
      </div>
    );
  }

  if (kpis.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F3F5F8',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
        }}
      >
        <span style={{ color: '#637381' }}>No hay KPIs para mostrar en este periodo.</span>
      </div>
    );
  }

  // ────────────── Geometry ──────────────
  // Tuned for ~16 KPIs. With that many sectors center-to-center
  // angular spacing drops to 22.5°, so the OLD radii (labelMid≈189)
  // placed adjacent label centers only ~74px apart — cards overlap
  // since they render horizontally. The new radii put labelMid at
  // ~305, giving ~119px between centers which fits a two-line split
  // of the longest real titles without truncation. For fewer KPIs
  // the extra radius just means more whitespace, which still reads
  // cleanly.
  const W = 1400;
  const H = 1080;
  const cx = W / 2;
  const cy = H / 2;

  const n = kpis.length;
  const gap = 2;                   // degrees between sectors
  const span = (360 - n * gap) / n;

  const centerR = 70;
  const okrR = 170;                // KPI node sits here
  const labelRInner = 255;
  const labelROuter = 355;
  const barInner = 375;
  const barOuter = 505;

  // Effective viewBox shrinks symmetrically around the canvas center
  // as zoom grows — content scales up to fill the same DOM box.
  const vbW = W / zoom;
  const vbH = H / zoom;
  const vbX = cx - vbW / 2;
  const vbY = cy - vbH / 2;

  return (
    <div
      ref={containerRef}
      style={{
        height,
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        position: 'relative',
      }}
      onClick={(e) => {
        // Click on empty canvas background clears focus (bubbled clicks on
        // actual nodes are stopped in their handlers).
        if (e.target === e.currentTarget) setFocusedId(null);
      }}
      onDoubleClick={(e) => {
        // Double-clicking empty canvas zooms in by one step. Bubbled
        // double-clicks on nodes don't reach here because node
        // handlers stop propagation, so this only fires on
        // background empty space.
        if (e.target === e.currentTarget || (e.target as Element).tagName === 'svg') {
          zoomIn();
        }
      }}
    >
      <TopPill overall={overall} />
      <ZoomControls
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={resetZoom}
        min={ZOOM_MIN}
        max={ZOOM_MAX}
      />

      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
        onDoubleClick={(e) => {
          // Catch double-clicks that land on the SVG background
          // (between sectors). The SVG itself becomes the target —
          // node groups stop propagation.
          if (e.target === e.currentTarget) zoomIn();
        }}
      >
        {/* Concentric guide rings */}
        {[labelROuter, barInner, barOuter, barOuter + 24].map((r, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#EFF2F7"
            strokeWidth={1}
            strokeDasharray="2 5"
            opacity={0.3}
          />
        ))}

        {kpis.map((okr, i) => {
          const a1 = i * (span + gap) - 90;
          const a2 = a1 + span;
          const amid = (a1 + a2) / 2;
          const color = progressColor(okr.progress);
          const isFocused = focusedId === okr.id;
          const isDimmed = Boolean(focusedId) && !isFocused;

          const [nx, ny] = polar(cx, cy, okrR, amid);

          const bars = okr.objectives.slice(0, 8);
          const barGap = 1.2;
          const barSpan = bars.length > 0 ? (span - (bars.length - 1) * barGap) / bars.length : span;

          const labelMidR = (labelRInner + labelROuter) / 2;
          const [labelCx, labelCy] = polar(cx, cy, labelMidR, amid);

          // Slot width = actual horizontal distance between adjacent
          // label card centers (minus an 8px breathing gap). This is
          // what really bounds each card since labels are rendered
          // horizontally, not along the arc — using arc width
          // overestimates and produces overlapping cards when many
          // KPIs crowd the ring.
          const adjCenterDist = 2 * labelMidR * Math.sin(Math.PI / n);
          const slotW = Math.max(70, adjCenterDist - 8);
          const maxChars = Math.max(10, Math.floor((slotW - 20) / (11 * 0.55)));
          const lines = splitTitle(okr.short, maxChars);

          return (
            <g
              key={okr.id}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
              opacity={isDimmed ? 0.18 : 1}
              onClick={(e) => {
                e.stopPropagation();
                // Click in the radial only TOGGLES focus. The focus panel
                // that appears on the side is what routes to the slide-in
                // detail — a second click (on the panel's title or an
                // objective) fires onNodeClick.
                setFocusedId(isFocused ? null : okr.id);
              }}
            >
              {/* sector background */}
              <path
                d={annulusPath(cx, cy, centerR + 10, barOuter + 6, a1, a2)}
                fill="#FAFBFD"
                stroke="#EFF2F7"
                strokeWidth={1}
              />
              {isFocused && (
                <path
                  d={annulusPath(cx, cy, centerR + 10, barOuter + 6, a1, a2)}
                  fill={progressColorSoft(okr.progress, 0.08)}
                />
              )}

              {/* objective bars */}
              {bars.map((obj, j) => {
                const ba1 = a1 + j * (barSpan + barGap);
                const ba2 = ba1 + barSpan;
                const fillR = barInner + (barOuter - barInner) * (obj.progress / 100);
                const c = progressColor(obj.progress);
                return (
                  <g
                    key={obj.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNodeClick('obj', obj.id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <path
                      d={annulusPath(cx, cy, barInner, barOuter, ba1, ba2)}
                      fill="#F3F5F8"
                      stroke="#E8EDF5"
                      strokeWidth={1}
                    />
                    <path d={annulusPath(cx, cy, barInner, fillR, ba1, ba2)} fill={c} />
                    {isFocused && (() => {
                      const bmid = (ba1 + ba2) / 2;
                      const [lx, ly] = polar(cx, cy, barOuter + 16, bmid);
                      let rot = bmid + 90;
                      if (bmid > 0 && bmid < 180) rot = bmid - 90;
                      return (
                        <g transform={`translate(${lx} ${ly}) rotate(${rot})`}>
                          <text
                            textAnchor="middle"
                            fontSize="10"
                            fill="#3B455C"
                            fontWeight={500}
                            y="-1"
                          >
                            {truncate(obj.name, 22)}
                          </text>
                          <text
                            textAnchor="middle"
                            fontSize="9.5"
                            fill="#6B7691"
                            fontFamily="ui-monospace, 'JetBrains Mono', monospace"
                            fontWeight={600}
                            y="10"
                          >
                            {Math.round(obj.progress)}%
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}

              {/* KPI circle + progress ring */}
              <circle cx={nx} cy={ny} r={30} fill="#FFFFFF" stroke={color} strokeWidth={isFocused ? 3 : 2} />
              <circle cx={nx} cy={ny} r={34} fill="none" stroke="#EFF2F7" strokeWidth={3} />
              <circle
                cx={nx}
                cy={ny}
                r={34}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeDasharray={`${(okr.progress / 100) * 2 * Math.PI * 34} ${2 * Math.PI * 34}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${nx} ${ny})`}
              />
              <text
                x={nx}
                y={ny + 5}
                textAnchor="middle"
                fontSize="15"
                fontWeight={800}
                fill="#0F1830"
                style={{ pointerEvents: 'none' }}
              >
                {Math.round(okr.progress)}%
              </text>

              {/* White rounded "label card" with title lines + category
                  subtitle — lifted from proposal 7A to give each KPI a
                  readable, non-overlapping label that reads horizontally. */}
              {(() => {
                const fontTitle = 11;
                const fontKpi = 9;
                const lineH = 13;
                const padX = 10;
                const padY = 7;
                const widest = Math.max(
                  ...lines.map((l) => l.length * fontTitle * 0.55),
                  (okr.category.length + 2) * fontKpi * 0.6,
                );
                // Clamp the card to the real slot width so neighbors
                // can't overlap when titles run long.
                const cardW = Math.min(slotW, Math.max(90, widest + padX * 2));
                const cardH = lines.length * lineH + lineH + padY * 2 - 2;
                const cardX = labelCx - cardW / 2;
                const cardY = labelCy - 4 - lineH + padY - 2;
                const textStartY = cardY + padY + fontTitle;
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={cardX}
                      y={cardY}
                      width={cardW}
                      height={cardH}
                      rx={8}
                      fill="#FFFFFF"
                      stroke="#D9E1F2"
                      strokeWidth={1}
                    />
                    {lines.map((line, li) => (
                      <text
                        key={li}
                        x={labelCx}
                        y={textStartY + li * lineH}
                        textAnchor="middle"
                        fontSize={fontTitle}
                        fontWeight={700}
                        fill="#0F1830"
                        letterSpacing=".01em"
                      >
                        {line}
                      </text>
                    ))}
                    <text
                      x={labelCx}
                      y={textStartY + lines.length * lineH}
                      textAnchor="middle"
                      fontSize={fontKpi}
                      fill="#6B7691"
                      letterSpacing=".08em"
                      style={{ textTransform: 'uppercase' }}
                      fontWeight={600}
                    >
                      {okr.category}
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Center disc + overall progress */}
        <circle cx={cx} cy={cy} r={centerR} fill="#FFFFFF" stroke="#D9E1F2" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={centerR - 6} fill="none" stroke="#EFF2F7" strokeWidth={4} />
        <circle
          cx={cx}
          cy={cy}
          r={centerR - 6}
          fill="none"
          stroke={progressColor(overall)}
          strokeWidth={4}
          strokeDasharray={`${(overall / 100) * 2 * Math.PI * (centerR - 6)} ${2 * Math.PI * (centerR - 6)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="12" fill="#6B7691" letterSpacing="1.5" fontWeight={600}>
          TOTAL
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="24" fontWeight={800} fill="#0F1830">
          {overall}%
        </text>
      </svg>

      <Hint />

      {/* Focus modal: sits top-right of the canvas. Click on the header
          opens the KPI slide-in; click an objective row opens that
          objective's slide-in. Closing via X or ESC clears the focus. */}
      <KpiFocusPanel
        kpi={kpis.find((k) => k.id === focusedId) || null}
        onClose={() => setFocusedId(null)}
        onOpenKpi={(id) => onNodeClick('kpi', id)}
        onOpenObjective={(id) => onNodeClick('obj', id)}
      />
    </div>
  );
}

// ──────────────── Focus panel ────────────────

function KpiFocusPanel({
  kpi,
  onClose,
  onOpenKpi,
  onOpenObjective,
}: {
  kpi: ViewKpi | null;
  onClose: () => void;
  onOpenKpi: (id: string) => void;
  onOpenObjective: (id: string) => void;
}) {
  if (!kpi) return null;
  const color = progressColor(kpi.progress);
  return (
    <div
      className="anim-panel-enter"
      style={{
        position: 'absolute',
        right: 18,
        top: 60,
        width: 320,
        background: '#FFFFFF',
        border: '1px solid #E3E7EF',
        borderRadius: 12,
        padding: 16,
        zIndex: 6,
        boxShadow: '0 8px 24px -12px rgba(15,24,48,0.15), 0 2px 6px rgba(15,24,48,0.04)',
        maxHeight: 'calc(100% - 90px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 26,
          height: 26,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 6,
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          color: '#9AA3B8',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Header: eyebrow + title — clicking it opens the KPI detail. */}
      <button
        type="button"
        onClick={() => onOpenKpi(kpi.id)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'inherit',
        }}
      >
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#9AA3B8',
            fontWeight: 600,
            marginRight: 28, // leave room for the close button
          }}
        >
          {kpi.category}
        </div>
        <div
          style={{
            margin: '4px 0 2px',
            fontSize: 16,
            fontWeight: 700,
            color: '#0F1830',
            letterSpacing: '-0.005em',
            lineHeight: 1.25,
          }}
        >
          {kpi.title}
        </div>
      </button>

      <div
        style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 28,
          fontWeight: 700,
          marginTop: 8,
          color,
        }}
      >
        {Math.round(kpi.progress)}%
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: '#EFF2F7',
          overflow: 'hidden',
          marginTop: 4,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, kpi.progress))}%`,
            background: color,
            borderRadius: 999,
            transition: 'width 400ms ease',
          }}
        />
      </div>

      {/* Objectives list — each click opens the objective's slide-in. */}
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {kpi.objectives.length === 0 && (
          <div style={{ color: '#9AA3B8', fontSize: 12.5, fontStyle: 'italic' }}>
            Sin objetivos vinculados.
          </div>
        )}
        {kpi.objectives.map((obj) => (
          <button
            key={obj.id}
            type="button"
            onClick={() => onOpenObjective(obj.id)}
            style={{
              border: '1px solid #E3E7EF',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12.5,
              background: '#FFFFFF',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              color: 'inherit',
              transition: 'border-color 120ms ease, background 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#C8D2E4';
              e.currentTarget.style.background = '#FAFBFD';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#E3E7EF';
              e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            <div style={{ color: '#3B455C', fontWeight: 500, lineHeight: 1.3 }}>{obj.name}</div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 6,
                gap: 8,
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 999,
                  background: '#EFF2F7',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(0, Math.min(100, obj.progress))}%`,
                    background: progressColor(obj.progress),
                    borderRadius: 999,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                  fontSize: 11,
                  color: '#6B7691',
                  fontWeight: 600,
                }}
              >
                {Math.round(obj.progress)}%
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ──────────────── Helper components ────────────────

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  min,
  max,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  min: number;
  max: number;
}) {
  const pct = Math.round(zoom * 100);
  const btn: React.CSSProperties = {
    width: 28,
    height: 28,
    border: 'none',
    background: 'transparent',
    color: '#3D4760',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  };
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(255,255,255,.92)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: '1px solid #E3E7EF',
        borderRadius: 999,
        padding: 3,
      }}
    >
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoom <= min}
        aria-label="Reducir zoom"
        title="Reducir zoom"
        style={{ ...btn, opacity: zoom <= min ? 0.4 : 1, cursor: zoom <= min ? 'default' : 'pointer' }}
      >
        −
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label="Restablecer zoom"
        title="Restablecer zoom"
        style={{
          padding: '0 10px',
          height: 28,
          minWidth: 56,
          border: 'none',
          background: 'transparent',
          color: '#0F1830',
          fontFamily: 'ui-monospace, monospace',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
          borderRadius: 999,
        }}
      >
        {pct}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoom >= max}
        aria-label="Aumentar zoom"
        title="Aumentar zoom"
        style={{ ...btn, opacity: zoom >= max ? 0.4 : 1, cursor: zoom >= max ? 'default' : 'pointer' }}
      >
        +
      </button>
    </div>
  );
}

function TopPill({ overall }: { overall: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: 18,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,.85)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          border: '1px solid #E3E7EF',
          borderRadius: 999,
          padding: '6px 12px',
          fontSize: 12,
          color: '#6B7691',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>Progreso global:</span>
        <b style={{ color: '#0F1830', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{overall}%</b>
      </div>
    </div>
  );
}

function Hint() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        bottom: 14,
        fontSize: 11.5,
        color: '#9AA3B8',
        display: 'flex',
        gap: 16,
        pointerEvents: 'none',
      }}
    >
      <span>
        <Kbd>click</Kbd> enfocar KPI
      </span>
      <span>
        <Kbd>esc</Kbd> quitar foco
      </span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
        fontSize: 10.5,
        padding: '1px 6px',
        borderRadius: 4,
        border: '1px solid #E3E7EF',
        color: '#6B7691',
        marginRight: 4,
      }}
    >
      {children}
    </span>
  );
}
