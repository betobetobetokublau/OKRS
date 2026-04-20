'use client';

import { useEffect, useMemo, useState } from 'react';
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

  // ────────────── Geometry (from proposal 3B) ──────────────
  const W = 1400;
  const H = 720;
  const cx = W / 2;
  const cy = H / 2;

  const n = kpis.length;
  const gap = 2;                   // degrees between sectors
  const span = (360 - n * gap) / n;

  const centerR = 60;
  const okrR = 135;                // KPI node sits here
  const labelRInner = 168;
  const labelROuter = 210;
  const barInner = 220;
  const barOuter = 335;

  return (
    <div
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
    >
      <TopPill overall={overall} />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
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

          const [labelCx, labelCy] = polar(cx, cy, (labelRInner + labelROuter) / 2, amid);

          // Pick a character width for title wrapping based on sector arc width.
          const labelArcWidthPx = ((a2 - a1) - 2) * (Math.PI / 180) * labelROuter;
          const maxChars = Math.max(12, Math.floor(labelArcWidthPx / (11 * 0.55)));
          const lines = splitTitle(okr.short, maxChars);

          return (
            <g
              key={okr.id}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
              opacity={isDimmed ? 0.18 : 1}
              onClick={(e) => {
                e.stopPropagation();
                setFocusedId(isFocused ? null : okr.id);
                onNodeClick('kpi', okr.id);
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
              <circle cx={nx} cy={ny} r={26} fill="#FFFFFF" stroke={color} strokeWidth={isFocused ? 3 : 2} />
              <circle cx={nx} cy={ny} r={30} fill="none" stroke="#EFF2F7" strokeWidth={3} />
              <circle
                cx={nx}
                cy={ny}
                r={30}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeDasharray={`${(okr.progress / 100) * 2 * Math.PI * 30} ${2 * Math.PI * 30}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${nx} ${ny})`}
              />
              <text
                x={nx}
                y={ny + 5}
                textAnchor="middle"
                fontSize="13"
                fontWeight={800}
                fill="#0F1830"
                style={{ pointerEvents: 'none' }}
              >
                {Math.round(okr.progress)}%
              </text>

              {/* Horizontal (unrotated) KPI title under the circle */}
              <g style={{ pointerEvents: 'none' }}>
                {lines.map((line, li) => (
                  <text
                    key={li}
                    x={labelCx}
                    y={labelCy - 4 + li * 13}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={700}
                    fill="#0F1830"
                    letterSpacing=".01em"
                  >
                    {line}
                  </text>
                ))}
                <text
                  x={labelCx}
                  y={labelCy - 4 + lines.length * 13}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#6B7691"
                  letterSpacing=".08em"
                  style={{ textTransform: 'uppercase' }}
                  fontWeight={600}
                >
                  {okr.category}
                </text>
              </g>
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
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="#6B7691" letterSpacing="1.5" fontWeight={600}>
          TOTAL
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="22" fontWeight={800} fill="#0F1830">
          {overall}%
        </text>
      </svg>

      <Hint />
    </div>
  );
}

// ──────────────── Helper components ────────────────

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
