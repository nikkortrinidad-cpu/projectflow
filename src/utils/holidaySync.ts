import type { Holiday } from '../types/flizow';

/**
 * Holiday API integration — pulls public holidays from
 * date.nager.at and converts them to the Flizow Holiday shape.
 *
 * The provider:
 *   - Free, no auth, no rate limit
 *   - https://date.nager.at — open source (MIT) project
 *   - Endpoint: /api/v3/PublicHolidays/{year}/{countryCode}
 *   - CORS-friendly (responds with Access-Control-Allow-Origin: *)
 *   - Coverage: ~110 countries; varies year to year
 *
 * Design choices:
 *   - We fetch + map to Holiday + return; the store decides what
 *     to do with the result (add new, dedupe against existing).
 *   - Fetch failure (network, 404, rate-limit, malformed JSON)
 *     returns a typed result object instead of throwing — the UI
 *     surfaces the error inline rather than crashing the modal.
 *   - Stable ids: `hol-sync-{country}-{date}-{slug}`. Re-syncing
 *     the same year produces the same ids, so the store's dedupe
 *     pass is a no-op on the second run.
 *
 * What this helper deliberately doesn't handle:
 *   - Per-state filtering. Nager returns county codes in the
 *     `counties` field; we map them to Holiday.states verbatim.
 *     Filtering by state is done at render time (utils/holidays).
 *   - Movable observances confirmation. Islamic + Lunar dates
 *     are estimates; the OM is responsible for confirming closer
 *     to the year.
 *   - Special non-working days (PH-specific Malacañang
 *     proclamations, etc.). Nager only carries public holidays;
 *     specials need manual entry.
 *
 * Audit: holiday API integration Phase 8.
 */

const NAGER_BASE_URL = 'https://date.nager.at/api/v3/PublicHolidays';

// Shape returned by the Nager API (the slice we use). Documenting
// here so the helper stays self-contained.
interface NagerHoliday {
  date: string;          // 'YYYY-MM-DD'
  localName: string;     // Native-language name (e.g. "Año Nuevo")
  name: string;          // English name (e.g. "New Year's Day")
  countryCode: string;   // ISO 3166-1 alpha-2
  fixed: boolean;        // true if same date every year
  global: boolean;       // true if observed nationwide; false = state-only
  counties: string[] | null;  // ISO 3166-2 codes for state-level (e.g. ['US-CA', 'US-NY'])
  launchYear: number | null;
  types: string[];       // ['Public', 'Bank', 'School', ...]
}

// ── Public API ─────────────────────────────────────────────────────

export type HolidaySyncResult =
  | { kind: 'success'; holidays: Holiday[]; total: number; year: number; countryCode: string }
  | { kind: 'unsupported'; countryCode: string; year: number }
  | { kind: 'network-error'; message: string; countryCode: string; year: number }
  | { kind: 'malformed-response'; message: string; countryCode: string; year: number };

/**
 * Fetch + map Nager holidays for one (country, year) pair. Single-
 * call entry point. Pure async function — no store coupling, no
 * UI, no side effects beyond the network call.
 *
 * Caller examples:
 *   const r = await fetchHolidaysForYear('PH', 2026);
 *   if (r.kind === 'success') store.applyHolidays(r.holidays);
 */
export async function fetchHolidaysForYear(
  countryCode: string,
  year: number,
): Promise<HolidaySyncResult> {
  const upper = countryCode.toUpperCase();
  const url = `${NAGER_BASE_URL}/${year}/${upper}`;
  let response: Response;
  try {
    response = await fetch(url, {
      // No special headers — the API is fully public + CORS-open.
      // Cache: 'no-store' so the OM gets fresh data when they hit
      // sync (avoiding stale browser-cached responses from a
      // previous sync earlier in the same session).
      cache: 'no-store',
    });
  } catch (err) {
    return {
      kind: 'network-error',
      message: err instanceof Error ? err.message : 'Network request failed',
      countryCode: upper,
      year,
    };
  }

  // Nager returns 200 + empty array for unsupported countries
  // sometimes, 404 other times. Treat both as "unsupported."
  if (response.status === 404) {
    return { kind: 'unsupported', countryCode: upper, year };
  }
  if (!response.ok) {
    return {
      kind: 'network-error',
      message: `HTTP ${response.status}`,
      countryCode: upper,
      year,
    };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    return {
      kind: 'malformed-response',
      message: err instanceof Error ? err.message : 'JSON parse failed',
      countryCode: upper,
      year,
    };
  }

  if (!Array.isArray(raw)) {
    return {
      kind: 'malformed-response',
      message: 'Expected JSON array, got something else',
      countryCode: upper,
      year,
    };
  }

  if (raw.length === 0) {
    return { kind: 'unsupported', countryCode: upper, year };
  }

  // Map every entry. Defensive — drop entries that don't parse
  // rather than failing the whole sync. Reality: Nager's payload
  // shape is stable, but the cost of one extra try/catch is zero.
  const holidays: Holiday[] = [];
  for (const item of raw) {
    const h = mapNagerEntry(item as Partial<NagerHoliday>, upper);
    if (h) holidays.push(h);
  }

  return {
    kind: 'success',
    holidays,
    total: holidays.length,
    year,
    countryCode: upper,
  };
}

/**
 * Convenience wrapper — fetches a range of years for one country.
 * Used by the "Sync this year + next" button to pull current +
 * next year in a single OM action. Failures aggregate into the
 * `errors` array; partial success returns the holidays it did
 * fetch.
 */
export async function fetchHolidaysForRange(
  countryCode: string,
  years: ReadonlyArray<number>,
): Promise<{
  countryCode: string;
  holidays: Holiday[];
  errors: HolidaySyncResult[];
}> {
  const results = await Promise.all(
    years.map((y) => fetchHolidaysForYear(countryCode, y)),
  );
  const holidays: Holiday[] = [];
  const errors: HolidaySyncResult[] = [];
  for (const r of results) {
    if (r.kind === 'success') holidays.push(...r.holidays);
    else errors.push(r);
  }
  return { countryCode: countryCode.toUpperCase(), holidays, errors };
}

// ── Mapping ────────────────────────────────────────────────────────

/** Convert a Nager API entry to a Flizow Holiday. Returns null
 *  when the entry is malformed (missing date or name). */
export function mapNagerEntry(
  entry: Partial<NagerHoliday>,
  countryCode: string,
): Holiday | null {
  if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return null;
  if (!entry.name || typeof entry.name !== 'string') return null;
  // Stable id keyed on country + date + name slug. Re-syncing the
  // same year doesn't create duplicates because the slug only
  // depends on the source data.
  const slug = entry.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  // Nager 'types' includes 'Public', 'Bank', 'School', etc. Map
  // 'Public' → our 'public'; everything else → 'special' (so
  // Bank Holiday and School Holiday land somewhere reasonable).
  const types = Array.isArray(entry.types) ? entry.types : [];
  const isPublic = types.includes('Public');
  return {
    id: `hol-sync-${countryCode}-${entry.date}-${slug}`,
    name: entry.name,
    date: entry.date,
    country: countryCode,
    type: isPublic ? 'public' : 'special',
    states: entry.counties && entry.counties.length > 0 ? entry.counties : undefined,
    defaultObservation: 'observed',
    active: true,
  };
}
