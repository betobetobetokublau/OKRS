'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCheckinPending } from '@/hooks/use-checkin-pending';
import { todayISO } from '@/components/boards/board-progress';
import { PARENT_EMBED } from '@/hooks/use-tasks';
import type { Task } from '@/types';

type HoyTask = Pick<Task, 'id' | 'title' | 'due_date' | 'status'>;

interface HoyStripProps {
  slug: string;
  workspaceId: string;
  userId: string;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MAX_TASKS = 3;

/**
 * Phone-only «Hoy» card above the project stack (design B1): the user's open
 * tasks due today or overdue, plus the month's check-in when it's pending.
 * Pure read; every row links to the real screen.
 */
export function HoyStrip({ slug, workspaceId, userId }: HoyStripProps) {
  const [tasks, setTasks] = useState<HoyTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const { pending: checkinPending } = useCheckinPending(workspaceId, userId);
  const today = todayISO();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, count } = await supabase
        .from('tasks')
        .select(`id, title, due_date, status, ${PARENT_EMBED}`, { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .eq('assigned_user_id', userId)
        .neq('status', 'completed')
        .lte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(MAX_TASKS);
      if (cancelled) return;
      setTasks((data || []) as unknown as HoyTask[]);
      setTotal(count ?? 0);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId, today]);

  const now = new Date();
  const heading = `Hoy · ${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]?.slice(0, 3)}`;
  const items = tasks.length + (checkinPending ? 1 : 0);
  const allClear = loaded && checkinPending === false && tasks.length === 0;

  return (
    <section aria-label="Hoy" style={{ backgroundColor: 'white', border: '1px solid #dfe3e8', borderRadius: '10px', padding: '1.2rem 1.4rem', marginBottom: '1.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, color: '#212b36' }}>{heading}</h2>
        {loaded && <span style={{ fontSize: '1.2rem', color: '#919eab', fontVariantNumeric: 'tabular-nums' }}>{items}</span>}
      </div>

      {!loaded ? (
        <p style={{ margin: 0, fontSize: '1.3rem', color: '#919eab' }}>Cargando…</p>
      ) : allClear ? (
        <p style={{ margin: 0, fontSize: '1.3rem', color: '#108043' }}>Nada vence hoy y tu check-in del mes está hecho.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {tasks.map((t) => {
            const overdue = Boolean(t.due_date && t.due_date < today);
            return (
              <li key={t.id}>
                <Link href={`/${slug}/tareas/${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', textDecoration: 'none', color: '#212b36', fontSize: '1.3rem' }}>
                  <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${overdue ? '#bf0711' : '#c4cdd5'}`, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600, color: overdue ? '#bf0711' : '#8a6116', whiteSpace: 'nowrap' }}>{overdue ? 'Vencida' : 'Vence hoy'}</span>
                </Link>
              </li>
            );
          })}
          {total > MAX_TASKS && (
            <li>
              <Link href={`/${slug}/mis-tareas`} style={{ fontSize: '1.2rem', color: '#5c6ac4', textDecoration: 'none', paddingLeft: '2.2rem' }}>
                +{total - MAX_TASKS} más en Mis Tareas
              </Link>
            </li>
          )}
          {checkinPending && (
            <li>
              <Link href={`/${slug}/check-in`} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', textDecoration: 'none', color: '#212b36', fontSize: '1.3rem' }}>
                <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#de3618', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Check-in de {MONTHS[now.getMonth()]} pendiente</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 600, color: '#5c6ac4' }}>Hacer</span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
