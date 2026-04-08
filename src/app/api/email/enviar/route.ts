import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPostmarkClient } from '@/lib/postmark/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { to, template_alias, template_model, workspace_id } = body;

    const client = getPostmarkClient();
    const result = await client.sendEmailWithTemplate({
      From: process.env.POSTMARK_FROM_EMAIL!,
      To: to,
      TemplateAlias: template_alias,
      TemplateModel: template_model,
    });

    // Log the email
    await supabase.from('email_logs').insert({
      user_id: user.id,
      workspace_id,
      template_alias,
      postmark_message_id: result.MessageID,
      status: 'sent',
    });

    return NextResponse.json({ message_id: result.MessageID });
  } catch {
    return NextResponse.json({ error: 'Error al enviar email' }, { status: 500 });
  }
}
