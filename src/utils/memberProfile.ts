import type { Member, TimeOffRequest } from '../types/flizow';
import { currentApprovedPeriod } from './timeOff';

/**
 * Pure helpers for rendering and querying Member profile data.
 *
 * Lifted out of MemberProfilePanel.tsx so the deterministic pieces
 * (vacation status, time/day formatters, working-hours line) get
 * unit-test coverage without spinning up a React renderer.
 *
 * Kept separate from utils/capacity.ts because capacity is about
 * slot math; these are about identity/profile presentation.
 */

// ── Vacation status ────────────────────────────────────────────────────

/**
 * Find the vacation period (if any) that `todayISO` falls inside.
 * Returns the matching `{ start, end }` entry from the workspace's
 * approved time-off ledger, or null when the member is not on
 * vacation today.
 *
 * Bounds are inclusive on both sides — a period starting today
 * counts as "on vacation today" and a period ending today still
 * counts (returning tomorrow). Matches user mental model where
 * "I'm out from May 13 to May 15" includes both endpoints.
 *
 * Phase-3 update: now reads from the workspace `timeOffRequests`
 * collection instead of the deprecated `Member.timeOff` array.
 * Only approved entries count — pending requests don't render the
 * pill, denied/cancelled never count. The legacy `Member.timeOff`
 * field is consulted as a back-compat fallback for any reader that
 * runs before the migration sweep has cleared the field.
 */
export function currentVacationPeriod(
  member: Member,
  todayISO: string,
  timeOffRequests?: ReadonlyArray<TimeOffRequest>,
): { start: string; end: string } | null {
  // Preferred path: read from the workspace ledger.
  if (timeOffRequests && timeOffRequests.length > 0) {
    const r = currentApprovedPeriod(timeOffRequests, member.id, todayISO);
    if (r) return { start: r.start, end: r.end };
  }
  // Back-compat fallback for any caller that hasn't been swept to
  // pass the workspace-level ledger yet, or for pre-migration reads.
  if (!member.timeOff || member.timeOff.length === 0) return null;
  for (const period of member.timeOff) {
    if (todayISO >= period.start && todayISO <= period.end) {
      return period;
    }
  }
  return null;
}

/** True iff the member has a vacation period covering todayISO.
 *  Pass `timeOffRequests` when calling from a workspace context;
 *  the helper falls back to the legacy `Member.timeOff` array
 *  when omitted. */
export function isOnVacation(
  member: Member,
  todayISO: string,
  timeOffRequests?: ReadonlyArray<TimeOffRequest>,
): boolean {
  return currentVacationPeriod(member, todayISO, timeOffRequests) !== null;
}

// ── Time-of-day formatting ─────────────────────────────────────────────

/**
 * "09:00" → "9:00 AM". Returns null when the input doesn't match
 * the HH:mm shape — defensive against older data or hand-typed
 * values that shouldn't crash the panel.
 *
 * Hour boundary cases: 00:00 → "12:00 AM" and 12:00 → "12:00 PM"
 * to match conventional 12-hour reading.
 */
export function formatTime12h(hhmm: string | undefined): string | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2];
  if (h < 0 || h > 23) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${min} ${period}`;
}

// ── Working days formatting ────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Format a working-days array as a human label.
 *   [1,2,3,4,5]      → "Mon–Fri"  (single contiguous span)
 *   [1,2,3,4]        → "Mon–Thu"
 *   [1,3,5]          → "Mon · Wed · Fri"  (non-contiguous → bullet list)
 *   [0,1,2,3,4,5,6]  → "Every day"
 *   []               → "No working days set"
 *   undefined        → defaults to weekdays (per the type doc)
 *
 * Defensive: dedupes and sorts before formatting so an out-of-order
 * or duplicate-laden input still produces a sensible label.
 */
export function formatWorkingDays(days: number[] | undefined): string {
  const list = days ?? [1, 2, 3, 4, 5];
  if (list.length === 0) return 'No working days set';
  const sorted = Array.from(new Set(list)).sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  // Detect a single contiguous run.
  let isContiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      isContiguous = false;
      break;
    }
  }
  if (isContiguous && sorted.length >= 2) {
    return `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length - 1]]}`;
  }
  return sorted.map(d => DAY_NAMES[d]).join(' · ');
}

// ── Time zone formatting ───────────────────────────────────────────────

/**
 * "America/Los_Angeles" → "Los Angeles" (city only). Used in the
 * Contact section as a clear, full-city display.
 *
 * Defensive: an input without a slash falls through unchanged
 * (with underscores still replaced by spaces).
 */
export function formatTimeZone(iana: string): string {
  const slash = iana.lastIndexOf('/');
  const city = slash >= 0 ? iana.slice(slash + 1) : iana;
  return city.replace(/_/g, ' ');
}

/**
 * Short tz abbreviation for the working-hours line. Tries Intl
 * first ("PT", "ET"); falls back to the city name if Intl can't
 * resolve it (older browsers, invalid IANA strings).
 */
export function formatTimeZoneShort(iana: string): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'short',
    });
    const parts = dtf.formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart) return tzPart.value;
  } catch {
    // fall through
  }
  return formatTimeZone(iana);
}

// ── Composite line ─────────────────────────────────────────────────────

/**
 * Build the full "Mon–Fri, 9:00 AM – 6:00 PM PT" line. Returns null
 * when none of the structured fields are set so the section hides
 * cleanly. Time zone is the short abbreviation rather than the
 * full city name to keep the line compact.
 */
export function formatWorkingHoursLine(member: Member): string | null {
  const start = formatTime12h(member.workingHoursStart);
  const end = formatTime12h(member.workingHoursEnd);
  const days = member.workingDays;
  // If no times AND no days override, nothing to show.
  if (!start && !end && !days) return null;
  const dayPart = formatWorkingDays(days);
  const timePart = start && end ? `${start} – ${end}` : start || end;
  if (!timePart) return dayPart;
  const tzPart = member.ianaTimeZone ? ` ${formatTimeZoneShort(member.ianaTimeZone)}` : '';
  return `${dayPart}, ${timePart}${tzPart}`;
}

/**
 * ISO date "2026-05-15" → "May 15". Used in the vacation pill so
 * the user reads "back May 15" not "back 2026-05-15". Falls back
 * to the raw input for unparseable dates.
 */
export function formatReturnDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
