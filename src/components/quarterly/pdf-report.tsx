import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { KPI, Objective, Task, Department } from '@/types';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10 },
  coverPage: { padding: 40, fontFamily: 'Helvetica', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1c2260', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#637381', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1c2260', marginBottom: 12, borderBottomWidth: 2, borderBottomColor: '#5c6ac4', paddingBottom: 4 },
  card: { backgroundColor: '#f9fafb', borderRadius: 4, padding: 12, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  label: { fontSize: 10, color: '#637381' },
  value: { fontSize: 12, fontWeight: 'bold', color: '#212b36' },
  progressBar: { height: 6, backgroundColor: '#dfe3e8', borderRadius: 3, marginTop: 4 },
  progressFill: { height: 6, borderRadius: 3 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f4f6f8', padding: 8, borderBottomWidth: 1, borderBottomColor: '#dfe3e8' },
  tableRow: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: '#f4f6f8' },
  tableCell: { flex: 1, fontSize: 9 },
  tableCellHeader: { flex: 1, fontSize: 9, fontWeight: 'bold', color: '#637381', textTransform: 'uppercase' },
  blocked: { backgroundColor: '#fef3f0', borderLeftWidth: 3, borderLeftColor: '#de3618', padding: 8, marginBottom: 6, borderRadius: 2 },
  summary: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  summaryItem: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 4, padding: 12, alignItems: 'center' },
  summaryNumber: { fontSize: 24, fontWeight: 'bold', color: '#5c6ac4' },
  summaryLabel: { fontSize: 9, color: '#637381', marginTop: 2 },
});

function getProgressColor(p: number): string {
  if (p >= 80) return '#50b83c';
  if (p >= 50) return '#f49342';
  if (p >= 25) return '#eec200';
  return '#de3618';
}

interface PDFProps {
  workspaceName: string;
  periodName: string;
  kpis: KPI[];
  objectives: Objective[];
  blockedTasks: Task[];
  departments: Department[];
}

export function QuarterlyPDFReport({ workspaceName, periodName, kpis, objectives, blockedTasks }: PDFProps) {
  const avgKpi = kpis.length > 0 ? Math.round(kpis.reduce((s, k) => s + k.manual_progress, 0) / kpis.length) : 0;
  const allTasks = objectives.flatMap(o => (o.tasks || []) as Task[]);
  const completedTasks = allTasks.filter(t => t.status === 'completed').length;

  return (
    <Document>
      {/* Cover page */}
      <Page size="A4" style={styles.coverPage}>
        <View style={{ alignItems: 'center', marginTop: 200 }}>
          <Text style={{ fontSize: 36, fontWeight: 'bold', color: '#1c2260' }}>{workspaceName}</Text>
          <Text style={{ fontSize: 18, color: '#5c6ac4', marginTop: 12 }}>Reporte Trimestral</Text>
          <Text style={{ fontSize: 14, color: '#637381', marginTop: 8 }}>{periodName}</Text>
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 60, fontWeight: 'bold', color: '#5c6ac4' }}>{avgKpi}%</Text>
            <Text style={{ fontSize: 12, color: '#637381' }}>Progreso promedio de KPIs</Text>
          </View>
        </View>
      </Page>

      {/* Executive summary */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Resumen Ejecutivo</Text>
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{kpis.length}</Text>
            <Text style={styles.summaryLabel}>KPIs</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{objectives.length}</Text>
            <Text style={styles.summaryLabel}>Objetivos</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{completedTasks}/{allTasks.length}</Text>
            <Text style={styles.summaryLabel}>Tareas completadas</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={{ ...styles.summaryNumber, color: '#de3618' }}>{blockedTasks.length}</Text>
            <Text style={styles.summaryLabel}>Bloqueadas</Text>
          </View>
        </View>

        {/* KPI table */}
        <Text style={styles.sectionTitle}>KPIs</Text>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableCellHeader, flex: 2 }}>Título</Text>
          <Text style={styles.tableCellHeader}>Modo</Text>
          <Text style={styles.tableCellHeader}>Progreso</Text>
        </View>
        {kpis.map((kpi) => (
          <View key={kpi.id} style={styles.tableRow}>
            <Text style={{ ...styles.tableCell, flex: 2, fontWeight: 'bold' }}>{kpi.title}</Text>
            <Text style={styles.tableCell}>{kpi.progress_mode}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold' }}>{kpi.manual_progress}%</Text>
              <View style={styles.progressBar}>
                <View style={{ ...styles.progressFill, width: `${kpi.manual_progress}%`, backgroundColor: getProgressColor(kpi.manual_progress) }} />
              </View>
            </View>
          </View>
        ))}
      </Page>

      {/* Objectives */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Objetivos</Text>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableCellHeader, flex: 2 }}>Título</Text>
          <Text style={styles.tableCellHeader}>Estado</Text>
          <Text style={styles.tableCellHeader}>Progreso</Text>
          <Text style={styles.tableCellHeader}>Tareas</Text>
        </View>
        {objectives.map((obj) => {
          const tasks = (obj.tasks || []) as Task[];
          const completed = tasks.filter(t => t.status === 'completed').length;
          return (
            <View key={obj.id} style={styles.tableRow}>
              <Text style={{ ...styles.tableCell, flex: 2, fontWeight: 'bold' }}>{obj.title}</Text>
              <Text style={styles.tableCell}>{obj.status.replace('_', ' ')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold' }}>{obj.manual_progress}%</Text>
                <View style={styles.progressBar}>
                  <View style={{ ...styles.progressFill, width: `${obj.manual_progress}%`, backgroundColor: getProgressColor(obj.manual_progress) }} />
                </View>
              </View>
              <Text style={styles.tableCell}>{completed}/{tasks.length}</Text>
            </View>
          );
        })}

        {/* Blocked tasks */}
        {blockedTasks.length > 0 && (
          <>
            <Text style={{ ...styles.sectionTitle, marginTop: 20 }}>Tareas Bloqueadas</Text>
            {blockedTasks.map((task) => (
              <View key={task.id} style={styles.blocked}>
                <Text style={{ fontWeight: 'bold', fontSize: 10, color: '#212b36' }}>{task.title}</Text>
                {task.block_reason && (
                  <Text style={{ fontSize: 9, color: '#bf0711', marginTop: 2 }}>Motivo: {task.block_reason}</Text>
                )}
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}
