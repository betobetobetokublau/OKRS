// ============================================
// Tipos del sistema OKR/KPI Platform
// ============================================

export type WorkspaceRole = 'admin' | 'manager' | 'member';
export type PeriodStatus = 'active' | 'upcoming' | 'archived';
export type ProgressMode = 'manual' | 'auto' | 'hybrid';
export type ObjectiveStatus = 'in_progress' | 'paused' | 'deprecated' | 'upcoming';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type KPIStatus = 'on_track' | 'at_risk' | 'off_track' | 'achieved';
export type TaskPriority = 'high' | 'medium' | 'low';
export type BoardVisibility = 'workspace' | 'private';
export type NotificationType =
  | 'monthly_review_reminder'
  | 'quarterly_session'
  | 'task_assigned'
  | 'task_blocked'
  | 'comment_mention'
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
  /**
   * Null means the user has never completed the onboarding carousel;
   * a timestamp means they dismissed it on that date. Admins skip the
   * flow entirely so their rows stay NULL.
   */
  onboarded_at: string | null;
  /** Per-user UI preferences, e.g. `{ board_column_order: { [boardId]: sectionId[] } }`. */
  preferences?: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  board_column_order?: Record<string, string[]>;
  /** Saved default view per board (tab + filters + sort + grouping), shape = BoardView. */
  board_views?: Record<string, unknown>;
  [key: string]: unknown;
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
  /** Optional planning window; used by the "behind schedule" metric. */
  start_date: string | null;
  end_date: string | null;
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

export interface Task {
  id: string;
  workspace_id: string;
  /** Nullable since 2026-09-10: backlog / personal-board items may not belong to an OKR yet. */
  objective_id: string | null;
  /** Set when this task is a subtask (checklist item) of another task. */
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  block_reason: string | null;
  assigned_user_id: string | null;
  due_date: string | null;
  sort_order: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  assigned_user?: Profile;
  objective?: Objective | null;
  /** Embedded parent (`parent:parent_task_id(id, title)`) when this is a subtask. */
  parent?: Pick<Task, 'id' | 'title'> | null;
  subtasks?: Task[];
}

// ---------- Boards (tableros) ----------
// A board is a lens over tasks, orthogonal to KPI › Objective › Task. Tasks live
// in N boards, in exactly one section per board. Boards never roll up progress.

export interface Board {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  visibility: BoardVisibility;
  owner_id: string | null;
  department_id: string | null;
  is_favorite: boolean;
  sort_order: number;
  archived_at: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  sections?: BoardSection[];
  /** Populated by list queries: number of tasks placed on the board. */
  task_count?: number;
}

export interface BoardSection {
  id: string;
  board_id: string;
  name: string;
  position: number;
  wip_limit: number | null;
  created_at: string;
}

export interface BoardTask {
  board_id: string;
  task_id: string;
  section_id: string | null;
  position: number;
  added_by: string | null;
  created_at: string;
  task?: Task;
  board?: Board;
  section?: BoardSection | null;
}

export type TaskActivityKind =
  | 'created'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'due_date'
  | 'objective'
  | 'title'
  | 'board_added'
  | 'board_removed'
  | 'section'
  | 'subtask_added'
  /** Re-parented or decoupled; payload `{ from, to }` are task ids (null = top-level). */
  | 'parent';

export interface TaskActivity {
  id: string;
  task_id: string;
  workspace_id: string;
  actor_id: string | null;
  kind: TaskActivityKind;
  payload: Record<string, unknown>;
  created_at: string;
  actor?: Profile | null;
}

export interface ProgressLog {
  id: string;
  user_id: string;
  period_id: string | null;
  workspace_id: string | null;
  kpi_id: string | null;
  objective_id: string | null;
  previous_value: number | null;
  new_value: number | null;
  comment: string | null;
  created_at: string;
  user?: Profile;
}

export interface Comment {
  id: string;
  user_id: string;
  kpi_id: string | null;
  objective_id: string | null;
  task_id: string | null;
  content: string;
  /** Profile ids @mentioned in `content`; the DB trigger notifies them. */
  mentions: string[];
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
