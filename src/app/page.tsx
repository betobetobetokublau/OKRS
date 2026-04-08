import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get first workspace for user
  const { data: uw } = await supabase
    .from('user_workspaces')
    .select('workspace:workspaces(slug)')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  const workspace = uw?.workspace as { slug: string } | undefined;
  if (workspace?.slug) {
    redirect(`/${workspace.slug}`);
  }

  redirect('/login');
}
