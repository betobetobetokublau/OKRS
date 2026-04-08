import { getPostmarkClient } from './client';

const FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL!;

export async function sendMonthlyReviewReminder(params: {
  to: string;
  user_name: string;
  workspace_name: string;
  month_name: string;
  pending_objectives_count: number;
  pending_tasks_count: number;
  review_url: string;
}) {
  const client = getPostmarkClient();
  return client.sendEmailWithTemplate({
    From: FROM_EMAIL,
    To: params.to,
    TemplateAlias: 'monthly-review-reminder',
    TemplateModel: {
      user_name: params.user_name,
      workspace_name: params.workspace_name,
      month_name: params.month_name,
      pending_objectives_count: params.pending_objectives_count,
      pending_tasks_count: params.pending_tasks_count,
      review_url: params.review_url,
      company_name: params.workspace_name,
    },
  });
}

export async function sendQuarterlySessionInvite(params: {
  to: string;
  user_name: string;
  workspace_name: string;
  period_name: string;
  session_url: string;
}) {
  const client = getPostmarkClient();
  return client.sendEmailWithTemplate({
    From: FROM_EMAIL,
    To: params.to,
    TemplateAlias: 'quarterly-session-invite',
    TemplateModel: {
      user_name: params.user_name,
      workspace_name: params.workspace_name,
      period_name: params.period_name,
      session_url: params.session_url,
    },
  });
}

export async function sendWelcomeEmail(params: {
  to: string;
  user_name: string;
  workspace_name: string;
  email: string;
  temp_password: string;
  login_url: string;
}) {
  const client = getPostmarkClient();
  return client.sendEmailWithTemplate({
    From: FROM_EMAIL,
    To: params.to,
    TemplateAlias: 'welcome-new-user',
    TemplateModel: {
      user_name: params.user_name,
      workspace_name: params.workspace_name,
      email: params.email,
      temp_password: params.temp_password,
      login_url: params.login_url,
    },
  });
}
