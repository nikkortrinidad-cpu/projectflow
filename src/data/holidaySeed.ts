import type { Holiday } from '../types/flizow';

/**
 * Seeded holiday catalog for fresh workspaces.
 *
 * Coverage:
 *   - Philippines 2026 + 2027 — public regular + special non-working,
 *     per the official Malacañang proclamations + the standing
 *     calendar. Movable observances (Eid'l Fitr, Eid'l Adha) are
 *     seeded with their currently-announced dates; the OM updates
 *     when the actual dates land closer to the year.
 *   - Australia 2026 + 2027 — national + major-state (NSW, VIC,
 *     QLD, WA, SA, ACT, NT, TAS) observances. State scope on each
 *     entry; Phase-6B treats every entry as visible to the AU
 *     country tag (the OM filters via the calendar's chip strip).
 *
 * Defaults to 'observed' for every entry — Phase 6C will surface
 * per-holiday "we worked through this" overrides + transfer-credit
 * accrual. For now, an 'observed' holiday paints a colored ribbon
 * on the calendar without auto-creating time-off requests.
 *
 * Stable ids (hol-{country}-{slug}-{year}) keep the migration
 * idempotent — re-running this seed on a workspace that already has
 * these entries is a no-op.
 *
 * Audit: time-off Phase 6B.
 */

// ── Helpers ────────────────────────────────────────────────────────

const phPublic = (
  slug: string,
  name: string,
  date: string,
): Holiday => ({
  id: `hol-ph-${slug}-${date.slice(0, 4)}`,
  name,
  date,
  country: 'PH',
  type: 'public',
  defaultObservation: 'observed',
  active: true,
});

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

const auNational = (
  slug: string,
  name: string,
  date: string,
): Holiday => ({
  id: `hol-au-${slug}-${date.slice(0, 4)}`,
  name,
  date,
  country: 'AU',
  type: 'public',
  defaultObservation: 'observed',
  active: true,
});

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

// ── PH 2026 ────────────────────────────────────────────────────────
// Source: standing PH calendar; movable Islamic dates use the
// announced 2026 observances. OM should reconfirm closer to the
// year as Malacañang publishes the final proclamation.

const PH_2026: Holiday[] = [
  // Regular public holidays
  phPublic('new-year',          "New Year's Day",            '2026-01-01'),
  phPublic('day-of-valor',      'Araw ng Kagitingan',        '2026-04-09'),
  phPublic('maundy-thursday',   'Maundy Thursday',           '2026-04-02'),
  phPublic('good-friday',       'Good Friday',               '2026-04-03'),
  phPublic('labor-day',         'Labor Day',                 '2026-05-01'),
  phPublic('independence-day',  'Independence Day',          '2026-06-12'),
  phPublic('national-heroes',   'National Heroes Day',       '2026-08-31'),
  phPublic('bonifacio-day',     'Bonifacio Day',             '2026-11-30'),
  phPublic('christmas',         'Christmas Day',             '2026-12-25'),
  phPublic('rizal-day',         'Rizal Day',                 '2026-12-30'),
  phPublic('eid-fitr',          "Eid'l Fitr (estimated)",    '2026-03-20'),
  phPublic('eid-adha',          "Eid'l Adha (estimated)",    '2026-05-27'),

  // Special non-working days
  phSpecial('chinese-new-year', 'Chinese New Year',          '2026-02-17'),
  phSpecial('edsa',             'EDSA People Power',         '2026-02-25'),
  phSpecial('black-saturday',   'Black Saturday',            '2026-04-04'),
  phSpecial('ninoy-aquino',     'Ninoy Aquino Day',          '2026-08-21'),
  phSpecial('all-saints-eve',   'All Saints Day Eve',        '2026-10-31'),
  phSpecial('all-saints',       "All Saints' Day",           '2026-11-01'),
  phSpecial('all-souls',        "All Souls' Day",            '2026-11-02'),
  phSpecial('immaculate',       'Immaculate Conception',     '2026-12-08'),
  phSpecial('christmas-eve',    'Christmas Eve',             '2026-12-24'),
  phSpecial('new-years-eve',    "New Year's Eve",            '2026-12-31'),
];

// ── PH 2027 ────────────────────────────────────────────────────────

const PH_2027: Holiday[] = [
  phPublic('new-year',          "New Year's Day",            '2027-01-01'),
  phPublic('day-of-valor',      'Araw ng Kagitingan',        '2027-04-09'),
  phPublic('maundy-thursday',   'Maundy Thursday',           '2027-03-25'),
  phPublic('good-friday',       'Good Friday',               '2027-03-26'),
  phPublic('labor-day',         'Labor Day',                 '2027-05-01'),
  phPublic('independence-day',  'Independence Day',          '2027-06-12'),
  phPublic('national-heroes',   'National Heroes Day',       '2027-08-30'),
  phPublic('bonifacio-day',     'Bonifacio Day',             '2027-11-30'),
  phPublic('christmas',         'Christmas Day',             '2027-12-25'),
  phPublic('rizal-day',         'Rizal Day',                 '2027-12-30'),
  phPublic('eid-fitr',          "Eid'l Fitr (estimated)",    '2027-03-09'),
  phPublic('eid-adha',          "Eid'l Adha (estimated)",    '2027-05-16'),
  phSpecial('chinese-new-year', 'Chinese New Year',          '2027-02-06'),
  phSpecial('edsa',             'EDSA People Power',         '2027-02-25'),
  phSpecial('black-saturday',   'Black Saturday',            '2027-03-27'),
  phSpecial('ninoy-aquino',     'Ninoy Aquino Day',          '2027-08-21'),
  phSpecial('all-saints-eve',   'All Saints Day Eve',        '2027-10-31'),
  phSpecial('all-saints',       "All Saints' Day",           '2027-11-01'),
  phSpecial('all-souls',        "All Souls' Day",            '2027-11-02'),
  phSpecial('immaculate',       'Immaculate Conception',     '2027-12-08'),
  phSpecial('christmas-eve',    'Christmas Eve',             '2027-12-24'),
  phSpecial('new-years-eve',    "New Year's Eve",            '2027-12-31'),
];

// ── AU 2026 ────────────────────────────────────────────────────────
// National holidays first, then state-only entries.

const AU_2026: Holiday[] = [
  // National
  auNational('new-year',         "New Year's Day",       '2026-01-01'),
  auNational('australia-day',    'Australia Day',        '2026-01-26'),
  auNational('good-friday',      'Good Friday',          '2026-04-03'),
  auNational('easter-saturday',  'Easter Saturday',      '2026-04-04'),
  auNational('easter-sunday',    'Easter Sunday',        '2026-04-05'),
  auNational('easter-monday',    'Easter Monday',        '2026-04-06'),
  auNational('anzac-day',        'Anzac Day',            '2026-04-25'),
  auNational('christmas',        'Christmas Day',        '2026-12-25'),
  auNational('boxing-day',       'Boxing Day',           '2026-12-26'),

  // State-specific
  auState('queens-birthday',     "King's Birthday",      '2026-06-08', ['NSW', 'VIC', 'ACT', 'NT', 'SA', 'TAS']),
  auState('queens-birthday-wa',  "King's Birthday (WA)", '2026-09-28', ['WA']),
  auState('queens-birthday-qld', "King's Birthday (QLD)",'2026-10-05', ['QLD']),
  auState('labour-day-vic',      'Labour Day (VIC)',     '2026-03-09', ['VIC']),
  auState('labour-day-wa',       'Labour Day (WA)',      '2026-03-02', ['WA']),
  auState('labour-day-nsw',      'Labour Day (NSW/SA)',  '2026-10-05', ['NSW', 'SA']),
  auState('labour-day-qld',      'Labour Day (QLD/NT)',  '2026-05-04', ['QLD', 'NT']),
  auState('melbourne-cup',       'Melbourne Cup (VIC)',  '2026-11-03', ['VIC']),
];

// ── AU 2027 ────────────────────────────────────────────────────────

const AU_2027: Holiday[] = [
  auNational('new-year',         "New Year's Day",       '2027-01-01'),
  auNational('australia-day',    'Australia Day',        '2027-01-26'),
  auNational('good-friday',      'Good Friday',          '2027-03-26'),
  auNational('easter-saturday',  'Easter Saturday',      '2027-03-27'),
  auNational('easter-sunday',    'Easter Sunday',        '2027-03-28'),
  auNational('easter-monday',    'Easter Monday',        '2027-03-29'),
  auNational('anzac-day',        'Anzac Day',            '2027-04-25'),
  auNational('christmas',        'Christmas Day',        '2027-12-25'),
  auNational('boxing-day',       'Boxing Day',           '2027-12-27'),
  auState('queens-birthday',     "King's Birthday",      '2027-06-14', ['NSW', 'VIC', 'ACT', 'NT', 'SA', 'TAS']),
  auState('queens-birthday-wa',  "King's Birthday (WA)", '2027-09-27', ['WA']),
  auState('queens-birthday-qld', "King's Birthday (QLD)",'2027-10-04', ['QLD']),
  auState('labour-day-vic',      'Labour Day (VIC)',     '2027-03-08', ['VIC']),
  auState('labour-day-wa',       'Labour Day (WA)',      '2027-03-01', ['WA']),
  auState('labour-day-nsw',      'Labour Day (NSW/SA)',  '2027-10-04', ['NSW', 'SA']),
  auState('labour-day-qld',      'Labour Day (QLD/NT)',  '2027-05-03', ['QLD', 'NT']),
  auState('melbourne-cup',       'Melbourne Cup (VIC)',  '2027-11-02', ['VIC']),
];

/** Concatenated default seed — every PH + AU holiday for 2026 + 2027.
 *  ~80 entries; well under any realistic Firestore doc-size cap. */
export const DEFAULT_HOLIDAYS: ReadonlyArray<Holiday> = [
  ...PH_2026,
  ...PH_2027,
  ...AU_2026,
  ...AU_2027,
];
