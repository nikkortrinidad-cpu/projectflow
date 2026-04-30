/**
 * Coverage rules evaluator — unit tests.
 *
 * Pure logic only — no store, no React. Coverage targets the
 * boundary cases that are easiest to break:
 *   - All three `who` filter kinds (role / jobTitle / members)
 *   - Both constraint kinds (min-present, max-out)
 *   - `when` weekdays-only vs all
 *   - Vacuous satisfaction (empty scope)
 *   - Inactive rules ignored
 *   - Status filter (only approved time-off counts)
 *   - Multi-day requests count on every day in the period
 *   - Date-range iteration (every day evaluated, ordering preserved)
 *   - Multiple rules broken on the same day
 *
 * Phase 5 of the time-off rules engine.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateRules,
  evaluateRuleOnDate,
  membersInScope,
  isWeekday,
  datesBetween,
  groupConflictsByDate,
  groupConflictsByRule,
  makeCoverageRule,
} from '../utils/coverageRules';
import type {
  CoverageRule,
  Member,
  TimeOffRequest,
} from '../types/flizow';

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

// May 11 2026 is a Monday; May 16 2026 is a Saturday.
const MONDAY = '2026-05-11';
const TUESDAY = '2026-05-12';
const SATURDAY = '2026-05-16';
const SUNDAY = '2026-05-17';

// ── Date utilities ──────────────────────────────────────────────────

describe('isWeekday()', () => {
  it('returns true for Monday-Friday', () => {
    expect(isWeekday(MONDAY)).toBe(true);
    expect(isWeekday(TUESDAY)).toBe(true);
  });

  it('returns false for Saturday and Sunday', () => {
    expect(isWeekday(SATURDAY)).toBe(false);
    expect(isWeekday(SUNDAY)).toBe(false);
  });

  it('returns true defensively for malformed input', () => {
    // Caller bug, but we don't want to crash the whole evaluator.
    expect(isWeekday('not-a-date')).toBe(true);
  });
});

describe('datesBetween()', () => {
  it('expands inclusive range to ISO array', () => {
    expect(datesBetween('2026-05-10', '2026-05-12')).toEqual([
      '2026-05-10', '2026-05-11', '2026-05-12',
    ]);
  });

  it('returns single-element array for same-day range', () => {
    expect(datesBetween('2026-05-10', '2026-05-10')).toEqual(['2026-05-10']);
  });

  it('returns empty for inverted range', () => {
    expect(datesBetween('2026-05-12', '2026-05-10')).toEqual([]);
  });

  it('crosses month boundary cleanly', () => {
    expect(datesBetween('2026-05-30', '2026-06-02')).toEqual([
      '2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02',
    ]);
  });
});

// ── membersInScope ──────────────────────────────────────────────────

describe('membersInScope()', () => {
  const members: Member[] = [
    member({ id: 'sarah', accessLevel: 'admin', jobTitleId: 'jt-account-manager' }),
    member({ id: 'mike',  accessLevel: 'member', jobTitleId: 'jt-designer' }),
    member({ id: 'ann',   accessLevel: 'member', jobTitleId: 'jt-account-manager' }),
    member({ id: 'tom',   accessLevel: 'viewer' }), // no jobTitleId
  ];

  it('role filter matches Member.accessLevel', () => {
    const scope = membersInScope({ kind: 'role', roleIds: ['member'] }, members);
    expect(scope.map((m) => m.id).sort()).toEqual(['ann', 'mike']);
  });

  it('jobTitle filter matches Member.jobTitleId', () => {
    const scope = membersInScope(
      { kind: 'jobTitle', jobTitleIds: ['jt-account-manager'] },
      members,
    );
    expect(scope.map((m) => m.id).sort()).toEqual(['ann', 'sarah']);
  });

  it('members filter matches by id', () => {
    const scope = membersInScope(
      { kind: 'members', memberIds: ['sarah', 'mike'] },
      members,
    );
    expect(scope.map((m) => m.id).sort()).toEqual(['mike', 'sarah']);
  });

  it('returns empty when no members match', () => {
    const scope = membersInScope({ kind: 'role', roleIds: ['owner'] }, members);
    expect(scope).toEqual([]);
  });

  it('excludes members without accessLevel from role-kind matches', () => {
    // Legacy demo data has accessLevel undefined; deny by default.
    const noLevel: Member[] = [member({ id: 'legacy' })];
    expect(
      membersInScope({ kind: 'role', roleIds: ['admin'] }, noLevel),
    ).toEqual([]);
  });
});

// ── evaluateRuleOnDate (single-day, single-rule) ────────────────────

describe('evaluateRuleOnDate()', () => {
  const ams: Member[] = [
    member({ id: 'sarah', jobTitleId: 'jt-account-manager' }),
    member({ id: 'ann',   jobTitleId: 'jt-account-manager' }),
  ];
  const minOneAm = makeCoverageRule({
    id: 'cr-1',
    name: 'At least 1 AM present',
    who: { kind: 'jobTitle', jobTitleIds: ['jt-account-manager'] },
    constraint: { kind: 'min-present', count: 1 },
    when: 'weekdays',
  });

  it('min-present satisfied: enough members present', () => {
    const requests = [req({ memberId: 'sarah', start: MONDAY, end: MONDAY })];
    expect(evaluateRuleOnDate(minOneAm, MONDAY, ams, requests)).toBeNull();
  });

  it('min-present broken: not enough members present', () => {
    const requests = [
      req({ memberId: 'sarah', start: MONDAY, end: MONDAY }),
      req({ memberId: 'ann',   start: MONDAY, end: MONDAY }),
    ];
    const conflict = evaluateRuleOnDate(minOneAm, MONDAY, ams, requests);
    expect(conflict).not.toBeNull();
    expect(conflict?.expected).toBe(1);
    expect(conflict?.actual).toBe(0);
    expect(conflict?.membersOff.sort()).toEqual(['ann', 'sarah']);
  });

  it('max-out satisfied: not too many off', () => {
    const designers: Member[] = [
      member({ id: 'd1', jobTitleId: 'jt-designer' }),
      member({ id: 'd2', jobTitleId: 'jt-designer' }),
      member({ id: 'd3', jobTitleId: 'jt-designer' }),
    ];
    const cap = makeCoverageRule({
      id: 'cr-2',
      name: 'No more than 2 designers off',
      who: { kind: 'jobTitle', jobTitleIds: ['jt-designer'] },
      constraint: { kind: 'max-out', count: 2 },
      when: 'all',
    });
    const requests = [req({ memberId: 'd1', start: MONDAY, end: MONDAY })];
    expect(evaluateRuleOnDate(cap, MONDAY, designers, requests)).toBeNull();
  });

  it('max-out broken: too many off', () => {
    const designers: Member[] = [
      member({ id: 'd1', jobTitleId: 'jt-designer' }),
      member({ id: 'd2', jobTitleId: 'jt-designer' }),
      member({ id: 'd3', jobTitleId: 'jt-designer' }),
    ];
    const cap = makeCoverageRule({
      id: 'cr-2',
      name: 'No more than 1 designer off',
      who: { kind: 'jobTitle', jobTitleIds: ['jt-designer'] },
      constraint: { kind: 'max-out', count: 1 },
      when: 'all',
    });
    const requests = [
      req({ memberId: 'd1', start: MONDAY, end: MONDAY }),
      req({ memberId: 'd2', start: MONDAY, end: MONDAY }),
    ];
    const conflict = evaluateRuleOnDate(cap, MONDAY, designers, requests);
    expect(conflict).not.toBeNull();
    expect(conflict?.expected).toBe(1);
    expect(conflict?.actual).toBe(2);
  });

  it('when=weekdays skips Saturday and Sunday', () => {
    const requests = [
      req({ memberId: 'sarah', start: SATURDAY, end: SUNDAY }),
      req({ memberId: 'ann',   start: SATURDAY, end: SUNDAY }),
    ];
    expect(evaluateRuleOnDate(minOneAm, SATURDAY, ams, requests)).toBeNull();
    expect(evaluateRuleOnDate(minOneAm, SUNDAY,   ams, requests)).toBeNull();
  });

  it('when=all enforces on weekends too', () => {
    const allDays = makeCoverageRule({
      id: 'cr-3',
      name: 'AM coverage all week',
      who: { kind: 'jobTitle', jobTitleIds: ['jt-account-manager'] },
      constraint: { kind: 'min-present', count: 1 },
      when: 'all',
    });
    const requests = [
      req({ memberId: 'sarah', start: SATURDAY, end: SATURDAY }),
      req({ memberId: 'ann',   start: SATURDAY, end: SATURDAY }),
    ];
    expect(evaluateRuleOnDate(allDays, SATURDAY, ams, requests)).not.toBeNull();
  });

  it('inactive rules never fire', () => {
    const inactive = { ...minOneAm, active: false };
    const requests = [
      req({ memberId: 'sarah', start: MONDAY, end: MONDAY }),
      req({ memberId: 'ann',   start: MONDAY, end: MONDAY }),
    ];
    expect(evaluateRuleOnDate(inactive, MONDAY, ams, requests)).toBeNull();
  });

  it('vacuous satisfaction: empty scope produces no conflict', () => {
    const noTitled: Member[] = [member({ id: 'sarah' })]; // no jobTitleId
    const requests: TimeOffRequest[] = [];
    expect(evaluateRuleOnDate(minOneAm, MONDAY, noTitled, requests)).toBeNull();
  });

  it('only counts approved requests — pending/denied/cancelled ignored', () => {
    const requests = [
      req({ memberId: 'sarah', start: MONDAY, end: MONDAY, status: 'pending' }),
      req({ memberId: 'ann',   start: MONDAY, end: MONDAY, status: 'denied' }),
    ];
    // Both members are technically "submitted off" but neither is
    // approved — so 2 still present, rule satisfied.
    expect(evaluateRuleOnDate(minOneAm, MONDAY, ams, requests)).toBeNull();
  });

  it('multi-day request counts on every day in its range', () => {
    const requests = [
      req({ memberId: 'sarah', start: MONDAY, end: TUESDAY }),
      req({ memberId: 'ann',   start: MONDAY, end: TUESDAY }),
    ];
    expect(evaluateRuleOnDate(minOneAm, MONDAY, ams, requests)).not.toBeNull();
    expect(evaluateRuleOnDate(minOneAm, TUESDAY, ams, requests)).not.toBeNull();
  });

  it('members-kind filter scopes to a named subset', () => {
    const everyone: Member[] = [
      member({ id: 'sarah' }),
      member({ id: 'ann' }),
      member({ id: 'mike' }), // not in the named list
    ];
    const adamsSupport = makeCoverageRule({
      id: 'cr-4',
      name: 'At least 1 of Sarah/Ann present',
      who: { kind: 'members', memberIds: ['sarah', 'ann'] },
      constraint: { kind: 'min-present', count: 1 },
      when: 'all',
    });
    // Mike off doesn't matter — he's not in scope.
    const requests = [req({ memberId: 'mike', start: MONDAY, end: MONDAY })];
    expect(evaluateRuleOnDate(adamsSupport, MONDAY, everyone, requests)).toBeNull();
    // Sarah + Ann both off → broken.
    const requests2 = [
      req({ memberId: 'sarah', start: MONDAY, end: MONDAY }),
      req({ memberId: 'ann',   start: MONDAY, end: MONDAY }),
    ];
    expect(evaluateRuleOnDate(adamsSupport, MONDAY, everyone, requests2)).not.toBeNull();
  });
});

// ── evaluateRules (window-wide) ─────────────────────────────────────

describe('evaluateRules()', () => {
  const ams: Member[] = [
    member({ id: 'sarah', jobTitleId: 'jt-account-manager' }),
    member({ id: 'ann',   jobTitleId: 'jt-account-manager' }),
  ];
  const designers: Member[] = [
    member({ id: 'd1', jobTitleId: 'jt-designer' }),
    member({ id: 'd2', jobTitleId: 'jt-designer' }),
  ];

  it('returns empty array when there are no rules', () => {
    expect(
      evaluateRules({
        rules: [],
        members: ams,
        approvedRequests: [],
        start: MONDAY,
        end: TUESDAY,
      }),
    ).toEqual([]);
  });

  it('returns empty array when there are no dates', () => {
    expect(
      evaluateRules({
        rules: [
          makeCoverageRule({
            id: 'cr-1',
            name: 'Always need 1 AM',
            who: { kind: 'jobTitle', jobTitleIds: ['jt-account-manager'] },
            constraint: { kind: 'min-present', count: 1 },
            when: 'all',
          }),
        ],
        members: ams,
        approvedRequests: [],
        start: TUESDAY,
        end: MONDAY, // inverted
      }),
    ).toEqual([]);
  });

  it('reports a conflict per (rule, broken-day) pair', () => {
    const rule = makeCoverageRule({
      id: 'cr-1',
      name: 'Always need 1 AM',
      who: { kind: 'jobTitle', jobTitleIds: ['jt-account-manager'] },
      constraint: { kind: 'min-present', count: 1 },
      when: 'all',
    });
    const requests = [
      req({ memberId: 'sarah', start: MONDAY, end: TUESDAY }),
      req({ memberId: 'ann',   start: MONDAY, end: TUESDAY }),
    ];
    const out = evaluateRules({
      rules: [rule],
      members: [...ams, ...designers],
      approvedRequests: requests,
      start: MONDAY,
      end: TUESDAY,
    });
    expect(out).toHaveLength(2);
    expect(out[0].date).toBe(MONDAY);
    expect(out[1].date).toBe(TUESDAY);
  });

  it('multiple rules broken on the same day each surface as separate entries', () => {
    const ruleA = makeCoverageRule({
      id: 'cr-a',
      name: 'Always need 1 AM',
      who: { kind: 'jobTitle', jobTitleIds: ['jt-account-manager'] },
      constraint: { kind: 'min-present', count: 1 },
      when: 'all',
    });
    const ruleB = makeCoverageRule({
      id: 'cr-b',
      name: 'No more than 1 designer off',
      who: { kind: 'jobTitle', jobTitleIds: ['jt-designer'] },
      constraint: { kind: 'max-out', count: 1 },
      when: 'all',
    });
    const requests = [
      req({ memberId: 'sarah', start: MONDAY, end: MONDAY }),
      req({ memberId: 'ann',   start: MONDAY, end: MONDAY }),
      req({ memberId: 'd1',    start: MONDAY, end: MONDAY }),
      req({ memberId: 'd2',    start: MONDAY, end: MONDAY }),
    ];
    const out = evaluateRules({
      rules: [ruleA, ruleB],
      members: [...ams, ...designers],
      approvedRequests: requests,
      start: MONDAY,
      end: MONDAY,
    });
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.ruleId).sort()).toEqual(['cr-a', 'cr-b']);
  });

  it('preserves stable order: dates outer, rules inner', () => {
    // Two rules both broken across two days. Output should read
    // [day1-ruleA, day1-ruleB, day2-ruleA, day2-ruleB].
    const ruleA = makeCoverageRule({
      id: 'cr-a',
      name: 'A',
      who: { kind: 'jobTitle', jobTitleIds: ['jt-account-manager'] },
      constraint: { kind: 'min-present', count: 1 },
      when: 'all',
    });
    const ruleB = makeCoverageRule({
      id: 'cr-b',
      name: 'B',
      who: { kind: 'jobTitle', jobTitleIds: ['jt-designer'] },
      constraint: { kind: 'min-present', count: 1 },
      when: 'all',
    });
    const requests = [
      req({ memberId: 'sarah', start: MONDAY, end: TUESDAY }),
      req({ memberId: 'ann',   start: MONDAY, end: TUESDAY }),
      req({ memberId: 'd1',    start: MONDAY, end: TUESDAY }),
      req({ memberId: 'd2',    start: MONDAY, end: TUESDAY }),
    ];
    const out = evaluateRules({
      rules: [ruleA, ruleB],
      members: [...ams, ...designers],
      approvedRequests: requests,
      start: MONDAY,
      end: TUESDAY,
    });
    expect(out.map((c) => `${c.date}/${c.ruleId}`)).toEqual([
      `${MONDAY}/cr-a`, `${MONDAY}/cr-b`,
      `${TUESDAY}/cr-a`, `${TUESDAY}/cr-b`,
    ]);
  });
});

// ── Grouping helpers ───────────────────────────────────────────────

describe('groupConflictsByDate() / groupConflictsByRule()', () => {
  const conflicts = [
    { ruleId: 'a', ruleName: 'A', date: MONDAY, expected: 1, actual: 0, membersInScope: [], membersOff: [] },
    { ruleId: 'b', ruleName: 'B', date: MONDAY, expected: 1, actual: 0, membersInScope: [], membersOff: [] },
    { ruleId: 'a', ruleName: 'A', date: TUESDAY, expected: 1, actual: 0, membersInScope: [], membersOff: [] },
  ];

  it('groupConflictsByDate buckets by ISO date', () => {
    const map = groupConflictsByDate(conflicts);
    expect(map.get(MONDAY)?.length).toBe(2);
    expect(map.get(TUESDAY)?.length).toBe(1);
  });

  it('groupConflictsByRule buckets by rule id', () => {
    const map = groupConflictsByRule(conflicts);
    expect(map.get('a')?.length).toBe(2);
    expect(map.get('b')?.length).toBe(1);
  });
});

// ── Constructor ────────────────────────────────────────────────────

describe('makeCoverageRule()', () => {
  it('defaults active=true and when=weekdays', () => {
    const r = makeCoverageRule({
      name: 'Test',
      who: { kind: 'role', roleIds: ['admin'] },
      constraint: { kind: 'min-present', count: 1 },
    });
    expect(r.active).toBe(true);
    expect(r.when).toBe('weekdays');
    expect(r.id).toMatch(/^cr-/);
  });

  it('honours explicit overrides', () => {
    const r = makeCoverageRule({
      id: 'cr-fixed',
      name: 'Fixed',
      who: { kind: 'role', roleIds: ['admin'] },
      constraint: { kind: 'max-out', count: 2 },
      when: 'all',
      active: false,
    });
    expect(r.id).toBe('cr-fixed');
    expect(r.active).toBe(false);
    expect(r.when).toBe('all');
  });
});
