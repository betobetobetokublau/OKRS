'use client';

import { useMemo } from 'react';
import { calculateKpiProgress } from '@/lib/utils/progress';
import type { Department, KPI } from '@/types';
import type { ObjectiveRow } from '@/hooks/use-objectives-table';
import type { PanelTarget } from '@/components/okrs/okr-detail-panel';

/**
 * Overview tab — a treemap-style dashboard inspired by the D06 "Treemap"
 * proposal from the Skill Tree Explorations set:
 *
 *   - Dark (`#0E0E0E`) canvas with monospace type
 *   - Header: eyebrow "TREEMAP · AVANCE POR ÁREA", global progress %,
 *     right-side legend explaining the encoding
 *   - Grid of area blocks sized proportionally to KPI count (area)
 *     and tinted with the department color at an opacity proportional
 *     to the area's average progress
 *   - Each block contains a small grid of KPI cells, each with a name
 *     and a tiny progress bar. Clicking a KPI cell opens the KPI
 *     detail panel — same behavior as the Skill Tree.
 *
 * Grouping key: `responsible_department_id`. KPIs without one land in
 * a neutral "Sin departamento" bucket so they still show up.
 */

interface ObjectivesOverviewProps {
  kpis: KPI[];
  departments: Department[];
  rows: ObjectiveRow[];
  onOpenPanel: (t: PanelTarget) => void;
}

interface KpiCell {
  kpi: KPI;
  progress: number;
}

interface AreaBlock {
  id: string;
  name: string;
  color: string;
  kpis: KpiCell[];
  avg: number;
}

const NEUTRAL_AREA_COLOR = '#6B7280';

export function ObjectivesOverview({
  kpis,
  departments,
  rows,
  onOpenPanel,
}: ObjectivesOverviewProps) {
  const { areas, globalProgress } = useMemo(() => {
    // Group objectives under each KPI to compute the KPI's roll-up.
    const objsByKpi = new Map<string, ObjectiveRow[]>();
    rows.forEach((obj) => {
      (obj.linked_kpis || []).forEach((k) => {
        const arr = objsByKpi.get(k.id) || [];
        arr.push(obj);
        objsByKpi.set(k.id, arr);
      });
    });

    // For each KPI compute its progress and slot it into the right area.
    const byArea = new Map<string, AreaBlock>();
    kpis.forEach((kpi) => {
      const linked = objsByKpi.get(kpi.id) || [];
      const progress = Math.round(
        calculateKpiProgress(
          kpi,
          linked.map((o) => ({ objective: o, tasks: o.tasks || [] })),
        ),
      );
      const deptId = kpi.responsible_department_id;
      const areaKey = deptId ?? '__none__';
      let block = byArea.get(areaKey);
      if (!block) {
        const dept = deptId ? departments.find((d) => d.id === deptId) : null;
        block = {
          id: areaKey,
          name: dept?.name ?? 'Sin departamento',
          color: dept?.color ?? NEUTRAL_AREA_COLOR,
          kpis: [],
          avg: 0,
        };
        byArea.set(areaKey, block);
      }
      block.kpis.push({ kpi, progress });
    });

    // Compute each area's average progress.
    const areaList: AreaBlock[] = Array.from(byArea.values()).map((a) => ({
      ...a,
      avg:
        a.kpis.length > 0
          ? Math.round(a.kpis.reduce((s, k) => s + k.progress, 0) / a.kpis.length)
          : 0,
    }));

    // Biggest areas go on top per the D06 proposal — sort by kpi count
    // descending so the visually dominant blocks carry the eye first.
    areaList.sort((a, b) => b.kpis.length - a.kpis.length || a.name.localeCompare(b.name));

    const allKpis = areaList.flatMap((a) => a.kpis);
    const gp = allKpis.length
      ? Math.round(allKpis.reduce((s, k) => s + k.progress, 0) / allKpis.length)
      : 0;

    return { areas: areaList, globalProgress: gp };
  }, [kpis, departments, rows]);

  if (areas.length === 0) {
    return (
      <div
        style={{
          padding: '4rem',
          textAlign: 'center',
          color: '#637381',
          fontSize: '1.4rem',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
        }}
      >
        No hay KPIs ni objetivos en este periodo para mostrar.
      </div>
    );
  }

  // Split into top row (first ceil(n/2) biggest) and bottom row (rest).
  // When there are only 1–2 areas we keep a single row — a bottom row
  // would just leave awkward gap.
  const splitAt = areas.length <= 2 ? areas.length : Math.ceil(areas.length / 2);
  const top = areas.slice(0, splitAt);
  const bot = areas.slice(splitAt);
  const totalKpis = Math.max(1, areas.reduce((s, a) => s + a.kpis.length, 0));
  const topKpiCount = Math.max(1, top.reduce((s, a) => s + a.kpis.length, 0));
  const botKpiCount = Math.max(1, bot.reduce((s, a) => s + a.kpis.length, 0));
  // Row heights = fraction of total KPIs — bigger row of areas gets more space.
  const topHeightFrac = bot.length === 0 ? 1 : topKpiCount / totalKpis;
  const botHeightFrac = 1 - topHeightFrac;

  return (
    <div
      style={{
        background: '#0E0E0E',
        color: '#EEE',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        padding: '2rem',
        borderRadius: '12px',
        border: '1px solid #1F1F1F',
        boxSizing: 'border-box',
        // Match the Skill Tree canvas so this tab fills the same vertical
        // space and doesn't jump the page layout when switching tabs.
        height: 'calc(100vh - 280px)',
        minHeight: '560px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '0.4rem 1.2rem 1.6rem',
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: '1rem',
              letterSpacing: '0.3em',
              opacity: 0.5,
            }}
          >
            TREEMAP · AVANCE POR ÁREA
          </div>
          <div
            style={{
              fontSize: '2.8rem',
              fontWeight: 400,
              marginTop: '0.4rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {globalProgress}
            <span style={{ opacity: 0.4 }}>%</span>
          </div>
        </div>
        <div
          style={{
            fontSize: '1rem',
            opacity: 0.5,
            letterSpacing: '0.2em',
            textAlign: 'right',
          }}
        >
          AREA ∝ # KPIs · OPACIDAD ∝ PROGRESO
        </div>
      </div>

      {/* Treemap grid — outer flex column, two rows sized by kpi fraction */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <AreaRow
          areas={top}
          heightFrac={topHeightFrac}
          onOpenPanel={onOpenPanel}
        />
        {bot.length > 0 && (
          <AreaRow
            areas={bot}
            heightFrac={botHeightFrac}
            onOpenPanel={onOpenPanel}
          />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────

function AreaRow({
  areas,
  heightFrac,
  onOpenPanel,
}: {
  areas: AreaBlock[];
  heightFrac: number;
  onOpenPanel: (t: PanelTarget) => void;
}) {
  const totalInRow = Math.max(1, areas.reduce((s, a) => s + a.kpis.length, 0));
  return (
    <div
      style={{
        flex: heightFrac,
        display: 'flex',
        gap: '0.4rem',
        minHeight: 0,
      }}
    >
      {areas.map((area) => (
        <AreaTile
          key={area.id}
          area={area}
          widthFrac={area.kpis.length / totalInRow}
          onOpenPanel={onOpenPanel}
        />
      ))}
    </div>
  );
}

function AreaTile({
  area,
  widthFrac,
  onOpenPanel,
}: {
  area: AreaBlock;
  widthFrac: number;
  onOpenPanel: (t: PanelTarget) => void;
}) {
  // Square-ish inner grid: cols ≈ ceil(sqrt(n)), rows ≈ ceil(n / cols).
  const cols = Math.max(1, Math.ceil(Math.sqrt(area.kpis.length)));
  const rows = Math.max(1, Math.ceil(area.kpis.length / cols));
  // Tint: color overlay opacity rises with progress, with a small floor
  // so even 0% areas are visible against the black background.
  const tintOpacity = (area.avg / 100) * 0.8 + 0.06;

  return (
    <div
      style={{
        flex: widthFrac,
        position: 'relative',
        padding: 2,
        boxSizing: 'border-box',
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: '#151515',
          overflow: 'hidden',
        }}
      >
        {/* Color tint overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: area.color,
            opacity: tintOpacity,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'relative',
            padding: '1rem 1.2rem',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            boxSizing: 'border-box',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: '1.3rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#fff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {area.name.toUpperCase()}
            </div>
            <div
              style={{
                fontSize: '1.3rem',
                color: '#fff',
                fontVariantNumeric: 'tabular-nums',
                marginLeft: '0.8rem',
              }}
            >
              {area.avg}%
            </div>
          </div>

          <div
            style={{
              flex: 1,
              marginTop: '0.8rem',
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              gap: 2,
              minHeight: 0,
            }}
          >
            {area.kpis.map(({ kpi, progress }) => (
              <KpiMiniCell
                key={kpi.id}
                kpi={kpi}
                progress={progress}
                onClick={() => onOpenPanel({ type: 'kpi', id: kpi.id })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiMiniCell({
  kpi,
  progress,
  onClick,
}: {
  kpi: KPI;
  progress: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${kpi.title} — ${progress}%`}
      style={{
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.04)',
        padding: '0.4rem 0.6rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 0,
        cursor: 'pointer',
        textAlign: 'left',
        color: 'inherit',
        font: 'inherit',
        transition: 'background-color 120ms ease, border-color 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(0,0,0,0.55)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(0,0,0,0.35)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
      }}
    >
      <div
        style={{
          fontSize: '0.95rem',
          color: 'rgba(255,255,255,0.88)',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {kpi.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
        <div
          style={{
            flex: 1,
            height: 2,
            background: 'rgba(255,255,255,0.15)',
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, progress))}%`,
              height: '100%',
              background: '#fff',
            }}
          />
        </div>
        <div
          style={{
            fontSize: '0.95rem',
            color: '#fff',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {progress}
        </div>
      </div>
    </button>
  );
}
