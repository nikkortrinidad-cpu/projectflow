/**
 * OpsTimeOffTab — the Time off Schedules surface inside the Ops page.
 *
 * Layout:
 *   ┌──────────────────────────────────┬──────────────────────┐
 *   │  Month calendar (Mon–Sun grid)   │  Right rail          │
 *   │  - avatar stack per day          │  - sub-tabs:         │
 *   │  - red border on conflict days   │    Approvals (default│
 *   │  - "today" highlighted in orange │     for Owner/Admin) │
 *   │  - click cell → day popover      │    Rules             │
 *   │                                  │    Conflicts         │
 *   └──────────────────────────────────┴──────────────────────┘
 *
 * Reads:
 *   data.timeOffRequests  → calendar avatars + conflict math
 *   data.coverageRules    → conflict math + rules CRUD
 *   data.members          → who's off + scope filtering
 *   data.jobTitles        → filter chips
 *
 * Writes (Owner/Admin only):
 *   approveTimeOffRequest / denyTimeOffRequest — approval queue
 *   submitTimeOffRequest (cancel by member)    — passthrough cancel
 *   addCoverageRule / updateCoverageRule /
 *   archiveCoverageRule / deleteCoverageRule   — rules builder
 *
 * Role gating:
 *   - Owner/Admin: full surface, write access on everything
 *   - Member:      tab is hidden in the parent (OpsPage)
 *   - Viewer:      tab is hidden in the parent
 *
 * The role check at the parent level (OpsPage filters tabs by
 * can(role, 'manage:workspace')) means we don't have to repeat the
 * gate inside this component — if you got here, you can write.
 *
 * Audit: time-off Phase 6.
 */

import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
import {
  evaluateRules,
  groupConflictsByDate,
  makeCoverageRule,
} from '../utils/coverageRules';
import { ACCESS_ROLE_LABEL } from '../utils/access';
import { visibleHolidays, countryShortLabel, countryTint, holidayAppliesToCountry } from '../utils/holidays';
import { memberObservationFor } from '../utils/holidayCredits';
import type {
  CoverageRule,
  CoverageRuleConstraint,
  CoverageRuleWho,
  Member,
  RuleConflict,
  TimeOffRequest,
  AccessRole,
  Holiday,
  HolidayObservation,
  JobTitle,
} from '../types/flizow';

// ── Date utilities (local, kept tight) ─────────────────────────────

/** First and last ISO dates inside a month. End-inclusive. */
function monthRange(year: number, monthIdx: number): { start: string; end: string } {
  const last = new Date(year, monthIdx + 1, 0).getDate();
  const m = String(monthIdx + 1).padStart(2, '0');
  return {
    start: `${year}-${m}-01`,
    end: `${year}-${m}-${String(last).padStart(2, '0')}`,
  };
}

/** Build the calendar cells for a given month. Always 6 rows × 7
 *  cols = 42 cells so the grid height stays stable regardless of
 *  how the month falls. Each cell has its ISO date + an `inMonth`
 *  flag so the renderer can dim leading/trailing days. */
function buildMonthCells(year: number, monthIdx: number): Array<{ iso: string; inMonth: boolean }> {
  const out: Array<{ iso: string; inMonth: boolean }> = [];
  const firstOfMonth = new Date(year, monthIdx, 1);
  // Lead-in days: align so Monday is the first column.
  const dow = firstOfMonth.getDay(); // 0=Sun ... 6=Sat
  const lead = (dow + 6) % 7;        // 0=Mon ... 6=Sun
  const start = new Date(year, monthIdx, 1 - lead);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({
      iso,
      inMonth: d.getMonth() === monthIdx && d.getFullYear() === year,
    });
  }
  return out;
}

/** ISO → "May 15, 2026" */
function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
/** ISO → "May 15" */
function formatMonthDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
/** ISO → "Wed, May 15" */
function formatWeekdayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Top-level component ────────────────────────────────────────────

type RailTab = 'approvals' | 'rules' | 'conflicts';

export function OpsTimeOffTab({ focusId }: { focusId?: string } = {}) {
  const { data } = useFlizow();
  const today = data.today;

  // Month cursor state — first day of the displayed month. Stored
  // as a Date so the ◀ ▶ arrows can step ±1 month with one .setMonth.
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, 1);
  });

  const year = cursor.getFullYear();
  const monthIdx = cursor.getMonth();
  const cells = useMemo(() => buildMonthCells(year, monthIdx), [year, monthIdx]);
  const range = useMemo(() => monthRange(year, monthIdx), [year, monthIdx]);

  // Job-title filter — chip-based. Empty set = show everyone (the
  // common case). Pressing chips narrows to specific titles.
  const [jobTitleFilter, setJobTitleFilter] = useState<Set<string>>(new Set());

  // Right-rail sub-tab. Default to Approvals because that's the
  // primary OM workflow on this surface; Rules + Conflicts are
  // configuration / audit views.
  const [railTab, setRailTab] = useState<RailTab>('approvals');

  // Selected day (popover). Null when the popover is closed.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Filter members by job-title pill state. Done once at the top
  // so all the downstream views (calendar, conflict list, day
  // popover) read the same filtered set.
  const filteredMembers: Member[] = useMemo(() => {
    if (jobTitleFilter.size === 0) return data.members;
    return data.members.filter(
      (m) => m.jobTitleId != null && jobTitleFilter.has(m.jobTitleId),
    );
  }, [data.members, jobTitleFilter]);

  const filteredMemberIds = useMemo(
    () => new Set(filteredMembers.map((m) => m.id)),
    [filteredMembers],
  );

  // Approved time off whose member matches the filter — drives the
  // calendar avatar stacks. Not the conflict math (rules see ALL
  // members regardless of filter).
  const approvedRequests = useMemo(
    () => data.timeOffRequests.filter((r) => r.status === 'approved'),
    [data.timeOffRequests],
  );
  const calendarRequests = useMemo(
    () =>
      jobTitleFilter.size === 0
        ? approvedRequests
        : approvedRequests.filter((r) => filteredMemberIds.has(r.memberId)),
    [approvedRequests, jobTitleFilter, filteredMemberIds],
  );

  // Conflict math. Always runs across ALL members (filter shouldn't
  // hide a real coverage problem).
  const conflicts = useMemo(
    () =>
      evaluateRules({
        rules: data.coverageRules,
        members: data.members,
        approvedRequests,
        start: range.start,
        end: range.end,
      }),
    [data.coverageRules, data.members, approvedRequests, range.start, range.end],
  );
  const conflictsByDate = useMemo(() => groupConflictsByDate(conflicts), [conflicts]);

  // Holidays bucketed by date for the calendar ribbon. Filtered by
  // the workspace's actual member country mix — a PH-only workspace
  // doesn't see AU dates even though they live in the catalog.
  const holidaysByDate = useMemo(() => {
    const visible = visibleHolidays(data.holidays, data.members);
    const map = new Map<string, Holiday[]>();
    for (const h of visible) {
      const bucket = map.get(h.date) ?? [];
      bucket.push(h);
      map.set(h.date, bucket);
    }
    return map;
  }, [data.holidays, data.members]);

  // Pending requests for the approval queue (only those whose start
  // is still ahead, OR currently-active — past-only pending makes no
  // sense in practice but we don't filter aggressively in case a
  // network round-trip delayed approval).
  const pendingRequests = useMemo(
    () =>
      data.timeOffRequests
        .filter((r) => r.status === 'pending')
        .slice()
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    [data.timeOffRequests],
  );

  function stepMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }
  function jumpToToday() {
    const [y, m] = today.split('-').map(Number);
    setCursor(new Date(y, (m ?? 1) - 1, 1));
  }

  function toggleJobTitle(id: string) {
    setJobTitleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section
      id="ops-panel-timeoff"
      role="tabpanel"
      aria-labelledby="ops-tab-timeoff"
      className="schedules-strip"
    >
      <div className="schedules-strip-head">
        <div>
          <h2 className="schedules-strip-title">Time off Schedules</h2>
          <p className="schedules-strip-sub">
            Calendar of approved time off with rule-based conflict checks. Approve pending requests, edit coverage rules, and scan the month for trouble.
          </p>
        </div>
        <SchedulesToolbar
          cursor={cursor}
          onStepMonth={stepMonth}
          onJumpToday={jumpToToday}
          jobTitles={data.jobTitles.filter((t) => t.active)}
          jobTitleFilter={jobTitleFilter}
          onToggleJobTitle={toggleJobTitle}
          onClearFilter={() => setJobTitleFilter(new Set())}
        />
      </div>

      <div className="schedules-grid">
        <SchedulesCalendar
          cells={cells}
          monthIdx={monthIdx}
          today={today}
          requests={calendarRequests}
          conflictsByDate={conflictsByDate}
          holidaysByDate={holidaysByDate}
          members={data.members}
          onSelectDate={setSelectedDate}
        />
        <aside className="schedules-rail" aria-label="Schedules side panel">
          <RailTabs active={railTab} onChange={setRailTab} pendingCount={pendingRequests.length} conflictCount={conflicts.length} ruleCount={data.coverageRules.length} />
          {railTab === 'approvals' && (
            <ApprovalQueue
              requests={pendingRequests}
              members={data.members}
              rules={data.coverageRules}
              approvedRequests={approvedRequests}
              focusId={focusId}
            />
          )}
          {railTab === 'rules' && (
            <RulesPanel
              rules={data.coverageRules}
              members={data.members}
              jobTitles={data.jobTitles}
            />
          )}
          {railTab === 'conflicts' && (
            <ConflictsPanel
              conflicts={conflicts}
              members={data.members}
              onSelectDate={setSelectedDate}
            />
          )}
        </aside>
      </div>

      {selectedDate && (
        <DayPopover
          date={selectedDate}
          requests={approvedRequests}
          members={data.members}
          jobTitles={data.jobTitles}
          conflicts={conflictsByDate.get(selectedDate) ?? []}
          holidays={holidaysByDate.get(selectedDate) ?? []}
          observations={data.holidayObservations}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </section>
  );
}

// ── Toolbar (month nav + filter chips) ─────────────────────────────

function SchedulesToolbar({
  cursor,
  onStepMonth,
  onJumpToday,
  jobTitles,
  jobTitleFilter,
  onToggleJobTitle,
  onClearFilter,
}: {
  cursor: Date;
  onStepMonth: (delta: number) => void;
  onJumpToday: () => void;
  jobTitles: ReadonlyArray<JobTitle>;
  jobTitleFilter: ReadonlySet<string>;
  onToggleJobTitle: (id: string) => void;
  onClearFilter: () => void;
}) {
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div className="schedules-toolbar">
      <div className="schedules-month-nav" role="group" aria-label="Month navigation">
        <button
          type="button"
          className="schedules-month-step"
          onClick={() => onStepMonth(-1)}
          aria-label="Previous month"
        >
          ◀
        </button>
        <span className="schedules-month-label">{monthLabel}</span>
        <button
          type="button"
          className="schedules-month-step"
          onClick={() => onStepMonth(1)}
          aria-label="Next month"
        >
          ▶
        </button>
        <button
          type="button"
          className="schedules-today-btn"
          onClick={onJumpToday}
        >
          Today
        </button>
      </div>
      {jobTitles.length > 0 && (
        <div className="schedules-filter-chips" role="group" aria-label="Filter by job title">
          {jobTitles.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`schedules-chip${jobTitleFilter.has(t.id) ? ' schedules-chip--on' : ''}`}
              onClick={() => onToggleJobTitle(t.id)}
              aria-pressed={jobTitleFilter.has(t.id)}
            >
              <span className="schedules-chip-dot" style={{ background: t.color || 'var(--bg-soft)' }} aria-hidden="true" />
              {t.label}
            </button>
          ))}
          {jobTitleFilter.size > 0 && (
            <button
              type="button"
              className="schedules-chip schedules-chip--clear"
              onClick={onClearFilter}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Calendar grid ──────────────────────────────────────────────────

function SchedulesCalendar({
  cells,
  monthIdx,
  today,
  requests,
  conflictsByDate,
  holidaysByDate,
  members,
  onSelectDate,
}: {
  cells: Array<{ iso: string; inMonth: boolean }>;
  monthIdx: number;
  today: string;
  requests: ReadonlyArray<TimeOffRequest>;
  conflictsByDate: Map<string, RuleConflict[]>;
  holidaysByDate: Map<string, Holiday[]>;
  members: ReadonlyArray<Member>;
  onSelectDate: (iso: string) => void;
}) {
  // Index requests by date. Iterates each date inside each request's
  // range so a 5-day vacation lights up all 5 cells.
  const offByDate = useMemo(() => {
    const map = new Map<string, Member[]>();
    const memberById = new Map(members.map((m) => [m.id, m]));
    for (const r of requests) {
      const m = memberById.get(r.memberId);
      if (!m) continue;
      // Walk start → end inclusive.
      const [sy, sm, sd] = r.start.split('-').map(Number);
      const [ey, em, ed] = r.end.split('-').map(Number);
      const cur = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);
      while (cur.getTime() <= end.getTime()) {
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        const bucket = map.get(iso) ?? [];
        if (!bucket.some((existing) => existing.id === m.id)) bucket.push(m);
        map.set(iso, bucket);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [requests, members]);

  return (
    <div className="schedules-calendar" role="grid" aria-label="Time off month calendar">
      <div className="schedules-calendar-weekdays" role="row">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} role="columnheader" className="schedules-calendar-weekday">{d}</div>
        ))}
      </div>
      <div className="schedules-calendar-grid">
        {cells.map((cell) => {
          const off = offByDate.get(cell.iso) ?? [];
          const conflicts = conflictsByDate.get(cell.iso) ?? [];
          const holidays = holidaysByDate.get(cell.iso) ?? [];
          const isToday = cell.iso === today;
          return (
            <CalendarDayCell
              key={cell.iso}
              iso={cell.iso}
              inMonth={cell.inMonth && new Date(cell.iso.slice(0, 4) + '-' + cell.iso.slice(5, 7) + '-01').getMonth() === monthIdx}
              isToday={isToday}
              off={off}
              holidays={holidays}
              hasConflict={conflicts.length > 0}
              conflictCount={conflicts.length}
              onClick={() => onSelectDate(cell.iso)}
            />
          );
        })}
      </div>
    </div>
  );
}

function CalendarDayCell({
  iso,
  inMonth,
  isToday,
  off,
  holidays,
  hasConflict,
  conflictCount,
  onClick,
}: {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  off: ReadonlyArray<Member>;
  holidays: ReadonlyArray<Holiday>;
  hasConflict: boolean;
  conflictCount: number;
  onClick: () => void;
}) {
  const day = parseInt(iso.slice(8, 10), 10);
  const visible = off.slice(0, 3);
  const overflow = off.length - visible.length;
  // Pick the first holiday for the per-cell tint. Multiple holidays
  // on one date is rare (PH overlaps); the popover shows the full
  // list. The ribbon just signals "something's happening here."
  const primaryHoliday = holidays[0];

  const className = [
    'schedules-day',
    inMonth ? '' : 'schedules-day--out',
    isToday ? 'schedules-day--today' : '',
    hasConflict ? 'schedules-day--conflict' : '',
    off.length > 0 ? 'schedules-day--has-off' : '',
    primaryHoliday ? 'schedules-day--holiday' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role="gridcell"
      className={className}
      onClick={onClick}
      aria-label={`${formatLong(iso)} — ${off.length} off, ${conflictCount} conflicts${holidays.length > 0 ? `, ${holidays.length} holiday(s)` : ''}`}
      style={
        primaryHoliday
          ? { background: countryTint(primaryHoliday.country) }
          : undefined
      }
    >
      <span className="schedules-day-num">{day}</span>
      {primaryHoliday && (
        <span
          className="schedules-day-holiday"
          aria-hidden="true"
          title={
            holidays.length > 1
              ? `${holidays.length} holidays — ${holidays.map((h) => h.name).join(', ')}`
              : primaryHoliday.name
          }
        >
          {countryShortLabel(primaryHoliday.country)}
          {' '}
          {primaryHoliday.name.length > 18
            ? primaryHoliday.name.slice(0, 16) + '…'
            : primaryHoliday.name}
        </span>
      )}
      {hasConflict && (
        <span
          className="schedules-day-conflict-dot"
          aria-hidden="true"
          title={`${conflictCount} ${conflictCount === 1 ? 'rule broken' : 'rules broken'}`}
        >
          {conflictCount > 1 ? conflictCount : ''}
        </span>
      )}
      {visible.length > 0 && (
        <div className="schedules-day-avatars" aria-hidden="true">
          {visible.map((m) => (
            <span
              key={m.id}
              className="schedules-day-avatar"
              style={
                m.bg
                  ? { background: m.bg, color: m.color }
                  : { background: m.color, color: '#fff' }
              }
              title={m.name}
            >
              {m.initials}
            </span>
          ))}
          {overflow > 0 && (
            <span className="schedules-day-avatar schedules-day-avatar--overflow">+{overflow}</span>
          )}
        </div>
      )}
    </button>
  );
}

// ── Rail tabs ──────────────────────────────────────────────────────

function RailTabs({
  active,
  onChange,
  pendingCount,
  conflictCount,
  ruleCount,
}: {
  active: RailTab;
  onChange: (tab: RailTab) => void;
  pendingCount: number;
  conflictCount: number;
  ruleCount: number;
}) {
  const items: Array<{ id: RailTab; label: string; count: number }> = [
    { id: 'approvals', label: 'Approvals', count: pendingCount },
    { id: 'rules',     label: 'Rules',     count: ruleCount },
    { id: 'conflicts', label: 'Conflicts', count: conflictCount },
  ];
  return (
    <div className="schedules-rail-tabs" role="tablist" aria-label="Schedules side panel sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={active === item.id}
          className={`schedules-rail-tab${active === item.id ? ' on' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count > 0 && <span className="schedules-rail-tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Approval queue ─────────────────────────────────────────────────

function ApprovalQueue({
  requests,
  members,
  rules,
  approvedRequests,
  focusId,
}: {
  requests: ReadonlyArray<TimeOffRequest>;
  members: ReadonlyArray<Member>;
  rules: ReadonlyArray<CoverageRule>;
  approvedRequests: ReadonlyArray<TimeOffRequest>;
  focusId?: string;
}) {
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  // One-shot focus highlight when a deep-link points at a request.
  // Scrolls into view + applies a `data-focused` attribute that the
  // CSS pulses for ~1.5s. Tracking the id across renders so the
  // attribute clears once the highlight has played, avoiding a
  // permanent ring on the row.
  const [focusedNow, setFocusedNow] = useState<string | null>(focusId ?? null);
  useEffect(() => {
    if (!focusId) return;
    setFocusedNow(focusId);
    // Wait one frame so the row mounts, then scroll. requestAnimationFrame
    // keeps this readable + avoids the brief flash of an unscrolled
    // first paint.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-focus-id="${focusId}"]`,
      );
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Clear the highlight after the CSS animation completes so a
    // re-render doesn't snap it back on indefinitely.
    const timer = setTimeout(() => setFocusedNow(null), 1800);
    return () => clearTimeout(timer);
  }, [focusId]);

  if (requests.length === 0) {
    return <div className="schedules-rail-empty">No pending requests.</div>;
  }

  function handleApprove(id: string) {
    const note = decisionNotes[id]?.trim();
    setPending(id);
    flizowStore.approveTimeOffRequest(id, note || undefined);
    setDecisionNotes((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
    setPending(null);
  }
  function handleDeny(id: string) {
    const note = decisionNotes[id]?.trim();
    setPending(id);
    flizowStore.denyTimeOffRequest(id, note || undefined);
    setDecisionNotes((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
    setPending(null);
  }

  return (
    <ul className="schedules-rail-list">
      {requests.map((r) => {
        const m = members.find((x) => x.id === r.memberId);
        // Conflict preview: would approving this request create
        // NEW broken rule-days that don't already exist? Shows the
        // OM whether they're walking into a coverage gap before
        // they click. Compute baseline (without this request) and
        // preview (with this request approved); subtract the
        // baseline keys from the preview to isolate the additions.
        const baselineConflicts = evaluateRules({
          rules,
          members,
          approvedRequests,
          start: r.start,
          end: r.end,
        });
        const previewConflicts = evaluateRules({
          rules,
          members,
          approvedRequests: [...approvedRequests, { ...r, status: 'approved' as const }],
          start: r.start,
          end: r.end,
        });
        const baselineKeys = new Set(
          baselineConflicts.map((c) => `${c.date}|${c.ruleId}`),
        );
        const newConflicts = previewConflicts.filter(
          (c) => !baselineKeys.has(`${c.date}|${c.ruleId}`),
        );

        return (
          <li
            key={r.id}
            className="schedules-request"
            data-focus-id={r.id}
            data-focused={focusedNow === r.id ? 'true' : undefined}
          >
            <div className="schedules-request-head">
              {m && (
                <span
                  className="schedules-request-avatar"
                  style={
                    m.bg
                      ? { background: m.bg, color: m.color }
                      : { background: m.color, color: '#fff' }
                  }
                  title={m.name}
                >
                  {m.initials}
                </span>
              )}
              <div className="schedules-request-id">
                <div className="schedules-request-name">{m?.name ?? 'Unknown'}</div>
                <div className="schedules-request-dates">
                  {formatMonthDay(r.start)} – {formatMonthDay(r.end)}
                </div>
              </div>
            </div>
            {r.reason && (
              <div className="schedules-request-reason">"{r.reason}"</div>
            )}
            {newConflicts.length > 0 && (
              <div className="schedules-request-conflict">
                <strong>Approving this would break {newConflicts.length} {newConflicts.length === 1 ? 'rule-day' : 'rule-days'}:</strong>
                <ul>
                  {newConflicts.slice(0, 3).map((c) => (
                    <li key={`${c.date}|${c.ruleId}`}>
                      {formatMonthDay(c.date)}: {c.ruleName}
                    </li>
                  ))}
                  {newConflicts.length > 3 && (
                    <li>+ {newConflicts.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
            <textarea
              className="schedules-request-note"
              value={decisionNotes[r.id] ?? ''}
              onChange={(e) =>
                setDecisionNotes((p) => ({ ...p, [r.id]: e.target.value }))
              }
              placeholder="Optional note (visible to the requester)"
              rows={2}
              maxLength={280}
            />
            <div className="schedules-request-actions">
              <button
                type="button"
                className="acct-btn-text schedules-deny-btn"
                onClick={() => handleDeny(r.id)}
                disabled={pending === r.id}
              >
                Deny
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                onClick={() => handleApprove(r.id)}
                disabled={pending === r.id}
              >
                Approve
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Rules panel ────────────────────────────────────────────────────

function RulesPanel({
  rules,
  members,
  jobTitles,
}: {
  rules: ReadonlyArray<CoverageRule>;
  members: ReadonlyArray<Member>;
  jobTitles: ReadonlyArray<JobTitle>;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  if (editing) {
    const existing = editing === 'new' ? null : rules.find((r) => r.id === editing) ?? null;
    return (
      <RuleEditor
        existing={existing}
        members={members}
        jobTitles={jobTitles}
        onCancel={() => setEditing(null)}
        onSave={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="schedules-rules-list">
      {rules.length === 0 ? (
        <div className="schedules-rail-empty">
          No rules yet. Rules let you say things like "always need 1 Account Manager present" so the calendar flags days that break the goal.
        </div>
      ) : (
        <ul className="schedules-rail-list">
          {rules.map((r) => (
            <li key={r.id} className={`schedules-rule${r.active ? '' : ' schedules-rule--archived'}`}>
              <div className="schedules-rule-head">
                <span className="schedules-rule-name">{r.name}</span>
                {!r.active && <span className="schedules-rule-tag">Archived</span>}
              </div>
              <div className="schedules-rule-summary">
                {summariseRule(r, jobTitles, members)}
              </div>
              <div className="schedules-rule-actions">
                <button
                  type="button"
                  className="acct-btn-text"
                  onClick={() => setEditing(r.id)}
                >
                  Edit
                </button>
                {r.active ? (
                  <button
                    type="button"
                    className="acct-btn-text"
                    onClick={() => flizowStore.archiveCoverageRule(r.id)}
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    type="button"
                    className="acct-btn-text"
                    onClick={() => flizowStore.updateCoverageRule(r.id, { active: true })}
                  >
                    Restore
                  </button>
                )}
                <button
                  type="button"
                  className="acct-btn-text schedules-deny-btn"
                  onClick={() => {
                    if (window.confirm(`Delete "${r.name}"? This can't be undone.`)) {
                      flizowStore.deleteCoverageRule(r.id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="acct-btn acct-btn--primary"
        onClick={() => setEditing('new')}
        style={{ marginTop: 'var(--sp-md)' }}
      >
        + New rule
      </button>
    </div>
  );
}

/** Plain-language summary of a rule for the list view. Reads back
 *  the form fields as a sentence: "At least 1 Account Manager
 *  present every weekday." */
function summariseRule(
  rule: CoverageRule,
  jobTitles: ReadonlyArray<JobTitle>,
  members: ReadonlyArray<Member>,
): string {
  const whoLabel = (() => {
    switch (rule.who.kind) {
      case 'role':
        return rule.who.roleIds.map((r) => ACCESS_ROLE_LABEL[r] + 's').join(' / ');
      case 'jobTitle':
        return rule.who.jobTitleIds
          .map((id) => jobTitles.find((t) => t.id === id)?.label ?? 'Unknown')
          .join(' / ');
      case 'members':
        return rule.who.memberIds
          .map((id) => members.find((m) => m.id === id)?.name ?? 'Unknown')
          .join(' / ');
    }
  })();
  const constraintLabel = rule.constraint.kind === 'min-present'
    ? `at least ${rule.constraint.count} present`
    : `at most ${rule.constraint.count} off`;
  const whenLabel = rule.when === 'weekdays' ? 'every weekday' : 'every day';
  return `${whoLabel}: ${constraintLabel} ${whenLabel}.`;
}

// ── Rule editor (form) ─────────────────────────────────────────────

function RuleEditor({
  existing,
  members,
  jobTitles,
  onCancel,
  onSave,
}: {
  existing: CoverageRule | null;
  members: ReadonlyArray<Member>;
  jobTitles: ReadonlyArray<JobTitle>;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [whoKind, setWhoKind] = useState<CoverageRuleWho['kind']>(existing?.who.kind ?? 'jobTitle');
  const [roleIds, setRoleIds] = useState<AccessRole[]>(
    existing?.who.kind === 'role' ? existing.who.roleIds : [],
  );
  const [jobTitleIds, setJobTitleIds] = useState<string[]>(
    existing?.who.kind === 'jobTitle' ? existing.who.jobTitleIds : [],
  );
  const [memberIds, setMemberIds] = useState<string[]>(
    existing?.who.kind === 'members' ? existing.who.memberIds : [],
  );
  const [constraintKind, setConstraintKind] = useState<CoverageRuleConstraint['kind']>(
    existing?.constraint.kind ?? 'min-present',
  );
  const [count, setCount] = useState<number>(existing?.constraint.count ?? 1);
  const [when, setWhen] = useState<'weekdays' | 'all'>(existing?.when ?? 'weekdays');
  const [error, setError] = useState<string | null>(null);

  function buildWho(): CoverageRuleWho | null {
    switch (whoKind) {
      case 'role':
        if (roleIds.length === 0) return null;
        return { kind: 'role', roleIds };
      case 'jobTitle':
        if (jobTitleIds.length === 0) return null;
        return { kind: 'jobTitle', jobTitleIds };
      case 'members':
        if (memberIds.length === 0) return null;
        return { kind: 'members', memberIds };
    }
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    const who = buildWho();
    if (!who) {
      setError('Pick at least one ' + (whoKind === 'role' ? 'role' : whoKind === 'jobTitle' ? 'job title' : 'member') + '.');
      return;
    }
    if (count < 0 || !Number.isFinite(count)) {
      setError('Count must be a positive number.');
      return;
    }
    const payload = {
      name: trimmed,
      who,
      constraint: { kind: constraintKind, count },
      when,
      active: existing?.active ?? true,
    };
    if (existing) {
      flizowStore.updateCoverageRule(existing.id, payload);
    } else {
      flizowStore.addCoverageRule(makeCoverageRule(payload));
    }
    onSave();
  }

  return (
    <div className="schedules-rule-editor">
      <div className="schedules-rule-editor-head">
        {existing ? 'Edit rule' : 'New rule'}
      </div>
      {error && (
        <div className="mbrs-error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <label className="member-profile-field">
        <span className="member-profile-field-label">Name</span>
        <input
          className="acct-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Always need an AM on deck"
          autoFocus
        />
      </label>
      <label className="member-profile-field">
        <span className="member-profile-field-label">Applies to</span>
        <select
          className="acct-input"
          value={whoKind}
          onChange={(e) => setWhoKind(e.target.value as CoverageRuleWho['kind'])}
        >
          <option value="jobTitle">Members with a job title</option>
          <option value="role">Members with an access role</option>
          <option value="members">Specific named members</option>
        </select>
      </label>
      {whoKind === 'jobTitle' && (
        <MultiCheckbox
          label="Job titles"
          options={jobTitles.filter((t) => t.active).map((t) => ({ id: t.id, label: t.label }))}
          selected={jobTitleIds}
          onChange={setJobTitleIds}
        />
      )}
      {whoKind === 'role' && (
        <MultiCheckbox
          label="Access roles"
          options={(['owner', 'admin', 'member', 'viewer'] as AccessRole[]).map((r) => ({
            id: r,
            label: ACCESS_ROLE_LABEL[r],
          }))}
          selected={roleIds}
          onChange={(ids) => setRoleIds(ids as AccessRole[])}
        />
      )}
      {whoKind === 'members' && (
        <MultiCheckbox
          label="Members"
          options={members.map((m) => ({ id: m.id, label: m.name }))}
          selected={memberIds}
          onChange={setMemberIds}
        />
      )}
      <div className="schedules-rule-row-2">
        <label className="member-profile-field">
          <span className="member-profile-field-label">Constraint</span>
          <select
            className="acct-input"
            value={constraintKind}
            onChange={(e) => setConstraintKind(e.target.value as CoverageRuleConstraint['kind'])}
          >
            <option value="min-present">At least N present</option>
            <option value="max-out">At most N off</option>
          </select>
        </label>
        <label className="member-profile-field">
          <span className="member-profile-field-label">Count</span>
          <input
            type="number"
            className="acct-input"
            value={count}
            min={0}
            onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)}
          />
        </label>
      </div>
      <label className="member-profile-field">
        <span className="member-profile-field-label">Days</span>
        <select
          className="acct-input"
          value={when}
          onChange={(e) => setWhen(e.target.value as 'weekdays' | 'all')}
        >
          <option value="weekdays">Weekdays only</option>
          <option value="all">All days</option>
        </select>
      </label>
      <div className="schedules-rule-editor-actions">
        <button
          type="button"
          className="acct-btn-text"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="acct-btn acct-btn--primary"
          onClick={handleSave}
        >
          {existing ? 'Save changes' : 'Create rule'}
        </button>
      </div>
    </div>
  );
}

function MultiCheckbox({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  selected: ReadonlyArray<string>;
  onChange: (ids: string[]) => void;
}) {
  const sel = new Set(selected);
  function toggle(id: string) {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }
  return (
    <div className="member-profile-field">
      <span className="member-profile-field-label">{label}</span>
      <div className="schedules-multi-checkbox">
        {options.map((o) => (
          <label key={o.id} className="schedules-multi-checkbox-row">
            <input
              type="checkbox"
              checked={sel.has(o.id)}
              onChange={() => toggle(o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Conflicts panel ────────────────────────────────────────────────

function ConflictsPanel({
  conflicts,
  members,
  onSelectDate,
}: {
  conflicts: ReadonlyArray<RuleConflict>;
  members: ReadonlyArray<Member>;
  onSelectDate: (iso: string) => void;
}) {
  if (conflicts.length === 0) {
    return (
      <div className="schedules-rail-empty">
        No conflicts this month — every coverage rule is satisfied.
      </div>
    );
  }
  return (
    <ul className="schedules-rail-list">
      {conflicts.map((c) => (
        <li key={`${c.date}|${c.ruleId}`} className="schedules-conflict">
          <button
            type="button"
            className="schedules-conflict-date"
            onClick={() => onSelectDate(c.date)}
          >
            {formatWeekdayShort(c.date)}
          </button>
          <div className="schedules-conflict-rule">{c.ruleName}</div>
          <div className="schedules-conflict-detail">
            {c.actual}/{c.expected}
            {c.membersOff.length > 0 && (
              <> · out: {c.membersOff
                .map((id) => members.find((m) => m.id === id)?.name ?? 'Unknown')
                .join(', ')}</>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Day popover ────────────────────────────────────────────────────

function DayPopover({
  date,
  requests,
  members,
  jobTitles,
  conflicts,
  holidays,
  observations,
  onClose,
}: {
  date: string;
  requests: ReadonlyArray<TimeOffRequest>;
  members: ReadonlyArray<Member>;
  jobTitles: ReadonlyArray<JobTitle>;
  conflicts: ReadonlyArray<RuleConflict>;
  holidays: ReadonlyArray<Holiday>;
  observations: ReadonlyArray<HolidayObservation>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Members on this date.
  const off: Member[] = [];
  const memberById = new Map(members.map((m) => [m.id, m]));
  for (const r of requests) {
    if (date >= r.start && date <= r.end) {
      const m = memberById.get(r.memberId);
      if (m && !off.some((x) => x.id === m.id)) off.push(m);
    }
  }

  return (
    <div
      className="schedules-popover-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="schedules-popover">
        <header className="schedules-popover-head">
          <h3>{formatWeekdayShort(date)}</h3>
          <button
            type="button"
            className="schedules-popover-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="schedules-popover-body">
          {holidays.map((h) => {
            // Members in scope for this holiday's country — these
            // are the ones the OM might want to override (e.g.
            // "Sarah worked through PH Labor Day").
            const inScope = members.filter((m) => holidayAppliesToCountry(h, m.country));
            return (
              <div key={h.id} className="schedules-popover-section">
                <div className="schedules-popover-eyebrow">
                  Holiday · {countryShortLabel(h.country)}
                </div>
                <div className="schedules-popover-row">
                  <span
                    className="schedules-popover-country-pill"
                    style={{ background: countryTint(h.country) }}
                  >
                    {countryShortLabel(h.country)}
                  </span>
                  <div>
                    <div className="schedules-popover-name">{h.name}</div>
                    <div className="schedules-popover-sub">
                      {h.type === 'special' ? 'Special non-working' : 'Public holiday'}
                      {h.states && h.states.length > 0 && <> · {h.states.join(', ')}</>}
                      {' · Default: '}
                      {h.defaultObservation === 'observed' ? 'observed' : 'worked'}
                    </div>
                  </div>
                </div>
                {/* Per-member observation list — lets the OM flip
                    a member's status to "Worked" so a transfer
                    credit accrues, or back to "Observed" to revert.
                    Only shown when there's anyone in the holiday's
                    country to override. */}
                {inScope.length > 0 && (
                  <ul className="schedules-popover-list schedules-popover-list--members">
                    {inScope.map((m) => {
                      const status = memberObservationFor(m, h, observations);
                      return (
                        <li key={`${h.id}-${m.id}`} className="schedules-popover-member-row">
                          <span
                            className="schedules-popover-member-avatar"
                            style={
                              m.bg
                                ? { background: m.bg, color: m.color }
                                : { background: m.color, color: '#fff' }
                            }
                          >
                            {m.initials}
                          </span>
                          <span className="schedules-popover-member-name">{m.name}</span>
                          <select
                            className="schedules-popover-member-status"
                            value={status}
                            onChange={(e) =>
                              flizowStore.setHolidayObservation({
                                holidayId: h.id,
                                memberId: m.id,
                                status: e.target.value as 'observed' | 'worked',
                              })
                            }
                            aria-label={`${m.name}'s status for ${h.name}`}
                          >
                            <option value="observed">Observed</option>
                            <option value="worked">Worked (+1 credit)</option>
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          <div className="schedules-popover-section">
            <div className="schedules-popover-eyebrow">Off this day · {off.length}</div>
            {off.length === 0 ? (
              <div className="schedules-popover-empty">Nobody is on approved time off.</div>
            ) : (
              <ul className="schedules-popover-list">
                {off.map((m) => {
                  const jt = m.jobTitleId
                    ? jobTitles.find((t) => t.id === m.jobTitleId)
                    : undefined;
                  return (
                    <li key={m.id} className="schedules-popover-row">
                      <span
                        className="schedules-popover-avatar"
                        style={
                          m.bg
                            ? { background: m.bg, color: m.color }
                            : { background: m.color, color: '#fff' }
                        }
                      >
                        {m.initials}
                      </span>
                      <div>
                        <div className="schedules-popover-name">{m.name}</div>
                        {jt && <div className="schedules-popover-sub">{jt.label}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {conflicts.length > 0 && (
            <div className="schedules-popover-section">
              <div className="schedules-popover-eyebrow">Rules broken · {conflicts.length}</div>
              <ul className="schedules-popover-list">
                {conflicts.map((c) => (
                  <li key={c.ruleId} className="schedules-popover-conflict">
                    <strong>{c.ruleName}</strong>
                    <div className="schedules-popover-sub">
                      {c.actual}/{c.expected} present
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
