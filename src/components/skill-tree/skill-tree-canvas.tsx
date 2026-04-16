'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { createClient } from '@/lib/supabase/client';
import { useSkillTreeStore } from '@/stores/skill-tree-store';
import { KPINode } from './kpi-node';
import { ObjectiveNode } from './objective-node';
import type { KPI, Objective } from '@/types';

interface SkillTreeCanvasProps {
  workspaceId: string;
  periodId: string;
  onNodeClick: (type: string, id: string) => void;
}

const nodeTypes: NodeTypes = {
  kpiNode: KPINode,
  objectiveNode: ObjectiveNode,
};

const DEPT_COLORS = ['#5c6ac4', '#47c1bf', '#f49342', '#50b83c', '#de3618', '#9c6ade', '#006fbb', '#eec200'];

export function SkillTreeCanvas({ workspaceId, periodId, onNodeClick }: SkillTreeCanvasProps) {
  const { filterDepartmentId, filterKpiId, filterObjectiveId } = useSkillTreeStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTree() {
      const supabase = createClient();

      const [kpisRes, objsRes, koRes, kdRes] = await Promise.all([
        supabase.from('kpis').select('*').eq('workspace_id', workspaceId).eq('period_id', periodId),
        supabase.from('objectives').select('*').eq('workspace_id', workspaceId).eq('period_id', periodId),
        supabase.from('kpi_objectives').select('*'),
        supabase.from('kpi_departments').select('*'),
      ]);

      let kpis = (kpisRes.data || []) as KPI[];
      let objectives = (objsRes.data || []) as Objective[];
      const kpiObjectives = (koRes.data || []) as { kpi_id: string; objective_id: string }[];
      const kpiDepartments = (kdRes.data || []) as { kpi_id: string; department_id: string }[];

      // Apply filters
      if (filterKpiId) {
        kpis = kpis.filter(k => k.id === filterKpiId);
        const linkedObjIds = kpiObjectives.filter(ko => ko.kpi_id === filterKpiId).map(ko => ko.objective_id);
        objectives = objectives.filter(o => linkedObjIds.includes(o.id));
      }
      if (filterDepartmentId) {
        const deptKpiIds = kpiDepartments.filter(kd => kd.department_id === filterDepartmentId).map(kd => kd.kpi_id);
        kpis = kpis.filter(k => deptKpiIds.includes(k.id));
        const linkedObjIds = kpiObjectives.filter(ko => deptKpiIds.includes(ko.kpi_id)).map(ko => ko.objective_id);
        objectives = objectives.filter(o => linkedObjIds.includes(o.id));
      }

      // Build nodes / edges
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // --- Layout ---
      // KPIs sit evenly spaced around a circle centered at (0, 0). Each KPI's
      // linked objectives radiate outward along the ray from the center to
      // that KPI, arranged in 2-per-level rows (so objectives stay aligned
      // with their KPI's angle and never overlap another KPI's stack).
      //
      // Node dimensions (visual; must stay roughly in sync with kpi-node /
      // objective-node components).
      const KPI_NODE_W = 220;
      const KPI_NODE_H = 90;
      const OBJ_NODE_W = 200;
      const OBJ_NODE_H = 90;

      // Spacing between the KPI ring and the first row of objectives, then
      // between each subsequent row, measured along the radial direction.
      const OBJ_RADIAL_GAP = 40;   // gap between KPI and first objective row
      const OBJ_ROW_STRIDE = OBJ_NODE_H + 30; // distance between objective rows
      const OBJ_PAIR_OFFSET = (OBJ_NODE_W + 20) / 2; // perpendicular offset
                                                    // between the two items in a "level"

      // Pack KPIs as close as possible on the ring. The constraint is that
      // each KPI's tangential footprint (KPI node OR its 2-column objective
      // cluster, whichever is wider) must fit inside its angular slice. Solve
      // for the minimum radius that satisfies that, then add a small margin.
      const KPI_TANGENTIAL_FOOTPRINT = Math.max(
        KPI_NODE_W,
        OBJ_NODE_W + 2 * OBJ_PAIR_OFFSET, // 2-col objective cluster width
      );
      const MARGIN = 40;
      const CHORD = KPI_TANGENTIAL_FOOTPRINT + MARGIN;
      // chord = 2 * R * sin(pi / N)  →  R = chord / (2 * sin(pi / N))
      const kpiCount = Math.max(kpis.length, 1);
      const KPI_RADIUS =
        kpiCount === 1
          ? 0 // single KPI sits at the origin
          : Math.max(
              200, // floor so very few KPIs still give breathing room
              CHORD / (2 * Math.sin(Math.PI / kpiCount)),
            );

      // Map KPI id -> index and color
      const kpiIndex = new Map<string, number>();
      const kpiColorMap = new Map<string, string>();
      kpis.forEach((kpi, i) => {
        kpiIndex.set(kpi.id, i);
        kpiColorMap.set(kpi.id, DEPT_COLORS[i % DEPT_COLORS.length]);
      });

      // Group objectives by their first linked KPI so each objective is drawn
      // exactly once, under the KPI it most strongly belongs to.
      const objectivesByKpi = new Map<string, Objective[]>();
      const orphanObjectives: Objective[] = [];

      objectives.forEach((obj) => {
        const link = kpiObjectives.find(
          (ko) => ko.objective_id === obj.id && kpiIndex.has(ko.kpi_id),
        );
        if (!link) {
          orphanObjectives.push(obj);
          return;
        }
        const arr = objectivesByKpi.get(link.kpi_id) || [];
        arr.push(obj);
        objectivesByKpi.set(link.kpi_id, arr);
      });

      // Place each KPI around the ring.
      kpis.forEach((kpi, i) => {
        const color = kpiColorMap.get(kpi.id)!;
        // Start at -PI/2 so the first KPI sits at the top of the ring.
        const angle = -Math.PI / 2 + (i / kpiCount) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const kpiCenterX = cosA * KPI_RADIUS;
        const kpiCenterY = sinA * KPI_RADIUS;
        // React Flow positions by top-left corner; offset by half size to center.
        newNodes.push({
          id: `kpi-${kpi.id}`,
          type: 'kpiNode',
          position: { x: kpiCenterX - KPI_NODE_W / 2, y: kpiCenterY - KPI_NODE_H / 2 },
          data: { label: kpi.title, progress: kpi.manual_progress, color },
        });

        const linkedObjs = objectivesByKpi.get(kpi.id) || [];
        // Unit vector pointing outward from the center along this KPI's ray,
        // and its perpendicular (used to offset the two objectives per level).
        const outX = cosA;
        const outY = sinA;
        const perpX = -sinA;
        const perpY = cosA;

        linkedObjs.forEach((obj, idx) => {
          const level = Math.floor(idx / 2); // 0, 1, 2, ...
          const side = idx % 2 === 0 ? -1 : 1; // left or right of the ray

          // Distance from the KPI's center, measured along the outward ray.
          // First level starts just past the KPI node; subsequent levels step
          // further out.
          const radialDist = KPI_NODE_H / 2 + OBJ_RADIAL_GAP + level * OBJ_ROW_STRIDE + OBJ_NODE_H / 2;

          const objCenterX = kpiCenterX + outX * radialDist + perpX * OBJ_PAIR_OFFSET * side;
          const objCenterY = kpiCenterY + outY * radialDist + perpY * OBJ_PAIR_OFFSET * side;

          newNodes.push({
            id: `obj-${obj.id}`,
            type: 'objectiveNode',
            position: { x: objCenterX - OBJ_NODE_W / 2, y: objCenterY - OBJ_NODE_H / 2 },
            data: { label: obj.title, progress: obj.manual_progress, status: obj.status, color },
          });

          // Draw edges from every KPI this objective is linked to (not just
          // the owning one), colored by the source KPI.
          kpiObjectives
            .filter((ko) => ko.objective_id === obj.id && kpiIndex.has(ko.kpi_id))
            .forEach((ko) => {
              newEdges.push({
                id: `e-kpi-${ko.kpi_id}-obj-${obj.id}`,
                source: `kpi-${ko.kpi_id}`,
                target: `obj-${obj.id}`,
                style: { stroke: kpiColorMap.get(ko.kpi_id) || '#637381', strokeWidth: 2 },
                animated: false,
              });
            });
        });
      });

      // Orphan objectives (no KPI link) — stack to the far right, outside the
      // ring, in a simple 2-column grid. They have no edges.
      if (orphanObjectives.length > 0) {
        const orphanLeft = KPI_RADIUS + 500;
        const orphanTop = -KPI_RADIUS;
        orphanObjectives.forEach((obj, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const objX = orphanLeft + col * (OBJ_NODE_W + 30);
          const objY = orphanTop + row * OBJ_ROW_STRIDE;
          newNodes.push({
            id: `obj-${obj.id}`,
            type: 'objectiveNode',
            position: { x: objX, y: objY },
            data: { label: obj.title, progress: obj.manual_progress, status: obj.status, color: '#637381' },
          });
        });
      }

      setNodes(newNodes);
      setEdges(newEdges);
      setLoading(false);
    }

    loadTree();
  }, [workspaceId, periodId, filterDepartmentId, filterKpiId, filterObjectiveId, setNodes, setEdges]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const [type] = node.id.split('-', 2);
    const actualId = node.id.substring(type.length + 1);
    onNodeClick(type, actualId);
  }, [onNodeClick]);

  if (loading) {
    return (
      <div style={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1117', borderRadius: '12px' }}>
        <span style={{ color: '#637381' }}>Cargando skill tree...</span>
      </div>
    );
  }

  return (
    <div style={{ height: '600px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ backgroundColor: '#0d1117' }}
      >
        <Background variant={BackgroundVariant.Dots} color="#1e2450" gap={20} size={1} />
        <Controls position="bottom-right" style={{ background: '#1c2260', borderRadius: '8px', border: '1px solid #2e3477' }} />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'kpiNode') return '#5c6ac4';
            if (node.type === 'objectiveNode') return '#47c1bf';
            return '#637381';
          }}
          style={{ backgroundColor: '#0d1117', borderRadius: '8px' }}
        />
      </ReactFlow>
    </div>
  );
}
