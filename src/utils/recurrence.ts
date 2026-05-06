/**
 * Recurrence math for Task / OpsTask cards. Pure functions only — the
 * store wires `nextDueDate()` into the move-to-Done hook to spawn the
 * next instance. The card modal uses `summarizeRecurrence()` for the
 * plain-language line under the Repeat field, and `defaultRule()` to
 * seed the picker presets.
 *
 * Date convention: ISO calendar date strings (YYYY-MM-DD), not full
 * timestamps. Recurrence is a calendar-day concept; treating the
 * anchor as a local-day Date avoids timezone drift around midnight.
 */

import type { Recurrence } from '../types/flizow';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Parse a YYYY-MM-DD string into a local-midnight Date. Returns null
 *  on garbage input — callers are responsible for handling that case. */
function parseISODate(iso: string): Date | null {
  if (!iso) return null;
  // Build via component constructor so the resulting Date is in local
  // time at midnight. `new Date('2026-05-04')` would parse as UTC and
  // then drift by the user's offset on serialisation.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]); const mon = Number(m[2]); const day = Number(m[3]);
  const d = new Date(y, mon - 1, day);
  return isNaN(d.getTime()) ? null : d;
}

/** Format a Date as YYYY-MM-DD using local components. Mirrors how the
 *  rest of the app stores calendar-day fields (Task.dueDate, etc.). */
function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Last day of the month containing `d`. Used to clamp byMonthDay when
 *  the requested day overflows (e.g. day 31 in February). */
function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of the current month.
  return new Date(year, month + 1, 0).getDate();
}

/** Given a rule and an anchor (typically the previous due date), return
 *  the next due date as an ISO string, or null if the rule has already
 *  ended. Pure — no side effects, no `today` reads. */
export function nextDueDate(rule: Recurrence, anchorISO: string): string | null {
  const anchor = parseISODate(anchorISO);
  if (!anchor) return null;
  const interval = Math.max(1, Math.floor(rule.interval ?? 1));

  let next: Date;

  switch (rule.pattern) {
    case 'daily':
      next = new Date(anchor);
      next.setDate(next.getDate() + interval);
      break;

    case 'weekly':
      next = nextWeekly(anchor, interval, rule.byDay);
      break;

    case 'monthly':
      next = nextMonthly(anchor, interval, rule.byMonthDay);
      break;

    case 'yearly':
      next = new Date(anchor);
      next.setFullYear(next.getFullYear() + interval);
      break;
  }

  // Honour endsAt. The rule lives only while the next computed date
  // is on or before the end. Strict-after means an end date IS a valid
  // last occurrence.
  if (rule.endsAt) {
    const end = parseISODate(rule.endsAt);
    if (end && next.getTime() > end.getTime()) return null;
  }

  return formatISODate(next);
}

/** Weekly walk. byDay is a mask of weekday numbers (0..6, Sun..Sat).
 *  Empty / absent means "same weekday as the anchor, jump `interval`
 *  weeks". With a mask: find the next weekday in the mask that comes
 *  after the anchor's weekday this week; if the mask is exhausted for
 *  the current week, jump `interval` weeks and pick the first day in
 *  the mask. */
function nextWeekly(anchor: Date, interval: number, byDay: number[] | undefined): Date {
  if (!byDay || byDay.length === 0) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 7 * interval);
    return d;
  }
  // Sort + dedupe + clamp into 0..6 for safety. A bad input (e.g. 9)
  // would otherwise compute a wild offset.
  const days = Array.from(new Set(byDay))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
  if (days.length === 0) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 7 * interval);
    return d;
  }
  const anchorDow = anchor.getDay();
  // Same week, later day?
  const laterThisWeek = days.find(d => d > anchorDow);
  if (laterThisWeek !== undefined) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + (laterThisWeek - anchorDow));
    return d;
  }
  // Otherwise: jump `interval` weeks ahead and pick the first day in mask.
  const first = days[0];
  // Move to the start of next "interval week", then add the offset
  // from Sunday (day 0) to `first`.
  const d = new Date(anchor);
  d.setDate(d.getDate() + (7 * interval) - anchorDow + first);
  return d;
}

/** Monthly walk. byMonthDay is the target day (1..31). Falls back to
 *  the anchor's day-of-month when absent. Clamps to the last day of
 *  the month when the target overflows (e.g. 31 in Feb). */
function nextMonthly(anchor: Date, interval: number, byMonthDay: number | undefined): Date {
  const targetDay = byMonthDay && byMonthDay >= 1 && byMonthDay <= 31
    ? Math.floor(byMonthDay)
    : anchor.getDate();
  const targetMonth = anchor.getMonth() + interval;
  const targetYear = anchor.getFullYear() + Math.floor(targetMonth / 12);
  const wrappedMonth = ((targetMonth % 12) + 12) % 12;
  const clampedDay = Math.min(targetDay, lastDayOfMonth(targetYear, wrappedMonth));
  return new Date(targetYear, wrappedMonth, clampedDay);
}

/** Plain-language line for the card modal ("Weekly on Tuesday", etc.).
 *  When the rule is paused, prepends "Paused — ". Used only for
 *  display; safe to call on any well-formed rule. */
export function summarizeRecurrence(rule: Recurrence | undefined): string {
  if (!rule) return '';
  const interval = Math.max(1, Math.floor(rule.interval ?? 1));
  const prefix = rule.paused ? 'Paused: ' : '';
  let body: string;

  switch (rule.pattern) {
    case 'daily':
      body = interval === 1 ? 'Repeats daily' : `Repeats every ${interval} days`;
      break;
    case 'weekly':
      body = summarizeWeekly(interval, rule.byDay);
      break;
    case 'monthly':
      body = summarizeMonthly(interval, rule.byMonthDay);
      break;
    case 'yearly':
      body = interval === 1 ? 'Repeats yearly' : `Repeats every ${interval} years`;
      break;
  }

  if (rule.endsAt) {
    const end = parseISODate(rule.endsAt);
    if (end) {
      const fmt = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      body += `, ends ${fmt}`;
    }
  }

  return prefix + body;
}

function summarizeWeekly(interval: number, byDay: number[] | undefined): string {
  const days = (byDay ?? [])
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
  const dayList = days.length
    ? days.map(d => DAY_NAMES_SHORT[d]).join(', ')
    : '';
  if (interval === 1) {
    if (!dayList) return 'Repeats weekly';
    return `Weekly on ${dayList}`;
  }
  if (!dayList) return `Repeats every ${interval} weeks`;
  return `Every ${interval} weeks on ${dayList}`;
}

function summarizeMonthly(interval: number, byMonthDay: number | undefined): string {
  const day = byMonthDay && byMonthDay >= 1 && byMonthDay <= 31
    ? ordinal(Math.floor(byMonthDay))
    : null;
  if (interval === 1) {
    if (!day) return 'Repeats monthly';
    return `Monthly on the ${day}`;
  }
  if (!day) return `Repeats every ${interval} months`;
  return `Every ${interval} months on the ${day}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Sensible defaults for each preset in the picker. The anchor is
 *  typically the card's current dueDate (or today if it's not set yet)
 *  so "Weekly on <today's day>" comes out pre-filled. */
export function defaultRule(
  pattern: Recurrence['pattern'],
  anchorISO: string,
): Recurrence {
  const anchor = parseISODate(anchorISO) ?? new Date();
  switch (pattern) {
    case 'daily':
      return { pattern: 'daily', interval: 1 };
    case 'weekly':
      return { pattern: 'weekly', interval: 1, byDay: [anchor.getDay()] };
    case 'monthly':
      return { pattern: 'monthly', interval: 1, byMonthDay: anchor.getDate() };
    case 'yearly':
      return { pattern: 'yearly', interval: 1 };
  }
}

/** Display name for a weekday number. Used by the picker's chip row. */
export function dayOfWeekLabel(n: number, short = false): string {
  if (n < 0 || n > 6) return '';
  return short ? DAY_NAMES_SHORT[n] : DAY_NAMES[n];
}
