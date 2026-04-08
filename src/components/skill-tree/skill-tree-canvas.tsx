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
import { TaskNode } from './task-node';
import type { KPI, Objective, Task } from '@/types';

interface SkillTreeCanvasProps {
  workspaceId: string;
  periodId: string;
  onNodeClick: (type: string, id: string) => void;
}

const nodeTypes: NodeTypes = {
  kpiNode: KPINode,
  objectiveNode: ObjectiveNode,
  taskNode: TaskNode,
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

      const [kpisRes, objsRes, tasksRes, koRes, kdRes] = await Promise.all([
        supabase.from('kpis').select('*').eq('workspace_id', workspaceId).eq('period_id', periodId),
        supabase.from('objectives').select('*').eq('workspace_id', workspaceId).eq('period_id', periodId),
        supabase.from('tasks').select('*'),
        supabase.from('kpi_objectives').select('*'),
        supabase.from('kpi_departments').select('*'),
      ]);

      let kpis = (kpisRes.data || []) as KPI[];
      let objectives = (objsRes.data || []) as Objective[];
      let allTasks = (tasksRes.data || []) as Task[];
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

      // Filter tasks to only those belonging to visible objectives
      const objIds = new Set(objectives.map(o => o.id));
      allTasks = allTasks.filter(t => objIds.has(t.objective_id));

      // Build nodes
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Layout: KPIs on top row, objectives middle, tasks bottom
      const KPI_Y = 0;
      const OBJ_Y = 200;
      const TASK_Y = 380;
      const SPACING_X = 160;

      // Map KPI to color
      const kpiColorMap = new Map<string, string>();
      kpis.forEach((kpi, i) => {
        const color = DEPT_COLORS[i % DEPT_COLORS.length];
        kpiColorMap.set(kpi.id, color);
      });

      // KPI nodes
      kpis.forEach((kpi, i) => {
        const color = kpiColorMap.get(kpi.id)!;
        newNodes.push({
          id: `kpi-${kpi.id}`,
          type: 'kpiNode',
          position: { x: i * SPACING_X * 1.5, y: KPI_Y },
          data: { label: kpi.title, progress: kpi.manual_progress, color },
        });
      });

      // Objective nodes — position based on first linked KPI
      const objPositionMap = new Map<string, number>();
      let objIndex = 0;
      objectives.forEach((obj) => {
        const linkedKpi = kpiObjectives.find(ko => ko.objective_id === obj.id && kpis.some(k => k.id === ko.kpi_id));
        const kpiIdx = linkedKpi ? kpis.findIndex(k => k.id === linkedKpi.kpi_id) : objIndex;
        const color = linkedKpi ? kpiColorMap.get(linkedKpi.kpi_id)! : '#637381';

        newNodes.push({
          id: `obj-${obj.id}`,
          type: 'objectiveNode',
          position: { x: kpiIdx * SPACING_X * 1.5 + objIndex * 30, y: OBJ_Y + (objIndex % 2) * 40 },
          data: { label: obj.title, progress: obj.manual_progress, status: obj.status, color },
        });

        objPositionMap.set(obj.id, objIndex);
        objIndex++;

        // Edges from KPIs to this objective
        kpiObjectives
          .filter(ko => ko.objective_id === obj.id && kpis.some(k => k.id === ko.kpi_id))
          .forEach(ko => {
            newEdges.push({
              id: `e-kpi-${ko.kpi_id}-obj-${obj.id}`,
              source: `kpi-${ko.kpi_id}`,
              target: `obj-${obj.id}`,
              style: { stroke: kpiColorMap.get(ko.kpi_id) || '#637381', strokeWidth: 2 },
              animated: false,
            });
          });
      });

      // Task nodes
      let taskIndex = 0;
      allTasks.forEach((task) => {
        const objPos = objPositionMap.get(task.objective_id) || 0;
        const linkedKpi = kpiObjectives.find(ko => ko.objective_id === task.objective_id);
        const color = linkedKpi ? kpiColorMap.get(linkedKpi.kpi_id) || '#637381' : '#637381';

        newNodes.push({
          id: `task-${task.id}`,
          type: 'taskNode',
          position: { x: objPos * SPACING_X + taskIndex * 20, y: TASK_Y + (taskIndex % 3) * 30 },
          data: { label: task.title, status: task.status, color },
        });

        newEdges.push({
          id: `e-obj-${task.objective_id}-task-${task.id}`,
          source: `obj-${task.objective_id}`,
          target: `task-${task.id}`,
          style: { stroke: color + '80', strokeWidth: 1.5 },
          animated: task.status === 'in_progress',
        });

        taskIndex++;
      });

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
