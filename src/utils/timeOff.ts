import {
  SHARED_LEAVE_DAYS_PER_YEAR,
  SICK_LEAVE_DAYS_PER_YEAR,
} from '../types/flizow';
import type {
  Holiday,
  LeaveType,
  Member,
  MemberCountry,
  TimeOffRequest,
  TimeOffStatus,
} from '../types/flizow';
import { holidayAppliesToCountry } from './holidays';

/**
 * Time-off helpers — pure read functions over FlizowData.timeOffRequests
 * + the Phase-3 migration helper.
 *
 * Why this lives in one place:
 *   - Six surfaces (profile pill, Account → Time off list, capacity
 *     heatmap, ops approval queue, notifications, calendar grid) all
 *     ask "is this member off today?" or "what's pending?". One
 *     source of truth keeps the answers consistent.
 *   - Pure ⇒ trivial unit tests. No store, no React.
 *
 * Audit: time-off Phase 3.
 */

// ── Filter primitives ──────────────────────────────────────────────

/** All requests for a member, regardless of status. Sorted by start
 *  date ascending so calendars + lists render in chronological order. */
export function getMemberTimeOff(
  requests: ReadonlyArray<TimeOffRequest>,
  memberId: string,
): TimeOffRequest[] {
  return requests
    .filter((r) => r.memberId === memberId)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** All approved requests across the workspace, sorted by start. Used
 *  by the capacity heatmap, the calendar, and the profile pill. */
export function getApprovedTimeOff(
  requests: ReadonlyArray<TimeOffRequest>,
): TimeOffRequest[] {
  return getRequestsByStatus(requests, 'approved');
}

/** All pending requests across the workspace, sorted by request time
 *  (oldest first). Drives the OM approval queue: the request that's
 *  been waiting longest surfaces at the top. */
export function getPendingTimeOff(
  requests: ReadonlyArray<TimeOffRequest>,
): TimeOffRequest[] {
  return requests
    .filter((r) => r.status === 'pending')
    .slice()
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

/** Generic filter by status — internal primitive that the
 *  status-specific wrappers above build on. Exposed because the
 *  approval queue might want 'denied' to surface a "recently
 *  denied" history strip. */
export function getRequestsByStatus(
  requests: ReadonlyArray<TimeOffRequest>,
  status: TimeOffStatus,
): TimeOffRequest[] {
  return requests
    .filter((r) => r.status === status)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ── Date queries ───────────────────────────────────────────────────

/** Find the *approved* period covering `dateISO` for `memberId`, or
 *  null when the member isn't out that day. Replaces the legacy
 *  `currentVacationPeriod(member, todayISO)` which read directly off
 *  `Member.timeOff`. */
export function currentApprovedPeriod(
  requests: ReadonlyArray<TimeOffRequest>,
  memberId: string,
  dateISO: string,
): TimeOffRequest | null {
  for (const r of requests) {
    if (r.memberId !== memberId) continue;
    if (r.status !== 'approved') continue;
    if (dateISO >= r.start && dateISO <= r.end) return r;
  }
  return null;
}

/** Boolean wrapper around `currentApprovedPeriod`. Used wherever a
 *  caller just wants "is this member out today" without caring about
 *  the period's start/end. */
export function isOnApprovedTimeOff(
  requests: ReadonlyArray<TimeOffRequest>,
  memberId: string,
  dateISO: string,
): boolean {
  return currentApprovedPeriod(requests, memberId, dateISO) !== null;
}

/** Future-dated approved periods for a member, sorted nearest-first.
 *  Used on the profile to show "next time off" chips. Excludes the
 *  currently-active period (use `currentApprovedPeriod` for that)
 *  and excludes anything in the past (no value to surface a vacation
 *  someone already took). */
export function upcomingApprovedPeriods(
  requests: ReadonlyArray<TimeOffRequest>,
  memberId: string,
  dateISO: string,
): TimeOffRequest[] {
  return requests
    .filter(
      (r) =>
        r.memberId === memberId &&
        r.status === 'approved' &&
        r.start > dateISO,
    )
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ── Constructors ───────────────────────────────────────────────────

/** Build a fresh TimeOffRequest. Defensive defaults so callers can
 *  pass minimal input. The id is generated when absent so a UI
 *  layer doesn't have to mint one — but tests can pass an explicit
 *  id to make assertions deterministic. */
export function makeTimeOffRequest(input: {
  id?: string;
  memberId: string;
  start: string;
  end: string;
  reason?: string;
  status?: TimeOffStatus;
  requestedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
}): TimeOffRequest {
  const now = input.requestedAt ?? new Date().toISOString();
  return {
    id: input.id ?? `tor-${Math.random().toString(36).slice(2, 11)}`,
    memberId: input.memberId,
    start: input.start,
    end: input.end,
    reason: input.reason,
    status: input.status ?? 'pending',
    requestedAt: now,
    decidedAt: input.decidedAt,
    decidedBy: input.decidedBy,
    decisionNote: input.decisionNote,
  };
}

// ── Migration ──────────────────────────────────────────────────────

/** Phase-3 sweep: walks every member's legacy `timeOff[]`, mints an
 *  approved TimeOffRequest per entry, and clears the legacy field.
 *  Returns the new request list, the patched members, and a flag
 *  the caller uses to decide whether to persist back to Firestore.
 *
 *  Why approved-status (not pending): existing entries were already
 *  in effect — the user (or admin) had already accepted the time off.
 *  Migrating them to 'pending' would surface a fake approval queue
 *  full of every historical vacation on first load. Approved + a
 *  decisionNote stating it came from the migration is honest about
 *  the provenance.
 *
 *  decidedBy: the workspace owner uid. We don't know who originally
 *  approved the legacy entry (the data didn't store it), but the
 *  owner is the safe default audit subject. */
export function migrateLegacyTimeOff(
  members: ReadonlyArray<Member>,
  existingRequests: ReadonlyArray<TimeOffRequest>,
  ownerUid: string,
  todayISO: string,
): {
  members: Member[];
  requests: TimeOffRequest[];
  changed: boolean;
} {
  let changed = false;
  const requests = [...existingRequests];

  const nextMembers = members.map((m) => {
    const legacy = m.timeOff;
    if (!legacy || legacy.length === 0) return m;
    changed = true;
    for (const period of legacy) {
      // Idempotency guard: if a request with the same member +
      // date range + status already exists, don't double-write.
      // Defends against a partial migration that wrote some but
      // not all entries (offline edits, mid-flight crash).
      const dup = requests.some(
        (r) =>
          r.memberId === m.id &&
          r.start === period.start &&
          r.end === period.end &&
          r.status === 'approved',
      );
      if (dup) continue;
      requests.push(
        makeTimeOffRequest({
          memberId: m.id,
          start: period.start,
          end: period.end,
          status: 'approved',
          requestedAt: todayISO,
          decidedAt: todayISO,
          decidedBy: ownerUid,
          decisionNote: 'Migrated from legacy time-off entry',
        }),
      );
    }
    // Clear the legacy field so subsequent loads don't re-migrate.
    // Spreads the rest so we don't lose any other Member fields.
    const { timeOff, ...rest } = m;
    return rest as Member;
  });

  return {
    members: nextMembers,
    requests: changed ? requests : [...existingRequests],
    changed,
  };
}

// ── Working-day math + quota usage (Phase 8) ───────────────────────
//
// Working days drive the paid/unpaid breakdown. A working day is any
// date in the inclusive [start, end] range that isn't a weekend AND
// isn't an active observed holiday for the member's country. The
// math is pure and deliberately doesn't trust the date order — if
// `start > end` it returns 0 rather than throwing, so a malformed
// request can't crash a render path.

/** Count working days in an inclusive ISO-date range, excluding
 *  weekends (Sat/Sun) and any active holiday observed for `country`.
 *  Pure — caller passes the holiday list so tests stay deterministic. */
export function workingDaysBetween(
  startISO: string,
  endISO: string,
  holidays: ReadonlyArray<Holiday>,
  country?: MemberCountry,
): number {
  if (!startISO || !endISO) return 0;
  if (endISO < startISO) return 0;

  // Build a set of observed-holiday ISO dates once so the per-day
  // loop is O(1) per check.
  const observed = new Set<string>();
  for (const h of holidays) {
    if (!h.active) continue;
    if (country !== undefined && !holidayAppliesToCountry(h, country)) continue;
    observed.add(h.date);
  }

  let count = 0;
  // Walk dates as strings to avoid timezone drift — Date arithmetic
  // can shift by an hour around DST boundaries. ISO YYYY-MM-DD strings
  // compare lexicographically in the right order, and addDays below
  // does the increment without touching local time.
  let cursor = startISO;
  while (cursor <= endISO) {
    const day = dayOfWeekISO(cursor);
    const isWeekend = day === 0 || day === 6;
    if (!isWeekend && !observed.has(cursor)) count++;
    cursor = addDaysISO(cursor, 1);
  }
  return count;
}

/** 0=Sun ... 6=Sat for an ISO YYYY-MM-DD. UTC noon construction so
 *  daylight-saving transitions can't shift the day-of-week answer. */
function dayOfWeekISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay();
}

/** Add `n` days to an ISO YYYY-MM-DD, returning ISO YYYY-MM-DD.
 *  Uses UTC noon for the same DST-resilience reason as dayOfWeekISO. */
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
  base.setUTCDate(base.getUTCDate() + n);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Snapshot of where a member sits inside their current anniversary
 *  year on each of the two annual buckets. The Request modal renders
 *  the "X days remaining" hint from this; the Approvals card renders
 *  the same number with the requested-days delta beside it. */
export interface AnnualQuotaUsage {
  /** True when the member doesn't yet have a regularization date —
   *  no paid leave at all, everything they submit is unpaid. */
  isProbationary: boolean;
  /** Start of the current anniversary year (inclusive). Empty
   *  string when probationary. */
  yearStart: string;
  /** End of the current anniversary year (exclusive). Empty string
   *  when probationary. */
  yearEnd: string;
  /** Working days the member has already used from the SICK bucket
   *  inside the current anniversary year. Computed from approved
   *  requests' `paidDays` (sick-typed). */
  sickUsed: number;
  sickRemaining: number;
  /** Working days from the SHARED (casual + emergency) bucket
   *  already used in the current anniversary year. */
  sharedUsed: number;
  sharedRemaining: number;
}

/** Compute a member's quota usage inside the current anniversary
 *  year. Probationary members short-circuit to all-zero buckets with
 *  the probationary flag set, so callers can render a banner without
 *  doing the math themselves.
 *
 *  Pure: takes member + requests + today, returns a snapshot. The
 *  Request modal calls this on every render, so the year boundaries
 *  always reflect "now" rather than a stale anchor.
 *
 *  Anniversary semantics: if a member regularized on 2025-08-15,
 *  their year window today (2026-05-12) is 2025-08-15 → 2026-08-15.
 *  On 2026-08-15 the window flips to 2026-08-15 → 2027-08-15 and
 *  the buckets reset to 15 each. */
export function computeAnnualQuotaUsage(
  member: Pick<Member, 'id' | 'employmentStatus' | 'regularizedAt'>,
  requests: ReadonlyArray<TimeOffRequest>,
  todayISO: string,
): AnnualQuotaUsage {
  const isRegular =
    member.employmentStatus === 'regular' && !!member.regularizedAt;
  if (!isRegular || !member.regularizedAt) {
    return {
      isProbationary: true,
      yearStart: '',
      yearEnd: '',
      sickUsed: 0,
      sickRemaining: 0,
      sharedUsed: 0,
      sharedRemaining: 0,
    };
  }

  const { yearStart, yearEnd } = currentAnniversaryYear(
    member.regularizedAt,
    todayISO,
  );

  let sickUsed = 0;
  let sharedUsed = 0;
  for (const r of requests) {
    if (r.memberId !== member.id) continue;
    if (r.status !== 'approved') continue;
    // The breakdown got locked on approval — count any approved
    // request whose start falls inside the current year window.
    // Anchoring on `start` (not the per-day distribution) avoids
    // double-counting when a request straddles the year boundary;
    // edge case revisited in Phase 9 if it comes up.
    if (r.start < yearStart || r.start >= yearEnd) continue;
    const paid = r.paidDays ?? 0;
    if (paid <= 0) continue;
    if (r.leaveType === 'sick') sickUsed += paid;
    else if (r.leaveType === 'emergency' || r.leaveType === 'casual') {
      // Casual draws credits first; only the NON-credit portion
      // eats the shared bucket. paidDays already includes credits,
      // so subtract them back out here.
      const credit = r.creditDays ?? 0;
      sharedUsed += Math.max(0, paid - credit);
    }
  }

  return {
    isProbationary: false,
    yearStart,
    yearEnd,
    sickUsed,
    sickRemaining: Math.max(0, SICK_LEAVE_DAYS_PER_YEAR - sickUsed),
    sharedUsed,
    sharedRemaining: Math.max(0, SHARED_LEAVE_DAYS_PER_YEAR - sharedUsed),
  };
}

/** Resolve the current anniversary-year window for a regularization
 *  date. Returns [yearStart, yearEnd) — inclusive start, exclusive end —
 *  both as ISO YYYY-MM-DD. */
function currentAnniversaryYear(
  regularizedAtISO: string,
  todayISO: string,
): { yearStart: string; yearEnd: string } {
  // Anniversary always lands on the same month + day as the
  // regularization date. Find the most recent occurrence on-or-before
  // today, then add a year for the end.
  const reg = parseISO(regularizedAtISO);
  const tod = parseISO(todayISO);
  let anniversaryThisYear = new Date(
    Date.UTC(tod.getUTCFullYear(), reg.getUTCMonth(), reg.getUTCDate(), 12),
  );
  if (anniversaryThisYear > tod) {
    // We're before this year's anniversary — the active window
    // started on last year's anniversary.
    anniversaryThisYear = new Date(
      Date.UTC(tod.getUTCFullYear() - 1, reg.getUTCMonth(), reg.getUTCDate(), 12),
    );
  }
  const yearEnd = new Date(anniversaryThisYear);
  yearEnd.setUTCFullYear(yearEnd.getUTCFullYear() + 1);
  return {
    yearStart: formatISO(anniversaryThisYear),
    yearEnd: formatISO(yearEnd),
  };
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
}
function formatISO(d: Date): string {
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Result of running the paid/unpaid math on a single time-off
 *  request. The Request modal shows this as a live preview; the
 *  store locks it onto the request at approval time. */
export interface LeaveBreakdown {
  /** Total working days in the request range — excluded weekends
   *  + observed holidays. The sum of paid + unpaid. */
  workingDays: number;
  /** Days drawn from the holiday transfer-credit ledger (casual
   *  leave only). Subset of paidDays. */
  creditDays: number;
  /** Days the requester will be paid for. Includes creditDays. */
  paidDays: number;
  /** Days flagged unpaid because the bucket and credits were both
   *  exhausted. */
  unpaidDays: number;
}

/** Compute the paid/unpaid breakdown for a hypothetical or actual
 *  request. Pure — caller supplies every dependency. The Request
 *  modal calls this on every keystroke (cheap O(working days)) to
 *  render the preview; the store calls it once on approval to lock
 *  the breakdown onto the request.
 *
 *  Rules:
 *    sick      → paid = min(workingDays, sickRemaining)
 *    emergency → paid = min(workingDays, sharedRemaining)
 *    casual    → first burn credits (1 per working day), then the
 *                shared bucket, then unpaid.
 *
 *  When the member is probationary every day is unpaid regardless
 *  of type. When `leaveType` is undefined (a fresh modal that hasn't
 *  picked yet) we still report workingDays so the user sees the
 *  range length — paid/unpaid stay zero until a type is picked. */
export function computeLeaveBreakdown(input: {
  leaveType?: LeaveType;
  start: string;
  end: string;
  member: Pick<Member, 'id' | 'employmentStatus' | 'regularizedAt' | 'country'>;
  holidays: ReadonlyArray<Holiday>;
  /** Other approved requests for this member — used to compute the
   *  current quota balance. */
  requests: ReadonlyArray<TimeOffRequest>;
  /** Holiday transfer credits available to this member RIGHT NOW.
   *  Caller computes via utils/holidayCredits.computeMemberBalance
   *  (same function the existing checkbox used). */
  creditBalance: number;
  todayISO: string;
}): LeaveBreakdown {
  const workingDays = workingDaysBetween(
    input.start,
    input.end,
    input.holidays,
    input.member.country,
  );
  if (workingDays === 0 || !input.leaveType) {
    return { workingDays, creditDays: 0, paidDays: 0, unpaidDays: 0 };
  }

  const usage = computeAnnualQuotaUsage(
    input.member,
    input.requests,
    input.todayISO,
  );
  if (usage.isProbationary) {
    return {
      workingDays,
      creditDays: 0,
      paidDays: 0,
      unpaidDays: workingDays,
    };
  }

  if (input.leaveType === 'sick') {
    const paid = Math.min(workingDays, usage.sickRemaining);
    return {
      workingDays,
      creditDays: 0,
      paidDays: paid,
      unpaidDays: workingDays - paid,
    };
  }
  if (input.leaveType === 'emergency') {
    const paid = Math.min(workingDays, usage.sharedRemaining);
    return {
      workingDays,
      creditDays: 0,
      paidDays: paid,
      unpaidDays: workingDays - paid,
    };
  }
  // casual: spend credits first, then shared, then unpaid.
  const credit = Math.min(workingDays, Math.max(0, input.creditBalance));
  const afterCredit = workingDays - credit;
  const fromShared = Math.min(afterCredit, usage.sharedRemaining);
  const unpaid = afterCredit - fromShared;
  return {
    workingDays,
    creditDays: credit,
    paidDays: credit + fromShared,
    unpaidDays: unpaid,
  };
}
