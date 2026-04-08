import { createAdminClient } from '@/lib/supabase/server';
import { sendMonthlyReviewReminder, sendQuarterlySessionInvite } from '@/lib/postmark/templates';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const adminClient = createAdminClient();
    const now = new Date();
    const dayOfMonth = now.getDate();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // Get all workspaces with active periods
    const { data: periods } = await adminClient
      .from('periods')
      .select('*, workspace:workspaces(*)')
      .eq('status', 'active');

    if (!periods) return NextResponse.json({ sent: 0 });

    let emailsSent = 0;

    for (const period of periods) {
      const workspace = period.workspace as any;
      if (!workspace) continue;

      // Get all users in this workspace
      const { data: uwList } = await adminClient
        .from('user_workspaces')
        .select('user_id, profile:profiles(id, email, full_name)')
        .eq('workspace_id', workspace.id);

      if (!uwList) continue;

      // Monthly review reminder (day 20 to end of month)
      if (dayOfMonth >= 20 && dayOfMonth <= lastDay) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        for (const uw of uwList) {
          const profile = uw.profile as any;
          if (!profile) continue;

          // Check if user already completed review this month
          const { data: logs } = await adminClient
            .from('progress_logs')
            .select('id')
            .eq('user_id', uw.user_id)
            .eq('workspace_id', workspace.id)
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd)
            .limit(1);

          if (logs && logs.length > 0) continue; // Already reviewed

          // Count pending items
          const { count: objCount } = await adminClient
            .from('objectives')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspace.id)
            .eq('period_id', period.id)
            .eq('responsible_user_id', uw.user_id);

          const { count: taskCount } = await adminClient
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_user_id', uw.user_id)
            .neq('status', 'completed');

          try {
            await sendMonthlyReviewReminder({
              to: profile.email,
              user_name: profile.full_name,
              workspace_name: workspace.name,
              month_name: now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
              pending_objectives_count: objCount || 0,
              pending_tasks_count: taskCount || 0,
              review_url: `${process.env.NEXT_PUBLIC_APP_URL}/${workspace.slug}/revision-mensual`,
            });

            // Create in-app notification
            await adminClient.from('notifications').insert({
              user_id: uw.user_id,
              workspace_id: workspace.id,
              type: 'monthly_review_reminder',
              title: 'Revisión mensual pendiente',
              message: `Tu revisión mensual de ${now.toLocaleDateString('es-ES', { month: 'long' })} está pendiente.`,
              action_url: `/${workspace.slug}/revision-mensual`,
            });

            // Log email
            await adminClient.from('email_logs').insert({
              user_id: uw.user_id,
              workspace_id: workspace.id,
              template_alias: 'monthly-review-reminder',
              status: 'sent',
            });

            emailsSent++;
          } catch {
            // Email send failed — continue with others
          }
        }
      }

      // Quarterly session reminder (7 days before period end)
      const periodEnd = new Date(period.end_date);
      const daysUntilEnd = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilEnd === 7) {
        for (const uw of uwList) {
          const profile = uw.profile as any;
          if (!profile) continue;

          try {
            await sendQuarterlySessionInvite({
              to: profile.email,
              user_name: profile.full_name,
              workspace_name: workspace.name,
              period_name: period.name,
              session_url: `${process.env.NEXT_PUBLIC_APP_URL}/${workspace.slug}/trimestral`,
            });

            await adminClient.from('notifications').insert({
              user_id: uw.user_id,
              workspace_id: workspace.id,
              type: 'quarterly_session',
              title: 'Sesión trimestral próxima',
              message: `La sesión trimestral de ${period.name} está programada en 7 días.`,
              action_url: `/${workspace.slug}/trimestral`,
            });

            emailsSent++;
          } catch {
            // Continue
          }
        }
      }
    }

    return NextResponse.json({ sent: emailsSent });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
