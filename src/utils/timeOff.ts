import type { Member, TimeOffRequest, TimeOffStatus } from '../types/flizow';

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
