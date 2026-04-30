import type {
  CreditExpiryPolicy,
  Holiday,
  HolidayObservation,
  Member,
  TimeOffRequest,
} from '../types/flizow';
import { holidayAppliesToCountry } from './holidays';

/**
 * Holiday transfer credits — pure helpers.
 *
 * The mental model: every member starts with 0 credits. They earn
 * +1 by working through a holiday they would otherwise have observed
 * (the OM flips their status from 'observed' to 'worked'). They
 * spend -1 by submitting a time-off request with `useTransferCredit`
 * set, which on approval deducts from their balance.
 *
 * Computed live from data — no separate ledger storage. The
 * earnings come from holidayObservations (status='worked'); the
 * spends come from timeOffRequests (status='approved' AND
 * useTransferCredit=true).
 *
 * Expiry: every credit gets a `validThrough` date computed from the
 * workspace's `creditExpiryPolicy`. Helpers below filter by the
 * window so an expired credit silently zeros out without needing
 * a cleanup pass.
 *
 * Phase 6C of the time-off system.
 */

// ── Observation resolution ─────────────────────────────────────────

/** Effective observation status for `(memberId, holidayId)` —
 *  consults the override list first, falls back to the holiday's
 *  workspace default. Returns 'observed' when the member's country
 *  doesn't apply (defensive: a credit can't accrue against a
 *  holiday that wasn't theirs to begin with). */
export function memberObservationFor(
  member: Pick<Member, 'id' | 'country'>,
  holiday: Holiday,
  overrides: ReadonlyArray<HolidayObservation>,
): 'observed' | 'worked' {
  if (!holidayAppliesToCountry(holiday, member.country)) return 'observed';
  const override = overrides.find(
    (o) => o.memberId === member.id && o.holidayId === holiday.id,
  );
  return override ? override.status : holiday.defaultObservation;
}

// ── Credit expiry ──────────────────────────────────────────────────

/** Date a credit earned on `earnedDate` expires under `policy`. ISO
 *  string return. 'never' returns a far-future sentinel so callers
 *  can compare uniformly. */
export function creditExpiryFor(
  earnedDate: string,
  policy: CreditExpiryPolicy,
): string {
  const [y, m, d] = earnedDate.split('-').map(Number);
  if (!y || !m || !d) return earnedDate;
  switch (policy) {
    case 'end-of-year':
      return `${y}-12-31`;
    case 'six-months':
      return offsetMonths(earnedDate, 6);
    case 'twelve-months':
      return offsetMonths(earnedDate, 12);
    case 'never':
      return '9999-12-31';
  }
}

function offsetMonths(iso: string, monthDelta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + monthDelta);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

// ── Earned + spent ─────────────────────────────────────────────────

export interface EarnedCredit {
  /** Stable id derived from holiday + member so the ledger row can
   *  use it as a React key. */
  id: string;
  holidayId: string;
  holidayName: string;
  /** ISO date the holiday was on (== earned date). */
  date: string;
  /** ISO date this credit expires. */
  validThrough: string;
}

export interface SpentCredit {
  id: string;
  requestId: string;
  /** ISO date the request was submitted (used to order in the
   *  ledger; for an approved request the order matches the
   *  request's start date). */
  date: string;
  /** Inclusive ISO range of the time-off period the credit funded. */
  start: string;
  end: string;
}

/** All credits a member has earned by working through holidays.
 *  Filter is countries-aware (only holidays that apply to the
 *  member's country count). Sorted by earned date ascending. */
export function earnedCreditsFor(
  member: Pick<Member, 'id' | 'country'>,
  holidays: ReadonlyArray<Holiday>,
  overrides: ReadonlyArray<HolidayObservation>,
  policy: CreditExpiryPolicy,
): EarnedCredit[] {
  const out: EarnedCredit[] = [];
  for (const h of holidays) {
    if (!h.active) continue;
    if (!holidayAppliesToCountry(h, member.country)) continue;
    const status = memberObservationFor(member, h, overrides);
    if (status !== 'worked') continue;
    out.push({
      id: `earned-${h.id}-${member.id}`,
      holidayId: h.id,
      holidayName: h.name,
      date: h.date,
      validThrough: creditExpiryFor(h.date, policy),
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** All credits a member has spent — approved time-off requests
 *  whose `useTransferCredit` flag is true. Pending or cancelled
 *  requests don't count (a credit isn't actually spent until the
 *  decision lands). Sorted by request start date. */
export function spentCreditsFor(
  member: Pick<Member, 'id'>,
  requests: ReadonlyArray<TimeOffRequest>,
): SpentCredit[] {
  return requests
    .filter(
      (r) =>
        r.memberId === member.id &&
        r.status === 'approved' &&
        r.useTransferCredit === true,
    )
    .map((r) => ({
      id: `spent-${r.id}`,
      requestId: r.id,
      date: r.start,
      start: r.start,
      end: r.end,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Balance ────────────────────────────────────────────────────────

/** Net credit balance available to a member as of `todayISO`.
 *  Earned − spent, after filtering out earned credits whose
 *  expiry has already passed. Intentional: an expired credit
 *  silently disappears; the user sees it in the ledger as
 *  "Expired Dec 31 2026" and the balance reflects only what's
 *  still claimable. */
export function creditBalanceFor(
  member: Pick<Member, 'id' | 'country'>,
  holidays: ReadonlyArray<Holiday>,
  overrides: ReadonlyArray<HolidayObservation>,
  requests: ReadonlyArray<TimeOffRequest>,
  policy: CreditExpiryPolicy,
  todayISO: string,
): number {
  const earned = earnedCreditsFor(member, holidays, overrides, policy)
    .filter((c) => c.validThrough >= todayISO).length;
  const spent = spentCreditsFor(member, requests).length;
  return earned - spent;
}

// ── Ledger view ────────────────────────────────────────────────────

export type CreditLedgerEntry =
  | { kind: 'earned'; date: string; credit: EarnedCredit; isExpired: boolean }
  | { kind: 'spent'; date: string; credit: SpentCredit };

/** Combined ledger of earned + spent entries, sorted by date.
 *  `isExpired` lets the renderer dim expired earnings without
 *  removing them from the historical view. */
export function memberCreditLedger(
  member: Pick<Member, 'id' | 'country'>,
  holidays: ReadonlyArray<Holiday>,
  overrides: ReadonlyArray<HolidayObservation>,
  requests: ReadonlyArray<TimeOffRequest>,
  policy: CreditExpiryPolicy,
  todayISO: string,
): CreditLedgerEntry[] {
  const earned = earnedCreditsFor(member, holidays, overrides, policy);
  const spent = spentCreditsFor(member, requests);
  const entries: CreditLedgerEntry[] = [];
  for (const c of earned) {
    entries.push({
      kind: 'earned',
      date: c.date,
      credit: c,
      isExpired: c.validThrough < todayISO,
    });
  }
  for (const c of spent) {
    entries.push({ kind: 'spent', date: c.date, credit: c });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

// ── Constructor ────────────────────────────────────────────────────

/** Build a HolidayObservation with the audit fields stamped. The
 *  store calls this from setHolidayObservation. */
export function makeHolidayObservation(input: {
  holidayId: string;
  memberId: string;
  status: 'observed' | 'worked';
  decidedBy: string;
}): HolidayObservation {
  return {
    id: `hobs-${input.holidayId}-${input.memberId}`,
    holidayId: input.holidayId,
    memberId: input.memberId,
    status: input.status,
    decidedAt: new Date().toISOString(),
    decidedBy: input.decidedBy,
  };
}
