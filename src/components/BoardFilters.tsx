import { useEffect, useRef, useState } from 'react';
// CheckIcon is renamed on import because BoardFilters defines its own
// `CheckIcon` wrapper component (preserved at the bottom of this file
// for callsite stability). The wrapper now delegates to the Heroicons
// component.
import { CheckIcon as HeroCheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { Member, Priority } from '../types/flizow';
import { BOARD_LABELS, labelById } from '../constants/labels';
import { avatarStyle } from '../utils/avatar';

/**
 * Shared filter bar for the service board (BoardPage) and the internal
 * Ops board (OpsPage). The two pages have different task shapes but the
 * filter dimensions are the same, so this component emits a typed
 * `BoardFilterState` and the parent applies it to whichever task list
 * it owns via the `applyFilters` helper below.
 *
 * Design notes:
 *  - Matches the `.filter-chip` CSS already in flizow.css (active state
 *    highlights blue per the "blue highlight hierarchy" rule).
 *  - Each chip owns a `.filter-group-menu` popover — multi-select for
 *    assignees/labels/priorities, single-select for due-date buckets
 *    and sort.
 *  - Empty arrays = no filter. The parent can treat `state.assignees`
 *    as "show all" when length is 0.
 *  - Due date buckets are computed against an ISO `todayISO` string so
 *    the UI stays stable across re-renders.
 */

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export type SortMode = 'manual' | 'priority' | 'due' | 'created';

/** Board swimlane grouping. `none` = flat columns; the other modes
 *  stack horizontal swimlanes per distinct value of that field. Kept
 *  in this module so both the chip here and the lane-builder on the
 *  page import it from one place. */
export type GroupBy = 'none' | 'priority' | 'assignee' | 'label';

export interface BoardFilterState {
  assigneeIds: string[];
  labelIds: string[];
  priorities: Priority[];
  dueBuckets: DueBucket[];
  sort: SortMode;
}

export const EMPTY_FILTERS: BoardFilterState = {
  assigneeIds: [],
  labelIds: [],
  priorities: [],
  dueBuckets: [],
  sort: 'manual',
};

const DUE_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'This week',
  later: 'Later',
  none: 'No date',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Priority rank for sort. Higher number = higher priority. */
const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Manual',
  priority: 'Priority',
  due: 'Due date',
  created: 'Newest',
};

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: 'None',
  priority: 'Priority',
  assignee: 'Assignee',
  label: 'Label',
};

/** Shape the filter bar expects for each task it's asked to filter.
 *  Intentionally narrower than the full Task/OpsTask types so both
 *  pages can feed in whatever they have. */
export interface FilterableTask {
  id: string;
  title: string;
  /** Priority is optional — some boards (e.g. Ops) have seeds that
   *  leave priority unset. A task with no priority is filtered out when
   *  a priority filter is active, which matches the user's intent. */
  priority?: Priority;
  labels: string[];
  dueDate?: string;
  createdAt?: string;
  assigneeId?: string | null;
  assigneeIds?: string[];
  /** For `sort: 'manual'` we try to preserve the original order. The
   *  parent supplies the index if it cares; we default to 0 otherwise. */
  _order?: number;
}

/** Which side of today an ISO date falls on. Handles the "no date"
 *  bucket too so the caller doesn't have to special-case it. */
function bucketForDue(dueISO: string | undefined, todayISO: string): DueBucket {
  if (!dueISO) return 'none';
  if (dueISO < todayISO) return 'overdue';
  if (dueISO === todayISO) return 'today';
  // Compare via Date math so daylight-saving drift doesn't flip the
  // bucket. "This week" = within the next 6 calendar days.
  const today = new Date(todayISO);
  const due = new Date(dueISO);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays <= 6) return 'week';
  return 'later';
}

/** Apply filter + sort to a task list. Returns a new array; never
 *  mutates the input. The sort is stable within each rank so the
 *  manual order of equal-priority cards stays put. */
export function applyFilters<T extends FilterableTask>(
  tasks: T[],
  state: BoardFilterState,
  todayISO: string,
  searchQuery = '',
): T[] {
  const q = searchQuery.trim().toLowerCase();
  const assigneeSet = new Set(state.assigneeIds);
  const labelSet = new Set(state.labelIds);
  const prioritySet = new Set(state.priorities);
  const dueSet = new Set(state.dueBuckets);

  const filtered = tasks.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q)) return false;

    if (assigneeSet.size > 0) {
      const ids = (t.assigneeIds && t.assigneeIds.length)
        ? t.assigneeIds
        : (t.assigneeId ? [t.assigneeId] : []);
      if (!ids.some((id) => assigneeSet.has(id))) return false;
    }

    if (labelSet.size > 0) {
      if (!t.labels.some((id) => labelSet.has(id))) return false;
    }

    if (prioritySet.size > 0) {
      // Tasks with no priority drop out of the list once any priority
      // filter is active — otherwise the filter chip would silently let
      // un-prioritized cards through, which reads as a bug.
      if (!t.priority || !prioritySet.has(t.priority)) return false;
    }

    if (dueSet.size > 0) {
      const b = bucketForDue(t.dueDate, todayISO);
      if (!dueSet.has(b)) return false;
    }

    return true;
  });

  // Sort. We lean on Array.sort being stable (TC39 mandate since ES2019)
  // so `manual` is literally "don't reorder anything."
  if (state.sort === 'manual') return filtered;

  const sorted = [...filtered];
  if (state.sort === 'priority') {
    // Undefined priorities rank 0 so they sink to the bottom instead of
    // tripping NaN in the comparator.
    const rank = (p: Priority | undefined) => (p ? PRIORITY_RANK[p] : 0);
    sorted.sort((a, b) => rank(b.priority) - rank(a.priority));
  } else if (state.sort === 'due') {
    // Missing dates sort to the end.
    sorted.sort((a, b) => {
      const ad = a.dueDate || '9999-12-31';
      const bd = b.dueDate || '9999-12-31';
      return ad.localeCompare(bd);
    });
  } else if (state.sort === 'created') {
    sorted.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  return sorted;
}

/** How many active filters are set — used to drive the "Reset"
 *  button's disabled state. */
export function filterCount(state: BoardFilterState): number {
  return (
    state.assigneeIds.length +
    state.labelIds.length +
    state.priorities.length +
    state.dueBuckets.length +
    (state.sort === 'manual' ? 0 : 1)
  );
}

interface Props {
  state: BoardFilterState;
  onChange: (next: BoardFilterState) => void;
  /** Members available to pick from. Pass the full member list or a
   *  scoped subset (e.g. only operators on the Ops board). */
  members: Member[];
  /** Which chips to render. Defaults to everything. */
  show?: {
    assignees?: boolean;
    labels?: boolean;
    priorities?: boolean;
    dueDate?: boolean;
    sort?: boolean;
    groupBy?: boolean;
  };
  /** Optional Swimlane grouping control. The chip only renders when
   *  both `groupBy` and `onGroupByChange` are provided — the Ops board
   *  (which keeps a flat layout for now) just omits them. Kept next to
   *  Sort because they're the two "how is this board arranged" knobs,
   *  even though groupBy is persistent board config while sort is
   *  local session state. */
  groupBy?: GroupBy;
  onGroupByChange?: (next: GroupBy) => void;
}

export function BoardFilters({ state, onChange, members, show, groupBy, onGroupByChange }: Props) {
  const want = {
    assignees: show?.assignees ?? true,
    labels: show?.labels ?? true,
    priorities: show?.priorities ?? true,
    dueDate: show?.dueDate ?? true,
    sort: show?.sort ?? true,
    // Group-By only shows when the parent wires both value + setter.
    // The explicit `show?.groupBy === false` opt-out lets a board hide
    // the chip without clearing the wiring.
    groupBy: (show?.groupBy ?? true) && groupBy !== undefined && !!onGroupByChange,
  };

  const count = filterCount(state);

  const toggleInList = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <>
      {want.assignees && (
        <ChipMenu
          label="Assignee"
          icon={<PeopleIcon />}
          active={state.assigneeIds.length > 0}
          summary={
            state.assigneeIds.length > 0
              ? state.assigneeIds.length === 1
                ? members.find((m) => m.id === state.assigneeIds[0])?.name ?? '1 selected'
                : `${state.assigneeIds.length} selected`
              : null
          }
        >
          {members.length === 0 ? (
            <div className="filter-group-heading">No team members</div>
          ) : (
            members.map((m) => {
              const active = state.assigneeIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="filter-group-item"
                  data-active={active ? 'true' : 'false'}
                  onClick={() =>
                    onChange({ ...state, assigneeIds: toggleInList(state.assigneeIds, m.id) })
                  }
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        ...avatarStyle(m),
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {m.initials}
                    </span>
                    {m.name}
                  </span>
                  <CheckIcon />
                </button>
              );
            })
          )}
        </ChipMenu>
      )}

      {want.labels && (
        <ChipMenu
          label="Labels"
          icon={<LabelIcon />}
          active={state.labelIds.length > 0}
          summary={
            state.labelIds.length > 0
              ? state.labelIds.length === 1
                ? labelById(state.labelIds[0])?.name ?? '1 selected'
                : `${state.labelIds.length} selected`
              : null
          }
        >
          {BOARD_LABELS.map((l) => {
            const active = state.labelIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className="filter-group-item"
                data-active={active ? 'true' : 'false'}
                onClick={() =>
                  onChange({ ...state, labelIds: toggleInList(state.labelIds, l.id) })
                }
              >
                <span className={`label-pill ${l.cls}`}>{l.name}</span>
                <CheckIcon />
              </button>
            );
          })}
        </ChipMenu>
      )}

      {want.priorities && (
        <ChipMenu
          label="Priority"
          icon={<FlagIcon />}
          active={state.priorities.length > 0}
          summary={
            state.priorities.length > 0
              ? state.priorities.length === 1
                ? PRIORITY_LABELS[state.priorities[0]]
                : `${state.priorities.length} selected`
              : null
          }
        >
          {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => {
            const active = state.priorities.includes(p);
            return (
              <button
                key={p}
                type="button"
                className="filter-group-item"
                data-active={active ? 'true' : 'false'}
                onClick={() =>
                  onChange({ ...state, priorities: toggleInList(state.priorities, p) })
                }
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className={`status-dot dot-${p}`} />
                  {PRIORITY_LABELS[p]}
                </span>
                <CheckIcon />
              </button>
            );
          })}
        </ChipMenu>
      )}

      {want.dueDate && (
        <ChipMenu
          label="Due date"
          icon={<CalIcon />}
          active={state.dueBuckets.length > 0}
          summary={
            state.dueBuckets.length > 0
              ? state.dueBuckets.length === 1
                ? DUE_LABELS[state.dueBuckets[0]]
                : `${state.dueBuckets.length} selected`
              : null
          }
        >
          {(['overdue', 'today', 'week', 'later', 'none'] as DueBucket[]).map((b) => {
            const active = state.dueBuckets.includes(b);
            return (
              <button
                key={b}
                type="button"
                className="filter-group-item"
                data-active={active ? 'true' : 'false'}
                onClick={() =>
                  onChange({ ...state, dueBuckets: toggleInList(state.dueBuckets, b) })
                }
              >
                {DUE_LABELS[b]}
                <CheckIcon />
              </button>
            );
          })}
        </ChipMenu>
      )}

      {/* Tail cluster — "arrangement" controls (group + sort). Shares a
          single spacer that's rendered once when either chip is shown,
          so the visual gap between filters and arrangement controls
          doesn't double-up. */}
      {(want.sort || want.groupBy) && <div className="filter-spacer" />}

      {want.groupBy && (
        <ChipMenu
          label="Group:"
          icon={<LanesIcon />}
          active={groupBy !== 'none'}
          summary={<strong style={{ fontWeight: 600, color: 'var(--text)' }}>{GROUP_BY_LABELS[groupBy!]}</strong>}
        >
          {(['none', 'priority', 'assignee', 'label'] as GroupBy[]).map((g) => (
            <button
              key={g}
              type="button"
              className="filter-group-item"
              data-active={groupBy === g ? 'true' : 'false'}
              onClick={() => onGroupByChange?.(g)}
            >
              {GROUP_BY_LABELS[g]}
              <CheckIcon />
            </button>
          ))}
        </ChipMenu>
      )}

      {want.sort && (
        <ChipMenu
          label="Sort:"
          icon={<SortIcon />}
          active={state.sort !== 'manual'}
          summary={<strong style={{ fontWeight: 600, color: 'var(--text)' }}>{SORT_LABELS[state.sort]}</strong>}
        >
          {(['manual', 'priority', 'due', 'created'] as SortMode[]).map((s) => (
            <button
              key={s}
              type="button"
              className="filter-group-item"
              data-active={state.sort === s ? 'true' : 'false'}
              onClick={() => onChange({ ...state, sort: s })}
            >
              {SORT_LABELS[s]}
              <CheckIcon />
            </button>
          ))}
        </ChipMenu>
      )}

      {count > 0 && (
        <button
          type="button"
          className="filter-reset"
          onClick={() => onChange(EMPTY_FILTERS)}
          aria-label="Reset all filters"
        >
          Reset · {count}
        </button>
      )}
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function ChipMenu({
  label,
  icon,
  active,
  summary,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  summary: React.ReactNode | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Defer one frame so the opening click doesn't immediately close us.
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="filter-group-wrap">
      <button
        type="button"
        className={`filter-chip${active ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon} {label} {summary} <ChevronDown />
      </button>
      {open && (
        <div className="filter-group-menu open" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

/* Icons — lifted from BoardPage so this component is self-contained. */

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function LabelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function LanesIcon() {
  // Three horizontal rows — reads as "stacked swimlanes" without leaning
  // on the sort icon's visual vocabulary.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
    </svg>
  );
}
function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M6 12h12" />
      <path d="M10 18h4" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <ChevronDownIcon className="chev" aria-hidden="true" />
  );
}
function CheckIcon() {
  return <HeroCheckIcon className="check" aria-hidden="true" />;
}
