import type {
  CoverageRule,
  CoverageRuleWho,
  Member,
  RuleConflict,
  TimeOffRequest,
} from '../types/flizow';

/**
 * Coverage rules evaluator — pure logic for the time-off rules engine.
 *
 * Phase 5 ships only the data shape + evaluator + tests; Phase 6
 * builds the rules-builder UI and wires the conflict report into
 * the Time off Schedules tab.
 *
 * Why this lives in its own module:
 *   - Pure ⇒ trivial unit tests. No store, no React, no dates from
 *     `new Date()` outside the helpers below.
 *   - Three separate consumers (calendar grid, conflict ribbon,
 *     approval queue's inline warning) all ask the same question:
 *     "which rules break on which days?". One source of truth keeps
 *     the answers consistent.
 *   - The math is the most error-prone piece in the whole feature
 *     (date iteration × who-filter × constraint × status). Isolating
 *     it lets us pile tests on without spinning a renderer.
 *
 * Shape of the public API:
 *   - evaluateRules(input): the main entry point. Walks every date
 *     in the window, every active rule, and produces a flat array
 *     of RuleConflict entries.
 *   - membersInScope: the `who`-filter primitive, exported for tests
 *     and for the Phase-6 rules-builder preview ("3 members match
 *     this filter").
 *   - isWeekday / datesBetween: date utilities, also exported for
 *     reuse + isolated testing.
 *
 * Audit: time-off rules Phase 5.
 */

// ── Date utilities ─────────────────────────────────────────────────

/** Is the ISO date a weekday (Mon-Fri)?
 *
 *  Implementation note: parses YYYY-MM-DD into a local-time Date
 *  rather than going through `new Date(iso)`, which would parse as
 *  UTC midnight and return the wrong weekday in negative timezones.
 *  Defensive — malformed input returns true so a typo doesn't
 *  silently mark every day as weekend. */
export function isWeekday(iso: string): boolean {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return true;
  const [y, m, d] = parts;
  const day = new Date(y, m - 1, d).getDay();
  return day !== 0 && day !== 6;
}

/** Inclusive date range expanded to an ISO string array. Walks
 *  start → end, one day at a time. Returns empty when start > end
 *  (defensive — caller shouldn't pass an inverted range, but a
 *  silent empty result is safer than a crash). */
export function datesBetween(startISO: string, endISO: string): string[] {
  if (startISO > endISO) return [];
  const out: string[] = [];
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  if ([sy, sm, sd, ey, em, ed].some((n) => Number.isNaN(n))) return [];
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ── Who filter ─────────────────────────────────────────────────────

/** Resolve a rule's `who` filter to the concrete set of members it
 *  matches. Returns a fresh array — caller can sort / slice freely.
 *  Members without an accessLevel (legacy demo data) are excluded
 *  from role-kind matches; they wouldn't have signed in to be on a
 *  rule anyway, but the explicit guard documents the intent. */
export function membersInScope(
  who: CoverageRuleWho,
  members: ReadonlyArray<Member>,
): Member[] {
  switch (who.kind) {
    case 'role': {
      const target = new Set(who.roleIds);
      return members.filter((m) => m.accessLevel != null && target.has(m.accessLevel));
    }
    case 'jobTitle': {
      const target = new Set(who.jobTitleIds);
      return members.filter((m) => m.jobTitleId != null && target.has(m.jobTitleId));
    }
    case 'members': {
      const target = new Set(who.memberIds);
      return members.filter((m) => target.has(m.id));
    }
  }
}

// ── Per-day per-rule check ─────────────────────────────────────────

/** Which members in `scope` are on approved time off on this date?
 *  Internal helper — the evaluator calls this once per (rule, date)
 *  pair. Linear scan; fine for the workspace sizes Flizow targets
 *  (10s of members, 100s of requests). */
function membersOffOnDate(
  scope: ReadonlyArray<Member>,
  approvedRequests: ReadonlyArray<TimeOffRequest>,
  dateISO: string,
): Member[] {
  if (scope.length === 0) return [];
  const scopeIds = new Set(scope.map((m) => m.id));
  const off = new Set<string>();
  for (const r of approvedRequests) {
    if (r.status !== 'approved') continue;
    if (!scopeIds.has(r.memberId)) continue;
    if (dateISO < r.start || dateISO > r.end) continue;
    off.add(r.memberId);
  }
  return scope.filter((m) => off.has(m.id));
}

/** Returns the conflict for `(rule, dateISO)` when broken, or null
 *  when satisfied / when the rule doesn't apply to this date. Pure;
 *  exported so tests can call it directly without going through
 *  evaluateRules. */
export function evaluateRuleOnDate(
  rule: CoverageRule,
  dateISO: string,
  members: ReadonlyArray<Member>,
  approvedRequests: ReadonlyArray<TimeOffRequest>,
): RuleConflict | null {
  if (!rule.active) return null;
  if (rule.when === 'weekdays' && !isWeekday(dateISO)) return null;

  const scope = membersInScope(rule.who, members);
  // Vacuously satisfied — nothing in scope means nothing to enforce.
  // The OM might create a rule against a job-title nobody has yet;
  // that's fine, it'll start firing once they tag members. Same for
  // an empty named-members list.
  if (scope.length === 0) return null;

  const off = membersOffOnDate(scope, approvedRequests, dateISO);
  const presentCount = scope.length - off.length;

  let broken = false;
  let expected = 0;
  let actual = 0;

  switch (rule.constraint.kind) {
    case 'min-present':
      expected = rule.constraint.count;
      actual = presentCount;
      broken = actual < expected;
      break;
    case 'max-out':
      expected = rule.constraint.count;
      actual = off.length;
      broken = actual > expected;
      break;
  }

  if (!broken) return null;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    date: dateISO,
    expected,
    actual,
    membersInScope: scope.map((m) => m.id),
    membersOff: off.map((m) => m.id),
  };
}

// ── Main entry ─────────────────────────────────────────────────────

/**
 * Walk every (rule, date) pair in the window and produce the flat
 * conflict report. Caller decides whether to render it as a list,
 * group by date, group by rule, etc.
 *
 * Date order in the output mirrors the input range (start → end);
 * within a single day, conflicts come in the order their rules
 * appear in `rules`. Stable ordering matters for the calendar UI
 * — re-renders don't shuffle the conflict ribbon.
 *
 * Performance: O(rules × dates × members + requests) per call. For
 * a typical workspace (5 rules × 30 days × 20 members + 100
 * requests) that's ~3000 + 100 ops — trivial. No memoisation needed.
 */
export function evaluateRules(input: {
  rules: ReadonlyArray<CoverageRule>;
  members: ReadonlyArray<Member>;
  approvedRequests: ReadonlyArray<TimeOffRequest>;
  /** Inclusive ISO date window. */
  start: string;
  end: string;
}): RuleConflict[] {
  const out: RuleConflict[] = [];
  if (input.rules.length === 0) return out;
  const dates = datesBetween(input.start, input.end);
  if (dates.length === 0) return out;
  for (const date of dates) {
    for (const rule of input.rules) {
      const conflict = evaluateRuleOnDate(rule, date, input.members, input.approvedRequests);
      if (conflict) out.push(conflict);
    }
  }
  return out;
}

/** Group a flat conflict list by date for calendar rendering.
 *  Convenience for the Phase-6 calendar grid — each day cell
 *  asks "are there any conflicts for me?" and reads the entry
 *  from the map directly. */
export function groupConflictsByDate(
  conflicts: ReadonlyArray<RuleConflict>,
): Map<string, RuleConflict[]> {
  const map = new Map<string, RuleConflict[]>();
  for (const c of conflicts) {
    const bucket = map.get(c.date) ?? [];
    bucket.push(c);
    map.set(c.date, bucket);
  }
  return map;
}

/** Group a flat conflict list by rule for the rules-list view ("3
 *  conflicts on this rule this month"). Inverse projection of the
 *  date grouping above. */
export function groupConflictsByRule(
  conflicts: ReadonlyArray<RuleConflict>,
): Map<string, RuleConflict[]> {
  const map = new Map<string, RuleConflict[]>();
  for (const c of conflicts) {
    const bucket = map.get(c.ruleId) ?? [];
    bucket.push(c);
    map.set(c.ruleId, bucket);
  }
  return map;
}

// ── Constructor ────────────────────────────────────────────────────

/** Build a CoverageRule with defaults filled in. Used by the store's
 *  `addCoverageRule` and (in Phase 6) the rules-builder form. */
export function makeCoverageRule(input: {
  id?: string;
  name: string;
  who: CoverageRuleWho;
  constraint: { kind: 'min-present' | 'max-out'; count: number };
  when?: 'weekdays' | 'all';
  active?: boolean;
}): CoverageRule {
  return {
    id: input.id ?? `cr-${Math.random().toString(36).slice(2, 11)}`,
    name: input.name,
    who: input.who,
    constraint: input.constraint,
    when: input.when ?? 'weekdays',
    active: input.active ?? true,
  };
}
