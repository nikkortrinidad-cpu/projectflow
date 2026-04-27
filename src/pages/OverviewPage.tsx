import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import type { Client, Task, ClientStatus, OnboardingItem, Service } from '../types/flizow';

/** localStorage key for the one-time first-run welcome banner. Versioned
 *  so a future revision can re-show the banner if we change the
 *  onboarding hand-off. */
const WELCOME_KEY = 'flizow-welcome-dismissed-v1';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstNameOf(displayName: string | null | undefined): string {
  if (!displayName) return 'there';
  return displayName.split(' ')[0] || 'there';
}

export function OverviewPage() {
  const { user } = useAuth();
  const { data, store } = useFlizow();

  // First-run welcome banner. Renders only when (a) the user hasn't
  // dismissed it before and (b) the workspace is genuinely empty
  // (zero clients). Dismissed via the close button OR by triggering
  // either CTA. Once a client lands in the store, the banner stops
  // matching the visibility predicate even without the flag — so
  // someone who adds a client without dismissing won't see it
  // re-appear later if they delete that client. Audit: first-run B5.
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(WELCOME_KEY) === 'true'; } catch { return false; }
  });
  // If the user already has clients (returning user, or imported via
  // demo before the banner shipped), set the flag silently so we
  // don't pop the banner if they ever clear their workspace later.
  useEffect(() => {
    if (data.clients.length > 0 && !welcomeDismissed) {
      try { localStorage.setItem(WELCOME_KEY, 'true'); } catch {}
      setWelcomeDismissed(true);
    }
  }, [data.clients.length, welcomeDismissed]);
  function dismissWelcome() {
    try { localStorage.setItem(WELCOME_KEY, 'true'); } catch {}
    setWelcomeDismissed(true);
  }
  async function handleTryDemo() {
    dismissWelcome();
    await store.loadDemoData();
  }
  function handleAddFirst() {
    dismissWelcome();
    navigate('#clients');
  }
  // Suppress the welcome banner for non-owners (invited members).
  // Landing in someone else's empty workspace and seeing "Try the demo
  // / Add my first client" is wrong — it's not THEIR workspace to fill
  // up, and clicking demo would dump fake clients into the shared
  // workspace for everyone. Banner is owner-only. Audit: workspace MVP.
  const wsMeta = useSyncExternalStore(store.subscribeWorkspace, store.getWorkspaceMeta);
  const isWorkspaceOwner = !wsMeta || wsMeta.ownerUid === user?.uid;
  const showWelcome = isWorkspaceOwner && !welcomeDismissed && data.clients.length === 0;
  // Land on "next week" when today is Sat/Sun — the 5-col grid skips the
  // weekend, so "this week" would be 100% grayed out and useless. Lazy
  // init so this only runs once on mount.
  const [weekTab, setWeekTab] = useState<'current' | 'next'>(() => {
    const dow = new Date().getDay();
    return dow === 0 || dow === 6 ? 'next' : 'current';
  });
  const now = new Date();
  const greetingLine = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  const title = `${greetingFor(now.getHours())}, ${firstNameOf(user?.displayName)}.`;

  // Portfolio health counts, computed from live client statuses. `active`
  // is everything that isn't paused — the Overview is about what's in
  // play, so a paused retainer doesn't count toward "active clients"
  // but still lives on the Clients page. Memoized because it recomputes
  // on every client write otherwise.
  const health = useMemo(() => {
    const byStatus: Record<ClientStatus, number> = {
      fire: 0, risk: 0, track: 0, onboard: 0, paused: 0,
    };
    for (const c of data.clients) byStatus[c.status]++;
    return {
      fire: byStatus.fire,
      risk: byStatus.risk,
      track: byStatus.track,
      active: data.clients.length - byStatus.paused,
    };
  }, [data.clients]);

  // Archived tasks are hidden from every Overview panel — they don't
  // contribute to client health, schedule entries, or needs-attention
  // counts. Pre-filter once so every downstream builder sees the same
  // view of "active work."
  const liveTasks = useMemo(() => data.tasks.filter(t => !t.archived), [data.tasks]);

  // Needs-attention cards — the clients you actually need to open today.
  // Order: fire first, then risk, then unfinished onboarding (mine).
  // Default cap of 6 keeps the block scannable; the "View all N tasks"
  // toggle expands in place to show the full list (and "Show less"
  // collapses back).
  //
  // The currentMemberId filter applies to onboarding only — fire/risk
  // are workspace-wide. Onboarding is "you forgot to chase this," so
  // it has to attribute to whoever owns the client (the AM). Without
  // this filter every AM would see every other AM's stalled
  // onboarding.
  const currentMemberId = store.getCurrentMemberId();
  const ATTENTION_INITIAL_CAP = 6;
  const allAttention = useMemo(
    () => buildAttentionCards(
      data.clients,
      liveTasks,
      data.onboardingItems,
      data.services,
      currentMemberId,
    ),
    [data.clients, liveTasks, data.onboardingItems, data.services, currentMemberId],
  );
  const [attentionExpanded, setAttentionExpanded] = useState(false);
  const attention = attentionExpanded
    ? allAttention
    : allAttention.slice(0, ATTENTION_INITIAL_CAP);
  const hasMoreAttention = allAttention.length > ATTENTION_INITIAL_CAP;
  // If the list shrinks back below the cap (a teammate cleared some
  // urgent work, etc.) while we're expanded, snap back to collapsed —
  // there's nothing left to "show less" of, and the toggle button
  // disappears anyway. Wrapped in an effect to avoid setState-during-
  // render warnings.
  useEffect(() => {
    if (attentionExpanded && !hasMoreAttention) {
      setAttentionExpanded(false);
    }
  }, [attentionExpanded, hasMoreAttention]);

  // Schedule grid: Mon–Fri this week + Mon–Fri next week. Tasks with a
  // `_schedule` meta (deadline/meeting/milestone) and touchpoints with
  // scheduled=true both land here — task pools cover internal work,
  // touchpoints cover client meetings, and the schedule is the one
  // place they have to overlap.
  const weekDays = useMemo(() => {
    return buildWeekGrid(liveTasks, new Date());
  }, [liveTasks]);
  // Tab labels use the week's date range ("Apr 22 – 26") so the user
  // sees at a glance what they're looking at without decoding which
  // Monday we anchored on.
  const weekLabels = useMemo(() => {
    const current = weekDays.filter(d => d.week === 'current');
    const next = weekDays.filter(d => d.week === 'next');
    return {
      current: formatWeekRange(current[0]?.iso, current[current.length - 1]?.iso),
      next: formatWeekRange(next[0]?.iso, next[next.length - 1]?.iso),
    };
  }, [weekDays]);

  // My Boards chips — resolved from favoriteServiceIds so the strip
  // order mirrors the order the user starred things (newest at the
  // end). A favorite whose underlying service has been deleted is
  // dropped on cascade in the store, so every id here should resolve.
  const myBoards = useMemo(() => {
    const svcById = new Map(data.services.map((s) => [s.id, s]));
    const clientById = new Map(data.clients.map((c) => [c.id, c]));
    const out: Array<{ service: typeof data.services[number]; client: typeof data.clients[number] }> = [];
    for (const id of data.favoriteServiceIds) {
      const service = svcById.get(id);
      if (!service) continue;
      const client = clientById.get(service.clientId);
      if (!client) continue;
      out.push({ service, client });
    }
    return out;
  }, [data.favoriteServiceIds, data.services, data.clients]);

  return (
    <div className="view view-overview active">
      <main className="page">
        {/* First-run welcome banner. Only renders when the workspace
            is genuinely empty AND the banner hasn't been dismissed.
            Two CTAs (demo vs add-first) covers both evaluator paths
            without forcing one. The banner sits above the page
            header so it claims attention before "Good morning…",
            but uses tinted card styling so it reads as a hint, not
            a takeover. Audit: first-run B5. */}
        {showWelcome && (
          <section className="welcome-banner" role="region" aria-label="Welcome to Flizow">
            <div className="welcome-banner-text">
              <h2 className="welcome-banner-title">
                Welcome to Flizow, {firstNameOf(user?.displayName)}.
              </h2>
              <p className="welcome-banner-sub">
                Your workspace is empty. Try the demo to see what Flizow looks like with sample clients,
                or jump in by adding your first one.
              </p>
            </div>
            <div className="welcome-banner-actions">
              <button
                type="button"
                className="welcome-banner-cta-primary"
                onClick={handleTryDemo}
              >
                Try the demo
              </button>
              <button
                type="button"
                className="welcome-banner-cta-secondary"
                onClick={handleAddFirst}
              >
                Add my first client
              </button>
              <button
                type="button"
                className="welcome-banner-dismiss"
                aria-label="Dismiss welcome message"
                onClick={dismissWelcome}
                title="Dismiss"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </section>
        )}

        {/* Two-line header: the greeting eyebrow + the title. The
            rotating tagline row used to sit below, rendering one of
            14 strings per day-of-year — ambient decoration with no
            signal on a page whose job is to surface urgent work.
            Dropping it also lifts the first data block ~20-40px
            closer to the top of the viewport. Audit: overview M1 +
            M4. */}
        <div className="page-header">
          <div className="page-greeting">{greetingLine}</div>
          <div className="page-title">{title}</div>
        </div>

        {/* BLOCK 1 — Portfolio Health */}
        {/* Each block is a logical region, so we give it role="region"
            + aria-labelledby pointing at the block title. Screen reader
            users can now jump between blocks with R (landmarks). Before
            this, every block rendered as a plain div and was invisible
            to landmark navigation. Audit: overview L2. */}
        <section
          className="block"
          data-block-id="health"
          role="region"
          aria-labelledby="block-health-title"
        >
          <div className="block-header">
            <div className="block-title" id="block-health-title">Portfolio Health</div>
            <div className="block-sub"><span>Across {health.active} active clients</span></div>
          </div>
          <div className="health-strip">
            {/* Each health cell deep-links to the pre-filtered Clients
                page via `#clients/view/<id>`. Before this, the aria-label
                promised a filtered drill-in but the onClick landed on the
                unfiltered page, which SR users read as a lie and sighted
                users read as a wasted click. Audit: overview.md H1. */}
            <HealthCell
              label="On Fire"
              value={health.fire}
              sub="needs you now"
              valueClass="urgent"
              iconClass="alert"
              onClick={() => navigate('#clients/view/fire')}
              ariaLabel="View On Fire clients"
              icon={<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />}
            />
            <div className="health-divider" />
            <HealthCell
              label="At Risk"
              value={health.risk}
              sub="need review"
              onClick={() => navigate('#clients/view/risk')}
              ariaLabel="View At Risk clients"
              icon={<>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </>}
            />
            <div className="health-divider" />
            <HealthCell
              label="On Track"
              value={health.track}
              sub="clients healthy"
              onClick={() => navigate('#clients/view/track')}
              ariaLabel="View On Track clients"
              icon={<polyline points="20 6 9 17 4 12" />}
            />
          </div>
        </section>

        {/* BLOCK 2 — Needs Your Attention */}
        <section
          className="block"
          data-block-id="attention"
          role="region"
          aria-labelledby="block-attention-title"
        >
          <div className="block-header">
            <div className="block-title" id="block-attention-title">Needs Your Attention</div>
          </div>
          <div className="attention-list" id="attention-list">
            {attention.length === 0 ? (
              <div className="attn-empty" style={{ padding: 24, color: 'var(--text-soft)', fontSize: 14 }}>
                Nothing urgent right now. Enjoy the quiet.
              </div>
            ) : (
              <>
                {attention.map((card) => {
                  // Card variant + severity-pill class share the same
                  // tier name. Three tiers: critical (fire) → warn
                  // (risk) → onboard (preventive). Class names match
                  // the CSS modifiers so styling stays per-tier.
                  const cardTier =
                    card.severity === 'critical' ? 'critical'
                    : card.severity === 'warning' ? 'warn'
                    : 'onboard';
                  const sevTier =
                    card.severity === 'critical' ? 'critical'
                    : card.severity === 'warning' ? 'warning'
                    : 'onboarding';
                  // Deep-link target. When the attention card is
                  // backed by a specific kanban task (overdue or
                  // blocked), open that card's modal directly via
                  // `#board/{svcId}/card/{cardId}`. BoardPage's
                  // auto-open effect catches the URL and pops the
                  // modal. When there's no primary task (onboarding
                  // cards, or status-only fire alerts), fall back to
                  // the client detail page.
                  const target =
                    card.primaryTaskId && card.primaryServiceId
                      ? `#board/${card.primaryServiceId}/card/${card.primaryTaskId}`
                      : `#clients/${card.clientId}`;
                  const ariaLabel = card.primaryTaskTitle
                    ? `Open card: ${card.primaryTaskTitle} (${card.clientName})`
                    : `Open ${card.clientName}`;
                  return (
                    <div
                      key={card.clientId}
                      className={`attn-card ${cardTier}`}
                      role="button"
                      tabIndex={0}
                      aria-label={ariaLabel}
                      onClick={() => navigate(target)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(target);
                        }
                      }}
                    >
                      <div className="attn-content">
                        <div className="attn-row1">
                          <span className={`attn-severity ${sevTier}`}>
                            <span className="dot" />{card.severityLabel}
                          </span>
                          <span className="attn-client">{card.clientName}</span>
                          <span className="attn-age">{card.ageLabel}</span>
                        </div>
                        <div className="attn-title">{card.title}</div>
                        {card.desc && <div className="attn-desc">{card.desc}</div>}
                      </div>
                    </div>
                  );
                })}
                {hasMoreAttention && (
                  <button
                    type="button"
                    className="attn-more"
                    onClick={() => setAttentionExpanded((v) => !v)}
                    aria-expanded={attentionExpanded}
                    aria-controls="attention-list"
                  >
                    {attentionExpanded
                      ? 'Show less ↑'
                      : `View all ${allAttention.length} tasks ↓`}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* BLOCK 4 — Schedule */}
        <section
          className="block"
          data-block-id="schedule"
          role="region"
          aria-labelledby="block-schedule-title"
        >
          <div className="block-header">
            <div className="block-title" id="block-schedule-title">Schedule</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Toggle buttons — NOT ARIA tabs (no paired tabpanel below
                  these; the schedule grid swaps content in place via the
                  .show-next class). aria-pressed conveys the active state
                  to screen readers without lying about a panel
                  relationship. role="group" gives the pair a single
                  landmark. Audit: overview re-audit HIGH (matches the
                  notifications-panel filter-button fix). */}
              <div className="week-tabs" role="group" aria-label="Schedule week">
                <button
                  type="button"
                  className={`week-tab ${weekTab === 'current' ? 'active' : ''}`}
                  aria-pressed={weekTab === 'current'}
                  onClick={() => setWeekTab('current')}
                >
                  This week
                  <span style={{ fontWeight: 400, color: 'var(--text-soft)', marginLeft: 6 }}>
                    {weekLabels.current}
                  </span>
                </button>
                <button
                  type="button"
                  className={`week-tab ${weekTab === 'next' ? 'active' : ''}`}
                  aria-pressed={weekTab === 'next'}
                  onClick={() => setWeekTab('next')}
                >
                  Next week
                  <span style={{ fontWeight: 400, color: 'var(--text-soft)', marginLeft: 6 }}>
                    {weekLabels.next}
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={`week-board${weekTab === 'next' ? ' show-next' : ''}`}>
            {weekDays.map((d) => (
              <div
                key={d.iso}
                className={`week-col${d.isToday ? ' is-today' : ''}${d.isPast ? ' is-past' : ''}`}
                data-iso={d.iso}
                data-week={d.week}
              >
                <div className="week-col-header">
                  <div className="week-col-date">{d.dateLabel}</div>
                  <div className="week-col-day">{d.dayName}</div>
                </div>
                <div className="week-col-body">
                  {d.items.map((item) => (
                    <a
                      key={item.id}
                      className="week-task"
                      href={item.href}
                      data-done={item.done ? 'true' : 'false'}
                      aria-label={`Open ${item.title}`}
                    >
                      <div className="week-task-title">{item.title}</div>
                      {item.meta && <div className="week-task-meta">{item.meta}</div>}
                      <span className={`week-task-tag ${item.tag}`}>
                        <ScheduleTagIcon tag={item.tag} />
                        {TAG_LABEL[item.tag]}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BLOCK 5 — My Boards */}
        <section
          className="block"
          data-block-id="myboards"
          role="region"
          aria-labelledby="block-myboards-title"
        >
          <div className="block-header">
            <div className="block-title" id="block-myboards-title">My Boards</div>
            {myBoards.length > 0 && (
              <div className="block-sub"><span>{myBoards.length} pinned</span></div>
            )}
          </div>
          <div className={`pinned-wrap pinned-wrap--inline${myBoards.length === 0 ? ' has-empty' : ''}`}>
            <div className="pinned-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <div>
                <div className="pinned-empty-title">No boards favorited yet</div>
                <div className="pinned-empty-sub">Open any client and tap the star on a service to pin its board here.</div>
              </div>
              <a className="pinned-empty-cta" href="#clients">Browse clients →</a>
            </div>
            <div className="pinned-strip">
              {myBoards.map(({ service, client }) => (
                <a
                  key={service.id}
                  className="board-chip"
                  href={`#board/${service.id}`}
                  data-status={client.status}
                  aria-label={`Open ${service.name} board for ${client.name}`}
                >
                  <div className={`board-chip-logo ${client.logoClass}`}>{client.initials}</div>
                  <div className="board-chip-body">
                    <div className="board-chip-name">{service.name}</div>
                    <div className="board-chip-meta">
                      {client.name}
                      <span className="sep">·</span>
                      {service.type === 'project' ? 'Project' : 'Retainer'}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

type HealthCellProps = {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  valueClass?: string;
  iconClass?: string;
};

// ── Schedule grid (Block 4) ────────────────────────────────────────────────

// 'meeting' stays in the union for back-compat with existing data
// that may still carry the tag, but the schedule builder filters
// those tasks out before they reach the render path. The icon +
// label entries below are dead for new data; left in defensively.
type ScheduleTag = 'deadline' | 'meeting' | 'milestone';
const TAG_LABEL: Record<ScheduleTag, string> = {
  deadline: 'Deadline',
  meeting: 'Meeting',
  milestone: 'Milestone',
};

type ScheduleItem = {
  id: string;
  title: string;
  meta?: string;
  tag: ScheduleTag;
  done: boolean;
  href: string;
};

type WeekDay = {
  iso: string;
  week: 'current' | 'next';
  dayName: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  items: ScheduleItem[];
};

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAY_NAMES_MF = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function isoOfLocalDate(d: Date): string {
  // Build YYYY-MM-DD from local components so we never slip a day on
  // UTC offset quirks. Task dueDates and our cell ids both live in
  // local calendar space.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWeekRange(startIso: string | undefined, endIso: string | undefined): string {
  if (!startIso || !endIso) return '';
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const startMo = MONTHS_SHORT[sm - 1];
  if (sy === ey && sm === em) {
    return `${startMo} ${sd}–${ed}`;
  }
  return `${startMo} ${sd} – ${MONTHS_SHORT[em - 1]} ${ed}`;
}

function buildWeekGrid(
  tasks: Task[],
  today: Date,
): WeekDay[] {
  // Anchor on Monday of today's week. Sunday is dow=0 and wraps back six
  // days to reach the Monday that just passed — same behavior as the
  // mockup's _ddMondayOf helper so demo data aligns.
  const dow = today.getDay();
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() + daysToMonday);

  const todayKey = isoOfLocalDate(today);

  // Schedule is task-due-date-driven now. Every task with a dueDate
  // gets a chip on its day, no `_schedule` opt-in required. Two
  // exclusions:
  //   - Tasks whose existing _schedule.tag is 'meeting' get filtered
  //     out — meetings no longer surface here. Live touchpoints
  //     (which used to populate the grid as 'meeting') were also
  //     dropped from this builder; they still exist on the client
  //     detail's Touchpoints tab.
  //   - Done tasks pass through but render with the done style; they
  //     don't pollute the active count.
  const byDate: Record<string, ScheduleItem[]> = {};
  for (const t of tasks) {
    if (!t.dueDate) continue;
    if (t._schedule?.tag === 'meeting') continue;
    const bucket = (byDate[t.dueDate] ||= []);
    // Pull tag/meta/done from _schedule when present (tasks the
    // user explicitly tagged as deadlines or milestones); fall back
    // to 'deadline' for plain task due dates.
    const tag: ScheduleTag = t._schedule?.tag ?? 'deadline';
    bucket.push({
      id: t.id,
      title: t.title,
      meta: t._schedule?.meta || undefined,
      tag,
      done: !!t._schedule?.done,
      // Deep-link to the specific kanban card modal so clicking a
      // schedule chip opens the work directly (matches the
      // attention-card behaviour). BoardPage's auto-open effect
      // catches the URL.
      href: `#board/${t.serviceId}/card/${t.id}`,
    });
  }

  const days: WeekDay[] = [];
  for (let i = 0; i < 10; i++) {
    // Step Mon-Fri, then jump two to skip Sat/Sun, then Mon-Fri again.
    const offset = i < 5 ? i : i + 2;
    const d = new Date(monday);
    d.setDate(d.getDate() + offset);
    const iso = isoOfLocalDate(d);
    days.push({
      iso,
      week: i < 5 ? 'current' : 'next',
      dayName: DAY_NAMES_MF[i % 5],
      dateLabel: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      isToday: iso === todayKey,
      isPast: iso < todayKey,
      items: byDate[iso] || [],
    });
  }

  return days;
}

function ScheduleTagIcon({ tag }: { tag: ScheduleTag }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (tag === 'deadline') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  if (tag === 'meeting') {
    return (
      <svg {...common}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  // milestone
  return (
    <svg {...common}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

// ── Needs-your-attention (Block 2) ─────────────────────────────────────────

type AttentionCard = {
  clientId: string;
  clientName: string;
  /** critical = client status fire (drop everything).
   *  warning  = client status risk (drifting).
   *  onboarding = unfinished onboarding for one of the user's clients
   *               (preventive — easy to skip, causes mid-project
   *                delays per the AM workflow rationale). */
  severity: 'critical' | 'warning' | 'onboarding';
  severityLabel: 'On Fire' | 'At Risk' | 'Onboarding';
  title: string;
  ageLabel: string;
  desc?: string;
  /** When set, clicking the card deep-links to a specific kanban
   *  card modal (`#board/{primaryServiceId}/card/{primaryTaskId}`)
   *  instead of the client detail page. Picked from the worst-case
   *  open task for the client — oldest overdue, then first blocked,
   *  then nothing (falls back to client detail).
   *
   *  Onboarding cards leave both unset because onboarding items
   *  aren't kanban cards; they live on the client detail's
   *  onboarding tab. Click → client detail page. */
  primaryTaskId?: string;
  primaryServiceId?: string;
  /** Title of the primary task (e.g., "Draft launch post") so the
   *  attention card's description can hint which specific card the
   *  click will open. Reads better than just "3 overdue cards →". */
  primaryTaskTitle?: string;
};

// Why we group by client (not by task): the AM's first move when the
// Overview surfaces something urgent is to open the client and look at
// the whole picture — which service is bleeding, what the last touchpoint
// said, whether a retainer is up for renewal. A card per task would push
// the same client 3x when they have three overdue items, which trains
// the eye to ignore repeats instead of act on them.
//
// Onboarding cards live in the same feed but use a softer severity
// ('onboarding'). Reason: unfinished onboarding gets overlooked — the
// AM is heads-down on cards in flight, the seeded-but-unchecked
// onboarding list quietly rots, and 3 weeks later the project hits a
// blocker traceable to a missing brand asset or unsigned MSA from
// onboarding. Surfacing it here is preventive: not "this is on fire
// right now," but "this WILL be on fire if you don't close it out."
function buildAttentionCards(
  clients: Client[],
  tasks: Task[],
  onboardingItems: OnboardingItem[],
  services: Service[],
  currentMemberId: string | null,
): AttentionCard[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Enrich each at-risk/on-fire client with the urgency metrics we'll
  // need for sorting AND for card copy. Computing overdue/blocked once
  // here saves the second pass in the old flow.
  const enriched = clients
    .filter((c) => c.status === 'fire' || c.status === 'risk')
    .map((c) => {
      const openTasks = tasks.filter((t) => t.clientId === c.id && t.columnId !== 'done');
      const overdue = openTasks.filter((t) => {
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);
        return due.getTime() < todayMs;
      });
      const blocked = openTasks.filter((t) => t.columnId === 'blocked');
      let oldestDueMs = Infinity;
      for (const t of overdue) {
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due.getTime() < oldestDueMs) oldestDueMs = due.getTime();
      }
      return { client: c, overdue, blocked, oldestDueMs };
    });

  // Sort by severity (fire before risk), then by total urgent items
  // desc, then by oldest overdue asc.
  enriched.sort((a, b) => {
    const sevA = a.client.status === 'fire' ? 0 : 1;
    const sevB = b.client.status === 'fire' ? 0 : 1;
    if (sevA !== sevB) return sevA - sevB;
    const urgA = a.overdue.length + a.blocked.length;
    const urgB = b.overdue.length + b.blocked.length;
    if (urgA !== urgB) return urgB - urgA;
    return a.oldestDueMs - b.oldestDueMs;
  });

  const fireRiskCards: AttentionCard[] = enriched.map(
    ({ client: c, overdue, blocked, oldestDueMs }) => {
      const isCritical = c.status === 'fire';

      let title: string;
      if (overdue.length && blocked.length) {
        title = `${overdue.length} overdue · ${blocked.length} blocked`;
      } else if (overdue.length) {
        title = overdue.length === 1 ? '1 overdue card' : `${overdue.length} overdue cards`;
      } else if (blocked.length) {
        title = blocked.length === 1 ? '1 blocked card' : `${blocked.length} blocked cards`;
      } else if (isCritical) {
        title = 'Marked on fire — no blocker logged yet';
      } else {
        title = 'Drifting — time for a check-in';
      }

      // Age label anchors on the oldest overdue task so the AM sees
      // worst-case staleness at a glance. Falls back to a status hint
      // when nothing is measurably late.
      let ageLabel: string;
      if (overdue.length) {
        const days = Math.max(1, Math.floor((todayMs - oldestDueMs) / 86_400_000));
        ageLabel = days === 1 ? '1 day overdue' : `${days} days overdue`;
      } else if (blocked.length) {
        ageLabel = 'Blocked';
      } else {
        ageLabel = 'Needs review';
      }

      // Pick the primary task to deep-link the click into. Worst-case
      // first: oldest overdue beats first blocked beats nothing. The
      // sort here finds the oldest overdue without re-walking the
      // whole list. Onboarding-driven attention cards leave this
      // unset — they fall back to the client detail page.
      let primaryTask: Task | undefined;
      if (overdue.length > 0) {
        primaryTask = overdue.reduce((worst, t) => {
          const due = new Date(t.dueDate).getTime();
          const worstDue = new Date(worst.dueDate).getTime();
          return due < worstDue ? t : worst;
        });
      } else if (blocked.length > 0) {
        primaryTask = blocked[0];
      }

      // Optional longer sentence when a blocker reason is present —
      // surfaces the human context ("waiting on brand assets") so the
      // AM can triage without opening the card. Falls back to the
      // primary task's title when there's no blocker reason but we DO
      // have a target task — gives the user a heads-up about which
      // card the click will open.
      let desc: string | undefined;
      const firstBlocker = blocked.find((t) => t.blockerReason)?.blockerReason;
      if (firstBlocker) {
        desc = `Blocked: ${firstBlocker}`;
      } else if (primaryTask && (overdue.length + blocked.length) > 1) {
        // Only show the "→ task name" hint when there are multiple
        // urgent items and we're picking one. With a single urgent
        // item the title already names it well enough.
        desc = `Opens: ${primaryTask.title}`;
      }

      return {
        clientId: c.id,
        clientName: c.name,
        severity: isCritical ? 'critical' : 'warning',
        severityLabel: isCritical ? 'On Fire' : 'At Risk',
        title,
        ageLabel,
        desc,
        primaryTaskId: primaryTask?.id,
        primaryServiceId: primaryTask?.serviceId,
        primaryTaskTitle: primaryTask?.title,
      };
    },
  );

  // ── Onboarding cards (mine only) ──────────────────────────────────
  // Only surfaces clients where the user is the AM. Skips clients
  // already represented in fireRiskCards — those will already pull the
  // AM's attention to the client where the onboarding will be visible.
  // We don't double-card; one card per client across the whole feed.
  const onboardingCards: AttentionCard[] = [];
  if (currentMemberId) {
    const fireRiskClientIds = new Set(fireRiskCards.map((c) => c.clientId));
    // Pre-index onboarding items by serviceId so the per-client loop
    // is cheap even with hundreds of items across dozens of services.
    const itemsByService = new Map<string, OnboardingItem[]>();
    for (const item of onboardingItems) {
      const arr = itemsByService.get(item.serviceId) ?? [];
      arr.push(item);
      itemsByService.set(item.serviceId, arr);
    }
    const servicesByClient = new Map<string, Service[]>();
    for (const s of services) {
      const arr = servicesByClient.get(s.clientId) ?? [];
      arr.push(s);
      servicesByClient.set(s.clientId, arr);
    }

    for (const c of clients) {
      if (c.amId !== currentMemberId) continue;
      if (fireRiskClientIds.has(c.id)) continue;

      // Roll up open onboarding items across all services for this
      // client. Split by group so the card copy can tell the AM
      // whether the next action is on them ('us') or on the client.
      let openUs = 0;
      let openClient = 0;
      const clientServices = servicesByClient.get(c.id) ?? [];
      for (const s of clientServices) {
        const items = itemsByService.get(s.id) ?? [];
        for (const item of items) {
          if (item.done) continue;
          if (item.group === 'us') openUs++;
          else openClient++;
        }
      }
      const total = openUs + openClient;
      if (total === 0) continue;

      // Title prioritises 'us' items because those are the ones the AM
      // can act on right now. Items waiting on the client become the
      // descriptor — they're real attention but the action is "chase
      // the client," not "do the work."
      let title: string;
      let desc: string | undefined;
      if (openUs > 0 && openClient > 0) {
        title = `${openUs} onboarding ${openUs === 1 ? 'step' : 'steps'} waiting on you`;
        desc = `${openClient} more waiting on the client`;
      } else if (openUs > 0) {
        title = `${openUs} onboarding ${openUs === 1 ? 'step' : 'steps'} waiting on you`;
      } else {
        title = `${openClient} onboarding ${openClient === 1 ? 'item' : 'items'} waiting on the client`;
      }

      onboardingCards.push({
        clientId: c.id,
        clientName: c.name,
        severity: 'onboarding',
        severityLabel: 'Onboarding',
        title,
        ageLabel: total === 1 ? '1 open item' : `${total} open items`,
        desc,
      });
    }

    // Sort onboarding cards by total open items desc — bigger backlogs
    // surface higher in the slice, so the worst-stalled clients win
    // the cap before lighter ones.
    onboardingCards.sort((a, b) => {
      const totalA = parseInt(a.ageLabel, 10) || 0;
      const totalB = parseInt(b.ageLabel, 10) || 0;
      return totalB - totalA;
    });
  }

  // Final order: critical (fire) → warning (risk) → onboarding.
  // Fires + risks are reactive and drop-everything; onboarding is
  // preventive. Don't bury an active fire behind preventive nudges.
  return [...fireRiskCards, ...onboardingCards];
}

function HealthCell({ label, value, sub, icon, onClick, ariaLabel, valueClass, iconClass }: HealthCellProps) {
  return (
    <div
      className="health-cell clickable"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div className={`health-icon${iconClass ? ` ${iconClass}` : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </div>
      <div>
        <div className="health-label">{label}</div>
        <div className={`health-value${valueClass ? ` ${valueClass}` : ''}`}>{value}</div>
        <div className="health-sub">{sub}</div>
      </div>
    </div>
  );
}
