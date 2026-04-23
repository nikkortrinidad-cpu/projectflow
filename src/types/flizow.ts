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
  industry: string;
  industryCategory: IndustryCategory;
  amId: string | null;
  /** Monthly recurring revenue in USD. Stub values from the mockup
   *  generator; real numbers come from the billing integration later. */
  mrr: number;
  /** ISO date (YYYY-MM-DD). When the retainer next renews. */
  renewsAt: string;
  /** ISO date. When this client first onboarded. */
  startedAt: string;
  /** Ordered — oldest first, except project services get unshifted to the
   *  top so new work surfaces at the start of the strip. */
  serviceIds: string[];
  /** Operators attached to this client, above and beyond the AM. The AM
   *  lives on `amId` — this is the "Project team" you see in the About
   *  tab's Team section. Ordered by add-time; dedupe at write. */
  teamIds: string[];
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
  | 'commentDeleted';

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
  /** The "today" reference the mockup uses for all date math. A single
   *  anchor keeps the UI stable across re-renders. */
  today: string;
  /** Map from schedule-seed id → the service id the card lives on. */
  scheduleTaskMap: { [scheduleId: string]: string };
  /** Service ids the user has starred. These render as the "My Boards"
   *  strip on the Overview so the boards you open every day are one
   *  click away. Order is insertion — newest star lands at the end of
   *  the strip; re-starring a service bumps it to the end. */
  favoriteServiceIds: string[];
}
