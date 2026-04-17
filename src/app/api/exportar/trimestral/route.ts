import { NextResponse } from 'next/server';
import ReactPDF from '@react-pdf/renderer';
import { QuarterlyPDFReport } from '@/components/quarterly/pdf-report';
import { requireAuth, requireWorkspaceRole } from '@/lib/api/require-auth';
import type { KPI, Objective, Task, Department } from '@/types';

export async function POST(request: Request) {
  try {
    const authed = await requireAuth();
    if (authed instanceof NextResponse) return authed;
    const { user, supabase } = authed;

    const body = (await request.json()) as { workspace_id?: unknown; period_id?: unknown };
    const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : '';
    const period_id = typeof body.period_id === 'string' ? body.period_id : '';
    if (!workspace_id || !period_id) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Caller must be manager+ in the target workspace (matches the old
    // `role !== 'member'` check but via the shared helper).
    const roleResult = await requireWorkspaceRole(supabase, user.id, workspace_id, 'manager');
    if (roleResult instanceof NextResponse) return roleResult;

    // Fetch all data
    const [wsRes, periodRes, kpisRes, objsRes, deptsRes] = await Promise.all([
      supabase.from('workspaces').select('*').eq('id', workspace_id).single(),
      supabase.from('periods').select('*').eq('id', period_id).single(),
      supabase.from('kpis').select('*').eq('workspace_id', workspace_id).eq('period_id', period_id),
      supabase.from('objectives').select('*, tasks(*)').eq('workspace_id', workspace_id).eq('period_id', period_id),
      supabase.from('departments').select('*').eq('workspace_id', workspace_id),
    ]);

    const kpis = (kpisRes.data || []) as KPI[];
    const objectives = (objsRes.data || []) as Objective[];
    const allTasks = objectives.flatMap(o => (o.tasks || []) as Task[]);
    const blockedTasks = allTasks.filter(t => t.status === 'blocked');

    const pdfStream = await ReactPDF.renderToStream(
      QuarterlyPDFReport({
        workspaceName: wsRes.data?.name || '',
        periodName: periodRes.data?.name || '',
        kpis,
        objectives,
        blockedTasks,
        departments: (deptsRes.data || []) as Department[],
      })
    );

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of pdfStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="reporte-trimestral.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json({ error: 'Error al generar PDF' }, { status: 500 });
  }
}
