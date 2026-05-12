/**
 * Time-off helpers — unit tests.
 *
 * Pure logic only — no store, no React. Coverage:
 *   - Status filtering (pending / approved / denied / cancelled)
 *   - Date queries (current period, upcoming, isOnApprovedTimeOff)
 *   - Sort order
 *   - The Phase-3 migration (legacy Member.timeOff → workspace ledger)
 *   - Idempotency of the migration
 *
 * Phase 3 of the time-off refactor.
 */

import { describe, it, expect } from 'vitest';
import {
  getMemberTimeOff,
  getApprovedTimeOff,
  getPendingTimeOff,
  currentApprovedPeriod,
  isOnApprovedTimeOff,
  upcomingApprovedPeriods,
  makeTimeOffRequest,
  migrateLegacyTimeOff,
  workingDaysBetween,
  computeAnnualQuotaUsage,
  computeLeaveBreakdown,
} from '../utils/timeOff';
import type { Member, TimeOffRequest, Holiday } from '../types/flizow';

// ── Fixtures ─────────────────────────────────────────────────────────

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'm-1',
  initials: 'M1',
  name: 'Member One',
  color: '#000',
  type: 'operator',
  ...overrides,
});

const req = (overrides: Partial<TimeOffRequest> = {}): TimeOffRequest => ({
  id: `tor-${Math.random().toString(36).slice(2, 9)}`,
  memberId: 'm-1',
  start: '2026-05-10',
  end: '2026-05-12',
  status: 'approved',
  requestedAt: '2026-05-01T10:00:00Z',
  ...overrides,
});

// ── Filter primitives ───────────────────────────────────────────────

describe('getMemberTimeOff()', () => {
  it('filters by memberId and sorts by start date', () => {
    const requests = [
      req({ id: 'a', memberId: 'm-1', start: '2026-06-01', end: '2026-06-02' }),
      req({ id: 'b', memberId: 'm-2', start: '2026-05-01', end: '2026-05-02' }),
      req({ id: 'c', memberId: 'm-1', start: '2026-05-01', end: '2026-05-02' }),
    ];
    const out = getMemberTimeOff(requests, 'm-1');
    expect(out.map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('returns empty array when the member has no entries', () => {
    expect(getMemberTimeOff([], 'm-99')).toEqual([]);
  });
});

describe('getApprovedTimeOff() / getPendingTimeOff()', () => {
  const requests: TimeOffRequest[] = [
    req({ id: 'p', status: 'pending', requestedAt: '2026-05-02T10:00:00Z' }),
    req({ id: 'a', status: 'approved' }),
    req({ id: 'd', status: 'denied' }),
    req({ id: 'c', status: 'cancelled' }),
    req({ id: 'p2', status: 'pending', requestedAt: '2026-05-01T10:00:00Z' }),
  ];

  it('approved filter returns only approved entries', () => {
    expect(getApprovedTimeOff(requests).map((r) => r.id)).toEqual(['a']);
  });

  it('pending filter returns only pending entries, sorted oldest-first', () => {
    expect(getPendingTimeOff(requests).map((r) => r.id)).toEqual(['p2', 'p']);
  });
});

// ── Date queries ────────────────────────────────────────────────────

describe('currentApprovedPeriod()', () => {
  const requests: TimeOffRequest[] = [
    req({ id: 'a', start: '2026-05-10', end: '2026-05-12', status: 'approved' }),
    req({ id: 'b', start: '2026-05-15', end: '2026-05-17', status: 'pending' }),
    req({ id: 'c', start: '2026-05-15', end: '2026-05-17', status: 'denied' }),
  ];

  it('returns the matching approved period', () => {
    expect(currentApprovedPeriod(requests, 'm-1', '2026-05-11')?.id).toBe('a');
  });

  it('treats start and end as inclusive bounds', () => {
    expect(currentApprovedPeriod(requests, 'm-1', '2026-05-10')?.id).toBe('a');
    expect(currentApprovedPeriod(requests, 'm-1', '2026-05-12')?.id).toBe('a');
  });

  it('returns null for pending or denied periods even if today is inside', () => {
    expect(currentApprovedPeriod(requests, 'm-1', '2026-05-16')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(currentApprovedPeriod(requests, 'm-1', '2026-05-13')).toBeNull();
    expect(currentApprovedPeriod([], 'm-1', '2026-05-11')).toBeNull();
  });

  it('returns null for a different member', () => {
    expect(currentApprovedPeriod(requests, 'm-99', '2026-05-11')).toBeNull();
  });
});

describe('isOnApprovedTimeOff()', () => {
  it('returns boolean wrapper around currentApprovedPeriod', () => {
    const requests = [
      req({ start: '2026-05-10', end: '2026-05-12', status: 'approved' }),
    ];
    expect(isOnApprovedTimeOff(requests, 'm-1', '2026-05-11')).toBe(true);
    expect(isOnApprovedTimeOff(requests, 'm-1', '2026-05-13')).toBe(false);
  });
});

describe('upcomingApprovedPeriods()', () => {
  const today = '2026-05-10';
  const requests: TimeOffRequest[] = [
    req({ id: 'past',     start: '2026-04-01', end: '2026-04-03', status: 'approved' }),
    req({ id: 'current',  start: '2026-05-09', end: '2026-05-11', status: 'approved' }),
    req({ id: 'soon',     start: '2026-05-20', end: '2026-05-22', status: 'approved' }),
    req({ id: 'pending',  start: '2026-05-25', end: '2026-05-27', status: 'pending'  }),
    req({ id: 'further',  start: '2026-06-01', end: '2026-06-03', status: 'approved' }),
  ];

  it("returns only future-dated approved periods, soonest first", () => {
    const out = upcomingApprovedPeriods(requests, 'm-1', today);
    expect(out.map((r) => r.id)).toEqual(['soon', 'further']);
  });
});

// ── Constructor ─────────────────────────────────────────────────────

describe('makeTimeOffRequest()', () => {
  it('defaults status to pending and stamps requestedAt', () => {
    const r = makeTimeOffRequest({
      memberId: 'm-1',
      start: '2026-05-10',
      end: '2026-05-12',
    });
    expect(r.status).toBe('pending');
    expect(r.requestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.id).toMatch(/^tor-/);
  });

  it('honours explicit ids, status, and decision fields', () => {
    const r = makeTimeOffRequest({
      id: 'tor-fixed',
      memberId: 'm-1',
      start: '2026-05-10',
      end: '2026-05-12',
      status: 'approved',
      requestedAt: '2026-05-01T10:00:00Z',
      decidedAt: '2026-05-02T10:00:00Z',
      decidedBy: 'owner-uid',
      decisionNote: 'Approved',
    });
    expect(r.id).toBe('tor-fixed');
    expect(r.status).toBe('approved');
    expect(r.decidedBy).toBe('owner-uid');
    expect(r.decisionNote).toBe('Approved');
  });
});

// ── Migration ───────────────────────────────────────────────────────

describe('migrateLegacyTimeOff()', () => {
  const ownerUid = 'owner-1';
  const today = '2026-05-01';

  it('mints an approved request per legacy entry and clears the field', () => {
    const m = member({
      id: 'm-1',
      timeOff: [
        { start: '2026-05-10', end: '2026-05-12' },
        { start: '2026-06-01', end: '2026-06-03' },
      ],
    });
    const out = migrateLegacyTimeOff([m], [], ownerUid, today);
    expect(out.changed).toBe(true);
    expect(out.requests).toHaveLength(2);
    expect(out.requests.every((r) => r.status === 'approved')).toBe(true);
    expect(out.requests.every((r) => r.decidedBy === ownerUid)).toBe(true);
    expect(out.requests.every((r) => r.memberId === 'm-1')).toBe(true);
    // Field cleared on the migrated member.
    expect(out.members[0].timeOff).toBeUndefined();
  });

  it('skips members with empty/undefined timeOff', () => {
    const out = migrateLegacyTimeOff(
      [member({ id: 'm-1' }), member({ id: 'm-2', timeOff: [] })],
      [],
      ownerUid,
      today,
    );
    expect(out.changed).toBe(false);
    expect(out.requests).toEqual([]);
  });

  it('preserves existing requests and only appends new ones', () => {
    const existing: TimeOffRequest[] = [
      req({ id: 'pre-existing', memberId: 'm-1', start: '2026-04-01', end: '2026-04-03' }),
    ];
    const m = member({
      id: 'm-1',
      timeOff: [{ start: '2026-05-10', end: '2026-05-12' }],
    });
    const out = migrateLegacyTimeOff([m], existing, ownerUid, today);
    expect(out.requests).toHaveLength(2);
    expect(out.requests.find((r) => r.id === 'pre-existing')).toBeDefined();
  });

  it('is idempotent — running twice on the same input is a no-op', () => {
    const m = member({
      id: 'm-1',
      timeOff: [{ start: '2026-05-10', end: '2026-05-12' }],
    });
    const first = migrateLegacyTimeOff([m], [], ownerUid, today);
    // Second pass receives the already-migrated members (no timeOff)
    // and the existing request list. Nothing should change.
    const second = migrateLegacyTimeOff(first.members, first.requests, ownerUid, today);
    expect(second.changed).toBe(false);
    expect(second.requests).toEqual(first.requests);
  });

  it('dup-guards against duplicate-period entries from a partial prior run', () => {
    const m = member({
      id: 'm-1',
      timeOff: [{ start: '2026-05-10', end: '2026-05-12' }],
    });
    // Previous run already wrote this period to the ledger but the
    // legacy field didn't get cleared (mid-flight crash). Re-running
    // should NOT create a duplicate.
    const existing: TimeOffRequest[] = [
      req({
        memberId: 'm-1',
        start: '2026-05-10',
        end: '2026-05-12',
        status: 'approved',
      }),
    ];
    const out = migrateLegacyTimeOff([m], existing, ownerUid, today);
    expect(out.requests).toHaveLength(1);
    // Field still cleared (we processed the legacy member).
    expect(out.members[0].timeOff).toBeUndefined();
  });
});

// ── Phase 8 — working-day math + quota + leave breakdown ─────────────

describe('workingDaysBetween', () => {
  it('counts weekdays inclusive of both ends', () => {
    // Mon 2026-05-11 through Fri 2026-05-15 = 5 working days.
    expect(workingDaysBetween('2026-05-11', '2026-05-15', [])).toBe(5);
  });

  it('skips weekends', () => {
    // Sat 2026-05-16 + Sun 2026-05-17 alone = 0 working days.
    expect(workingDaysBetween('2026-05-16', '2026-05-17', [])).toBe(0);
  });

  it('handles a range that straddles a weekend', () => {
    // Fri 2026-05-15 through Mon 2026-05-18 = 2 working days (Fri + Mon).
    expect(workingDaysBetween('2026-05-15', '2026-05-18', [])).toBe(2);
  });

  it('skips active observed holidays for the member country', () => {
    // Tue 2026-05-12 falls on a PH holiday for a PH-tagged member.
    const holidays: Holiday[] = [
      {
        id: 'h-1',
        date: '2026-05-12',
        country: 'PH',
        type: 'public',
        observation: 'national',
        name: 'Test holiday',
        active: true,
      } as Holiday,
    ];
    expect(workingDaysBetween('2026-05-11', '2026-05-13', holidays, 'PH')).toBe(2);
  });

  it('returns 0 on invalid ranges', () => {
    expect(workingDaysBetween('', '2026-05-12', [])).toBe(0);
    expect(workingDaysBetween('2026-05-13', '2026-05-11', [])).toBe(0);
  });
});

describe('computeAnnualQuotaUsage', () => {
  const regularMember: Member = {
    id: 'm-reg',
    initials: 'AB',
    name: 'Reg User',
    color: '#000',
    type: 'operator',
    employmentStatus: 'regular',
    regularizedAt: '2025-08-15',
  };
  it('flags probationary members + zeroes out the buckets', () => {
    const usage = computeAnnualQuotaUsage(
      { id: 'm-1', employmentStatus: 'probationary' },
      [],
      '2026-05-12',
    );
    expect(usage.isProbationary).toBe(true);
    expect(usage.sickRemaining).toBe(0);
    expect(usage.sharedRemaining).toBe(0);
  });

  it('treats missing regularizedAt as probationary', () => {
    const usage = computeAnnualQuotaUsage(
      { id: 'm-1', employmentStatus: 'regular' },
      [],
      '2026-05-12',
    );
    expect(usage.isProbationary).toBe(true);
  });

  it('opens the right anniversary window for a regular member', () => {
    const usage = computeAnnualQuotaUsage(regularMember, [], '2026-05-12');
    expect(usage.isProbationary).toBe(false);
    // Anniversary in this case sits on Aug 15, so on May 12 2026 the
    // active window is Aug 15 2025 → Aug 15 2026.
    expect(usage.yearStart).toBe('2025-08-15');
    expect(usage.yearEnd).toBe('2026-08-15');
    expect(usage.sickRemaining).toBe(15);
    expect(usage.sharedRemaining).toBe(15);
  });

  it('counts approved sick days inside the window against the sick bucket', () => {
    const reqs: TimeOffRequest[] = [
      makeTimeOffRequest({
        memberId: 'm-reg',
        start: '2026-03-02',
        end: '2026-03-06',
        status: 'approved',
        requestedAt: '2026-02-28',
      }),
    ];
    reqs[0].leaveType = 'sick';
    reqs[0].paidDays = 4;
    reqs[0].unpaidDays = 0;
    const usage = computeAnnualQuotaUsage(regularMember, reqs, '2026-05-12');
    expect(usage.sickUsed).toBe(4);
    expect(usage.sickRemaining).toBe(11);
    expect(usage.sharedUsed).toBe(0);
  });

  it('subtracts creditDays before counting against the shared bucket', () => {
    const reqs: TimeOffRequest[] = [
      makeTimeOffRequest({
        memberId: 'm-reg',
        start: '2026-03-02',
        end: '2026-03-06',
        status: 'approved',
        requestedAt: '2026-02-28',
      }),
    ];
    reqs[0].leaveType = 'casual';
    reqs[0].paidDays = 5;
    reqs[0].creditDays = 2;
    reqs[0].unpaidDays = 0;
    const usage = computeAnnualQuotaUsage(regularMember, reqs, '2026-05-12');
    // 5 paid - 2 from credit = 3 from shared bucket.
    expect(usage.sharedUsed).toBe(3);
    expect(usage.sharedRemaining).toBe(12);
  });
});

describe('computeLeaveBreakdown', () => {
  const regular = {
    id: 'm-1',
    employmentStatus: 'regular' as const,
    regularizedAt: '2025-08-15',
  };

  it('marks everything unpaid for probationary members', () => {
    const out = computeLeaveBreakdown({
      leaveType: 'sick',
      start: '2026-05-11',
      end: '2026-05-15',
      member: { id: 'm-1', employmentStatus: 'probationary' },
      holidays: [],
      requests: [],
      creditBalance: 0,
      todayISO: '2026-05-12',
    });
    expect(out.workingDays).toBe(5);
    expect(out.paidDays).toBe(0);
    expect(out.unpaidDays).toBe(5);
  });

  it('draws from sick bucket and flags overflow as unpaid', () => {
    // Pre-load 14 paid sick days already used.
    const prior: TimeOffRequest = makeTimeOffRequest({
      memberId: 'm-1',
      start: '2026-02-02',
      end: '2026-02-20',
      status: 'approved',
      requestedAt: '2026-02-01',
    });
    prior.leaveType = 'sick';
    prior.paidDays = 14;
    const out = computeLeaveBreakdown({
      leaveType: 'sick',
      start: '2026-05-11',
      end: '2026-05-15',
      member: regular,
      holidays: [],
      requests: [prior],
      creditBalance: 0,
      todayISO: '2026-05-12',
    });
    // 5 working days, only 1 sick day left in the bucket.
    expect(out.workingDays).toBe(5);
    expect(out.paidDays).toBe(1);
    expect(out.unpaidDays).toBe(4);
  });

  it('casual leave burns credits before drawing from the shared bucket', () => {
    const out = computeLeaveBreakdown({
      leaveType: 'casual',
      start: '2026-05-11',
      end: '2026-05-15',
      member: regular,
      holidays: [],
      requests: [],
      creditBalance: 2,
      todayISO: '2026-05-12',
    });
    expect(out.workingDays).toBe(5);
    expect(out.creditDays).toBe(2);
    // 2 from credit + 3 from shared = 5 paid, 0 unpaid.
    expect(out.paidDays).toBe(5);
    expect(out.unpaidDays).toBe(0);
  });

  it('casual leave overflows to unpaid when credits + shared are exhausted', () => {
    // Pre-load 15 shared days used.
    const prior: TimeOffRequest = makeTimeOffRequest({
      memberId: 'm-1',
      start: '2026-02-02',
      end: '2026-02-20',
      status: 'approved',
      requestedAt: '2026-02-01',
    });
    prior.leaveType = 'emergency';
    prior.paidDays = 15;
    const out = computeLeaveBreakdown({
      leaveType: 'casual',
      start: '2026-05-11',
      end: '2026-05-15',
      member: regular,
      holidays: [],
      requests: [prior],
      creditBalance: 1,
      todayISO: '2026-05-12',
    });
    expect(out.workingDays).toBe(5);
    expect(out.creditDays).toBe(1);
    expect(out.paidDays).toBe(1);
    expect(out.unpaidDays).toBe(4);
  });
});
