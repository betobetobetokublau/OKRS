# Benchmark: Asana task management (board ALPrioridades, 2026-09-10)

Source: live exploration of a private Asana board via Chrome. Scope: task management,
columns/filters/custom columns, and the Project > Section > Task hierarchy.
Purpose: candidate feature list for the Kublau OKR platform's task module.

## 1. Task detail pane

- Completion toggle ("Mark complete") + task types: Task (default), Milestone, Approval
  (Approve / Request changes / Reject).
- Assignee: single assignee, typeahead search, hover profile card (name, title, email,
  local time). Assigning auto-adds the task to the assignee's "My tasks" list.
- Due date: date picker with optional Start date, time-of-day, recurrence, Clear.
- Dependencies: "Blocked by" / "Blocking" direction; cross-project task search.
- Projects (multi-homing): one task can live in N projects, each with its own Section
  picker inline ("Otro ▾"). Add via "+" / Tab+P.
- Custom fields (per project): Priority (High/Medium/Low), Effort (S/M/L), Status
  (On track / At risk / Off track / On hold), Responsable (Kublau/BSC), Actual time
  (timer). Each dropdown offers "Edit options" and AI "Auto-fill field value".
- Description: rich text.
- Subtasks: inline list, "0/1" progress counter, own assignee/date, nested detail.
- Attachments.
- Collaborators / followers (avatar row + "N people will be notified").
- Likes, copy task link, full-screen, privacy banner ("private to project" / Make public).
- Task "…" menu: Add to another project, Add subtask, Add tags, Attach files, Create
  follow-up task, Merge duplicate tasks, AI Summarize task, AI Draft subtasks, Convert
  to (milestone/approval/project), Duplicate, Print, Make public, Delete.
  Every action has a keyboard shortcut (Tab+P, Tab+S, Tab+T, Tab+Del…).

## 2. Comments & activity

- Activity feed with "Comments" vs "All activity" toggle and Oldest/Newest sort.
- System events: created, added to project, renamed (with "Show original"), assigned,
  field changes.
- Comment editor: rich text (bold/italic/underline/strike/link/lists/code/quote/table/
  headings/section break), emoji, image, embed link, attachments.
- @mention of people, tasks, and projects (typeahead across the workspace).
- Comment actions: emoji reactions (👍 👀 🙌 + picker), threaded Reply, Pin to top,
  Edit, Copy comment link, Delete.
- AI assist in composer: Summarize task, Recommend edits.
- Notification recipient count preview before posting.

## 3. Board / columns (Project > Section > Task)

- Sections = columns. Header: count, collapse, "+ add task", "…" menu
  (Add rule to section, Rename, Add section before/after, Expand/collapse subtasks,
  Expand/collapse columns, Hide all empty columns, Delete section).
- Inline "Add section" at the right end of the board.
- Card shows: title, custom-field chips (e.g. "High"), due date (red if overdue),
  tag color dot, assignee avatar, like/comment/subtask counters, cover image.
- Card right-click: Add card image, Duplicate, Create follow-up, Mark complete,
  Add subtask, Convert to, Open details, Open in new tab, Copy link, Delete.
- Drag and drop between sections (moves task = changes section).
- Same data in List (table with one column per field, "+" adds a field), Timeline
  (Gantt with dependencies and unscheduled side panel), Calendar, Dashboard.

## 4. Filters, sort, group, view options

- Filters: quick chips (Incomplete, Completed [last N], Just my tasks, Due this week,
  Due next week) + "All filters" builder: Completion status, Assignee, Start date,
  Due date, Created by, Created on, Last modified on, Completed on, Task type, and every
  custom field (Priority, Effort, Status, Responsable). Multiple filters stack; Clear.
- Sort: Start date, Due date, Assignee, Created by/on, Last modified, Completed on,
  Likes, Alphabetical, Priority, Effort, Status, Responsable, Actual time.
- Group: by Sections (default) or any field (dates, Assignee, Project, Priority…),
  with Custom order; "Add subgroup" = swimlanes.
- Options panel per view: view name/icon, layout options, Show/hide fields,
  Filters/Sorts/Groups summary, Subtasks collapsed/expanded. Views are saveable
  (multiple named tabs per project).
- "Search this view" quick search.

## 5. Custom fields (Customize > Fields)

- Field types: Single-select, Multi-select, Date, People, Reference, Text, Number,
  Formula, ID, Timer, Time tracking, Rollup, plus "Fields with AI Studio" and a
  workspace library to reuse fields across projects.
- Reorder fields (drag), color-coded options, "Recommend fields" (AI).

## 6. Automation & project settings

- Rules: trigger → action (overdue → auto comment; status At risk → comment; task moved
  to section → …; due date approaching → move section; added to project → add
  collaborators). Featured AI rules: auto-name, translate comments, check missing info,
  duplicates check, summarize blocking task.
- Forms (intake), Emails, Apps/integrations, Task templates, Bundles, Status templates.
- Project menu: Edit settings, Permissions, Color & icon, Copy link, Duplicate, Save as
  template, Add to portfolio, Import, Export/sync, Archive, Delete.
- Project header: Set status, star (favorite), Share, member avatars, "+" tab to add view.

## 7. Cross-project personal views

- "My tasks" (List/Board/Calendar) aggregating every assigned task; auto-sections
  ("Recently assigned", etc.).
- Saved searches in sidebar (e.g. "Tasks asignadas Devv", "Tasks I've created").
- Inbox for notifications; Starred projects.

## Test artifacts left on the board (for cleanup)

- Task "Sesion de Integracion Fast Track": assigned to Alberto, subtask
  "Subtarea de prueba Claude", comment "Comentario de prueba desde Claude @Alberto".
- New empty section "Seccion prueba Claude".
