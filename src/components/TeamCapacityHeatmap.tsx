import { useEffect, useMemo, useState } from 'react';
import type {
  Client,
  Member,
  MemberDayOverride,
  OpsTask,
  Service,
  Task,
} from '../types/flizow';
import { loadFor, effectiveCapFor, zoneFor } from '../utils/capacity';

/**
 * Team Capacity heatmap.
 *
 * The payoff view for the whole capacity model. Rows = team members,
 * columns = the next 10 weekdays (Mon–Fri × 2 weeks, matching My
 * Schedule). Each cell shows `load/soft` tinted green/amber/red so the
 * ops manager can scan the fortnight and spot bottlenecks before any
 * AM books past someone's cap.
 *
 * Why it lives here (Ops page): the heatmap is a workspace-level
 * planning surface — peer of the Ops Brief and the Ops Board. It's
 * not "MY view" (that's the Overview), it's "the team's load."
 *
 * Click a cell → modal lists the tasks stacked on that member that day.
 * The list matches what `loadFor` counts: primary-assignee only, not
 * archived, not in `done`. Multi-owner tasks don't double-count anyone.
 *
 * v1 is read-only — capacity numbers display, no editing per-day caps
 * from this surface (those still live on each person's My Schedule).
 * Drag-rebook + per-cell cap editing are obvious follow-ups.
 */

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type HeatDay = {
  iso: string;
  dayName: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
};

function isoOfLocal(d: Date): string {
  // Build YYYY-MM-DD from local components — toISOString() shifts to
  // UTC and rolls back a day in any timezone east of Greenwich, which
  // would mis-align this grid against task dueDates (which live in
  // local calendar space).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildHeatmapDays(todayISO: string): HeatDay[] {
  // Mirror buildWeekGrid in OverviewPage so the heatmap aligns with My
  // Schedule. Anchor on Monday of today's week, then walk Mon–Fri,
  // skip Sat/Sun, walk Mon–Fri again. Sunday wraps back six days to
  // last Monday — same convention as the demo seed used.
  const [ty, tm, td] = todayISO.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  const dow = today.getDay();
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() + daysToMonday);
  const todayKey = isoOfLocal(today);

  const days: HeatDay[] = [];
  for (let i = 0; i < 10; i++) {
    const offset = i < 5 ? i : i + 2;
    const d = new Date(monday);
    d.setDate(d.getDate() + offset);
    const iso = isoOfLocal(d);
    days.push({
      iso,
      dayName: DAY_NAMES[i % 5],
      dateLabel: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
      isToday: iso === todayKey,
      isPast: iso < todayKey,
    });
  }
  return days;
}

export function TeamCapacityHeatmap({
  members,
  tasks,
  opsTasks,
  overrides,
  todayISO,
  clients,
  services,
}: {
  members: Member[];
  tasks: Task[];
  opsTasks: OpsTask[];
  overrides: MemberDayOverride[];
  todayISO: string;
  clients: Client[];
  services: Service[];
}) {
  const days = useMemo(() => buildHeatmapDays(todayISO), [todayISO]);
  // Combined slot pile — client tasks + ops tasks both consume the
  // same finite attention, so the heatmap counts both. Same rule the
  // card-modal capacity warning + My Schedule per-day badge use.
  const allTasks = useMemo(() => [...tasks, ...opsTasks], [tasks, opsTasks]);
  // Stable display order: A→Z by name. Keeps row order predictable
  // across renders even when the underlying members array gets
  // rewritten (Firebase sync, store edits, etc.). Members without
  // names sort to the bottom.
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [members],
  );

  // Which (member, date) cell is open in the detail modal. One at a
  // time — clicking another cell replaces the open one without
  // closing first.
  const [selected, setSelected] = useState<{
    memberId: string;
    dateISO: string;
  } | null>(null);

  if (sortedMembers.length === 0) {
    return (
      <section className="capacity-strip" role="region" aria-labelledby="cap-strip-title">
        <div className="capacity-strip-head">
          <h2 className="capacity-strip-title" id="cap-strip-title">Team Capacity</h2>
        </div>
        <div className="capacity-strip-empty">
          Invite teammates to see their workload here.
        </div>
      </section>
    );
  }

  return (
    <section className="capacity-strip" role="region" aria-labelledby="cap-strip-title">
      <div className="capacity-strip-head">
        <h2 className="capacity-strip-title" id="cap-strip-title">Team Capacity</h2>
        <p className="capacity-strip-sub">
          Slots booked vs. soft cap across the next two weeks. Green is
          under, amber is stretching, red is over max. Click any cell to
          see what's stacked.
        </p>
      </div>

      {/* role="table" so screen readers announce rows + columns; cells
          inside use role="cell" / "columnheader" / "rowheader". The
          DOM structure is a flexbox grid, not a real <table>, because
          the layout pins the member column and lets day columns flex
          — easier to do with grid than table layout. */}
      <div className="capacity-grid" role="table" aria-label="Team capacity by day">
        <div className="cap-row cap-row--head" role="row">
          <div className="cap-cell cap-cell--member-head" role="columnheader">Team</div>
          {days.map(d => (
            <div
              key={d.iso}
              className={`cap-cell cap-cell--day-head${d.isToday ? ' is-today' : ''}${d.isPast ? ' is-past' : ''}`}
              role="columnheader"
            >
              <div className="cap-day-name">{d.dayName}</div>
              <div className="cap-day-date">{d.dateLabel}</div>
            </div>
          ))}
        </div>

        {sortedMembers.map(m => (
          <div key={m.id} className="cap-row" role="row">
            <div className="cap-cell cap-cell--member" role="rowheader">
              <span
                className="cap-member-avatar"
                style={{ background: m.bg ?? m.color, color: m.bg ? m.color : '#fff' }}
                aria-hidden="true"
              >
                {m.initials}
              </span>
              <div className="cap-member-text">
                <div className="cap-member-name">{m.name || 'Unnamed'}</div>
                {m.role && <div className="cap-member-role">{m.role}</div>}
              </div>
            </div>
            {days.map(d => {
              const load = loadFor(m.id, d.iso, allTasks);
              const caps = effectiveCapFor(m.id, d.iso, members, overrides);
              const zone = zoneFor(load, caps);
              const hasOverride = overrides.some(
                o => o.memberId === m.id && o.date === d.iso,
              );
              const isEmpty = load === 0;
              const cellLabel =
                `${m.name || 'Unnamed'}, ${d.dateLabel}: ${load} of ${caps.soft} slots booked` +
                (hasOverride ? ' (custom cap for this day)' : '');
              return (
                <button
                  key={d.iso}
                  type="button"
                  className={
                    `cap-cell cap-cell--data zone-${zone}` +
                    (hasOverride ? ' has-override' : '') +
                    (isEmpty ? ' is-empty' : '') +
                    (d.isToday ? ' is-today' : '') +
                    (d.isPast ? ' is-past' : '')
                  }
                  onClick={() => setSelected({ memberId: m.id, dateISO: d.iso })}
                  aria-label={cellLabel}
                  title={cellLabel}
                >
                  {load}/{caps.soft}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {selected && (
        <CellDetailModal
          memberId={selected.memberId}
          dateISO={selected.dateISO}
          members={members}
          allTasks={allTasks}
          overrides={overrides}
          clients={clients}
          services={services}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

/**
 * "What's stacked on this person, this day" — opens when a cell is
 * clicked. Lists the same tasks that loadFor counts (primary
 * assignee, not archived, not done) so the visible pile matches the
 * cell's number exactly. Clicking a row deep-links into the card
 * modal (or `#ops` for ops tasks, since those don't have a per-card
 * route yet).
 *
 * Modal-style (centered + backdrop) instead of an anchored popover
 * because a 14-column heatmap puts cells near viewport edges where
 * anchored popovers get clipped or jump. Centered is bulletproof and
 * gives the content room to breathe.
 */
function CellDetailModal({
  memberId,
  dateISO,
  members,
  allTasks,
  overrides,
  clients,
  services,
  onClose,
}: {
  memberId: string;
  dateISO: string;
  members: Member[];
  allTasks: (Task | OpsTask)[];
  overrides: MemberDayOverride[];
  clients: Client[];
  services: Service[];
  onClose: () => void;
}) {
  const member = members.find(m => m.id === memberId);
  const load = loadFor(memberId, dateISO, allTasks);
  const caps = effectiveCapFor(memberId, dateISO, members, overrides);
  const zone = zoneFor(load, caps);
  const hasOverride = overrides.some(
    o => o.memberId === memberId && o.date === dateISO,
  );

  // Stacked tasks — same predicate as loadFor. Pulled out into its
  // own filter so we can render the list without re-walking the math.
  const stacked = allTasks.filter(t =>
    t.assigneeId === memberId &&
    t.dueDate === dateISO &&
    !t.archived &&
    t.columnId !== 'done',
  );

  const clientById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const serviceById = useMemo(() => new Map(services.map(s => [s.id, s])), [services]);
  const [yy, mm, dd] = dateISO.split('-').map(Number);
  const dt = new Date(yy, mm - 1, dd);
  const dateLabel = `${FULL_DAYS[dt.getDay()]}, ${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}`;

  // Esc to close. Keyboard-only users need an out, and this matches
  // the rest of the app's modal vocabulary.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cell-detail-backdrop" onClick={onClose}>
      <div
        className="cell-detail-pop"
        role="dialog"
        aria-modal="true"
        aria-label={`${member?.name ?? 'Member'} on ${dateLabel}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="cell-detail-head">
          <div>
            <div className="cell-detail-eyebrow">{dateLabel}</div>
            <div className="cell-detail-title">{member?.name ?? 'Unknown'}</div>
            {member?.role && <div className="cell-detail-role">{member.role}</div>}
          </div>
          <div
            className={`cell-detail-load zone-${zone}`}
            title={
              hasOverride
                ? `${load} of ${caps.soft} slots booked (custom cap for this day)`
                : `${load} of ${caps.soft} slots booked`
            }
          >
            {load} / {caps.soft}
            {hasOverride && <span className="cell-detail-override-mark"> ·</span>}
          </div>
        </div>
        {stacked.length === 0 ? (
          <div className="cell-detail-empty">Nothing booked.</div>
        ) : (
          <ul className="cell-detail-list">
            {stacked.map(t => {
              // Ops tasks don't carry clientId/serviceId; the union
              // discriminator is "does this task have a clientId".
              const isOps = !('clientId' in t);
              const slots = t.slots ?? 1;
              const client = isOps ? null : clientById.get((t as Task).clientId);
              const service = isOps ? null : serviceById.get((t as Task).serviceId);
              const href = isOps
                ? '#ops'
                : `#board/${(t as Task).serviceId}/card/${t.id}`;
              const meta = isOps
                ? 'Internal Ops'
                : [client?.name, service?.name].filter(Boolean).join(' · ');
              return (
                <li key={t.id} className="cell-detail-item">
                  <a
                    href={href}
                    className="cell-detail-item-link"
                    onClick={onClose}
                  >
                    <div className="cell-detail-item-title">{t.title}</div>
                    {meta && <div className="cell-detail-item-meta">{meta}</div>}
                  </a>
                  <div className="cell-detail-item-slots" title="Slot weight">
                    {slots} {slots === 1 ? 'slot' : 'slots'}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
