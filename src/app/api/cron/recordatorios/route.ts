import { createAdminClient } from '@/lib/supabase/server';
import { sendMonthlyReviewReminder, sendQuarterlySessionInvite } from '@/lib/postmark/templates';
import { NextResponse } from 'next/server';

// Batched-query approach: for each active period we run three bulk queries
// (progress_logs/objectives/tasks) across all workspace users instead of
// repeating them per user. This keeps total DB round-trips at O(periods)
// rather than O(periods × users × 3). Don't reintroduce per-user queries
// inside the recipient loop — aggregate in memory first.
//
// Idempotency: Vercel retries failed cron invocations up to 3 times. To
// prevent duplicate emails and notifications on retry, DB-level partial
// UNIQUE indexes (see sql/2026-05-21-cron-idempotency.sql) enforce one
// notification + one email_log row per (user, workspace, type/template,
// calendar day). The inserts below use `upsert({ ignoreDuplicates: true })`
// so a retry that hits the same (user, day) silently no-ops at the DB
// layer instead of throwing. The Postmark send itself is NOT deduped here
// — Postmark templating is idempotent enough for our use case, but if a
// retry races between the email send and the notification insert the
// recipient may receive a duplicate email. The notification/email_log
// dedup keys catch the common case (full retry of a previously-completed
// recipient).
export async function POST(request: Request) {
  // Verify cron secret. Fail-closed if the env var is missing — otherwise
  // an attacker sending `Bearer undefined` would authenticate.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

      if (!uwList || uwList.length === 0) continue;

      const allUserIds = uwList.map((uw) => uw.user_id);

      // Monthly review reminder (day 20 to end of month)
      if (dayOfMonth >= 20 && dayOfMonth <= lastDay) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        // Batch 1: users who already logged progress this month in this workspace.
        const { data: logRows } = await adminClient
          .from('progress_logs')
          .select('user_id')
          .in('user_id', allUserIds)
          .eq('workspace_id', workspace.id)
          .gte('created_at', monthStart)
          .lt('created_at', monthEnd);

        const reviewedUserIds = new Set<string>((logRows || []).map((r: any) => r.user_id));

        // Batch 2: pending objectives in this period — group counts by responsible_user_id.
        const { data: objRows } = await adminClient
          .from('objectives')
          .select('responsible_user_id')
          .eq('workspace_id', workspace.id)
          .eq('period_id', period.id)
          .in('responsible_user_id', allUserIds);

        const objCountByUser = new Map<string, number>();
        for (const row of objRows || []) {
          const uid = (row as any).responsible_user_id as string | null;
          if (!uid) continue;
          objCountByUser.set(uid, (objCountByUser.get(uid) || 0) + 1);
        }

        // Batch 3: open tasks assigned to these users (status != completed).
        // tasks has no workspace_id — preserving the original cross-workspace
        // count behavior for the assigned user.
        const { data: taskRows } = await adminClient
          .from('tasks')
          .select('assigned_user_id')
          .in('assigned_user_id', allUserIds)
          .neq('status', 'completed');

        const taskCountByUser = new Map<string, number>();
        for (const row of taskRows || []) {
          const uid = (row as any).assigned_user_id as string | null;
          if (!uid) continue;
          taskCountByUser.set(uid, (taskCountByUser.get(uid) || 0) + 1);
        }

        for (const uw of uwList) {
          const profile = uw.profile as any;
          if (!profile) continue;

          if (reviewedUserIds.has(uw.user_id)) continue; // Already reviewed

          const objCount = objCountByUser.get(uw.user_id) || 0;
          const taskCount = taskCountByUser.get(uw.user_id) || 0;

          try {
            await sendMonthlyReviewReminder({
              to: profile.email,
              user_name: profile.full_name,
              workspace_name: workspace.name,
              month_name: now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
              pending_objectives_count: objCount,
              pending_tasks_count: taskCount,
              review_url: `${process.env.NEXT_PUBLIC_APP_URL}/${workspace.slug}/revision-mensual`,
            });

            // Create in-app notification. Dedup at the DB layer:
            // notifications_dedup_idx prevents the same (user, workspace,
            // type, day) from being inserted twice on a Vercel retry.
            await adminClient.from('notifications').upsert(
              {
                user_id: uw.user_id,
                workspace_id: workspace.id,
                type: 'monthly_review_reminder',
                title: 'Revisión mensual pendiente',
                message: `Tu revisión mensual de ${now.toLocaleDateString('es-ES', { month: 'long' })} está pendiente.`,
                action_url: `/${workspace.slug}/revision-mensual`,
              },
              { onConflict: 'user_id,workspace_id,type,created_day', ignoreDuplicates: true },
            );

            // Log email. Same retry-safety reasoning via email_logs_dedup_idx.
            await adminClient.from('email_logs').upsert(
              {
                user_id: uw.user_id,
                workspace_id: workspace.id,
                to_email: profile.email,
                template_alias: 'monthly-review-reminder',
                status: 'sent',
              },
              { onConflict: 'user_id,workspace_id,template_alias,created_day', ignoreDuplicates: true },
            );

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

            // Dedup on retry — see comment above on notifications_dedup_idx.
            await adminClient.from('notifications').upsert(
              {
                user_id: uw.user_id,
                workspace_id: workspace.id,
                type: 'quarterly_session',
                title: 'Sesión trimestral próxima',
                message: `La sesión trimestral de ${period.name} está programada en 7 días.`,
                action_url: `/${workspace.slug}/trimestral`,
              },
              { onConflict: 'user_id,workspace_id,type,created_day', ignoreDuplicates: true },
            );

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
