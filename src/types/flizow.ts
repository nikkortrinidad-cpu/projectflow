/**
 * Flizow data model — the shapes that flow between the unified store,
 * Firestore, and the pages. Lifted from the mockup's window.FLIZOW_DATA
 * generator (public/flizow-test.html, ~line 25200–25560) so every field
 * here traces back to something the mockup already renders.
 *
 * Kept separate from src/types.ts (the legacy kanban board's types) until
 * the unified store lands and the old board migrates over.
 */

// ── Enums ─────────────────────────────────────────────────────────────────

/**
 * Client health. Drives the status dot colour, the Portfolio Health strip
 * counts, and the Saved Views filter set on the Clients page.
 *   fire    — something overdue or blocking, needs you now
 *   risk    — drifting, review soon
 *   track   — healthy
 *   onboard — in first ~30 days, still ramping
 *   paused  — temporarily inactive (retainer on hold, etc.)
 */
export type ClientStatus = 'fire' | 'risk' | 'track' | 'onboard' | 'paused';

/** Kanban column ids used on every service board. `blocked` only lights up
 *  when a task is stuck — the column is hidden when empty. */
export type ColumnId = 'todo' | 'inprogress' | 'review' | 'done' | 'blocked';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

/** Task severity flag. `critical` outlines the card in red (for fire
 *  clients); `warning` tints it amber (for at-risk work). Absent on the
 *  vast majority of tasks. */
export type TaskSeverity = 'critical' | 'warning';

export type ServiceType = 'retainer' | 'project';

/** `am` = Account Manager (inferred from the client's AM column).
 *  `operator` = anyone on OPS_TEAM (SEO, web, paid, ops). Both share the
 *  same shape so the delegate popover and assignee pickers can treat them
 *  uniformly. */
export type MemberType = 'am' | 'operator';

/** Access level governs what a member can do across the workspace.
 *  Admin = full access (settings, templates, billing). Editor = can
 *  edit work + cards + comments. Viewer = read-only. The signed-in
 *  workspace owner is always 'admin'; invited teammates get assigned
 *  a level when invited. Currently only displayed (pill in avatar
 *  popover, future placement on Members surface) — `useCanEditTemplates`
 *  and friends will read this when role-gating ships for real. */
export type AccessLevel = 'admin' | 'editor' | 'viewer';

// ── Workspace + multi-user types ──────────────────────────────────────────

/**
 * Per-member record on a workspace doc. Unlike `Member` (which is the
 * agency-side roster — assignees, AMs, operators), WorkspaceMembership
 * tracks who has actual sign-in access to the workspace and at what
 * level. The two concepts can overlap (an Editor with sign-in access is
 * usually also a Member you can assign cards to) but they aren't the
 * same — a Member can exist as a record-only assignee for someone who
 * never signs in. Audit: workspace MVP 2026-04-27.
 */
export interface WorkspaceMembership {
  uid: string;
  /** Cached display fields so we don't have to look up the user's
   *  Firebase profile every render. Updated on every sign-in via
   *  upsertOwnMember. */
  displayName?: string;
  email?: string;
  photoURL?: string;
  role: AccessLevel;
  /** ISO timestamp. Used in the Members list ("joined 3 days ago"). */
  joinedAt: string;
}

/**
 * One pending invite stored on the workspace doc. Single-use: once a
 * user accepts, the invite gets removed from `pendingInvites[]`.
 * Tokens are random base36 strings ~14 chars long; collision is
 * vanishingly unlikely at human scale.
 */
export interface PendingInvite {
  token: string;
  /** What role the new member gets when they accept. */
  role: AccessLevel;
  createdAt: string;
  /** UID of the workspace member who generated the invite. Mostly
   *  audit trail; not used for any current logic. */
  createdByUid: string;
  /** Optional display string the inviter wrote into the invite (e.g.
   *  "for Sarah"). Helps when revoking pending invites. */
  note?: string;
}

/**
 * Top-level workspace document. Lives at `workspaces/{wsId}` in
 * Firestore. The wsId is the owner's UID at creation time — simple
 * mapping that survives the lifetime of the workspace (we don't
 * support ownership transfer in the MVP).
 */
export interface WorkspaceDoc {
  ownerUid: string;
  /** Display name shown on invite landings, in the Members section
   *  sub-copy, and (when image upload ships later) the source-of-
   *  truth caption alongside the logo. Seeded as
   *  `${ownerDisplayName}'s workspace` on creation; editable via
   *  Account Settings → Workspace. */
  name: string;
  /** Two-letter workspace mark — the "[AC]" tile shown next to the
   *  workspace name. Defaults to derived from `name` (first letters
   *  of the first two words). User can override. */
  initials: string;
  /** Hex color for the workspace mark tile. Reuses the same 7-swatch
   *  palette as user avatars. Defaults to brand indigo (#5e5ce6).
   *  Used as the tile's background when no logo image is uploaded. */
  color: string;
  /** Optional uploaded logo URL. When present, the workspace mark
   *  tile renders this image instead of the initials+color. Lives
   *  in Firebase Storage at `workspaces/{wsId}/logo`; the URL here
   *  is the long-form download URL with auth token. Initials + color
   *  remain as fallback (used when this is unset, when the URL is
   *  unreachable, etc.). */
  logoUrl?: string;
  /** Full member objects with roles + display info. */
  members: WorkspaceMembership[];
  /** Denormalized UID list. Firestore rules can't easily check
   *  `members.some(m => m.uid === request.auth.uid)`, so we keep a
   *  flat array of UIDs for permission queries. Must stay in sync
   *  with `members[]`. */
  memberUids: string[];
  /** Outstanding invites — one entry per generated link. */
  pendingInvites: PendingInvite[];
  /** The actual workspace data. Same shape that used to live at
   *  `flizow/{uid}.data` in the single-user model. */
  data: FlizowData;
  /** ISO timestamps for audit + the Members "Joined" column. */
  createdAt: string;
  updatedAt: string;
}

/**
 * Tiny lookup doc at `users/{uid}` mapping a signed-in user to their
 * workspace. Without this, every sign-in would have to query "find
 * workspaces where my uid is in memberUids." A direct doc read is
 * simpler. One workspace per user for MVP — when multi-workspace
 * ships, this becomes an array.
 */
export interface UserLookup {
  workspaceId: string;
}

export type IntegrationStatus = 'connected' | 'error';

/** Template keys that services point at. Drives the POOL_LABEL pill on
 *  each card and the Service Templates split-view mapping. Intentionally
 *  a closed union — adding a new template means adding a key here. */
export type TemplateKey =
  | 'demandgen'
  | 'contentSEO'
  | 'launch'
  | 'cro'
  | 'paidSocial'
  | 'email'
  | 'seasonal'
  | 'localSEO'
  | 'paidLead'
  | 'reputation'
  | 'social'
  | 'photo'
  | 'linkedin'
  | 'website'
  // Project-specific templates used by the Acme extras block.
  | 'web-design-full-stack'
  | 'brand-refresh';

/** Icon kinds for the Templates split-view pane. The set is closed for
 *  v1 because the SVG sprites are inline in TemplatesPage; adding a new
 *  icon means adding a sprite, not just a token. */
export type TemplateIcon = 'web' | 'seo' | 'content' | 'brand' | 'paid';

/** Phase definition inside a service template — drives the labelled
 *  groupings inside the seeded onboarding block on Client Detail. */
export interface TemplatePhase {
  name: string;
  subtasks: string[];
}

/** Onboarding checklists that hydrate a new service. `client` items
 *  ride the from-client column, `us` items ride the from-us column. */
export interface TemplateOnboarding {
  client: string[];
  us: string[];
}

/** Live shape of a template after the store overlays user edits onto
 *  built-in defaults. Built-in records carry `userCreated: false`;
 *  user-created records carry `userCreated: true`. The audit-flagged
 *  Templates M2 admin editor writes/reads against this type. */
export interface TemplateRecord {
  id: string;
  name: string;
  category: string;
  icon: TemplateIcon;
  phasesSub: string;
  phases: TemplatePhase[];
  onboarding: TemplateOnboarding;
  brief: string[];
  /** True for user-created records; false for built-ins (or for
   *  overrides that replace a built-in's content). Drives whether
   *  "Reset to default" or "Delete" is offered. */
  userCreated: boolean;
  /** Soft-delete flag — hides from the picker but keeps the record so
   *  existing services can still resolve their template name. Built-in
   *  templates can be archived; user-created records can also be
   *  hard-purged via a separate store action. */
  archived: boolean;
  /** ISO timestamp of the last edit. `null` on never-edited records,
   *  which drives the "Read-only" badge presence on the Templates
   *  hero. */
  editedAt: string | null;
}

export type IndustryCategory =
  | 'saas'
  | 'ecommerce'
  | 'healthcare'
  | 'fnb'
  | 'education'
  | 'professional'
  | 'realestate'
  | 'services'
  | 'industrial'
  | 'media';

// ── Core domain objects ──────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  /** Two-letter abbreviation shown in the square logo tile. */
  initials: string;
  /** CSS class name (e.g. `logo-indigo`, `logo-pink`). Colour comes from
   *  the stylesheet so dark/light modes swap together. */
  logoClass: string;
  status: ClientStatus;
  /** One of ten preset categories. Drives display text on the list/hero
   *  AND service-template suggestions when adding a new service. The
   *  free-text `industry` field that used to live alongside this got
   *  removed 2026-04-27 — the category label was already doing the same
   *  display job, and asking for both confused the Add-client modal. */
  industryCategory: IndustryCategory;
  amId: string | null;
  /** Public website / homepage. Required at modal save (added 2026-04-27),
   *  but typed optional so existing client docs that pre-date this field
   *  still parse cleanly. New clients always carry a non-empty value. */
  website?: string;
  /** ISO date. When this client first onboarded. */
  startedAt: string;
  /** Ordered — oldest first, except project services get unshifted to the
   *  top so new work surfaces at the start of the strip. */
  serviceIds: string[];
  /** Operators attached to this client, above and beyond the AM. The AM
   *  lives on `amId` — this is the "Project team" you see in the About
   *  tab's Team section. Ordered by add-time; dedupe at write. */
  teamIds: string[];
  /** Soft-archive flag. Archived clients are hidden from the active
   *  Clients views (All / Mine / On Fire / etc.) and excluded from the
   *  "{N} active" header count. They surface only in the dedicated
   *  Archived view chip and remain restorable from the kebab menu on
   *  their detail page. Unset on active clients — treat absence as
   *  `archived: false`. */
  archived?: boolean;
  /** ISO timestamp when the client was archived. Always set when
   *  `archived` is true; cleared on unarchive. */
  archivedAt?: string;
}

// ── Client-scoped directory data (About tab) ─────────────────────────────

/**
 * A person we talk to at the client. Distinct from `Member` (who works on
 * our side). Kept flat at the FlizowData root rather than nested under
 * Client so edits are single-field patches.
 */
export interface Contact {
  id: string;
  clientId: string;
  name: string;
  /** e.g. "VP Marketing", "Head of Growth". Optional because the mockup
   *  allows a bare name. */
  role?: string;
  email?: string;
  phone?: string;
  /** The primary contact gets a star in the UI and is who the Weekly
   *  WIP agenda pings by default. At most one per client at a time. */
  primary?: boolean;
}

/**
 * A saved URL on a client — their website, shared drive, brand docs,
 * asset library. The `icon` field maps to one of a small set of glyphs
 * the Quick Links card knows how to render.
 */
export interface QuickLink {
  id: string;
  clientId: string;
  label: string;
  url: string;
  /** Optional icon hint. Falls back to a generic link glyph when unset
   *  or unknown. */
  icon?: 'globe' | 'drive' | 'doc' | 'figma' | 'folder' | 'link';
}

export interface Service {
  id: string;
  clientId: string;
  name: string;
  type: ServiceType;
  templateKey: TemplateKey;
  /** 0–100. Drives the progress bar on the service card. */
  progress: number;
  /** ISO date. Next milestone or recurring deliverable. */
  nextDeliverableAt: string;
  taskIds: string[];
  /** Per-column WIP caps. Absent key = no limit on that column. The
   *  board shows "N / L" on the header when set, and tints the count
   *  amber when tasks exceed the cap. Per-service (not global) because
   *  a content retainer and a dev project have very different cadences
   *  for what "too much at once" looks like. */
  columnLimits?: Partial<Record<ColumnId, number>>;
  /** Swimlane grouping for this board. Absent / `'none'` renders the
   *  flat columns layout. When set, the board stacks horizontal lanes
   *  per distinct value of the grouping field (priority / assignee /
   *  label), and dragging a card across lanes writes that field back
   *  to the task. Per-service so a focused project stays flat while a
   *  busy retainer can group by owner without forcing every board into
   *  the same mode. */
  groupBy?: 'none' | 'priority' | 'assignee' | 'label';
  /** Project brief — the AM's free-form spec for this service. HTML
   *  rich text from the TipTap editor (matches card descriptions).
   *  Absent / empty = no brief written yet (header strip shows the
   *  empty-state CTA). Auto-seeded from the template's `brief` array
   *  on service creation so the editor opens with section headings
   *  rather than a blank canvas. Edited through the Project Brief
   *  modal launched from the board header. */
  brief?: string;
  /** ISO timestamp the brief was last saved. Drives the "Last updated
   *  · 3d ago" indicator on the header strip. Absent when no brief
   *  has been written. */
  briefUpdatedAt?: string;
}

/** Metadata a schedule-seeded task carries so the Overview Schedule can
 *  render its chip and subtitle. Tasks generated from TASK_POOLS don't
 *  have this; only cards that double as schedule items do. */
export interface ScheduleMeta {
  tag: 'deadline' | 'meeting' | 'milestone';
  meta: string;
  done: boolean;
}

/** A checklist row on a card. The UI groups them under the card's
 *  Checklist section and shows a "X of Y · N%" progress indicator. */
export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
  /** Optional Member id. Unassigned items show a generic avatar glyph. */
  assigneeId: string | null;
}

export interface Task {
  id: string;
  serviceId: string;
  clientId: string;
  title: string;
  columnId: ColumnId;
  priority: Priority;
  assigneeId: string | null;
  /** Label ids. Tasks can be tagged like the legacy kanban cards. */
  labels: string[];
  /** ISO date. */
  dueDate: string;
  /** ISO date. */
  createdAt: string;
  severity?: TaskSeverity;
  /** Only set when a task is parked in `blocked`. Human-readable reason
   *  ("Waiting on client feedback" etc.). */
  blockerReason?: string;
  /** Populated for cards that also appear on the Overview Schedule. The
   *  leading underscore matches the mockup's naming — kept to make diffs
   *  against the mockup's JSON easy to spot. */
  _schedule?: ScheduleMeta;
  // ── Card detail fields (optional — cards that never opened the
  //    detail modal may not have any of these yet) ──────────────────
  /** ISO date. When work is expected to start. Optional. */
  startDate?: string;
  /** Free text. Rich text comes later. Empty string = "no description". */
  description?: string;
  /** Ordered checklist. Empty array = no checklist section shown. */
  checklist?: TaskChecklistItem[];
  /** Pool of assignees — a task can have more than one teammate on it.
   *  Kept separate from `assigneeId` (the legacy single-owner field)
   *  so the card tile can still show the primary owner. */
  assigneeIds?: string[];
  // ── Archive ─────────────────────────────────────────────────────────
  /** Soft-hidden from the board. Archived tasks keep their columnId,
   *  dueDate, checklist, comments, and activity — nothing is destroyed —
   *  they just drop out of column rendering and out of active analytics
   *  counts. Restore via the Archived-cards panel. Absent / false = live. */
  archived?: boolean;
  /** ISO timestamp the task was archived. Used to sort the Archived-cards
   *  list newest-first so the most recently hidden cards are easiest to
   *  find again. Cleared on unarchive. */
  archivedAt?: string;
  /** How many of the assignee's daily cap slots this task consumes.
   *  Defaults to 1 when absent. Designer / operator can set to 0,
   *  0.5, 2, 4, or any number — they're the expert on how heavy a
   *  given piece of work is. AMs creating cards can pre-fill via the
   *  t-shirt picker (S=1, M=2, L=4, XL=8) but their value is treated
   *  as a guess until the operator confirms (see weightStatus). */
  slots?: number;
  /** Authority signal on the slots value:
   *    'estimated'  — set by the AM (or the default), not yet confirmed
   *                   by the assignee. UI renders italic / muted.
   *    'confirmed'  — set or accepted by the assignee. UI renders solid.
   *  Defaults to 'estimated' on creation. The capacity math always uses
   *  the current slots value regardless of status — status is a trust
   *  cue for humans, not a math input. */
  weightStatus?: 'estimated' | 'confirmed';
  /** User-pinned for the next Weekly WIP agenda. When true, the card
   *  appears under the "Pinned for discussion" group regardless of
   *  whether it would otherwise qualify (urgent, on-track, new
   *  client). Auto-clears when the card moves to `done` — pinned-then-
   *  finished cards drop off the agenda automatically so the WIP
   *  doesn't fill with closed work nobody needs to discuss. */
  flaggedForWip?: boolean;
}

export interface Member {
  id: string;
  /** Two-letter initials used everywhere an avatar shows up. */
  initials: string;
  name: string;
  /** Job title. Optional because AMs inferred from the client rows only
   *  know their name/colour, not their role. Operators always have one. */
  role?: string;
  /** Hex colour for the solid avatar (AMs) or the text colour on the
   *  soft-bg avatar (operators). */
  color: string;
  /** Soft background colour for operators. AMs skip this and use `color`
   *  as a solid fill instead. */
  bg?: string;
  type: MemberType;
  /** Access level — undefined on legacy / demo members (no pill shown).
   *  The signed-in user always gets 'admin' set via upsertOwnMember on
   *  every sign-in. Future-invited teammates get assigned at invite. */
  accessLevel?: AccessLevel;
  /** What the user goes by — first-name shorthand. Optional; falls
   *  back to the first word of `name` when absent. Editable in the
   *  Profile tab of Account Settings. */
  preferredName?: string;
  /** User's preferred timezone. Stored as a short slug ('pst', 'est',
   *  etc.) that maps to a label in the Profile picker today. Future
   *  cleanup will migrate to IANA names ('America/Los_Angeles'). */
  timezone?: string;
  /** Per-user notification preferences. Both fields are optional with
   *  default-true semantics — undefined means "show me everything,"
   *  matching how the bell behaved before this prefs slice landed.
   *  Wired into deriveNotifications: false on `digest` skips the
   *  system-digest line; false on `urgent` skips the overdue /
   *  due-today / on-fire categories. Editable in Account Settings →
   *  Notifications. */
  notifPrefs?: {
    digest?: boolean;
    urgent?: boolean;
  };
  /** Daily soft cap — total slot count above which the member's load
   *  badge tints amber. Universal: every member has a cap, including
   *  AMs (operations roles also burn out). Defaults to DEFAULT_CAP_SOFT
   *  (6) when absent. Edited per-member on Account Settings → Members. */
  capSoft?: number;
  /** Daily max cap — total slot count above which the booking flow
   *  fires a soft warning ("Sarah will have 9, max is 8"). Doesn't
   *  block — agency reality has rush days; the warning is a nudge,
   *  not a wall. Defaults to DEFAULT_CAP_MAX (8). */
  capMax?: number;
}

/**
 * Per-day override on a member's standing cap. Lets an operator (or
 * an admin on their behalf) say "Sarah's cap on Wed Apr 30 is 3/4 —
 * she's in workshops half the day." When present, this row's caps
 * win over the member's standing capSoft/capMax for that single day.
 *
 * Stored flat on FlizowData rather than nested under Member so a
 * single override edit is a cheap array patch — and so the count of
 * overrides scales with usage rather than ballooning every member's
 * record.
 */
export interface MemberDayOverride {
  memberId: string;
  /** ISO date string (YYYY-MM-DD). Lexicographic sort works correctly. */
  date: string;
  capSoft: number;
  capMax: number;
}

export interface Integration {
  clientId: string;
  name: string;
  status: IntegrationStatus;
}

// ── Task comments ────────────────────────────────────────────────────────

/**
 * A comment posted on a task's Card Detail modal. One level of threading
 * (top-level → reply) — matches the mockup; deeper nesting is a separate
 * pass when we need it.
 *
 * `authorId` is a Member id. When the member is later removed we leave
 * the comment in place and render a generic "Deleted user" fallback so
 * the conversation still reads.
 *
 * `parentId` is the comment id the reply hangs under, or null/undefined
 * for a top-level post. We index by `taskId` first at read time and then
 * bucket by `parentId` — no tree structure stored on disk.
 */
export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  /** Plain text. Rich text / @mentions are a follow-up pass. */
  text: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp, only set if the comment was edited after posting.
   *  We show "Edited" in the meta row when this is present. */
  updatedAt?: string;
  /** Comment id the reply hangs under. Null/undefined = top-level. */
  parentId?: string | null;
}

// ── Task activity ────────────────────────────────────────────────────────

/**
 * A single entry in a task's activity feed. Appended on every mutation
 * the Activity tab cares about (moves, priority flips, edits, assignee
 * changes, comment posts). Render is a simple reverse-chronological
 * feed — no nesting, no editing. One event = one line.
 *
 * `kind` is intentionally a closed union so the renderer has an
 * exhaustive switch. Adding a new kind means adding a case; unknown
 * kinds from a stale cloud doc render as "did something" rather than
 * crashing.
 *
 * `text` is pre-formatted at write time so we don't need to re-run
 * i18n at render. If we ever need to localise, swap this field for
 * structured parts and keep the shape compatible.
 */
export type TaskActivityKind =
  | 'created'
  | 'moved'
  | 'priority'
  | 'title'
  | 'description'
  | 'dueDate'
  | 'startDate'
  | 'assignee'
  | 'label'
  | 'checklistAdded'
  | 'checklistToggled'
  | 'checklistDeleted'
  | 'checklistRenamed'
  | 'commentAdded'
  | 'commentDeleted'
  | 'archived';

export interface TaskActivity {
  id: string;
  taskId: string;
  actorId: string;
  kind: TaskActivityKind;
  /** Pre-formatted human string, e.g. "moved this card to In Progress". */
  text: string;
  /** ISO timestamp. */
  createdAt: string;
}

// ── Ops tasks ────────────────────────────────────────────────────────────

/**
 * Internal-team task that lives on the Ops board. The Ops board is the
 * agency's own kanban — hiring, finance, brand, legal, tooling, process.
 * No clientId / serviceId because the work isn't tied to a client.
 *
 * Kept separate from `Task` rather than folded into it with a "isOps"
 * flag: every place that reads tasks wants client-scoped rows only, so
 * mixing the two piles would mean wrapping every query in a filter.
 * Two piles, two typed mutators — cleaner at the call site.
 *
 * Labels are free-text strings (e.g. "Hiring", "Legal") rather than
 * BOARD_LABELS ids. The modal renders them via the orphan-label fallback
 * so no picker is wired up for v1; they come in through the seed and
 * stay immutable until we add an ops-label palette.
 *
 * Comments + activity aren't logged on ops cards for v1 — the modal
 * hides both tabs when `kind === 'opsTask'`. When the team actually
 * starts using the Ops board daily, wire them through the same store
 * helpers the Task side already has.
 */
export interface OpsTask {
  id: string;
  title: string;
  columnId: ColumnId;
  priority?: Priority;
  /** Member id — ops tasks resolve through `data.members` like Task
   *  does. The mockup seed stored raw initials; migrate() maps those
   *  to the seeded ops-team Member records on first load. */
  assigneeId: string | null;
  /** Secondary owners. Kept separate from `assigneeId` so the card tile
   *  can still show the primary owner without digging into the array. */
  assigneeIds?: string[];
  /** Free-text label strings. No BOARD_LABELS mapping for ops — the
   *  card renderer falls back to the raw token, which reads fine on
   *  the tile and in the modal's meta row. */
  labels: string[];
  /** ISO date (YYYY-MM-DD). Optional — an ops task can sit without a
   *  date (e.g. "Draft team offsite agenda"). */
  dueDate?: string;
  /** ISO timestamp. */
  createdAt: string;
  // ── Ops-specific display overrides (mockup parity) ────────────────
  /** "Blocked · Xd" / "Waiting · Xd" without needing a real timestamp.
   *  Expressed in days-since-entered; rendered as the due pill when set. */
  enteredDaysAgo?: number;
  /** Force a specific due-mod colour (amber for waiting, red for blocked)
   *  independent of the real dueDate. Only the card tile reads this. */
  overrideMod?: '' | 'due-overdue' | 'due-soon' | 'due-waiting' | 'due-blocked';
  /** Paired label text for `overrideMod` (e.g. "Waiting · 3d"). */
  overrideLabel?: string;
  /** Raw count shown in the card footer. Until comments are wired up
   *  for ops tasks we render this static number rather than computing
   *  from data.taskComments (ops tasks aren't in that table yet). */
  comments?: number;
  /** Same pattern as `comments` — raw count on the card, no backing
   *  attachments table for v1. */
  attachments?: number;
  // ── Card detail (optional — mirrors Task's post-modal fields) ─────
  description?: string;
  checklist?: TaskChecklistItem[];
  startDate?: string;
  archived?: boolean;
  archivedAt?: string;
  /** Slot weight — same shape as Task.slots. Ops tasks count toward
   *  the assignee's daily capacity just like client tasks; a designer
   *  doing internal work consumes the same finite attention. */
  slots?: number;
  /** Same shape as Task.weightStatus. */
  weightStatus?: 'estimated' | 'confirmed';
}

// ── Notifications ────────────────────────────────────────────────────────

export type NotificationType =
  | 'mention'
  | 'assign'
  | 'reply'
  | 'due'
  | 'overdue'
  | 'status'
  | 'system';

/** The notif panel groups the feed by recency buckets. Bucket is
 *  computed server-side (or at seed time) rather than per-render so the
 *  list stays stable as the user reads. */
export type NotificationGroup = 'Today' | 'Yesterday' | 'Earlier';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  group: NotificationGroup;
  /** Short relative-time label ("12m", "Yesterday", "Mon"). Precomputed
   *  because the exact timestamp doesn't matter for this UI — only the
   *  bucket and the short label. */
  ago: string;
  /** HTML string with <strong>/<em> tags for names and item titles. The
   *  mockup treats this as a formatting hint, not arbitrary HTML — we
   *  only render the tags we emit. */
  text: string;
  /** "Client · Area" subtitle under the message. */
  context: string;
  /** Target hash route to navigate to on click. */
  href: string;
}

/** Persisted per-user read/dismissed state. The seed is immutable and
 *  shared across users; this patch layer is the only thing we store. */
export interface NotificationState {
  read: { [id: string]: boolean };
  dismissed: { [id: string]: boolean };
}

/** Per-user notification channel preferences from Account Settings. */
export interface NotificationPreferences {
  digest: boolean;
  wip: boolean;
  mentions: boolean;
  overdue: boolean;
  inapp: boolean;
}

// ── Service templates ────────────────────────────────────────────────────

/** Minimal shape for the Service Templates library. The real SOP content
 *  drops in as managers hand it over (see MEMORY.md). For now a template
 *  is just a key + display name + the short scope blurb the mockup shows
 *  next to each entry. */
export interface ServiceTemplate {
  key: TemplateKey;
  name: string;
  /** One-line summary shown in the template list. */
  summary: string;
  /** Longer description rendered on the detail panel. Optional until
   *  copy arrives from the managers. */
  description?: string;
}

// ── Onboarding ───────────────────────────────────────────────────────────

/**
 * A single setup task on a service's onboarding checklist. Items are
 * template-driven (the labels and grouping come from constants keyed by
 * service template), but the done-state is per-instance so two clients
 * running the same service have independent checklists.
 *
 * We store flat rather than nested so toggling a single item is a cheap
 * patch — no digging through a `Service.onboarding` subtree.
 */
export interface OnboardingItem {
  /** Stable id: `${serviceId}-${slug(label)}`. Rebuilding from the
   *  template is deterministic, so upgrades don't break older docs. */
  id: string;
  serviceId: string;
  /** `client` = "we need this from the client". `us` = "we need to do
   *  this internally". Drives the two-column grouping in the UI. */
  group: 'client' | 'us';
  label: string;
  done: boolean;
}

// ── Notes ────────────────────────────────────────────────────────────────

/**
 * Per-client note. Stores an HTML body (produced by TipTap) rather than
 * markdown so we don't round-trip through a parser on every save. The
 * title is derived from the first non-empty line of the body at render
 * time, not stored separately — a single source of truth means the
 * sidebar list can't drift from the editor.
 *
 * pinned / locked are both per-note toggles: pinned floats to the top
 * of the list; locked flips the editor to read-only (mapping to the
 * mockup's "visibility lock" glyph for "client-facing; don't edit
 * casually").
 */
export interface Note {
  id: string;
  clientId: string;
  /** Sanitised HTML string. Empty when the note is a fresh draft. */
  body: string;
  pinned: boolean;
  locked?: boolean;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. Bumped on every body edit so the list can sort. */
  updatedAt: string;
}

// ── Touchpoints (client meetings + action items) ─────────────────────────

/**
 * How the touchpoint happened. Drives the little icon on the meeting
 * entry — video camera for `meeting`, phone for `call`, envelope for
 * `email`, building for `inperson`. Closed union so a new kind is a
 * type-check failure until the renderer handles it.
 */
export type TouchpointKind = 'meeting' | 'call' | 'email' | 'inperson';

/**
 * A logged meeting or touchpoint with a client. Renders as a card in the
 * Touchpoints tab. Past touchpoints carry a TL;DR and action items;
 * scheduled ones (future) carry an agenda + a calendar link instead.
 */
export interface Touchpoint {
  id: string;
  clientId: string;
  /** Short title — "Weekly sync", "Q2 roadmap review". */
  topic: string;
  /** Full ISO timestamp with time, e.g. "2026-04-22T10:00:00.000Z". The
   *  clock matters here, not just the day, so the meeting card can show
   *  "10:00 AM". */
  occurredAt: string;
  kind: TouchpointKind;
  /** Future vs past. Scheduled=true is an upcoming meeting; flips to
   *  false once `occurredAt` is in the past. Seed-time we set this
   *  explicitly so we don't round-trip a Date for classification. */
  scheduled: boolean;
  /** Mix of Member ids (our side) and Contact ids (their side). Render
   *  looks each id up in both tables and renders the first hit. */
  attendeeIds: string[];
  /** Length of the actual call — shown in the recording link label when
   *  populated. Only set for past touchpoints with a recording. */
  durationMin?: number;
  /** Link to the Fellow/Otter/Grain recording. Omitted means "no recording". */
  recordingUrl?: string;
  /** Display label for the recording button, e.g. "52 min · Fellow". */
  recordingLabel?: string;
  /** External calendar URL for scheduled meetings. Only set when
   *  `scheduled` is true. */
  calendarUrl?: string;
  /** Free text summary of what was decided. Empty string until someone
   *  writes one. Rendered in a grey "Add TL;DR —" empty-state span when
   *  falsy. */
  tldr?: string;
  /** Locks the TL;DR from edit. Set either manually by the AM or
   *  automatically 72h after the meeting (server-side later). Clients
   *  can't unlock without undoing the lock from the history trail. */
  tldrLocked?: boolean;
  /** ISO timestamp when the touchpoint was created in-system. Used as
   *  the secondary sort when two touchpoints share a day. */
  createdAt: string;
}

/**
 * A follow-up task tied to a specific touchpoint. Separate from the
 * kanban Task table because action items are lightweight and stay close
 * to their source meeting — "Promote to card" is the one-way bridge
 * into the Task system for work that needs visibility on a board.
 */
export interface ActionItem {
  id: string;
  touchpointId: string;
  clientId: string;
  text: string;
  assigneeId: string | null;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  done: boolean;
  /** Task id if this action item has been promoted to a kanban card.
   *  Kept so we can show "Open card" instead of "Promote" once promoted,
   *  and so deletes stay consistent if the source action item is
   *  removed. */
  promotedCardId?: string;
}

// ── Meetings (Weekly WIP) ────────────────────────────────────────────────

/** Weekly WIP agenda entry. The mockup's WIP tab is still a stub, but
 *  these are the fields the agenda builder needs once it ships. */
export interface WipAgendaItem {
  id: string;
  clientId: string;
  /** What's being discussed — usually a task title or a free-text topic. */
  title: string;
  /** Who raised it. */
  ownerId: string | null;
  /** Rough priority order in the meeting. 1 = first. */
  rank: number;
  /** Whether the item has been covered in the meeting yet. */
  covered: boolean;
}

/**
 * An agenda item raised by hand via the Add agenda item modal. These
 * persist across sessions (unlike the auto-generated new-clients /
 * urgent / on-track rows, which are derived at render time from live
 * client + task state).
 *
 * `clientId` is optional — some items are cross-cutting ("Team Q2
 * planning") and don't live under a single client. `note` is the free
 * text the user types in the Context field; it's what ends up in the
 * pre-read email.
 *
 * `rank` is kept separate from list position so reorder is a single
 * field patch, not an array rewrite. Lower rank = higher in the list.
 * We assign rank on create as (max existing rank) + 1, so new items
 * land at the bottom of the Manual group by default.
 */
export interface ManualAgendaItem {
  id: string;
  title: string;
  clientId: string | null;
  /** Free text. Shown under the item title in the agenda and in the
   *  pre-read email. Empty string = no context. */
  note: string;
  /** Sort order within the manual group. */
  rank: number;
  /** ISO timestamp — used as a stable secondary sort when ranks tie. */
  createdAt: string;
}

// ── Live meeting captures ────────────────────────────────────────────────

/**
 * A note, decision, or action captured during a Live Meeting via the
 * Quick Capture row. Each entry is tied to the agenda item that was
 * focused when it was captured, so the meeting log reads as a
 * timeline of what was discussed. Action-type captures are the
 * lightest possible TODO — for a full assigned task with due date,
 * the AM still creates a real card on the kanban board.
 */
export type MeetingCaptureType = 'note' | 'decision' | 'action';

export interface MeetingCapture {
  id: string;
  type: MeetingCaptureType;
  /** Free-text body. */
  text: string;
  /** Key of the agenda item the user was on when they captured this.
   *  Lets the meeting log group captures by topic. */
  agendaItemKey: string;
  /** Snapshot of the agenda item's label at capture time. Stored
   *  rather than resolved later because the underlying item (a
   *  client, task, or manual entry) might be deleted by the next
   *  time someone reads the log. */
  agendaItemLabel: string;
  /** ISO timestamp. Used to filter captures to the current meeting
   *  session and to sort the running log newest-last. */
  createdAt: string;
}

// ── Aggregate ────────────────────────────────────────────────────────────

/**
 * Everything the unified store exposes. Matches the shape of
 * window.FLIZOW_DATA so the port can cross-reference the mockup without
 * translating field names.
 */
export interface FlizowData {
  clients: Client[];
  services: Service[];
  tasks: Task[];
  members: Member[];
  integrations: Integration[];
  onboardingItems: OnboardingItem[];
  contacts: Contact[];
  quickLinks: QuickLink[];
  notes: Note[];
  touchpoints: Touchpoint[];
  actionItems: ActionItem[];
  /** Flat list of every comment on every task. We bucket by taskId at
   *  read time rather than nesting under Task so a single
   *  update-comment call is a simple array patch. */
  taskComments: TaskComment[];
  /** Flat list of every activity entry. Append-only — we never edit an
   *  existing row. Cascade-deleted when its task goes away. */
  taskActivity: TaskActivity[];
  /** Manual agenda items added via the WIP page's "Add agenda item"
   *  button. The auto-generated agenda groups (new-clients / urgent /
   *  on-track) derive from live data at render time and don't live in
   *  the store. */
  manualAgendaItems: ManualAgendaItem[];
  /** Live-meeting Quick Capture log. Notes, decisions, and actions
   *  captured during the WIP meeting via the N/D/A keys (or the
   *  matching buttons on the Live tab). Persists past meeting end so
   *  the log can be reviewed later or exported into the pre-read for
   *  next week. Each entry remembers which agenda item was focused at
   *  capture time so the log groups by topic. */
  meetingCaptures: MeetingCapture[];
  /** Per-day cap overrides for individual members. Each row says
   *  "this member's cap on this date is X/Y" and beats the member's
   *  standing capSoft/capMax for that date. Used for PTO,
   *  workshop-heavy days, and other partial-availability cases.
   *  Empty array on a fresh workspace. */
  memberDayOverrides: MemberDayOverride[];
  /** The "today" reference the mockup uses for all date math. A single
   *  anchor keeps the UI stable across re-renders. */
  today: string;
  /** Internal-team tasks shown on the Ops board. Separate pile from
   *  `tasks` because the Ops board has no client/service scope and the
   *  two would otherwise need a filter on every read. */
  opsTasks: OpsTask[];
  /** Map from schedule-seed id → the service id the card lives on. */
  scheduleTaskMap: { [scheduleId: string]: string };
  /** Service ids the user has starred. These render as the "My Boards"
   *  strip on the Overview so the boards you open every day are one
   *  click away. Order is insertion — newest star lands at the end of
   *  the strip; re-starring a service bumps it to the end. */
  favoriteServiceIds: string[];
  /** Edits to built-in templates (overrides) plus any user-created
   *  templates. Each entry is keyed by id; the resolver in
   *  `data/templates.ts` overlays these onto BUILT_IN_TEMPLATES at
   *  read time. Empty by default — a fresh install renders the five
   *  built-in templates as-is. Audit: templates M2 (admin editor). */
  templateOverrides: TemplateRecord[];
  /** Light vs dark mode. Used to be owned by the legacy BoardStore;
   *  moved here so we can retire that store. App.tsx reads this and
   *  syncs to `document.documentElement` (class + data-theme attr).
   *  Audit: D3 (BoardStore retirement). */
  theme: 'light' | 'dark';
  /** One-shot gate for the Ops auto-seed. The Ops board used to
   *  populate itself with 12+ fake team members + a dozen demo
   *  tasks on every fresh install — confusing for a real first-run
   *  user evaluating the app ("who are these people?"). Now seeds
   *  only run when this flag is unset AND the workspace already has
   *  data (legacy migration path); brand-new users land on a clean
   *  empty Ops board. The "Try the demo" CTA in the welcome banner
   *  is the explicit path to a populated workspace. Once flipped to
   *  true, the seeds never run again. */
  opsSeeded: boolean;
  /** Project Brief for the Ops board — the internal team's working
   *  notes / charter / standing-meeting agenda doc. Same shape as
   *  Service.brief but lives at the workspace level because the Ops
   *  board itself is workspace-wide (not per-service). HTML rich text
   *  from TipTap. Absent / empty = no brief written yet. */
  opsBrief?: string;
  /** ISO timestamp the ops brief was last saved. Drives the
   *  "Last updated · X ago" indicator on the Ops board's brief strip. */
  opsBriefUpdatedAt?: string;
  /** Workspace-wide Trash bin. Soft-deleted items live here for 90
   *  days before auto-empty. Holds notes, contacts, quick links,
   *  comments, touchpoints, action items, onboarding items, manual
   *  agenda items, tasks, ops tasks, services, clients, and
   *  user-created templates. Cascading deletes (client/service)
   *  bundle every child into a single TrashEntry so restore is
   *  atomic — restoring a deleted client brings every cascade
   *  child back with it.
   *
   *  Three things are deliberately excluded from Trash and stay
   *  hard-delete: checklist items (chatty), meeting captures
   *  (live-meeting scratch), and notification dismissals (system
   *  noise). The undo toast catches accidental clicks on those.
   *
   *  Empty array on a fresh workspace; backfilled by migrate() on
   *  legacy data. */
  trash: TrashEntry[];
}

// ── Trash bin ────────────────────────────────────────────────────────────

/**
 * Discriminator for Trash entries. Maps 1:1 to which `data.<array>` the
 * payload came from — drives both the icon shown in the Trash UI and
 * which restore branch fires when the user clicks Restore.
 *
 * Three categories of soft-deletable thing skip Trash and remain
 * hard-delete (handled via the undo toast instead): checklist items
 * inside cards, meeting captures, and notification dismissals.
 */
export type TrashKind =
  | 'note'
  | 'contact'
  | 'quickLink'
  | 'comment'
  | 'touchpoint'
  | 'actionItem'
  | 'onboardingItem'
  | 'manualAgendaItem'
  | 'task'
  | 'opsTask'
  | 'service'
  | 'client'
  | 'template';

/**
 * Cascade payload for a deleted client. Restoring a client TrashEntry
 * walks every field here and re-pushes them into their respective
 * top-level FlizowData arrays in one atomic save() — same shape that
 * existed before the delete, minus any fields that were already missing
 * (e.g. no `actionItems` for a client that never had any).
 *
 * Lives in its own type rather than inline because the client cascade is
 * the largest in the system and reads more clearly as a named block.
 */
export interface ClientCascadePayload {
  services: Service[];
  tasks: Task[];
  comments: TaskComment[];
  activity: TaskActivity[];
  contacts: Contact[];
  quickLinks: QuickLink[];
  notes: Note[];
  touchpoints: Touchpoint[];
  actionItems: ActionItem[];
  onboardingItems: OnboardingItem[];
  integrations: Integration[];
}

/**
 * Discriminated union — every TrashKind has a shape that matches what
 * needs to be restored. Tasks bundle their comments + activity. Services
 * bundle their tasks + comments + activity + onboarding. Clients bundle
 * the whole subtree.
 *
 * The top-level `kind` on TrashEntry duplicates this `kind` so a UI can
 * filter the trash list without unwrapping every payload — small dup,
 * worth the ergonomics.
 */
export type TrashPayload =
  | { kind: 'note'; data: Note }
  | { kind: 'contact'; data: Contact }
  | { kind: 'quickLink'; data: QuickLink }
  | {
      kind: 'comment';
      data: TaskComment;
      /** Replies cascaded with the parent comment. Empty array when
       *  the deleted comment was itself a reply (no children to bring
       *  along). Populated when a top-level comment was deleted —
       *  restoring the parent restores its thread atomically. */
      replies: TaskComment[];
    }
  | { kind: 'touchpoint'; data: Touchpoint; actionItems: ActionItem[] }
  | { kind: 'actionItem'; data: ActionItem }
  | { kind: 'onboardingItem'; data: OnboardingItem }
  | { kind: 'manualAgendaItem'; data: ManualAgendaItem }
  | { kind: 'task'; data: Task; comments: TaskComment[]; activity: TaskActivity[] }
  | { kind: 'opsTask'; data: OpsTask; activity: TaskActivity[] }
  | { kind: 'service'; data: Service; tasks: Task[]; comments: TaskComment[]; activity: TaskActivity[]; onboardingItems: OnboardingItem[] }
  | { kind: 'client'; data: Client; cascade: ClientCascadePayload }
  | { kind: 'template'; data: TemplateRecord };

/**
 * One row in `data.trash`. Created by `flizowStore.sendToTrash()` when
 * a soft-deletable thing is deleted; consumed by `restoreFromTrash()`,
 * `purgeFromTrash()`, or the 90-day auto-empty path.
 *
 * Field choices:
 *   - `id` is distinct from the original record's id so you can re-trash
 *     an item that was previously trashed + restored without colliding
 *   - `kind` duplicates the payload's kind so list filtering is cheap
 *   - `deletedBy` is `null` when no member context exists (rare — only
 *     happens before the first sign-in or in some demo paths). Real
 *     deletes always carry the actor's member id for the audit trail
 *   - `preview` is a short string for the row label; the UI may
 *     truncate further but we always store something non-empty
 *   - `parentLabel` is optional human context ("in Acme Corp") shown
 *     under the row. Resolved at delete time so a later parent rename
 *     doesn't drift the trash row out of sync
 */
export interface TrashEntry {
  id: string;
  kind: TrashKind;
  deletedAt: string;
  deletedBy: string | null;
  preview: string;
  parentLabel?: string;
  payload: TrashPayload;
}
