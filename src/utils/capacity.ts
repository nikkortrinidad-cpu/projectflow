import type { Member, MemberDayOverride, OpsTask, Task } from '../types/flizow';

/**
 * Anything that consumes capacity. Tasks (per-service) and OpsTasks
 * (workspace-level) both count toward an assignee's daily load —
 * a designer's internal ops work and their client work share the
 * same finite attention. The fields loadFor reads (assigneeId,
 * dueDate, archived, columnId, slots) all exist on both types, so
 * the helper is genuinely union-safe.
 */
export type CapacityTask = Task | OpsTask;

/**
 * Capacity / load math — the single source of truth for "how booked is
 * this member on this day."
 *
 * The whole feature is designed around one rule: if a UI surface needs
 * to render a load number or zone color, it reads from these helpers.
 * Don't reimplement the math at the call site — the cap-override
 * fallback chain and the slot-default behaviour are subtle, and getting
 * them slightly wrong here would cause every consumer to drift.
 *
 * Three pure functions, no React, no store dependency. Trivially
 * testable; trivially memoisable upstream.
 */

/** Default soft cap for a member who hasn't had one set explicitly.
 *  Matches the user-confirmed knowledge-worker baseline. */
export const DEFAULT_CAP_SOFT = 6;

/** Default max cap for a member who hasn't had one set explicitly.
 *  Soft warning fires when a booking would push load past this. */
export const DEFAULT_CAP_MAX = 8;

/** Default slot weight for a task that hasn't had one set. AMs creating
 *  cards default to "1 slot, estimated"; designers can change to any
 *  number including 0 or fractions. */
export const DEFAULT_TASK_SLOTS = 1;

/** Color zone derived from a load count vs. a member's caps. */
export type LoadZone = 'green' | 'amber' | 'red';

/**
 * Total slot count assigned to a member on a specific date.
 *
 *   load = sum of (task.slots ?? 1) for every "open" task where the
 *          member is the assignee AND the task's dueDate matches.
 *
 * "Open" excludes archived tasks and tasks already in the `done`
 * column — finished work doesn't keep eating capacity.
 *
 * Multi-owner tasks (assigneeIds[]) DO NOT contribute to anyone's
 * load by design: only the primary `assigneeId` field absorbs the
 * slots. This matches the mental model that one person owns each
 * task; co-owners are participants, not capacity-holders. If two
 * designers are sharing a job, the AM splits it into two tasks.
 */
export function loadFor(
  memberId: string,
  dateISO: string,
  tasks: CapacityTask[],
): number {
  let sum = 0;
  for (const t of tasks) {
    if (t.assigneeId !== memberId) continue;
    if (t.dueDate !== dateISO) continue;
    if (t.archived) continue;
    if (t.columnId === 'done') continue;
    sum += t.slots ?? DEFAULT_TASK_SLOTS;
  }
  return sum;
}

/**
 * The caps that apply to a member on a specific date, with override
 * fallback resolved.
 *
 *   1. Per-day override exists for this (member, date) → use it
 *   2. Else member has standing capSoft/capMax → use those
 *   3. Else fall back to DEFAULT_CAP_SOFT / DEFAULT_CAP_MAX
 *
 * Returning a {soft, max} pair lets callers do their own zone math
 * without re-resolving the override chain. `loadFor` and
 * `effectiveCapFor` both run in O(N) over their relevant arrays —
 * upstream callers should memoise per (memberId, dateISO) when
 * rendering for many cells (e.g. a 14-day heatmap).
 */
export function effectiveCapFor(
  memberId: string,
  dateISO: string,
  members: Member[],
  overrides: MemberDayOverride[],
): { soft: number; max: number } {
  const override = overrides.find(
    o => o.memberId === memberId && o.date === dateISO,
  );
  if (override) {
    return { soft: override.capSoft, max: override.capMax };
  }
  const member = members.find(m => m.id === memberId);
  return {
    soft: member?.capSoft ?? DEFAULT_CAP_SOFT,
    max: member?.capMax ?? DEFAULT_CAP_MAX,
  };
}

/**
 * Color zone for a load count vs. a caps pair.
 *
 *   load <= soft → green   (under target — quiet state)
 *   load <= max  → amber   (in stretch zone — visible nudge, no popup)
 *   load >  max  → red     (over max — booking flow surfaces a warning)
 *
 * The amber zone earns the second threshold: it's the passive signal
 * AMs see before the system has to actually speak up. Below soft = no
 * signal; soft→max = "stretching"; over max = "you sure?"
 */
export function zoneFor(
  load: number,
  caps: { soft: number; max: number },
): LoadZone {
  if (load <= caps.soft) return 'green';
  if (load <= caps.max) return 'amber';
  return 'red';
}

/**
 * Find the next available weekday where moving a task of `slots`
 * weight onto `memberId`'s queue would keep the load at-or-below the
 * soft cap.
 *
 * Used by the booking-flow soft warning to suggest "Sarah's full Fri
 * — Mon (3/6) has room. Switch?" without making the AM hunt for a
 * clean day manually.
 *
 * Logic:
 *   - Start one day after `fromISO`.
 *   - Skip Sat/Sun (configurable later).
 *   - For each candidate date, compute:
 *       baseLoad   = load on that date excluding the task's existing
 *                    contribution if it currently sits there
 *       predicted  = baseLoad + slots
 *     If `predicted <= softCap`, return that date.
 *   - Cap the search at `searchDays` (default 14) to bound the work.
 *
 * Returns null when nothing fits in the search window — the caller
 * should fall back to "no suggestion" rather than guessing.
 *
 * `excludeTaskId` lets the call site say "ignore this card's
 * existing slots when computing each candidate's base load." Without
 * it, the predicted load would double-count the card on its current
 * date and we'd think every other date is the candidate's only escape.
 */
export function nextAvailableDate(
  memberId: string,
  fromISO: string,
  slots: number,
  members: Member[],
  overrides: MemberDayOverride[],
  tasks: CapacityTask[],
  options: { excludeTaskId?: string; searchDays?: number } = {},
): string | null {
  const searchDays = options.searchDays ?? 14;
  const excludeId = options.excludeTaskId;

  // Parse fromISO as a local date and walk forward day by day.
  // Format candidates from local components rather than .toISOString()
  // — the latter shifts to UTC and rolls back a day in any timezone
  // east of Greenwich, which would cause the helper to return the
  // input date itself for callers in Asia/Australia.
  const [y, m, d] = fromISO.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);

  for (let i = 1; i <= searchDays; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) continue; // weekend skip
    const yy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getDate()).padStart(2, '0');
    const candidateISO = `${yy}-${mm}-${dd}`;

    // Filter out this task's contribution from the candidate's load
    // count so we can ask "if I move it here, what's the predicted
    // load?" rather than "is this candidate already clean?"
    const filtered = excludeId
      ? tasks.filter(t => t.id !== excludeId)
      : tasks;
    const baseLoad = loadFor(memberId, candidateISO, filtered);
    const predicted = baseLoad + slots;
    const caps = effectiveCapFor(memberId, candidateISO, members, overrides);
    if (predicted <= caps.soft) return candidateISO;
  }

  return null;
}
