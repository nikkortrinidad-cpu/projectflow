import type { Member, MemberDayOverride, Task } from '../types/flizow';

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
  tasks: Task[],
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
