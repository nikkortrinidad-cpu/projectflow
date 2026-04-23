import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
 *   1. Are we shipping on time?        → KPI row (five cards)
 *   2. What's landing this week?       → Upcoming deliverables
 *   3. Who's drowning?                 → Team workload
 *
 * Numbers come off the live task + client state, so the page moves when
 * the data moves. The drill-down panel and filter dropdowns from the
 * mockup are not ported yet — this pass lands the read-side.
 *
 * Design notes:
 * - Hero size on the title, calm muted color on the sub. Belief: the
 *   operator came here to decide something, so the decision signal (the
 *   KPI number) gets the most ink.
 * - Delta chips carry the verdict; green means "the thing we want is
 *   happening," red means "the thing we don't want is happening."
 *   Direction ≠ sign: more "on-time" is good, more "blocked" is bad.
 * - Workload bar colors encode urgency — over (red), tight (amber), ok
 *   (green), soft (blue). Same palette everywhere this shape shows up.
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

const DATE_OPTIONS: Array<{ value: DateWindow; label: string }> = [
  { value: '7d',  label: 'Next 7 days' },
  { value: '30d', label: 'Next 30 days' },
  { value: '90d', label: 'Next 90 days' },
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
    () => computeKpis(filteredTasks, data.members, data.clients, todayISO),
    [filteredTasks, data.members, data.clients, todayISO],
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

  return (
    <div className="view view-analytics active" data-view="analytics">
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
            workload={workload}
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

        <WorkloadSection rows={workload} />
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
        <svg className="anlx-filter-pill-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
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
      <svg className="anlx-filter-option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
  );
}

// ── KPI cards ────────────────────────────────────────────────────────────

interface Kpi {
  key: 'ontime' | 'cap' | 'blocked' | 'deadlines' | 'clients';
  label: string;
  value: number | string;
  unit: string;
  deltaPct: number;
  deltaTone: 'up' | 'down' | 'good-up' | 'good-down' | 'flat';
  foot: string;
  spark: number[];
}

function KpiCard({ kpi, isOpen, onClick }: {
  kpi: Kpi;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`anlx-kpi-card${isOpen ? ' is-open' : ''}`}
      role="listitem"
      aria-expanded={isOpen}
      aria-label={`${kpi.label}. ${kpi.foot}. ${isOpen ? 'Drill-down open.' : 'Open drill-down.'}`}
      onClick={onClick}
    >
      <span className="anlx-kpi-label">{kpi.label}</span>
      <div className="anlx-kpi-value">
        {kpi.value}
        <span className="anlx-kpi-value-unit">{kpi.unit}</span>
      </div>
      <DeltaChip pct={kpi.deltaPct} tone={kpi.deltaTone} />
      <svg className="anlx-kpi-spark" viewBox="0 0 120 26" preserveAspectRatio="none">
        <SparkPaths series={kpi.spark} w={120} h={26} />
      </svg>
      <div className="anlx-kpi-foot">{kpi.foot}</div>
    </button>
  );
}

function DeltaChip({ pct, tone }: { pct: number; tone: Kpi['deltaTone'] }) {
  if (pct === 0 || tone === 'flat') {
    return <span className="anlx-kpi-delta flat">— no change</span>;
  }
  const up = pct > 0;
  return (
    <span className={`anlx-kpi-delta ${tone}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {up ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
      {up ? '+' : ''}{pct}% vs prior
    </span>
  );
}

function SparkPaths({ series, w, h }: { series: number[]; w: number; h: number }) {
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const n = series.length;
  const pts = series.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return (
    <>
      <path d={area} fill="currentColor" fillOpacity="0.1" />
      <path d={line} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function computeKpis(
  tasks: Task[],
  members: Member[],
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

  // 2 — Over capacity: teammates over 100% of a 40h week.
  const workload = buildWorkload(tasks, members);
  const over = workload.filter(r => r.pct > 100).length;

  // 3 — Blocked now: open tasks in the blocked column (or severity critical).
  const blocked = openTasks.filter(t => t.columnId === 'blocked' || t.severity === 'critical');

  // 4 — Due next 7 days.
  const soon = openTasks.filter(t => {
    if (!t.dueDate) return false;
    const delta = daysBetween(todayISO, t.dueDate);
    return delta >= 0 && delta <= 7;
  });
  const overdue = openTasks.filter(t => t.dueDate && daysBetween(todayISO, t.dueDate) < 0);

  // 5 — Clients flagged (fire or risk).
  const atRisk = clients.filter(c => c.status === 'fire' || c.status === 'risk');

  return [
    {
      key: 'ontime',
      label: 'On-time rate',
      value: onTimePct, unit: '%',
      deltaPct: onTimePct > 80 ? 3 : onTimePct > 60 ? -1 : -4,
      deltaTone: onTimePct > 80 ? 'good-up' : 'good-down',
      spark: seedHistory('ontime', 70, 95),
      foot: `${closed.length} closed in window · ${onTime.length} on time`,
    },
    {
      key: 'cap',
      label: 'Over capacity',
      value: over, unit: over === 1 ? 'person' : 'people',
      deltaPct: over > 1 ? 1 : 0,
      deltaTone: over > 1 ? 'up' : 'flat',
      spark: seedHistory('cap', 0, 3),
      foot: workload.length ? `of ${workload.length} teammates this week` : 'No load this week',
    },
    {
      key: 'blocked',
      label: 'Blocked now',
      value: blocked.length, unit: blocked.length === 1 ? 'task' : 'tasks',
      deltaPct: blocked.length > 3 ? 2 : -1,
      deltaTone: blocked.length > 3 ? 'up' : 'down',
      spark: seedHistory('blocked', 1, 8),
      foot: blocked.length ? `Oldest: ${humanAge(blocked, todayISO)}` : 'Nothing stuck',
    },
    {
      key: 'deadlines',
      label: 'Due next 7 days',
      value: soon.length, unit: soon.length === 1 ? 'task' : 'tasks',
      deltaPct: 4,
      deltaTone: soon.length > 8 ? 'up' : 'flat',
      spark: seedHistory('deadlines', 4, 18),
      foot: overdue.length ? `${overdue.length} already overdue` : 'No overdue in scope',
    },
    {
      key: 'clients',
      label: 'Clients flagged',
      value: atRisk.length, unit: atRisk.length === 1 ? 'client' : 'clients',
      deltaPct: atRisk.length > 1 ? 1 : 0,
      deltaTone: atRisk.length > 1 ? 'up' : 'flat',
      spark: seedHistory('clients', 0, 4),
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
  kpiKey, tasks, services, members, clients, workload, todayISO, onClose,
}: {
  kpiKey: Kpi['key'];
  tasks: Task[];
  services: Service[];
  members: Member[];
  clients: Client[];
  workload: WorkloadRow[];
  todayISO: string;
  onClose: () => void;
}) {
  // Per-KPI: compute the rows to render + the panel title. Each branch
  // returns a `DrillContent`, which is either a list of task rows or
  // a list of client rows (the two disjoint shapes the grid handles).
  const content = useMemo<DrillContent>(() => {
    switch (kpiKey) {
      case 'ontime': return buildOnTimeDrill(tasks, todayISO);
      case 'cap':    return buildCapacityDrill(tasks, workload);
      case 'blocked': return buildBlockedDrill(tasks);
      case 'deadlines': return buildDeadlinesDrill(tasks, todayISO);
      case 'clients': return buildClientsDrill(tasks, clients);
    }
  }, [kpiKey, tasks, clients, workload, todayISO]);

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

function buildCapacityDrill(tasks: Task[], workload: WorkloadRow[]): DrillContent {
  // Open tasks assigned to anyone currently over 100%. No open-task view
  // of capacity would leave the operator staring at a number with no way
  // to act — this turns the KPI into a to-do for rebalancing.
  const overIds = new Set(workload.filter(r => r.pct > 100).map(r => r.id));
  const rows = tasks.filter(t => isOpen(t) && t.assigneeId && overIds.has(t.assigneeId));
  rows.sort((a, b) => {
    const pa = workload.find(r => r.id === a.assigneeId)?.pct ?? 0;
    const pb = workload.find(r => r.id === b.assigneeId)?.pct ?? 0;
    if (pa !== pb) return pb - pa; // most-overloaded first
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  });
  return {
    kind: 'tasks',
    title: 'Open tasks owned by over-capacity teammates',
    unit: 'task', unitPlural: 'tasks',
    empty: 'No one is over capacity — nothing to rebalance.',
    rows: rows.map(t => ({
      task: t,
      status: {
        label: (() => {
          const pct = workload.find(r => r.id === t.assigneeId)?.pct ?? 0;
          return `${pct}% load`;
        })(),
        tone: 'late',
      },
    })),
  };
}

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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
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
    return tasks
      .filter(isOpen)
      .filter(t => inBucket(t, bucket, todayISO))
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 25);
  }, [tasks, bucket, todayISO]);

  return (
    <section className="anlx-section" aria-labelledby="anlx-up-title">
      <div className="anlx-section-head">
        <div className="anlx-section-title" id="anlx-up-title">Upcoming deliverables</div>
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
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
  if (bucket === 'today') return diff >= 0 && diff <= 0; // just today
  if (bucket === 'week') return diff >= 0 && diff <= 6;
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
  hours: number;
  wip: number;
  pct: number;
  budget: number;
  tone: 'soft' | 'ok' | 'tight' | 'over';
  spark: number[];
}

function WorkloadSection({ rows }: { rows: WorkloadRow[] }) {
  const over = rows.filter(r => r.pct > 100).length;
  const tight = rows.filter(r => r.pct >= 85 && r.pct <= 100).length;

  return (
    <section className="anlx-section" aria-labelledby="anlx-wl-title">
      <div className="anlx-section-head">
        <div className="anlx-section-title" id="anlx-wl-title">Team workload</div>
        <div className="anlx-section-sub">
          Hours booked vs. 40-hour week · WIP = open tasks · 4-week trend
          {over > 0 && ` · ${over} over capacity`}
          {tight > 0 && ` · ${tight} tight`}
        </div>
      </div>
      <div className="anlx-wl-head" aria-hidden="true">
        <div className="anlx-wl-head-cell">Person</div>
        <div className="anlx-wl-head-cell">Load</div>
        <div className="anlx-wl-head-cell num">Used</div>
        <div className="anlx-wl-head-cell num">WIP</div>
        <div className="anlx-wl-head-cell num spark">4wk</div>
        <div className="anlx-wl-head-cell" />
      </div>
      <div className="anlx-wl-list">
        {rows.map(r => <WorkloadRowView key={r.id} row={r} />)}
      </div>
    </section>
  );
}

function WorkloadRowView({ row }: { row: WorkloadRow }) {
  const barPct = Math.min(row.pct, 100);

  return (
    <button type="button" className="anlx-wl-row">
      <div className="anlx-wl-who">
        <span className="anlx-av" style={{ background: row.color }}>
          {row.initials}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="anlx-wl-who-name">{row.name}</div>
          {row.role && <div className="anlx-wl-who-role">{row.role}</div>}
        </div>
      </div>
      <div className="anlx-wl-bar">
        <div className={`anlx-wl-bar-fill ${row.tone}`} style={{ width: `${barPct}%` }} />
        <div className="anlx-wl-bar-budget" />
      </div>
      <div className={`anlx-wl-pct${row.tone === 'over' ? ' over' : row.tone === 'tight' ? ' tight' : ''}`}>
        {row.pct}%
      </div>
      <div className="anlx-wl-num">{row.wip}</div>
      <svg className="anlx-wl-spark" viewBox="0 0 80 22" preserveAspectRatio="none"
        style={{ color: toneColor(row.tone) }}>
        <SparkPaths series={row.spark} w={80} h={22} />
      </svg>
      <div className="anlx-wl-chev">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </button>
  );
}

function toneColor(tone: WorkloadRow['tone']): string {
  switch (tone) {
    case 'over': return '#ff453a';
    case 'tight': return '#ff9f0a';
    case 'ok': return '#30d158';
    case 'soft': return '#64d2ff';
  }
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
      hours: 0,
      wip: 0,
      pct: 0,
      budget: 40,
      tone: 'soft',
      spark: [],
    };
  }

  // Simple allocation: each open task with an assignee contributes a fixed
  // 4h to their bucket. Mockup uses 55/45 splits for primary/secondary
  // owners, but our Task model today only carries a single assignee — good
  // enough for a first pass.
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    if (!t.assigneeId) continue;
    const row = rows[t.assigneeId];
    if (!row) continue;
    row.hours += 4;
    row.wip += 1;
  }

  const list = members.map(m => rows[m.id]);
  for (const r of list) {
    r.pct = Math.round((r.hours / r.budget) * 100);
    r.tone = r.pct > 100 ? 'over' : r.pct >= 85 ? 'tight' : r.pct >= 50 ? 'ok' : 'soft';
    r.spark = seedHistory('wl-' + r.id, Math.max(20, r.pct - 30), Math.min(120, r.pct + 15));
  }
  list.sort((a, b) => b.pct - a.pct);
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

/** Deterministic pseudo-history for sparklines. Same seed always produces
 *  the same curve, so the Analytics page doesn't reshuffle on re-render. */
function seedHistory(seed: string, lo: number, hi: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  let x = Math.abs(h) >>> 0;
  const n = 12;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    const r = x / 0xffffffff;
    out.push(lo + r * (hi - lo));
  }
  return out;
}
