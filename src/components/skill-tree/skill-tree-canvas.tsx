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

      // Layout constants
      // Objectives are arranged under each KPI in a 2-column grid.
      // A KPI's horizontal footprint is sized to its 2 columns (with padding),
      // so adjacent KPIs don't overlap no matter how many objectives they have.
      const KPI_Y = 0;
      const OBJ_Y_START = 200;
      const OBJ_NODE_W = 200;
      const OBJ_NODE_H = 90;
      const OBJ_COL_GAP = 30;
      const OBJ_ROW_GAP = 30;
      const KPI_GAP = 80;

      const KPI_BLOCK_W = OBJ_NODE_W * 2 + OBJ_COL_GAP; // 2 columns wide
      const KPI_STRIDE = KPI_BLOCK_W + KPI_GAP;

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

      // Place KPIs horizontally, centered over their 2-column objective grid.
      kpis.forEach((kpi, i) => {
        const color = kpiColorMap.get(kpi.id)!;
        const blockLeft = i * KPI_STRIDE;
        // KPINode is ~220px wide visually — center it over the block.
        const kpiX = blockLeft + (KPI_BLOCK_W - 220) / 2;

        newNodes.push({
          id: `kpi-${kpi.id}`,
          type: 'kpiNode',
          position: { x: kpiX, y: KPI_Y },
          data: { label: kpi.title, progress: kpi.manual_progress, color },
        });

        const linkedObjs = objectivesByKpi.get(kpi.id) || [];
        linkedObjs.forEach((obj, idx) => {
          const col = idx % 2; // 0 or 1 — max 2 per row
          const row = Math.floor(idx / 2);
          const objX = blockLeft + col * (OBJ_NODE_W + OBJ_COL_GAP);
          const objY = OBJ_Y_START + row * (OBJ_NODE_H + OBJ_ROW_GAP);

          newNodes.push({
            id: `obj-${obj.id}`,
            type: 'objectiveNode',
            position: { x: objX, y: objY },
            data: { label: obj.title, progress: obj.manual_progress, status: obj.status, color },
          });

          // Draw edges from every KPI this objective is linked to (not just the
          // owning one) so multi-KPI objectives still render their full web.
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

      // Orphans (no KPI link): lay them out on a row to the right of all KPIs.
      if (orphanObjectives.length > 0) {
        const orphanBlockLeft = kpis.length * KPI_STRIDE;
        orphanObjectives.forEach((obj, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const objX = orphanBlockLeft + col * (OBJ_NODE_W + OBJ_COL_GAP);
          const objY = OBJ_Y_START + row * (OBJ_NODE_H + OBJ_ROW_GAP);
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
