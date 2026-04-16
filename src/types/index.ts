// ============================================
// Tipos del sistema OKR/KPI Platform
// ============================================

export type WorkspaceRole = 'admin' | 'manager' | 'member';
export type PeriodStatus = 'active' | 'upcoming' | 'archived';
export type ProgressMode = 'manual' | 'auto' | 'hybrid';
export type ObjectiveStatus = 'in_progress' | 'paused' | 'deprecated' | 'upcoming';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type KPIStatus = 'on_track' | 'at_risk' | 'off_track' | 'achieved';
export type NotificationType =
  | 'monthly_review_reminder'
  | 'quarterly_session'
  | 'task_assigned'
  | 'task_blocked'
  | 'objective_updated'
  | 'general';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWorkspace {
  id: string;
  user_id: string;
  workspace_id: string;
  role: WorkspaceRole;
  created_at: string;
  profile?: Profile;
  workspace?: Workspace;
}

export interface Department {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface UserDepartment {
  id: string;
  user_id: string;
  department_id: string;
  profile?: Profile;
  department?: Department;
}

export interface Period {
  id: string;
  workspace_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
  created_at: string;
}

export interface KPI {
  id: string;
  period_id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  progress_mode: ProgressMode;
  manual_progress: number;
  status: KPIStatus;
  responsible_user_id: string | null;
  responsible_department_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Computed / joined
  computed_progress?: number;
  responsible_user?: Profile;
  responsible_department?: Department;
  departments?: Department[];
  objectives?: Objective[];
}

export interface Objective {
  id: string;
  period_id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: ObjectiveStatus;
  progress_mode: ProgressMode;
  manual_progress: number;
  responsible_user_id: string | null;
  responsible_department_id: string | null;
  created_at: string;
  updated_at: string;
  // Computed / joined
  computed_progress?: number;
  responsible_user?: Profile;
  responsible_department?: Department;
  departments?: Department[];
  kpis?: KPI[];
  tasks?: Task[];
}

export interface KPIObjective {
  kpi_id: string;
  objective_id: string;
}

export interface Task {
  id: string;
  objective_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  block_reason: string | null;
  assigned_user_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  assigned_user?: Profile;
  objective?: Objective;
}

export interface ProgressLog {
  id: string;
  user_id: string;
  period_id: string;
  workspace_id: string;
  kpi_id: string | null;
  objective_id: string | null;
  task_id: string | null;
  progress_value: number;
  note: string | null;
  created_at: string;
  user?: Profile;
}

export interface Comment {
  id: string;
  user_id: string;
  kpi_id: string | null;
  objective_id: string | null;
  content: string;
  created_at: string;
  user?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  workspace_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  action_url: string | null;
  created_at: string;
}

export interface EmailLog {
  id: string;
  user_id: string;
  workspace_id: string;
  template_alias: string;
  postmark_message_id: string | null;
  status: string;
  created_at: string;
}
