import type { Holiday, HolidayCountry, Member, MemberCountry } from '../types/flizow';

/**
 * Holiday helpers — pure read functions over FlizowData.holidays.
 *
 * Phase 6B ships display-only functionality:
 *   - Filter holidays for a member's country (PH-tagged sees PH,
 *     AU-tagged sees AU + national, Other sees nothing)
 *   - Find holidays on a specific date (for the calendar ribbon)
 *   - Filter by date range (for the month view)
 *
 * Phase 6C will add the per-member observation override + transfer
 * credit logic on top; the read primitives here stay the same.
 *
 * Audit: time-off Phase 6B.
 */

// ── Country mapping ────────────────────────────────────────────────

/** A holiday's country matches a member's country when:
 *    - the country tags are equal, OR
 *    - the holiday is tagged 'global' (everyone observes it).
 *  Members tagged 'Other' don't see PH or AU holidays — they
 *  observe via individual time-off requests. */
export function holidayAppliesToCountry(
  holiday: Holiday,
  country: MemberCountry | undefined,
): boolean {
  if (!country || country === 'Other') return false;
  if (holiday.country === 'global') return true;
  // PH/AU match exactly.
  return (holiday.country as string) === country;
}

/** All active holidays that apply to this country (PH/AU/Other).
 *  Sorted by date ascending. Inactive holidays excluded — the OM
 *  archived them, so the calendar shouldn't render them. */
export function holidaysForCountry(
  holidays: ReadonlyArray<Holiday>,
  country: MemberCountry | undefined,
): Holiday[] {
  return holidays
    .filter((h) => h.active && holidayAppliesToCountry(h, country))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Date queries ───────────────────────────────────────────────────

/** Holidays on a specific ISO date. Optionally filtered by country.
 *  Used by the schedules calendar to render the per-day ribbon. */
export function holidaysOnDate(
  holidays: ReadonlyArray<Holiday>,
  dateISO: string,
  country?: MemberCountry,
): Holiday[] {
  return holidays.filter(
    (h) =>
      h.active &&
      h.date === dateISO &&
      (country === undefined || holidayAppliesToCountry(h, country)),
  );
}

/** Holidays inside an inclusive date range. Sorted ascending.
 *  Used by the month view + the rules engine (Phase 6C may give
 *  rules a "respect holidays" toggle that makes them not fire on
 *  observed days). */
export function holidaysInRange(
  holidays: ReadonlyArray<Holiday>,
  startISO: string,
  endISO: string,
  country?: MemberCountry,
): Holiday[] {
  return holidays
    .filter(
      (h) =>
        h.active &&
        h.date >= startISO &&
        h.date <= endISO &&
        (country === undefined || holidayAppliesToCountry(h, country)),
    )
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Country tag helpers ────────────────────────────────────────────

/** Resolve which countries a list of members spans. The schedules
 *  calendar uses this to decide which holidays to render — if the
 *  workspace is PH-only, AU holidays don't paint, even if they're
 *  in the catalog. */
export function countriesInUse(
  members: ReadonlyArray<Member>,
): Set<MemberCountry> {
  const out = new Set<MemberCountry>();
  for (const m of members) {
    if (m.country) out.add(m.country);
  }
  return out;
}

/** Distinct list of holidays visible on the calendar given the
 *  workspace's member country mix. PH-only workspaces don't see AU
 *  entries; mixed workspaces see both. Sorted by date. */
export function visibleHolidays(
  holidays: ReadonlyArray<Holiday>,
  members: ReadonlyArray<Member>,
): Holiday[] {
  const countries = countriesInUse(members);
  if (countries.size === 0) return [];
  return holidays
    .filter((h) => h.active && (
      h.country === 'global' ||
      countries.has(h.country as MemberCountry)
    ))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Display ────────────────────────────────────────────────────────

/** Two-letter country flag for display in the calendar ribbon.
 *  Plain text, not emoji — keeps the visual language consistent
 *  with the rest of the app's chrome. */
export function countryShortLabel(country: HolidayCountry): string {
  switch (country) {
    case 'PH': return 'PH';
    case 'AU': return 'AU';
    case 'global': return '🌐';
  }
}

/** Choose a tint for the holiday ribbon. Different tints per
 *  country so a calendar with mixed PH/AU members reads at a
 *  glance which country is observing. Soft pastels — these run
 *  alongside conflict highlights, so they shouldn't shout. */
export function countryTint(country: HolidayCountry): string {
  switch (country) {
    case 'PH': return 'rgba(241, 90, 36, 0.18)';   // brand orange tint
    case 'AU': return 'rgba(48, 209, 88, 0.18)';   // green tint
    case 'global': return 'rgba(94, 92, 230, 0.18)'; // indigo tint
  }
}
