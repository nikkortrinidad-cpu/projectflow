import type { Holiday } from '../types/flizow';

/**
 * Curated "specials" packs for countries whose calendars include
 * observances that the Nager public-calendar API doesn't carry.
 *
 * Why this exists:
 *   - Nager covers only declared public holidays per country
 *   - PH + AU (and others to follow) have additional observances
 *     that don't fit Nager's "Public" type but matter for agency
 *     scheduling — special non-working days in PH, state-only days
 *     in AU, etc.
 *   - Asking every owner to type these in by hand burns time and
 *     risks drift across workspaces
 *
 * The OM clicks "Add specials" beside the country in Settings →
 * Holidays. The pack lands via importHolidays — same dedup path as
 * Nager sync — so re-applying the pack on a workspace that already
 * has these entries is a no-op.
 *
 * Stable ids match the legacy DEFAULT_HOLIDAYS namespace
 * (`hol-{country}-{slug}-{year}`) so workspaces that were seeded
 * with the old pre-Phase-8 default don't end up with duplicates
 * when the OM applies the pack to "fill in" what was already there.
 *
 * Maintenance:
 *   - Movable observances (Eid, Chinese New Year, Easter-derived)
 *     need yearly review. Update the dates here, ship a release.
 *   - When Flizow expands to a new country whose calendar has
 *     non-Nager entries, add a pack here keyed by ISO code.
 *
 * Phase 9.5 — built-in specials packs.
 */

export interface HolidayPack {
  /** ISO 3166-1 alpha-2 country code. Matches the workspace
   *  countries[] entries; the pack offer renders beside the country
   *  row in Settings → Holidays when a pack exists for that code. */
  country: string;
  /** Short display label — "PH non-working days". Plural reads
   *  natural in the button + banner copy. */
  label: string;
  /** One-sentence why-this-exists for the picker tooltip. Plain
   *  language; no jargon. */
  description: string;
  /** Year coverage — for the "Synced through 2027" copy. Matches
   *  the years actually present in `holidays`. */
  yearsCovered: number[];
  /** The actual entries. Stable ids — re-applying the pack on a
   *  workspace that already has these entries is a no-op (the
   *  importHolidays dedup catches duplicates). */
  holidays: Holiday[];
}

// ── PH — non-working days (specials) ───────────────────────────────
// What Nager misses for the Philippines: Malacañang-proclaimed
// special non-working days. Dates land per the standing PH calendar;
// movable Lunar/Christian observances follow the announced dates and
// should be reconfirmed yearly.

const phSpecial = (
  slug: string,
  name: string,
  date: string,
): Holiday => ({
  id: `hol-ph-${slug}-${date.slice(0, 4)}`,
  name,
  date,
  country: 'PH',
  type: 'special',
  defaultObservation: 'observed',
  active: true,
});

const PH_SPECIALS: Holiday[] = [
  // 2026
  phSpecial('chinese-new-year', 'Chinese New Year',     '2026-02-17'),
  phSpecial('edsa',             'EDSA People Power',    '2026-02-25'),
  phSpecial('black-saturday',   'Black Saturday',       '2026-04-04'),
  phSpecial('ninoy-aquino',     'Ninoy Aquino Day',     '2026-08-21'),
  phSpecial('all-saints-eve',   'All Saints Day Eve',   '2026-10-31'),
  phSpecial('all-saints',       "All Saints' Day",      '2026-11-01'),
  phSpecial('all-souls',        "All Souls' Day",       '2026-11-02'),
  phSpecial('immaculate',       'Immaculate Conception','2026-12-08'),
  phSpecial('christmas-eve',    'Christmas Eve',        '2026-12-24'),
  phSpecial('new-years-eve',    "New Year's Eve",       '2026-12-31'),
  // 2027
  phSpecial('chinese-new-year', 'Chinese New Year',     '2027-02-06'),
  phSpecial('edsa',             'EDSA People Power',    '2027-02-25'),
  phSpecial('black-saturday',   'Black Saturday',       '2027-03-27'),
  phSpecial('ninoy-aquino',     'Ninoy Aquino Day',     '2027-08-21'),
  phSpecial('all-saints-eve',   'All Saints Day Eve',   '2027-10-31'),
  phSpecial('all-saints',       "All Saints' Day",      '2027-11-01'),
  phSpecial('all-souls',        "All Souls' Day",       '2027-11-02'),
  phSpecial('immaculate',       'Immaculate Conception','2027-12-08'),
  phSpecial('christmas-eve',    'Christmas Eve',        '2027-12-24'),
  phSpecial('new-years-eve',    "New Year's Eve",       '2027-12-31'),
];

// ── AU — state-level observances ───────────────────────────────────
// What Nager misses for Australia: state-only days. Nager carries
// the federal calendar (Australia Day, Anzac Day, Christmas, etc.)
// but state-level Labour Days, Melbourne Cup, and the staggered
// King's Birthday across states are agency-relevant and not in
// the public feed. The states[] field carries the scope so the
// schedules calendar can render the right ribbon per member.

const auState = (
  slug: string,
  name: string,
  date: string,
  states: string[],
): Holiday => ({
  id: `hol-au-${slug}-${date.slice(0, 4)}`,
  name,
  date,
  country: 'AU',
  type: 'public',
  states,
  defaultObservation: 'observed',
  active: true,
});

const AU_STATE_OBSERVANCES: Holiday[] = [
  // 2026
  auState('queens-birthday',     "King's Birthday",       '2026-06-08', ['NSW', 'VIC', 'ACT', 'NT', 'SA', 'TAS']),
  auState('queens-birthday-wa',  "King's Birthday (WA)",  '2026-09-28', ['WA']),
  auState('queens-birthday-qld', "King's Birthday (QLD)", '2026-10-05', ['QLD']),
  auState('labour-day-vic',      'Labour Day (VIC)',      '2026-03-09', ['VIC']),
  auState('labour-day-wa',       'Labour Day (WA)',       '2026-03-02', ['WA']),
  auState('labour-day-nsw',      'Labour Day (NSW/SA)',   '2026-10-05', ['NSW', 'SA']),
  auState('labour-day-qld',      'Labour Day (QLD/NT)',   '2026-05-04', ['QLD', 'NT']),
  auState('melbourne-cup',       'Melbourne Cup (VIC)',   '2026-11-03', ['VIC']),
  // 2027
  auState('queens-birthday',     "King's Birthday",       '2027-06-14', ['NSW', 'VIC', 'ACT', 'NT', 'SA', 'TAS']),
  auState('queens-birthday-wa',  "King's Birthday (WA)",  '2027-09-27', ['WA']),
  auState('queens-birthday-qld', "King's Birthday (QLD)", '2027-10-04', ['QLD']),
  auState('labour-day-vic',      'Labour Day (VIC)',      '2027-03-08', ['VIC']),
  auState('labour-day-wa',       'Labour Day (WA)',       '2027-03-01', ['WA']),
  auState('labour-day-nsw',      'Labour Day (NSW/SA)',   '2027-10-04', ['NSW', 'SA']),
  auState('labour-day-qld',      'Labour Day (QLD/NT)',   '2027-05-03', ['QLD', 'NT']),
  auState('melbourne-cup',       'Melbourne Cup (VIC)',   '2027-11-02', ['VIC']),
];

// ── Registry ───────────────────────────────────────────────────────

/** Per-country pack registry. Lookup by ISO code in the UI; absence
 *  of a key means no pack exists yet for that country (the OM still
 *  has Sync + manual entry). */
export const HOLIDAY_PACKS: { readonly [country: string]: HolidayPack } = {
  PH: {
    country: 'PH',
    label: 'PH non-working days',
    description:
      'Special non-working days the Philippine government proclaims yearly — EDSA, All Saints, Christmas Eve, and the rest. Not covered by the public calendar.',
    yearsCovered: [2026, 2027],
    holidays: PH_SPECIALS,
  },
  AU: {
    country: 'AU',
    label: 'AU state-only days',
    description:
      'State-level holidays Australia observes per region — Labour Day variations, Melbourne Cup, the staggered King\'s Birthday. The public calendar carries only the federal ones.',
    yearsCovered: [2026, 2027],
    holidays: AU_STATE_OBSERVANCES,
  },
};

/** Convenience: does a pack exist for this country? */
export function hasHolidayPack(country: string): boolean {
  return HOLIDAY_PACKS[country.toUpperCase()] !== undefined;
}

/** Convenience: get the pack for a country, or undefined. */
export function getHolidayPack(country: string): HolidayPack | undefined {
  return HOLIDAY_PACKS[country.toUpperCase()];
}
