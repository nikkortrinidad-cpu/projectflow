/**
 * Holiday transfer credits — unit tests.
 *
 * Coverage:
 *   - memberObservationFor: override beats default; country
 *     mismatch falls back to 'observed'.
 *   - earnedCreditsFor: only 'worked' overrides count, country-
 *     filtered, sorted by date.
 *   - spentCreditsFor: only approved + useTransferCredit count.
 *   - creditBalanceFor: earned − spent, expired credits drop.
 *   - creditExpiryFor: end-of-year / six-months / twelve-months /
 *     never produce sensible boundaries.
 *   - memberCreditLedger: combines + sorts + flags expired.
 *
 * Phase 6C of the time-off system.
 */

import { describe, it, expect } from 'vitest';
import {
  memberObservationFor,
  creditExpiryFor,
  earnedCreditsFor,
  spentCreditsFor,
  creditBalanceFor,
  memberCreditLedger,
  makeHolidayObservation,
} from '../utils/holidayCredits';
import type {
  Holiday,
  HolidayObservation,
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
  country: 'PH',
  ...overrides,
});

const holiday = (overrides: Partial<Holiday> = {}): Holiday => ({
  id: `hol-${Math.random().toString(36).slice(2, 9)}`,
  name: 'Test holiday',
  date: '2026-05-01',
  country: 'PH',
  type: 'public',
  defaultObservation: 'observed',
  active: true,
  ...overrides,
});

const observation = (overrides: Partial<HolidayObservation> = {}): HolidayObservation => ({
  id: `hobs-${Math.random().toString(36).slice(2, 9)}`,
  holidayId: 'hol-test',
  memberId: 'm-1',
  status: 'worked',
  decidedAt: '2026-05-02T10:00:00Z',
  decidedBy: 'admin',
  ...overrides,
});

const req = (overrides: Partial<TimeOffRequest> = {}): TimeOffRequest => ({
  id: `tor-${Math.random().toString(36).slice(2, 9)}`,
  memberId: 'm-1',
  start: '2026-06-01',
  end: '2026-06-03',
  status: 'approved',
  requestedAt: '2026-05-20T10:00:00Z',
  ...overrides,
});

// ── memberObservationFor ────────────────────────────────────────────

describe('memberObservationFor()', () => {
  it("returns the override when one exists", () => {
    const h = holiday({ id: 'h1', defaultObservation: 'observed' });
    const overrides = [observation({ holidayId: 'h1', memberId: 'm-1', status: 'worked' })];
    expect(memberObservationFor(member(), h, overrides)).toBe('worked');
  });

  it("falls back to the holiday's default when no override", () => {
    const h = holiday({ id: 'h1', defaultObservation: 'worked' });
    expect(memberObservationFor(member(), h, [])).toBe('worked');
  });

  it("returns 'observed' when the holiday's country doesn't apply", () => {
    const m = member({ country: 'AU' });
    const h = holiday({ country: 'PH', defaultObservation: 'worked' });
    // Even with default 'worked', a non-applicable holiday counts
    // as 'observed' (no credit accrual).
    expect(memberObservationFor(m, h, [])).toBe('observed');
  });

  it("returns 'observed' when member has no country tag", () => {
    const m = member({ country: undefined });
    const h = holiday({ country: 'PH', defaultObservation: 'worked' });
    expect(memberObservationFor(m, h, [])).toBe('observed');
  });
});

// ── creditExpiryFor ─────────────────────────────────────────────────

describe('creditExpiryFor()', () => {
  it('end-of-year returns Dec 31 of the earned year', () => {
    expect(creditExpiryFor('2026-05-01', 'end-of-year')).toBe('2026-12-31');
    expect(creditExpiryFor('2026-12-30', 'end-of-year')).toBe('2026-12-31');
  });

  it('six-months adds six months', () => {
    expect(creditExpiryFor('2026-05-01', 'six-months')).toBe('2026-11-01');
  });

  it('twelve-months adds twelve months', () => {
    expect(creditExpiryFor('2026-05-01', 'twelve-months')).toBe('2027-05-01');
  });

  it('never returns a far-future sentinel', () => {
    expect(creditExpiryFor('2026-05-01', 'never')).toBe('9999-12-31');
  });
});

// ── earnedCreditsFor ────────────────────────────────────────────────

describe('earnedCreditsFor()', () => {
  it('returns one credit per holiday the member worked through', () => {
    const m = member({ id: 'sarah', country: 'PH' });
    const holidays = [
      holiday({ id: 'h1', date: '2026-05-01', country: 'PH' }),
      holiday({ id: 'h2', date: '2026-06-12', country: 'PH' }),
    ];
    const overrides = [
      observation({ holidayId: 'h1', memberId: 'sarah', status: 'worked' }),
      observation({ holidayId: 'h2', memberId: 'sarah', status: 'worked' }),
    ];
    const earned = earnedCreditsFor(m, holidays, overrides, 'end-of-year');
    expect(earned).toHaveLength(2);
    expect(earned[0].holidayId).toBe('h1');
    expect(earned[0].validThrough).toBe('2026-12-31');
  });

  it("doesn't count 'observed' overrides", () => {
    const m = member({ id: 'sarah', country: 'PH' });
    const holidays = [holiday({ id: 'h1', defaultObservation: 'worked' })];
    const overrides = [
      observation({ holidayId: 'h1', memberId: 'sarah', status: 'observed' }),
    ];
    expect(earnedCreditsFor(m, holidays, overrides, 'end-of-year')).toEqual([]);
  });

  it("excludes holidays that don't apply to the member's country", () => {
    const m = member({ id: 'sarah', country: 'PH' });
    const holidays = [holiday({ id: 'h1', country: 'AU' })];
    const overrides = [
      observation({ holidayId: 'h1', memberId: 'sarah', status: 'worked' }),
    ];
    // PH member with AU holiday override — doesn't earn a credit
    // (cannot accrue against a holiday that wasn't theirs).
    expect(earnedCreditsFor(m, holidays, overrides, 'end-of-year')).toEqual([]);
  });

  it("doesn't count archived holidays", () => {
    const m = member();
    const holidays = [holiday({ id: 'h1', active: false })];
    const overrides = [observation({ holidayId: 'h1', memberId: 'm-1', status: 'worked' })];
    expect(earnedCreditsFor(m, holidays, overrides, 'end-of-year')).toEqual([]);
  });
});

// ── spentCreditsFor ─────────────────────────────────────────────────

describe('spentCreditsFor()', () => {
  it('returns one entry per approved + useTransferCredit request', () => {
    const m = member({ id: 'sarah' });
    const requests = [
      req({ id: 'r1', memberId: 'sarah', status: 'approved', useTransferCredit: true }),
      req({ id: 'r2', memberId: 'sarah', status: 'approved', useTransferCredit: false }),
      req({ id: 'r3', memberId: 'sarah', status: 'pending',  useTransferCredit: true }),
      req({ id: 'r4', memberId: 'sarah', status: 'denied',   useTransferCredit: true }),
      req({ id: 'r5', memberId: 'sarah', status: 'cancelled', useTransferCredit: true }),
    ];
    const spent = spentCreditsFor(m, requests);
    expect(spent).toHaveLength(1);
    expect(spent[0].requestId).toBe('r1');
  });

  it("doesn't count another member's spends", () => {
    const m = member({ id: 'sarah' });
    const requests = [
      req({ memberId: 'mike', status: 'approved', useTransferCredit: true }),
    ];
    expect(spentCreditsFor(m, requests)).toEqual([]);
  });
});

// ── creditBalanceFor ────────────────────────────────────────────────

describe('creditBalanceFor()', () => {
  it('returns earned − spent for the active window', () => {
    const m = member({ id: 'sarah', country: 'PH' });
    const holidays = [
      holiday({ id: 'h1', date: '2026-05-01' }),
      holiday({ id: 'h2', date: '2026-06-12' }),
    ];
    const overrides = [
      observation({ holidayId: 'h1', memberId: 'sarah', status: 'worked' }),
      observation({ holidayId: 'h2', memberId: 'sarah', status: 'worked' }),
    ];
    const requests = [
      req({ memberId: 'sarah', status: 'approved', useTransferCredit: true }),
    ];
    expect(
      creditBalanceFor(m, holidays, overrides, requests, 'end-of-year', '2026-07-01'),
    ).toBe(1); // 2 earned − 1 spent
  });

  it('drops expired credits from the balance', () => {
    const m = member({ id: 'sarah', country: 'PH' });
    // Earned May 1 2026; expires Dec 31 2026.
    const holidays = [holiday({ id: 'h1', date: '2026-05-01' })];
    const overrides = [
      observation({ holidayId: 'h1', memberId: 'sarah', status: 'worked' }),
    ];
    // Today is Jan 1 2027 — credit has expired.
    expect(
      creditBalanceFor(m, holidays, overrides, [], 'end-of-year', '2027-01-01'),
    ).toBe(0);
  });

  it('returns 0 for a member with no earned + no spent', () => {
    expect(
      creditBalanceFor(member(), [], [], [], 'end-of-year', '2026-05-15'),
    ).toBe(0);
  });
});

// ── memberCreditLedger ──────────────────────────────────────────────

describe('memberCreditLedger()', () => {
  it('combines earned + spent into a single date-sorted list', () => {
    const m = member({ id: 'sarah', country: 'PH' });
    const holidays = [
      holiday({ id: 'h1', name: 'Labor Day', date: '2026-05-01' }),
      holiday({ id: 'h2', name: 'Indep Day', date: '2026-06-12' }),
    ];
    const overrides = [
      observation({ holidayId: 'h1', memberId: 'sarah', status: 'worked' }),
      observation({ holidayId: 'h2', memberId: 'sarah', status: 'worked' }),
    ];
    const requests = [
      req({
        id: 'r1',
        memberId: 'sarah',
        start: '2026-05-15',
        end: '2026-05-15',
        status: 'approved',
        useTransferCredit: true,
      }),
    ];
    const ledger = memberCreditLedger(
      m, holidays, overrides, requests, 'end-of-year', '2026-07-01',
    );
    expect(ledger).toHaveLength(3);
    expect(ledger[0].kind).toBe('earned');           // May 1
    expect(ledger[1].kind).toBe('spent');            // May 15
    expect(ledger[2].kind).toBe('earned');           // Jun 12
  });

  it('flags expired earned entries', () => {
    const m = member({ id: 'sarah', country: 'PH' });
    const holidays = [holiday({ id: 'h1', date: '2025-05-01' })];
    const overrides = [
      observation({ holidayId: 'h1', memberId: 'sarah', status: 'worked' }),
    ];
    const ledger = memberCreditLedger(
      m, holidays, overrides, [], 'end-of-year', '2026-05-15',
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].kind).toBe('earned');
    if (ledger[0].kind === 'earned') {
      expect(ledger[0].isExpired).toBe(true);
    }
  });
});

// ── makeHolidayObservation ──────────────────────────────────────────

describe('makeHolidayObservation()', () => {
  it('builds a deterministic id from holiday + member', () => {
    const o = makeHolidayObservation({
      holidayId: 'h1',
      memberId: 'm-1',
      status: 'worked',
      decidedBy: 'admin',
    });
    expect(o.id).toBe('hobs-h1-m-1');
    expect(o.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(o.decidedBy).toBe('admin');
  });
});
