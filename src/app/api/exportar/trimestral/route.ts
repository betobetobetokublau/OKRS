import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import ReactPDF from '@react-pdf/renderer';
import { QuarterlyPDFReport } from '@/components/quarterly/pdf-report';
import type { KPI, Objective, Task, Department } from '@/types';

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { workspace_id, period_id } = body;

    // Verify user role
    const { data: uw } = await supabase
      .from('user_workspaces')
      .select('role')
      .eq('user_id', user.id)
      .eq('workspace_id', workspace_id)
      .single();

    if (!uw || uw.role === 'member') {
      return NextResponse.json({ error: 'No tienes permiso para exportar' }, { status: 403 });
    }

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
