import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowTrendingUpIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FireIcon,
  NoSymbolIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType, SVGProps } from 'react';
import { navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import type { Task, Member, Client, Service } from '../types/flizow';
import { formatMonthDay, daysBetween } from '../utils/dateFormat';

/**
 * Analytics — "Delivery health"
 *
 * A single scrollable page that answers three questions the founder asks
 * on Monday morning:
 *
 *   1. Are we shipping on time?        → KPI row (four cards)
 *   2. What's landing this week?       → Upcoming deliverables
 *   3. Who's drowning?                 → Team workload
 *
 * Numbers come off the live task + client state, so the page moves when
 * the data moves. Clicking a KPI opens an inline drill-down panel under
 * the grid that lists the rows behind the number (tasks or clients);
 * clicking a task row deep-links to its card on the destination board,
 * clicking a client row opens that client's detail page.
 *
 * Design notes:
 * - Hero size on the title, calm muted color on the sub. Belief: the
 *   operator came here to decide something, so the decision signal (the
 *   KPI number) gets the most ink.
 * - Honest data only. We used to render delta chips ("+3% vs. prior"),
 *   per-KPI sparklines, and a percent-of-40h workload bar — none of
 *   which we could actually measure. No weekly snapshots means no real
 *   deltas. No time tracking means no real capacity. Audit analytics.md
 *   H1 pulled them all. What's left is what we can defend: counts of
 *   open tasks, close rates, due dates, and flagged clients.
 */

type DateWindow = '7d' | '30d' | '90d' | 'all';

interface AnalyticsFilters {
  assigneeId: string | null;   // null = anyone
  serviceId: string | null;    // null = all projects
  dateWindow: DateWindow;
}

const DEFAULT_FILTERS: AnalyticsFilters = {
  assigneeId: null,
  serviceId: null,
  dateWindow: '30d',
};

// Labels say what the filter actually does. The range is
// `[today - 14, today + N]` — a two-week lookback plus the chosen
// horizon. Pre-audit the pills read "Next 7 days" while quietly
// including two weeks of overdue context, so the KPI for overdues
// moved when the user toggled the filter even though nothing in the
// label suggested it would. Audit: analytics.md M3.
const DATE_OPTIONS: Array<{ value: DateWindow; label: string }> = [
  { value: '7d',  label: 'Overdue + next 7 days' },
  { value: '30d', label: 'Overdue + next 30 days' },
  { value: '90d', label: 'Overdue + next 90 days' },
  { value: 'all', label: 'All time' },
];

export function AnalyticsPage() {
  const { data } = useFlizow();
  const todayISO = data.today;

  // If the user arrived from a board's "Analytics" button, we pre-fill the
  // service filter so they land on a page that's already scoped to what
  // they were just looking at. Lazy initializer so the sessionStorage read
  // happens exactly once per mount, same one-shot shape BoardPage uses
  // for its pending-card key.
  const [filters, setFilters] = useState<AnalyticsFilters>(() => {
    const pendingService = sessionStorage.getItem('flizow-analytics-service');
    if (pendingService) {
      sessionStorage.removeItem('flizow-analytics-service');
      return { ...DEFAULT_FILTERS, serviceId: pendingService };
    }
    return DEFAULT_FILTERS;
  });

  const filteredTasks = useMemo(
    () => applyAnalyticsFilters(data.tasks, filters, todayISO),
    [data.tasks, filters, todayISO],
  );

  const kpis = useMemo(
    () => computeKpis(filteredTasks, data.clients, todayISO),
    [filteredTasks, data.clients, todayISO],
  );

  const workload = useMemo(
    () => buildWorkload(filteredTasks, data.members),
    [filteredTasks, data.members],
  );

  // Which KPI's drill-down panel is open. null = collapsed. Clicking the same
  // card twice toggles it off; clicking a different card swaps content in
  // place. Lives here (not on the card) because the panel renders outside
  // the KPI grid — hoisting state is the cheapest way to keep them in sync.
  const [drillKpi, setDrillKpi] = useState<Kpi['key'] | null>(null);

  // Which workload row's member drill is open (member id) or null. Same
  // toggle semantics as the KPI drill — click the same row to close it.
  // Kept separate from drillKpi so a user can have both open at once:
  // the KPI drill sits under the grid, the member drill sits under the
  // workload section, so they don't fight for the same screen region.
  const [drillMember, setDrillMember] = useState<string | null>(null);

  return (
    <div className="view view-analytics active">
      <main className="anlx-page">
        <header className="anlx-header">
          <div className="anlx-header-text">
            <div className="page-greeting">Analytics</div>
            <h1 className="page-title">Delivery health</h1>
            <p className="page-date">What's landing next, who's stretched, what's slipping. Updated live.</p>
          </div>
        </header>

        <FiltersBar
          filters={filters}
          onChange={setFilters}
          members={data.members}
          services={data.services}
          clients={data.clients}
        />

        <div className="anlx-kpi-grid" role="list" aria-label="Delivery health KPIs">
          {kpis.map(k => (
            <KpiCard
              key={k.key}
              kpi={k}
              isOpen={drillKpi === k.key}
              onClick={() => setDrillKpi(prev => (prev === k.key ? null : k.key))}
            />
          ))}
        </div>

        {drillKpi && (
          <DrillDownPanel
            kpiKey={drillKpi}
            tasks={filteredTasks}
            services={data.services}
            members={data.members}
            clients={data.clients}
            todayISO={todayISO}
            onClose={() => setDrillKpi(null)}
          />
        )}

        <UpcomingSection
          tasks={filteredTasks}
          services={data.services}
          members={data.members}
          clients={data.clients}
          todayISO={todayISO}
        />

        <WorkloadSection
          rows={workload}
          openMemberId={drillMember}
          onToggleMember={(id) => setDrillMember(prev => (prev === id ? null : id))}
        />

        {drillMember && (
          <MemberDrillPanel
            memberId={drillMember}
            tasks={filteredTasks}
            services={data.services}
            members={data.members}
            clients={data.clients}
            todayISO={todayISO}
            onClose={() => setDrillMember(null)}
          />
        )}
      </main>
    </div>
  );
}

function applyAnalyticsFilters(
  tasks: Task[],
  filters: AnalyticsFilters,
  todayISO: string,
): Task[] {
  // Drop archived tasks up front — they don't count toward any active
  // KPI (workload, overdue, upcoming) and shouldn't inflate the
  // "completed" totals either. Restoring a card from the archive
  // brings it back into analytics automatically since this is a pure
  // filter, not a data change.
  let out = tasks.filter(t => !t.archived);

  if (filters.assigneeId) {
    const id = filters.assigneeId;
    out = out.filter(t => t.assigneeId === id);
  }

  if (filters.serviceId) {
    const id = filters.serviceId;
    out = out.filter(t => t.serviceId === id);
  }

  if (filters.dateWindow !== 'all') {
    const days = filters.dateWindow === '7d' ? 7 : filters.dateWindow === '30d' ? 30 : 90;
    // Include tasks without a due date (they can still be open WIP) and
    // tasks whose due date is in [today - 14, today + N]. -14 keeps recent
    // overdues visible so they can still register as blocked/at-risk.
    out = out.filter(t => {
      if (!t.dueDate) return true;
      const diff = daysBetween(todayISO, t.dueDate);
      return diff >= -14 && diff <= days;
    });
  }

  return out;
}

// ── Filters bar ──────────────────────────────────────────────────────────

/** Three interactive pills + a Reset link. Each pill opens a fixed-position
 *  popover anchored below it. State lives in the AnalyticsPage parent so
 *  the KPI / Upcoming / Workload sections all recompute together. */
function FiltersBar({ filters, onChange, members, services, clients }: {
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  members: Member[];
  services: Service[];
  clients: Client[];
}) {
  const [open, setOpen] = useState<'assignee' | 'service' | 'date' | null>(null);

  const dirty = filters.assigneeId !== null || filters.serviceId !== null || filters.dateWindow !== '30d';

  const assigneeLabel = filters.assigneeId
    ? members.find(m => m.id === filters.assigneeId)?.name ?? 'Unknown'
    : 'Anyone';
  const serviceLabel = filters.serviceId
    ? (() => {
        const svc = services.find(s => s.id === filters.serviceId);
        if (!svc) return 'Unknown';
        const client = clients.find(c => c.id === svc.clientId);
        return client ? `${client.name} · ${svc.name}` : svc.name;
      })()
    : 'All projects';
  const dateLabel = DATE_OPTIONS.find(o => o.value === filters.dateWindow)?.label ?? 'Next 30 days';

  // Sort members alphabetically for the assignee picker. Services are
  // grouped by client name so "Acme · SEO" and "Acme · Content" cluster.
  const memberOptions = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );
  const serviceOptions = useMemo(() => {
    const byClient = new Map<string, Client>();
    for (const c of clients) byClient.set(c.id, c);
    const rows = services.map(s => ({
      service: s,
      client: byClient.get(s.clientId) ?? null,
    }));
    rows.sort((a, b) => {
      const ca = a.client?.name ?? 'zzz';
      const cb = b.client?.name ?? 'zzz';
      if (ca !== cb) return ca.localeCompare(cb);
      return a.service.name.localeCompare(b.service.name);
    });
    return rows;
  }, [services, clients]);

  return (
    <div className="anlx-filters" role="toolbar" aria-label="Filter analytics">
      <span className="anlx-filter-label">Filter</span>

      <AnalyticsFilterPill
        label={assigneeLabel}
        active={filters.assigneeId !== null}
        open={open === 'assignee'}
        onToggle={() => setOpen(v => v === 'assignee' ? null : 'assignee')}
        onClose={() => setOpen(null)}
      >
        <OptionRow
          label="Anyone"
          selected={filters.assigneeId === null}
          onSelect={() => { onChange({ ...filters, assigneeId: null }); setOpen(null); }}
        />
        <div className="anlx-filter-divider" />
        {memberOptions.map(m => (
          <OptionRow
            key={m.id}
            label={m.name}
            subLabel={m.role}
            avatar={<span className="anlx-filter-option-avatar" style={{ background: m.color }}>{m.initials}</span>}
            selected={filters.assigneeId === m.id}
            onSelect={() => { onChange({ ...filters, assigneeId: m.id }); setOpen(null); }}
          />
        ))}
      </AnalyticsFilterPill>

      <AnalyticsFilterPill
        label={serviceLabel}
        active={filters.serviceId !== null}
        open={open === 'service'}
        onToggle={() => setOpen(v => v === 'service' ? null : 'service')}
        onClose={() => setOpen(null)}
      >
        <OptionRow
          label="All projects"
          selected={filters.serviceId === null}
          onSelect={() => { onChange({ ...filters, serviceId: null }); setOpen(null); }}
        />
        <div className="anlx-filter-divider" />
        {serviceOptions.map(({ service, client }) => (
          <OptionRow
            key={service.id}
            label={service.name}
            subLabel={client?.name ?? undefined}
            selected={filters.serviceId === service.id}
            onSelect={() => { onChange({ ...filters, serviceId: service.id }); setOpen(null); }}
          />
        ))}
      </AnalyticsFilterPill>

      <AnalyticsFilterPill
        label={dateLabel}
        active={filters.dateWindow !== '30d'}
        open={open === 'date'}
        onToggle={() => setOpen(v => v === 'date' ? null : 'date')}
        onClose={() => setOpen(null)}
      >
        {DATE_OPTIONS.map(opt => (
          <OptionRow
            key={opt.value}
            label={opt.label}
            selected={filters.dateWindow === opt.value}
            onSelect={() => { onChange({ ...filters, dateWindow: opt.value }); setOpen(null); }}
          />
        ))}
      </AnalyticsFilterPill>

      <button
        type="button"
        className="anlx-filter-reset"
        hidden={!dirty}
        onClick={() => { onChange(DEFAULT_FILTERS); setOpen(null); }}
      >
        Reset
      </button>
    </div>
  );
}

/** A single filter pill with an anchored popover. Popover uses
 *  position: fixed and recomputes its top/left from the pill's bounding
 *  rect on open, so horizontal scroll / reflow doesn't drift it. */
function AnalyticsFilterPill({ label, active, open, onToggle, onClose, children }: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Compute anchor position just after the pill renders open. useLayoutEffect
  // ensures the menu is placed before the browser paints, preventing a
  // one-frame flash at the wrong spot.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
  }, [open]);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const btn = btnRef.current;
      const menu = menuRef.current;
      const target = e.target as Node;
      if (btn && btn.contains(target)) return;
      if (menu && menu.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`anlx-filter-pill${active ? ' is-active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="anlx-filter-pill-text">{label}</span>
        <ChevronDownIcon className="anlx-filter-pill-caret" aria-hidden="true" />
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          className="anlx-filter-menu open"
          role="listbox"
          style={{ top: pos.top, left: pos.left }}
        >
          {children}
        </div>
      )}
    </>
  );
}

function OptionRow({ label, subLabel, avatar, selected, onSelect }: {
  label: string;
  subLabel?: string;
  avatar?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`anlx-filter-option${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      {avatar}
      <span className="anlx-filter-option-text">
        <span className="anlx-filter-option-label">{label}</span>
        {subLabel && <span className="anlx-filter-option-sub">{subLabel}</span>}
      </span>
      <CheckIcon className="anlx-filter-option-check" aria-hidden="true" />
    </button>
  );
}

// ── KPI cards ────────────────────────────────────────────────────────────

interface Kpi {
  key: 'ontime' | 'blocked' | 'deadlines' | 'clients';
  label: string;
  value: number | string;
  unit: string;
  foot: string;
}

/**
 * Per-KPI category icon. Lives in the label row alongside the
 * eyebrow text — small, muted, doesn't compete with the big value.
 * Mapped by the discriminator key so the icon stays in sync if the
 * label copy ever changes.
 *
 *   ontime    — trending up, performance metric
 *   blocked   — universal "no" / blocker
 *   deadlines — calendar (when, by when)
 *   clients   — fire, since "flagged" almost always means fire/risk
 */
const KPI_ICONS: Record<Kpi['key'], ComponentType<SVGProps<SVGSVGElement>>> = {
  ontime: ArrowTrendingUpIcon,
  blocked: NoSymbolIcon,
  deadlines: CalendarDaysIcon,
  clients: FireIcon,
};

function KpiCard({ kpi, isOpen, onClick }: {
  kpi: Kpi;
  isOpen: boolean;
  onClick: () => void;
}) {
  const Icon = KPI_ICONS[kpi.key];
  return (
    <button
      type="button"
      className={`anlx-kpi-card${isOpen ? ' is-open' : ''}`}
      role="listitem"
      aria-expanded={isOpen}
      aria-label={`${kpi.label}. ${kpi.foot}. ${isOpen ? 'Drill-down open.' : 'Open drill-down.'}`}
      onClick={onClick}
    >
      <span className="anlx-kpi-label">
        <Icon width={12} height={12} aria-hidden="true" />
        {kpi.label}
      </span>
      <div className="anlx-kpi-value">
        {kpi.value}
        <span className="anlx-kpi-value-unit">{kpi.unit}</span>
      </div>
      <div className="anlx-kpi-foot">{kpi.foot}</div>
    </button>
  );
}

// DeltaChip + SparkPaths used to live here. The chip rendered a
// "+3% vs prior" signal calculated from hardcoded tiers
// (onTimePct > 80 ? 3 : …), not a real week-over-week comparison.
// SparkPaths rendered a curve from seedHistory() — same fake history.
// Both deleted per audit analytics.md H1.

function computeKpis(
  tasks: Task[],
  clients: Client[],
  todayISO: string,
): Kpi[] {
  const openTasks = tasks.filter(isOpen);

  // 1 — On-time rate: closed tasks that landed on or before their due date.
  const closed = tasks.filter(t => t.columnId === 'done' && t.dueDate);
  // No completedAt field in our model — treat a "done" card as on time if
  // its due date hasn't slipped past today. Honest heuristic.
  const onTime = closed.filter(t => daysBetween(todayISO, t.dueDate) >= 0);
  const onTimePct = closed.length ? Math.round((onTime.length / closed.length) * 100) : 100;

  // 2 — Blocked now: open tasks in the blocked column (or severity critical).
  const blocked = openTasks.filter(t => t.columnId === 'blocked' || t.severity === 'critical');

  // 3 — Due next 7 days.
  const soon = openTasks.filter(t => {
    if (!t.dueDate) return false;
    const delta = daysBetween(todayISO, t.dueDate);
    return delta >= 0 && delta <= 7;
  });
  const overdue = openTasks.filter(t => t.dueDate && daysBetween(todayISO, t.dueDate) < 0);

  // 4 — Clients flagged (fire or risk).
  const atRisk = clients.filter(c => c.status === 'fire' || c.status === 'risk');

  // The "Over capacity" KPI used to sit between on-time and blocked. We
  // were computing it from a fixed 4h/task allocation against a hardcoded
  // 40h week, which invented both the numerator and the denominator. Real
  // capacity needs time tracking we don't have. Pulled per audit analytics.md H1.
  return [
    {
      key: 'ontime',
      label: 'On-time rate',
      value: onTimePct, unit: '%',
      foot: `${closed.length} closed in window · ${onTime.length} on time`,
    },
    {
      key: 'blocked',
      label: 'Blocked now',
      value: blocked.length, unit: blocked.length === 1 ? 'task' : 'tasks',
      foot: blocked.length ? `Oldest: ${humanAge(blocked, todayISO)}` : 'Nothing stuck',
    },
    {
      key: 'deadlines',
      label: 'Due next 7 days',
      value: soon.length, unit: soon.length === 1 ? 'task' : 'tasks',
      foot: overdue.length ? `${overdue.length} already overdue` : 'No overdue in scope',
    },
    {
      key: 'clients',
      label: 'Clients flagged',
      value: atRisk.length, unit: atRisk.length === 1 ? 'client' : 'clients',
      foot: atRisk.slice(0, 3).map(c => c.name).join(' · ') || 'All clients on track',
    },
  ];
}

// ── KPI drill-down panel ─────────────────────────────────────────────────

/**
 * Inline panel that drops in under the KPI grid when a card is clicked.
 * Lists the rows behind the number — clicking a task row opens its card
 * on the relevant board, clicking a client row jumps to client detail.
 *
 * Shape decision: no modal. The panel lives on the same page so the
 * operator keeps the KPIs in view while drilling, which is how the
 * mockup originally read. CSS for this pattern (`.anlx-drill*`) is
 * already in flizow.css.
 */
function DrillDownPanel({
  kpiKey, tasks, services, members, clients, todayISO, onClose,
}: {
  kpiKey: Kpi['key'];
  tasks: Task[];
  services: Service[];
  members: Member[];
  clients: Client[];
  todayISO: string;
  onClose: () => void;
}) {
  // Per-KPI: compute the rows to render + the panel title. Each branch
  // returns a `DrillContent`, which is either a list of task rows or
  // a list of client rows (the two disjoint shapes the grid handles).
  const content = useMemo<DrillContent>(() => {
    switch (kpiKey) {
      case 'ontime': return buildOnTimeDrill(tasks, todayISO);
      case 'blocked': return buildBlockedDrill(tasks);
      case 'deadlines': return buildDeadlinesDrill(tasks, todayISO);
      case 'clients': return buildClientsDrill(tasks, clients);
    }
  }, [kpiKey, tasks, clients, todayISO]);

  // Dismiss on Escape — same convention as the filter popovers and the
  // card modal. Outside-click dismissal doesn't apply here because the
  // panel is a peer section, not an overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section className="anlx-drill open" aria-labelledby="anlx-drill-title">
      <div className="anlx-drill-head">
        <div className="anlx-drill-title" id="anlx-drill-title">{content.title}</div>
        <div className="anlx-drill-count">
          {content.rows.length} {content.rows.length === 1 ? content.unit : content.unitPlural}
        </div>
        <button
          type="button"
          className="anlx-drill-close"
          aria-label="Close drill-down"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {content.rows.length === 0 ? (
        <div className="anlx-drill-empty">{content.empty}</div>
      ) : (
        <div className="anlx-drill-list">
          {content.kind === 'tasks'
            ? content.rows.map(r => (
                <DrillTaskRow
                  key={r.task.id}
                  task={r.task}
                  service={services.find(s => s.id === r.task.serviceId) ?? null}
                  client={clients.find(c => c.id === r.task.clientId) ?? null}
                  owner={r.task.assigneeId ? members.find(m => m.id === r.task.assigneeId) ?? null : null}
                  status={r.status}
                />
              ))
            : content.rows.map(r => (
                <DrillClientRow key={r.client.id} client={r.client} openCount={r.openCount} />
              ))}
        </div>
      )}
    </section>
  );
}

type DrillContent =
  | {
      kind: 'tasks';
      title: string;
      unit: string;
      unitPlural: string;
      empty: string;
      rows: Array<{ task: Task; status: { label: string; tone?: 'late' | 'soon' } }>;
    }
  | {
      kind: 'clients';
      title: string;
      unit: string;
      unitPlural: string;
      empty: string;
      rows: Array<{ client: Client; openCount: number }>;
    };

function buildOnTimeDrill(tasks: Task[], todayISO: string): DrillContent {
  const closed = tasks.filter(t => t.columnId === 'done' && t.dueDate);
  // Late-first so the worst offenders read first. Ties by most-recent due.
  const sorted = closed.slice().sort((a, b) => {
    const aLate = daysBetween(todayISO, a.dueDate) < 0 ? 0 : 1;
    const bLate = daysBetween(todayISO, b.dueDate) < 0 ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
    return b.dueDate.localeCompare(a.dueDate);
  });
  return {
    kind: 'tasks',
    title: 'Closed tasks — on time vs. late',
    unit: 'task', unitPlural: 'tasks',
    empty: 'No closed tasks in this window yet.',
    rows: sorted.map(t => {
      const delta = daysBetween(todayISO, t.dueDate);
      if (delta >= 0) return { task: t, status: { label: 'On time' } };
      return { task: t, status: { label: `${-delta}d late`, tone: 'late' as const } };
    }),
  };
}

// buildCapacityDrill() used to live here, rendering open tasks owned by
// anyone over 100% load. With the "Over capacity" KPI gone (analytics.md
// H1 — no real time tracking means no real percent-of-40h), the drill
// has no anchor. Pulled alongside it.

function buildBlockedDrill(tasks: Task[]): DrillContent {
  const blocked = tasks.filter(t =>
    isOpen(t) && (t.columnId === 'blocked' || t.severity === 'critical'),
  );
  // Oldest stuck first — if something has been sitting a week, it deserves
  // top billing over something blocked this morning.
  blocked.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return {
    kind: 'tasks',
    title: 'Blocked or critical right now',
    unit: 'task', unitPlural: 'tasks',
    empty: 'Nothing is stuck. Enjoy it.',
    rows: blocked.map(t => ({
      task: t,
      status: {
        label: t.severity === 'critical' ? 'Critical' : 'Blocked',
        tone: 'late' as const,
      },
    })),
  };
}

function buildDeadlinesDrill(tasks: Task[], todayISO: string): DrillContent {
  const open = tasks.filter(isOpen).filter(t => t.dueDate);
  // Overdues first (they're already late and matter most), then this-week
  // in calendar order.
  const overdue = open.filter(t => daysBetween(todayISO, t.dueDate) < 0);
  const soon = open.filter(t => {
    const d = daysBetween(todayISO, t.dueDate);
    return d >= 0 && d <= 7;
  });
  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  soon.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const combined = [...overdue, ...soon];
  return {
    kind: 'tasks',
    title: 'Due in the next 7 days',
    unit: 'task', unitPlural: 'tasks',
    empty: 'No deadlines in the next 7 days.',
    rows: combined.map(t => {
      const d = daysBetween(todayISO, t.dueDate);
      if (d < 0) return { task: t, status: { label: `${-d}d overdue`, tone: 'late' as const } };
      if (d === 0) return { task: t, status: { label: 'Today', tone: 'late' as const } };
      if (d === 1) return { task: t, status: { label: 'Tomorrow', tone: 'soon' as const } };
      return { task: t, status: { label: `In ${d}d`, tone: 'soon' as const } };
    }),
  };
}

function buildClientsDrill(tasks: Task[], clients: Client[]): DrillContent {
  const flagged = clients.filter(c => c.status === 'fire' || c.status === 'risk');
  // Fire before risk so the burning clients read first.
  flagged.sort((a, b) => {
    const rank = (s: Client['status']) => (s === 'fire' ? 0 : s === 'risk' ? 1 : 2);
    const dr = rank(a.status) - rank(b.status);
    if (dr !== 0) return dr;
    return a.name.localeCompare(b.name);
  });
  const openByClient = new Map<string, number>();
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    openByClient.set(t.clientId, (openByClient.get(t.clientId) ?? 0) + 1);
  }
  return {
    kind: 'clients',
    title: 'Clients flagged — fire or risk',
    unit: 'client', unitPlural: 'clients',
    empty: 'All clients on track. Nice.',
    rows: flagged.map(c => ({ client: c, openCount: openByClient.get(c.id) ?? 0 })),
  };
}

/**
 * Drill panel rooted on a single workload row — lists that person's open
 * tasks. Same visual shell as the KPI drill (`.anlx-drill*`) so the user
 * sees one pattern for "drill into this number." Sits under the Workload
 * section so the clicked row stays on screen.
 */
function MemberDrillPanel({
  memberId, tasks, services, members, clients, todayISO, onClose,
}: {
  memberId: string;
  tasks: Task[];
  services: Service[];
  members: Member[];
  clients: Client[];
  todayISO: string;
  onClose: () => void;
}) {
  const member = members.find(m => m.id === memberId) ?? null;

  // Open tasks assigned to this member only. Due-date-sorted so whatever's
  // next in their queue reads first; undated tasks fall to the bottom.
  const rows = useMemo(() => {
    const mine = tasks.filter(t => isOpen(t) && t.assigneeId === memberId);
    mine.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    return mine;
  }, [tasks, memberId]);

  // Esc closes, same convention as the KPI drill.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Title carries count, not a percent. Without time tracking we can't
  // report real load, so we say what we actually know: how many tasks
  // are on this person's plate right now. Matches WorkloadRowView.
  const title = member
    ? `${member.name} — ${rows.length} open ${rows.length === 1 ? 'task' : 'tasks'}`
    : 'Member drill-down';

  return (
    <section className="anlx-drill open" aria-labelledby="anlx-mdrill-title">
      <div className="anlx-drill-head">
        <div className="anlx-drill-title" id="anlx-mdrill-title">{title}</div>
        <div className="anlx-drill-count">
          {rows.length} {rows.length === 1 ? 'task' : 'tasks'}
        </div>
        <button
          type="button"
          className="anlx-drill-close"
          aria-label="Close member drill-down"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="anlx-drill-empty">
          <BriefcaseIcon
            width={32}
            height={32}
            aria-hidden="true"
            className="anlx-empty-icon"
          />
          {member ? `${member.name.split(' ')[0]} has nothing open. Quiet week.` : 'Nothing open.'}
        </div>
      ) : (
        <div className="anlx-drill-list">
          {rows.map(t => (
            <DrillTaskRow
              key={t.id}
              task={t}
              service={services.find(s => s.id === t.serviceId) ?? null}
              client={clients.find(c => c.id === t.clientId) ?? null}
              owner={member}
              status={memberDueStatus(t, todayISO)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Due-date status label + tone for a row inside the member drill.
 *  Shapes what the user sees when scanning a person's queue: the next
 *  deadline owed (or a calm placeholder when the task has no date). */
function memberDueStatus(t: Task, todayISO: string): { label: string; tone?: 'late' | 'soon' } {
  if (!t.dueDate) return { label: 'No date' };
  const diff = daysBetween(todayISO, t.dueDate);
  if (diff < 0) return { label: `${-diff}d overdue`, tone: 'late' };
  if (diff === 0) return { label: 'Today', tone: 'late' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (diff <= 3) return { label: `In ${diff}d`, tone: 'soon' };
  return { label: formatMonthDay(t.dueDate) };
}

function DrillTaskRow({ task, service, client, owner, status }: {
  task: Task;
  service: Service | null;
  client: Client | null;
  owner: Member | null;
  status: { label: string; tone?: 'late' | 'soon' };
}) {
  const open = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    // Auto-open the card on landing — same one-shot handoff the
    // touchpoint "On board ↗" button uses. BoardPage clears the key
    // immediately on mount so a refresh doesn't re-trigger it.
    sessionStorage.setItem('flizow-open-card', task.id);
    navigate(`#board/${task.serviceId}`);
  };
  return (
    <a
      href={service ? `#board/${service.id}/card/${task.id}` : '#'}
      className="anlx-drill-row"
      onClick={open}
    >
      <div>
        <div className="anlx-drill-row-title">{task.title}</div>
        <div className="anlx-drill-row-client">
          {client?.name ?? 'Unknown client'}
          {service && ` · ${service.name}`}
        </div>
      </div>
      <div className="anlx-drill-row-owner">
        {owner ? (
          <>
            <span className="anlx-av sm" style={{ background: owner.color }}>
              {owner.initials}
            </span>
            <span>{owner.name.split(' ')[0]}</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-faint)' }}>Unassigned</span>
        )}
      </div>
      <div className={`anlx-drill-row-status${status.tone ? ` ${status.tone}` : ''}`}>
        {status.label}
      </div>
      <div className="anlx-up-phase">{phaseOf(task)}</div>
      <div className="anlx-drill-row-chev">
        <ChevronRightIcon aria-hidden="true" />
      </div>
    </a>
  );
}

function DrillClientRow({ client, openCount }: {
  client: Client;
  openCount: number;
}) {
  const open = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(`#clients/${client.id}`);
  };
  const statusLabel = client.status === 'fire' ? 'On fire' : 'At risk';
  const tone = client.status === 'fire' ? 'late' : 'soon';
  return (
    <a
      href={`#clients/${client.id}`}
      className="anlx-drill-row"
      onClick={open}
    >
      <div>
        <div className="anlx-drill-row-title">{client.name}</div>
        <div className="anlx-drill-row-client">
          {openCount} open {openCount === 1 ? 'task' : 'tasks'}
        </div>
      </div>
      <div className="anlx-drill-row-owner">
        <span style={{ color: 'var(--text-faint)' }}>—</span>
      </div>
      <div className={`anlx-drill-row-status ${tone}`}>{statusLabel}</div>
      <div className="anlx-up-phase">CLIENT</div>
      <div className="anlx-drill-row-chev">
        <ChevronRightIcon aria-hidden="true" />
      </div>
    </a>
  );
}

// ── Upcoming section ─────────────────────────────────────────────────────

type UpcomingBucket = 'today' | 'week' | 'next';

function UpcomingSection({ tasks, services, members, clients, todayISO }: {
  tasks: Task[];
  services: Service[];
  members: Member[];
  clients: Client[];
  todayISO: string;
}) {
  const [bucket, setBucket] = useState<UpcomingBucket>('today');

  const counts = useMemo(() => {
    const open = tasks.filter(isOpen);
    return {
      today: open.filter(t => inBucket(t, 'today', todayISO)).length,
      week:  open.filter(t => inBucket(t, 'week', todayISO)).length,
      next:  open.filter(t => inBucket(t, 'next', todayISO)).length,
    };
  }, [tasks, todayISO]);

  const rows = useMemo(() => {
    // No trailing `.slice(0, 25)` — the list is already scoped by
    // bucket + the page-level filter, and the `.anlx-up-list`
    // container already caps visible height (scrollable at 360px).
    // A silent truncation hid that "This week" had 40 items while
    // showing 25. Audit: analytics.md M5.
    return tasks
      .filter(isOpen)
      .filter(t => inBucket(t, bucket, todayISO))
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks, bucket, todayISO]);

  return (
    <section className="anlx-section" aria-labelledby="anlx-up-title">
      <div className="anlx-section-head">
        <div className="anlx-section-title" id="anlx-up-title">
          <CalendarDaysIcon width={14} height={14} aria-hidden="true" />
          Upcoming deliverables
        </div>
        <div className="anlx-up-tabs" role="tablist" aria-label="Time range">
          <TabButton active={bucket === 'today'} onClick={() => setBucket('today')}>
            Today <span className="anlx-up-tab-count">{counts.today}</span>
          </TabButton>
          <TabButton active={bucket === 'week'} onClick={() => setBucket('week')}>
            This week <span className="anlx-up-tab-count">{counts.week}</span>
          </TabButton>
          <TabButton active={bucket === 'next'} onClick={() => setBucket('next')}>
            Next week <span className="anlx-up-tab-count">{counts.next}</span>
          </TabButton>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="anlx-up-empty">
          <CalendarDaysIcon
            width={32}
            height={32}
            aria-hidden="true"
            className="anlx-empty-icon"
          />
          Nothing on the schedule for this window. Enjoy the quiet.
        </div>
      ) : (
        <div className="anlx-up-list">
          {rows.map(t => (
            <UpcomingRow
              key={t.id}
              task={t}
              service={services.find(s => s.id === t.serviceId) ?? null}
              client={clients.find(c => c.id === t.clientId) ?? null}
              owner={t.assigneeId ? members.find(m => m.id === t.assigneeId) ?? null : null}
              todayISO={todayISO}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TabButton({ active, children, onClick }: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className="anlx-up-tab"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function UpcomingRow({ task, service, client, owner, todayISO }: {
  task: Task;
  service: Service | null;
  client: Client | null;
  owner: Member | null;
  todayISO: string;
}) {
  const handleClick = () => {
    if (service) navigate(`#board/${service.id}`);
  };
  const whenClass = whenTone(task.dueDate, todayISO);

  return (
    <a
      href={service ? `#board/${service.id}` : '#'}
      className="anlx-up-row"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        handleClick();
      }}
    >
      <div className={`anlx-up-when${whenClass ? ` ${whenClass}` : ''}`}>
        {whenLabel(task.dueDate, todayISO)}
        <span className="anlx-up-when-dow">{whenDow(task.dueDate)}</span>
      </div>
      <div>
        <div className="anlx-up-title">{task.title}</div>
        <div className="anlx-up-sub">
          {client?.name ?? 'Unknown client'}
          {service && ` · ${service.name}`}
        </div>
      </div>
      <div className="anlx-up-owner">
        {owner ? (
          <>
            <span className="anlx-av sm" style={{ background: owner.color }}>
              {owner.initials}
            </span>
            <span className="anlx-up-owner-name">{owner.name.split(' ')[0]}</span>
          </>
        ) : (
          <span className="anlx-up-owner-name" style={{ color: 'var(--text-faint)' }}>
            Unassigned
          </span>
        )}
      </div>
      <div className="anlx-up-phase">{phaseOf(task)}</div>
      <div />
      <div className="anlx-up-chev">
        <ChevronRightIcon aria-hidden="true" />
      </div>
    </a>
  );
}

function whenLabel(dueISO: string, todayISO: string): string {
  const diff = daysBetween(todayISO, dueISO);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 0 && diff < 7) return `In ${diff} days`;
  if (diff < 0) return `${-diff}d overdue`;
  return formatMonthDay(dueISO);
}

function whenTone(dueISO: string, todayISO: string): string | null {
  const diff = daysBetween(todayISO, dueISO);
  if (diff <= 0) return 'today'; // fire — today or overdue
  if (diff === 1) return 'tomorrow';
  return null;
}

function whenDow(dueISO: string): string {
  const d = new Date(dueISO);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
}

function phaseOf(task: Task): string {
  switch (task.columnId) {
    case 'todo': return 'TO DO';
    case 'inprogress': return 'IN PROGRESS';
    case 'review': return 'REVIEW';
    case 'blocked': return 'BLOCKED';
    case 'done': return 'DONE';
  }
}

function inBucket(task: Task, bucket: UpcomingBucket, todayISO: string): boolean {
  if (!task.dueDate) return false;
  const diff = daysBetween(todayISO, task.dueDate);
  // Overdues fold into "today" — they are, operationally, today's
  // problem. Pre-audit the bucket required `diff === 0` and overdue
  // tasks disappeared from every tab while the KPI grid above still
  // counted them. The two halves of the page now agree. Audit:
  // analytics.md M2.
  if (bucket === 'today') return diff <= 0;
  if (bucket === 'week') return diff >= 1 && diff <= 6;
  if (bucket === 'next') return diff >= 7 && diff <= 13;
  return false;
}

// ── Workload ─────────────────────────────────────────────────────────────

interface WorkloadRow {
  id: string;
  name: string;
  initials: string;
  role?: string;
  color: string;
  /** Count of open tasks assigned to this teammate. The only load signal
   *  we can honestly produce without time tracking — see buildWorkload. */
  wip: number;
  /** Relative share: this person's WIP ÷ the top WIP on the team, 0–100.
   *  Drives the bar width so the busiest teammate fills the row. Not a
   *  percent-of-capacity — we're not claiming to know their capacity. */
  sharePct: number;
}

function WorkloadSection({ rows, openMemberId, onToggleMember }: {
  rows: WorkloadRow[];
  openMemberId: string | null;
  onToggleMember: (id: string) => void;
}) {
  // The section used to shout "N over capacity · M tight." Those counts
  // came from a fake percent-of-40h metric. Without time tracking we
  // can't say who's over — only who has more open cards than everyone
  // else. The subtitle names the limit honestly instead.
  return (
    <section className="anlx-section" aria-labelledby="anlx-wl-title">
      <div className="anlx-section-head">
        <div className="anlx-section-title" id="anlx-wl-title">
          <UsersIcon width={14} height={14} aria-hidden="true" />
          Team workload
        </div>
        <div className="anlx-section-sub">
          Open tasks per teammate. Hours aren't tracked, so this is card count, not time.
        </div>
      </div>
      <div className="anlx-wl-head" aria-hidden="true">
        <div className="anlx-wl-head-cell">Person</div>
        <div className="anlx-wl-head-cell">Share of open work</div>
        <div className="anlx-wl-head-cell num">Tasks</div>
        <div className="anlx-wl-head-cell" />
      </div>
      <div className="anlx-wl-list">
        {rows.map(r => (
          <WorkloadRowView
            key={r.id}
            row={r}
            isOpen={openMemberId === r.id}
            onClick={() => onToggleMember(r.id)}
          />
        ))}
      </div>
    </section>
  );
}

function WorkloadRowView({ row, isOpen, onClick }: {
  row: WorkloadRow;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="anlx-wl-row"
      aria-expanded={isOpen}
      aria-label={`${row.name}, ${row.wip} open ${row.wip === 1 ? 'task' : 'tasks'}. ${isOpen ? 'Close' : 'Open'} member drill-down.`}
      onClick={onClick}
    >
      <div className="anlx-wl-who">
        <span className="anlx-av" style={{ background: row.color }}>
          {row.initials}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="anlx-wl-who-name">{row.name}</div>
          {row.role && <div className="anlx-wl-who-role">{row.role}</div>}
        </div>
      </div>
      {/* Bar fills relative to the busiest teammate — the row at max WIP
          draws all the way across. We used to tint it red/amber/green by
          a made-up percent-of-capacity; now it stays muted so the number
          beside it does the talking. */}
      <div className="anlx-wl-bar">
        <div className="anlx-wl-bar-fill" style={{ width: `${row.sharePct}%` }} />
      </div>
      <div className="anlx-wl-num">{row.wip}</div>
      <div className="anlx-wl-chev">
        <ChevronRightIcon
          aria-hidden="true"
          style={{
            transform: isOpen ? 'rotate(90deg)' : undefined,
            transition: 'transform 160ms ease',
          }}
        />
      </div>
    </button>
  );
}

function buildWorkload(tasks: Task[], members: Member[]): WorkloadRow[] {
  const rows: Record<string, WorkloadRow> = {};
  for (const m of members) {
    rows[m.id] = {
      id: m.id,
      name: m.name,
      initials: m.initials,
      role: m.role,
      color: m.color,
      wip: 0,
      sharePct: 0,
    };
  }

  // Count open tasks per teammate. We used to also accrue a fake 4h per
  // card toward a 40h week, then render a percent-of-capacity bar — but
  // the hour allocation was invented and the capacity was never tracked.
  // Task count is the one signal we can back up.
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    if (!t.assigneeId) continue;
    const row = rows[t.assigneeId];
    if (!row) continue;
    row.wip += 1;
  }

  const list = members.map(m => rows[m.id]);
  // Bar is relative to the busiest teammate, not absolute capacity.
  // Clamps to 1 so a team where everyone has zero open tasks doesn't
  // divide-by-zero — every bar just stays empty.
  const maxWip = Math.max(1, ...list.map(r => r.wip));
  for (const r of list) {
    r.sharePct = Math.round((r.wip / maxWip) * 100);
  }
  list.sort((a, b) => b.wip - a.wip);
  return list;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isOpen(t: Task): boolean {
  return t.columnId !== 'done';
}

function humanAge(list: Task[], todayISO: string): string {
  const oldest = list.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
  if (!oldest || !oldest.createdAt) return '—';
  const d = daysBetween(oldest.createdAt, todayISO);
  if (d <= 0) return 'today';
  return `${d} day${d === 1 ? '' : 's'}`;
}

// seedHistory() used to live here: a deterministic pseudo-random
// generator feeding 12-point sparklines for every KPI card and
// workload row. There's no historical data behind it, so the curves
// decorated a blank surface with the shape of information. Deleted
// as part of audit analytics.md H1 — Analytics' job is to support
// decisions, and fake data on a decision surface is worse than no
// data. Bring back when we capture a real weekly snapshot.
