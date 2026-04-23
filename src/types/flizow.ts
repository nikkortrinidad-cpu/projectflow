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
  /** The "today" reference the mockup uses for all date math. A single
   *  anchor keeps the UI stable across re-renders. */
  today: string;
  /** Map from schedule-seed id → the service id the card lives on. */
  scheduleTaskMap: { [scheduleId: string]: string };
}
