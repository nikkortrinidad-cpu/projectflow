import { describe, it, expect } from 'vitest';
import { nextDueDate, summarizeRecurrence, defaultRule, dayOfWeekLabel } from '../utils/recurrence';
import type { Recurrence } from '../types/flizow';

describe('nextDueDate', () => {
  it('daily pattern: adds interval days', () => {
    const r: Recurrence = { pattern: 'daily', interval: 1 };
    expect(nextDueDate(r, '2026-05-04')).toBe('2026-05-05');
    expect(nextDueDate({ ...r, interval: 7 }, '2026-05-04')).toBe('2026-05-11');
  });

  it('weekly pattern with no byDay: adds 7*interval days', () => {
    const r: Recurrence = { pattern: 'weekly', interval: 1 };
    // 2026-05-04 is a Monday → next Monday is 2026-05-11.
    expect(nextDueDate(r, '2026-05-04')).toBe('2026-05-11');
    expect(nextDueDate({ ...r, interval: 2 }, '2026-05-04')).toBe('2026-05-18');
  });

  it('weekly with single byDay walks to that day next interval', () => {
    // Anchor: Tue 2026-05-05. byDay: Tuesday only. Next Tue: 2026-05-12.
    const r: Recurrence = { pattern: 'weekly', interval: 1, byDay: [2] };
    expect(nextDueDate(r, '2026-05-05')).toBe('2026-05-12');
  });

  it('weekly with multi-day mask picks the next day in the same week first', () => {
    // Anchor: Mon 2026-05-04. byDay: Mon, Wed, Fri. Next is Wed 2026-05-06.
    const r: Recurrence = { pattern: 'weekly', interval: 1, byDay: [1, 3, 5] };
    expect(nextDueDate(r, '2026-05-04')).toBe('2026-05-06');
  });

  it('weekly mask: jumps `interval` weeks when the current week is exhausted', () => {
    // Anchor: Fri 2026-05-08. byDay: Mon, Wed, Fri. Next slot is Mon
    // of the next interval-week (interval=1 → next Monday 2026-05-11).
    const r: Recurrence = { pattern: 'weekly', interval: 1, byDay: [1, 3, 5] };
    expect(nextDueDate(r, '2026-05-08')).toBe('2026-05-11');
  });

  it('weekly mask with interval=2: skips the in-between week', () => {
    // Anchor: Fri 2026-05-08. byDay: Mon. Interval 2 weeks. Should
    // land on Mon 2026-05-18, NOT 2026-05-11.
    const r: Recurrence = { pattern: 'weekly', interval: 2, byDay: [1] };
    expect(nextDueDate(r, '2026-05-08')).toBe('2026-05-18');
  });

  it('monthly pattern: rolls to the same day next month by default', () => {
    const r: Recurrence = { pattern: 'monthly', interval: 1 };
    expect(nextDueDate(r, '2026-05-15')).toBe('2026-06-15');
    expect(nextDueDate({ ...r, interval: 3 }, '2026-05-15')).toBe('2026-08-15');
  });

  it('monthly with byMonthDay overflow clamps to last day of the target month', () => {
    // Day 31 in February → clamp to 28 in 2026 (not a leap year).
    const r: Recurrence = { pattern: 'monthly', interval: 1, byMonthDay: 31 };
    expect(nextDueDate(r, '2026-01-31')).toBe('2026-02-28');
  });

  it('monthly across year boundary', () => {
    const r: Recurrence = { pattern: 'monthly', interval: 1, byMonthDay: 5 };
    expect(nextDueDate(r, '2026-12-05')).toBe('2027-01-05');
  });

  it('yearly pattern: adds interval years', () => {
    const r: Recurrence = { pattern: 'yearly', interval: 1 };
    expect(nextDueDate(r, '2026-05-04')).toBe('2027-05-04');
  });

  it('endsAt: returns null once the next computed date passes the end', () => {
    // Anchor 2026-05-25, weekly. End on 2026-05-31. Next would be
    // 2026-06-01 → past the end → null.
    const r: Recurrence = { pattern: 'weekly', interval: 1, endsAt: '2026-05-31' };
    expect(nextDueDate(r, '2026-05-25')).toBe(null);
  });

  it('endsAt: a next date equal to endsAt is allowed', () => {
    const r: Recurrence = { pattern: 'weekly', interval: 1, endsAt: '2026-05-11' };
    expect(nextDueDate(r, '2026-05-04')).toBe('2026-05-11');
  });

  it('returns null on garbage anchor', () => {
    const r: Recurrence = { pattern: 'daily', interval: 1 };
    expect(nextDueDate(r, '')).toBe(null);
    expect(nextDueDate(r, 'not-a-date')).toBe(null);
  });

  it('treats non-positive intervals as 1 (defensive)', () => {
    const r: Recurrence = { pattern: 'daily', interval: 0 };
    expect(nextDueDate(r, '2026-05-04')).toBe('2026-05-05');
  });
});

describe('summarizeRecurrence', () => {
  it('handles undefined cleanly', () => {
    expect(summarizeRecurrence(undefined)).toBe('');
  });

  it('daily presets', () => {
    expect(summarizeRecurrence({ pattern: 'daily', interval: 1 })).toBe('Repeats daily');
    expect(summarizeRecurrence({ pattern: 'daily', interval: 3 })).toBe('Repeats every 3 days');
  });

  it('weekly with single day', () => {
    expect(summarizeRecurrence({ pattern: 'weekly', interval: 1, byDay: [2] })).toBe('Weekly on Tue');
  });

  it('weekly with multiple days, sorted', () => {
    // Order in input shouldn't matter — output sorts.
    expect(summarizeRecurrence({ pattern: 'weekly', interval: 1, byDay: [5, 1, 3] }))
      .toBe('Weekly on Mon, Wed, Fri');
  });

  it('weekly with interval > 1', () => {
    expect(summarizeRecurrence({ pattern: 'weekly', interval: 2, byDay: [1] }))
      .toBe('Every 2 weeks on Mon');
  });

  it('monthly with byMonthDay uses ordinal', () => {
    expect(summarizeRecurrence({ pattern: 'monthly', interval: 1, byMonthDay: 1 }))
      .toBe('Monthly on the 1st');
    expect(summarizeRecurrence({ pattern: 'monthly', interval: 1, byMonthDay: 22 }))
      .toBe('Monthly on the 22nd');
    expect(summarizeRecurrence({ pattern: 'monthly', interval: 1, byMonthDay: 23 }))
      .toBe('Monthly on the 23rd');
    expect(summarizeRecurrence({ pattern: 'monthly', interval: 1, byMonthDay: 11 }))
      .toBe('Monthly on the 11th');
  });

  it('yearly default', () => {
    expect(summarizeRecurrence({ pattern: 'yearly', interval: 1 })).toBe('Repeats yearly');
  });

  it('appends end date when set', () => {
    const r: Recurrence = { pattern: 'weekly', interval: 1, byDay: [1], endsAt: '2026-12-31' };
    expect(summarizeRecurrence(r)).toMatch(/^Weekly on Mon, ends Dec 31, 2026$/);
  });

  it('prepends paused prefix', () => {
    const r: Recurrence = { pattern: 'daily', interval: 1, paused: true };
    expect(summarizeRecurrence(r)).toBe('Paused: Repeats daily');
  });
});

describe('defaultRule', () => {
  it('weekly seeds byDay to anchor weekday', () => {
    // 2026-05-05 is a Tuesday (day 2).
    expect(defaultRule('weekly', '2026-05-05')).toEqual({
      pattern: 'weekly', interval: 1, byDay: [2],
    });
  });

  it('monthly seeds byMonthDay to anchor day', () => {
    expect(defaultRule('monthly', '2026-05-15')).toEqual({
      pattern: 'monthly', interval: 1, byMonthDay: 15,
    });
  });

  it('daily and yearly carry no extras', () => {
    expect(defaultRule('daily', '2026-05-04')).toEqual({ pattern: 'daily', interval: 1 });
    expect(defaultRule('yearly', '2026-05-04')).toEqual({ pattern: 'yearly', interval: 1 });
  });
});

describe('dayOfWeekLabel', () => {
  it('full name', () => {
    expect(dayOfWeekLabel(0)).toBe('Sunday');
    expect(dayOfWeekLabel(2)).toBe('Tuesday');
  });

  it('short name', () => {
    expect(dayOfWeekLabel(1, true)).toBe('Mon');
    expect(dayOfWeekLabel(6, true)).toBe('Sat');
  });

  it('out-of-range returns empty', () => {
    expect(dayOfWeekLabel(-1)).toBe('');
    expect(dayOfWeekLabel(7)).toBe('');
  });
});
