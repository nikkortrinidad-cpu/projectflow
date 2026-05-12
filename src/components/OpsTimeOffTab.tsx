/**
 * OpsTimeOffTab — the Time off Schedules surface inside the Ops page.
 *
 * Layout:
 *   ┌──────────────────────────────────┬──────────────────────┐
 *   │  Month calendar (Mon–Sun grid)   │  Right rail          │
 *   │  - avatar stack per day          │  - sub-tabs:         │
 *   │  - red border on conflict days   │    Approvals (default│
 *   │  - "today" highlighted in blue   │     for Owner/Admin) │
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
  useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
import {
  evaluateRules,
  groupConflictsByDate,
  makeCoverageRule,
} from '../utils/coverageRules';
import { ACCESS_ROLE_LABEL } from '../utils/access';
import { visibleHolidays, countryShortLabel, countryTint, holidayAppliesToCountry } from '../utils/holidays';
import { creditBalanceFor, memberObservationFor } from '../utils/holidayCredits';
import { computeLeaveBreakdown } from '../utils/timeOff';
import type {
  CoverageRule,
  CoverageRuleConstraint,
  CoverageRuleWho,
  LeaveGuidelinesDoc,
  LeaveType,
  Member,
  RuleConflict,
  TimeOffRequest,
  AccessRole,
  Holiday,
  HolidayObservation,
  JobTitle,
} from '../types/flizow';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

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

type RailTab = 'approvals' | 'rules' | 'conflicts' | 'guidelines';

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

  // Phase 9 — country filter. Empty set = show every country in
  // the workspace's mix (the common case). Press a chip to narrow
  // the calendar's holiday ribbon to a single country (or several).
  // Chips only render when the workspace has 2+ countries — a
  // single-country agency doesn't need a filter that does nothing.
  const [countryFilter, setCountryFilter] = useState<Set<string>>(new Set());

  // Read workspace.countries off the meta observable so the chip
  // list updates when the owner adds or removes a country in
  // Settings → Holidays.
  const meta = useSyncExternalStore(flizowStore.subscribeWorkspace, flizowStore.getWorkspaceMeta);
  const workspaceCountries = useMemo(
    () => (meta?.countries ?? []).slice().sort(),
    [meta?.countries],
  );

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
  // Phase 9 — when the OM has narrowed via the country chip strip,
  // only entries whose country is in the chip set survive (plus
  // 'global' entries, which apply to every country).
  const holidaysByDate = useMemo(() => {
    const visible = visibleHolidays(data.holidays, data.members);
    const filtered = countryFilter.size === 0
      ? visible
      : visible.filter((h) => h.country === 'global' || countryFilter.has(h.country));
    const map = new Map<string, Holiday[]>();
    for (const h of filtered) {
      const bucket = map.get(h.date) ?? [];
      bucket.push(h);
      map.set(h.date, bucket);
    }
    return map;
  }, [data.holidays, data.members, countryFilter]);

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
  function toggleCountry(code: string) {
    setCountryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
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
          countries={workspaceCountries}
          countryFilter={countryFilter}
          onToggleCountry={toggleCountry}
          onClearCountryFilter={() => setCountryFilter(new Set())}
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
              holidays={data.holidays}
              observations={data.holidayObservations}
              allRequests={data.timeOffRequests}
              creditPolicy={data.creditExpiryPolicy}
              todayISO={data.today}
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
          {railTab === 'guidelines' && (
            <GuidelinesPanel doc={data.leaveGuidelines} />
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
  countries,
  countryFilter,
  onToggleCountry,
  onClearCountryFilter,
}: {
  cursor: Date;
  onStepMonth: (delta: number) => void;
  onJumpToday: () => void;
  jobTitles: ReadonlyArray<JobTitle>;
  jobTitleFilter: ReadonlySet<string>;
  onToggleJobTitle: (id: string) => void;
  onClearFilter: () => void;
  countries: ReadonlyArray<string>;
  countryFilter: ReadonlySet<string>;
  onToggleCountry: (code: string) => void;
  onClearCountryFilter: () => void;
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
          <ChevronLeftIcon aria-hidden="true" />
        </button>
        <span className="schedules-month-label">{monthLabel}</span>
        <button
          type="button"
          className="schedules-month-step"
          onClick={() => onStepMonth(1)}
          aria-label="Next month"
        >
          <ChevronRightIcon aria-hidden="true" />
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
      {/* Phase 9 — country chip strip. Only renders when the workspace
          has 2+ countries; a single-country agency doesn't need a
          filter that does nothing. The dot uses the deterministic
          per-country tint (utils/holidays.countryTint) so chip color
          matches the calendar ribbon. */}
      {countries.length >= 2 && (
        <div className="schedules-filter-chips" role="group" aria-label="Filter holidays by country">
          {countries.map((code) => (
            <button
              key={code}
              type="button"
              className={`schedules-chip${countryFilter.has(code) ? ' schedules-chip--on' : ''}`}
              onClick={() => onToggleCountry(code)}
              aria-pressed={countryFilter.has(code)}
              title={`Show only ${code} holidays`}
            >
              <span className="schedules-chip-dot" style={{ background: countryTint(code) }} aria-hidden="true" />
              {countryShortLabel(code)}
            </button>
          ))}
          {countryFilter.size > 0 && (
            <button
              type="button"
              className="schedules-chip schedules-chip--clear"
              onClick={onClearCountryFilter}
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
          // L5 — only open the popover when there's something
          // to show. A click on a fully-empty day (no off, no
          // conflict, no holiday) used to open a popover that
          // just said "Nobody is on approved time off." — wasted
          // click. The cell stays focusable for keyboard nav;
          // we just no-op the onClick.
          const hasContent = off.length > 0 || conflicts.length > 0 || holidays.length > 0;
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
              hasContent={hasContent}
              onClick={() => {
                if (hasContent) onSelectDate(cell.iso);
              }}
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
  hasContent,
  onClick,
}: {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  off: ReadonlyArray<Member>;
  holidays: ReadonlyArray<Holiday>;
  hasConflict: boolean;
  conflictCount: number;
  /** L5 — true when off / holiday / conflict is present, false on
   *  fully-empty days. Drives the cursor + click behaviour: empty
   *  cells render with default cursor and skip the popover open. */
  hasContent: boolean;
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
    hasContent ? '' : 'schedules-day--empty',
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
          {/* L1: width-based ellipsis from CSS replaces the old
              16-char JS slice — CSS knows the actual rendered
              width and breaks at the right boundary regardless of
              font / device-pixel-ratio. */}
          <span className="schedules-day-holiday-name">
            {countryShortLabel(primaryHoliday.country)}
            {' '}
            {primaryHoliday.name}
          </span>
          {/* L2: tiny suffix when more holidays land on this date.
              The popover lists them all; this signals "there's
              more" without taking another row. */}
          {holidays.length > 1 && (
            <span className="schedules-day-holiday-more">+{holidays.length - 1}</span>
          )}
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

// ── Guidelines panel (Phase 8) ─────────────────────────────────────
//
// TipTap rich-text editor for the workspace-wide leave guidelines.
// Owner/Admin reach this through the right-rail sub-tab; everyone
// else reads it from the Request Time Off modal via the
// LeaveGuidelinesViewer side-sheet.

function GuidelinesPanel({ doc }: { doc: LeaveGuidelinesDoc | undefined }) {
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the last-known-saved content so we don't push echo updates
  // back through TipTap (which would reset the cursor).
  const lastSavedRef = useRef<string>(doc?.content ?? '');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { rel: 'noreferrer noopener', target: '_blank' },
      }),
      Placeholder.configure({
        placeholder: 'Write your workspace’s leave guidelines here. Team members will see this in the Request Time Off modal.',
      }),
    ],
    content: doc?.content ?? '',
    editorProps: {
      attributes: {
        class: 'guidelines-editor',
        'aria-label': 'Leave guidelines',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: ed }) => {
      setSavedLabel('Saving…');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        try {
          const html = ed.getHTML();
          if (html === lastSavedRef.current) return;
          flizowStore.updateLeaveGuidelines(html);
          lastSavedRef.current = html;
          setSavedLabel('All changes saved');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[GuidelinesPanel] failed to serialise:', err);
          setSavedLabel("Couldn’t save — your last changes may not have persisted");
        }
      }, 400);
    },
  });

  // If the underlying doc changes from a different tab/device, sync
  // the editor without resetting the cursor when the change is just
  // our own echo.
  useEffect(() => {
    if (!editor) return;
    const incoming = doc?.content ?? '';
    if (incoming === lastSavedRef.current) return;
    if (incoming === editor.getHTML()) return;
    lastSavedRef.current = incoming;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, doc?.content]);

  // Flush any pending save on unmount so a tab-switch doesn't drop
  // the last few characters.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (editor) {
          try {
            const html = editor.getHTML();
            if (html !== lastSavedRef.current) {
              flizowStore.updateLeaveGuidelines(html);
            }
          } catch {
            // No surface to report on; the next mount picks up the
            // unflushed change from local storage anyway.
          }
        }
      }
    };
  }, [editor]);

  return (
    <div className="rail-section guidelines-panel">
      <div className="rail-section-head">
        <h3 className="rail-section-title">Leave guidelines</h3>
        <span className="rail-section-sub">
          Workspace-wide. Team members read this from the Request Time Off modal.
        </span>
      </div>
      <div className="guidelines-editor-wrap">
        <EditorContent editor={editor} />
      </div>
      <div className="guidelines-foot">
        {savedLabel && (
          <span className="guidelines-saved" aria-live="polite">{savedLabel}</span>
        )}
        {doc?.updatedAt && !savedLabel && (
          <span className="guidelines-saved">
            Last updated {formatGuidelinesDate(doc.updatedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function formatGuidelinesDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

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
    { id: 'approvals',  label: 'Approvals',  count: pendingCount },
    { id: 'rules',      label: 'Rules',      count: ruleCount },
    { id: 'conflicts',  label: 'Conflicts',  count: conflictCount },
    // Guidelines — count is always 0 (it's a single doc, not a
    // counted list) so the chip stays clean. Owner/Admin write
    // here; the read surface lives in the Request modal.
    { id: 'guidelines', label: 'Guidelines', count: 0 },
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

/** Compact display map for leave-type chips on the approval card.
 *  Keeps the colour tokens + tooltip copy in one place. */
const LEAVE_TYPE_DISPLAY: Record<LeaveType, { label: string; help: string }> = {
  sick:      { label: 'Sick',      help: 'Health-related leave. Eats the 15-day sick bucket.' },
  emergency: { label: 'Emergency', help: 'Unexpected event (power, internet, family). Eats the 15-day shared bucket.' },
  casual:    { label: 'Casual',    help: 'Earned-credit leave. Spends holiday transfer credits first, then the shared bucket.' },
};

/** Inline paid/unpaid preview on the approval card. Runs the same
 *  math the request modal showed the requester, so the approver
 *  sees the EXPECTED outcome before clicking Approve. Note: the
 *  actual locked breakdown gets re-computed at approval time, so
 *  this preview can drift slightly if other requests get approved
 *  between view and click. */
function ApprovalBreakdown({
  request,
  member,
  holidays,
  observations,
  allRequests,
  creditPolicy,
  todayISO,
}: {
  request: TimeOffRequest;
  member: Member;
  holidays: ReadonlyArray<Holiday>;
  observations: ReadonlyArray<HolidayObservation>;
  allRequests: ReadonlyArray<TimeOffRequest>;
  creditPolicy: import('../types/flizow').CreditExpiryPolicy;
  todayISO: string;
}) {
  if (!request.leaveType) return null;
  const others = allRequests.filter((r) => r.id !== request.id);
  const creditBalance = creditBalanceFor(
    member,
    holidays,
    observations,
    others,
    creditPolicy,
    todayISO,
  );
  const breakdown = computeLeaveBreakdown({
    leaveType: request.leaveType,
    start: request.start,
    end: request.end,
    member,
    holidays,
    requests: others,
    creditBalance,
    todayISO,
  });
  if (breakdown.workingDays === 0) return null;
  const sharedPart = breakdown.paidDays - breakdown.creditDays;
  return (
    <div className="schedules-request-breakdown">
      <span className="schedules-request-breakdown-total">
        {breakdown.workingDays} working {breakdown.workingDays === 1 ? 'day' : 'days'}
      </span>
      <span className="schedules-request-breakdown-sep" aria-hidden="true">·</span>
      {breakdown.creditDays > 0 && (
        <span className="schedules-request-breakdown-pill schedules-request-breakdown-pill--credit">
          {breakdown.creditDays} credit
        </span>
      )}
      {sharedPart > 0 && (
        <span className="schedules-request-breakdown-pill schedules-request-breakdown-pill--paid">
          {sharedPart} paid
        </span>
      )}
      {breakdown.unpaidDays > 0 && (
        <span className="schedules-request-breakdown-pill schedules-request-breakdown-pill--unpaid">
          {breakdown.unpaidDays} unpaid
        </span>
      )}
    </div>
  );
}

function ApprovalQueue({
  requests,
  members,
  rules,
  approvedRequests,
  focusId,
  holidays,
  observations,
  allRequests,
  creditPolicy,
  todayISO,
}: {
  requests: ReadonlyArray<TimeOffRequest>;
  members: ReadonlyArray<Member>;
  rules: ReadonlyArray<CoverageRule>;
  approvedRequests: ReadonlyArray<TimeOffRequest>;
  focusId?: string;
  /** Phase 8 — used by the inline breakdown preview that shows the
   *  approver "approving this will draw 3 paid + 2 unpaid" before
   *  they click. */
  holidays: ReadonlyArray<Holiday>;
  observations: ReadonlyArray<HolidayObservation>;
  allRequests: ReadonlyArray<TimeOffRequest>;
  creditPolicy: import('../types/flizow').CreditExpiryPolicy;
  todayISO: string;
}) {
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  // Progressive disclosure on the decision-note textarea: it hides
  // until the OM clicks "Add note" on a row. Most approvals don't
  // need a note (the dates speak for themselves); rendering an
  // empty textarea on every row was dead visual weight per the
  // post-Phase-7C design audit. Tracked by request id so each row
  // toggles independently.
  const [noteOpen, setNoteOpen] = useState<Set<string>>(new Set());
  function toggleNote(id: string) {
    setNoteOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
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
    // first paint. L6 — honor prefers-reduced-motion: skip the
    // smooth animation, jump directly when the user has it on.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-focus-id="${focusId}"]`,
      );
      if (!el) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
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
              {r.leaveType && (
                <span
                  className={`schedules-request-type schedules-request-type--${r.leaveType}`}
                  title={LEAVE_TYPE_DISPLAY[r.leaveType].help}
                >
                  {LEAVE_TYPE_DISPLAY[r.leaveType].label}
                </span>
              )}
            </div>
            {r.reason && (
              <div className="schedules-request-reason">"{r.reason}"</div>
            )}
            {m && r.leaveType && (
              <ApprovalBreakdown
                request={r}
                member={m}
                holidays={holidays}
                observations={observations}
                allRequests={allRequests}
                creditPolicy={creditPolicy}
                todayISO={todayISO}
              />
            )}
            {r.attachments && r.attachments.length > 0 && (
              <div className="schedules-request-attachments">
                <div className="schedules-request-attachments-label">
                  Supporting documents
                </div>
                <ul className="schedules-request-attachments-list">
                  {r.attachments.map((a) => (
                    <li key={a.id}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer">
                        {a.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
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
            {noteOpen.has(r.id) ? (
              <textarea
                className="schedules-request-note"
                value={decisionNotes[r.id] ?? ''}
                onChange={(e) =>
                  setDecisionNotes((p) => ({ ...p, [r.id]: e.target.value }))
                }
                placeholder="Optional note (visible to the requester)"
                rows={2}
                maxLength={280}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="schedules-request-note-toggle"
                onClick={() => toggleNote(r.id)}
              >
                + Add note
              </button>
            )}
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
                className="acct-btn-solid"
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
            <XMarkIcon aria-hidden="true" />
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
                    country to override. Caps height + adds a filter
                    input when the in-scope list exceeds 8 members
                    so a popover with a 50-PH-member workspace stays
                    usable. */}
                {inScope.length > 0 && (
                  <HolidayObservationList
                    holiday={h}
                    members={inScope}
                    observations={observations}
                  />
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

// ── HolidayObservationList ─────────────────────────────────────────
//
// Per-holiday per-member status list rendered inside DayPopover.
// Caps height + adds a filter input when the in-scope list exceeds
// the visible threshold so a workspace with 50+ PH-tagged members
// doesn't blow out the popover. M5 confirm prompt also lives here
// so flipping Worked → Observed (which drops a transfer credit)
// surfaces what's about to happen.

const POPOVER_MEMBER_FILTER_THRESHOLD = 8;

function HolidayObservationList({
  holiday,
  members,
  observations,
}: {
  holiday: Holiday;
  members: ReadonlyArray<Member>;
  observations: ReadonlyArray<HolidayObservation>;
}) {
  const [filter, setFilter] = useState('');
  const showFilter = members.length > POPOVER_MEMBER_FILTER_THRESHOLD;

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, filter]);

  function handleStatusChange(memberId: string, current: 'observed' | 'worked', next: 'observed' | 'worked') {
    if (current === next) return;
    // M5 — confirm before flipping a member from Worked back to
    // Observed: this drops the +1 holiday transfer credit they
    // earned, and a misclick costs them a paid day later. The
    // observed → worked direction is non-destructive, so no prompt.
    if (current === 'worked' && next === 'observed') {
      const member = members.find((m) => m.id === memberId);
      const ok = window.confirm(
        `${member?.name ?? 'This member'} will lose the holiday transfer credit they earned for ${holiday.name}. Continue?`,
      );
      if (!ok) return;
    }
    flizowStore.setHolidayObservation({
      holidayId: holiday.id,
      memberId,
      status: next,
    });
  }

  return (
    <>
      {showFilter && (
        <input
          type="search"
          className="schedules-popover-member-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${members.length} members…`}
          aria-label={`Filter members for ${holiday.name}`}
        />
      )}
      <ul className="schedules-popover-list schedules-popover-list--members">
        {filtered.length === 0 ? (
          <li className="schedules-popover-member-empty">No members match.</li>
        ) : (
          filtered.map((m) => {
            const status = memberObservationFor(m, holiday, observations);
            return (
              <li key={`${holiday.id}-${m.id}`} className="schedules-popover-member-row">
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
                    handleStatusChange(m.id, status, e.target.value as 'observed' | 'worked')
                  }
                  aria-label={`${m.name}'s status for ${holiday.name}`}
                >
                  <option value="observed">Observed</option>
                  <option value="worked">Worked (+1 credit)</option>
                </select>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}
