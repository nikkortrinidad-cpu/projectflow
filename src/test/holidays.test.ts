/**
 * Holiday helpers — unit tests.
 *
 * Phase 6B ships display-only logic, so coverage targets:
 *   - Country matching (PH-tagged sees PH, AU sees AU, Other sees nothing)
 *   - Active filter (archived holidays don't render)
 *   - Date queries (specific date, range, multi-day windows)
 *   - Workspace-mix logic (visibleHolidays filters by member country pool)
 *   - The seeded catalog has stable ids + sane shape
 *
 * Phase 6 of the time-off system.
 */

import { describe, it, expect } from 'vitest';
import {
  holidayAppliesToCountry,
  holidaysForCountry,
  holidaysOnDate,
  holidaysInRange,
  countriesInUse,
  visibleHolidays,
  countryShortLabel,
  countryTint,
} from '../utils/holidays';
import { DEFAULT_HOLIDAYS } from '../data/holidaySeed';
import type { Holiday, Member } from '../types/flizow';

// ── Fixtures ─────────────────────────────────────────────────────────

const holiday = (overrides: Partial<Holiday> = {}): Holiday => ({
  id: `hol-${Math.random().toString(36).slice(2, 9)}`,
  name: 'Test holiday',
  date: '2026-01-01',
  country: 'PH',
  type: 'public',
  defaultObservation: 'observed',
  active: true,
  ...overrides,
});

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'm-1',
  initials: 'M1',
  name: 'Member One',
  color: '#000',
  type: 'operator',
  ...overrides,
});

// ── Country matching ────────────────────────────────────────────────

describe('holidayAppliesToCountry()', () => {
  it('matches PH holiday to PH-tagged member', () => {
    expect(holidayAppliesToCountry(holiday({ country: 'PH' }), 'PH')).toBe(true);
  });

  it("doesn't cross-match PH and AU", () => {
    expect(holidayAppliesToCountry(holiday({ country: 'PH' }), 'AU')).toBe(false);
    expect(holidayAppliesToCountry(holiday({ country: 'AU' }), 'PH')).toBe(false);
  });

  it('global holidays match every country except Other', () => {
    expect(holidayAppliesToCountry(holiday({ country: 'global' }), 'PH')).toBe(true);
    expect(holidayAppliesToCountry(holiday({ country: 'global' }), 'AU')).toBe(true);
    expect(holidayAppliesToCountry(holiday({ country: 'global' }), 'Other')).toBe(false);
  });

  it('Other tag never matches anything', () => {
    expect(holidayAppliesToCountry(holiday({ country: 'PH' }), 'Other')).toBe(false);
    expect(holidayAppliesToCountry(holiday({ country: 'AU' }), 'Other')).toBe(false);
  });

  it('undefined country tag never matches', () => {
    expect(holidayAppliesToCountry(holiday(), undefined)).toBe(false);
  });
});

describe('holidaysForCountry()', () => {
  const list: Holiday[] = [
    holiday({ id: 'a', country: 'PH', date: '2026-05-01', name: 'Labor Day' }),
    holiday({ id: 'b', country: 'AU', date: '2026-04-25', name: 'Anzac Day' }),
    holiday({ id: 'c', country: 'PH', date: '2026-01-01', name: 'New Year', active: false }),
    holiday({ id: 'd', country: 'global', date: '2026-12-25', name: 'Christmas' }),
  ];

  it('returns active holidays for PH-tagged member, sorted by date', () => {
    const out = holidaysForCountry(list, 'PH');
    expect(out.map((h) => h.id)).toEqual(['a', 'd']);
  });

  it('archived holidays are excluded', () => {
    const out = holidaysForCountry(list, 'PH');
    expect(out.find((h) => h.id === 'c')).toBeUndefined();
  });

  it('Other tag returns empty list', () => {
    expect(holidaysForCountry(list, 'Other')).toEqual([]);
  });
});

// ── Date queries ────────────────────────────────────────────────────

describe('holidaysOnDate()', () => {
  const list: Holiday[] = [
    holiday({ id: 'a', country: 'PH', date: '2026-05-01' }),
    holiday({ id: 'b', country: 'PH', date: '2026-05-01', name: 'Same date' }),
    holiday({ id: 'c', country: 'AU', date: '2026-05-01' }),
    holiday({ id: 'd', country: 'PH', date: '2026-05-02' }),
  ];

  it('returns all holidays on that date when country is omitted', () => {
    expect(holidaysOnDate(list, '2026-05-01').length).toBe(3);
  });

  it('filters by country when provided', () => {
    expect(holidaysOnDate(list, '2026-05-01', 'PH').length).toBe(2);
    expect(holidaysOnDate(list, '2026-05-01', 'AU').length).toBe(1);
  });

  it('returns empty when nothing matches', () => {
    expect(holidaysOnDate(list, '2026-05-03')).toEqual([]);
  });

  it('respects active flag', () => {
    const archived = [holiday({ id: 'x', date: '2026-05-01', active: false })];
    expect(holidaysOnDate(archived, '2026-05-01')).toEqual([]);
  });
});

describe('holidaysInRange()', () => {
  const list: Holiday[] = [
    holiday({ id: 'a', date: '2026-05-01' }),
    holiday({ id: 'b', date: '2026-05-15' }),
    holiday({ id: 'c', date: '2026-06-01' }),
    holiday({ id: 'd', date: '2026-04-30' }),
  ];

  it('inclusive range filter', () => {
    const out = holidaysInRange(list, '2026-05-01', '2026-05-31');
    expect(out.map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('out-of-range dates excluded', () => {
    const out = holidaysInRange(list, '2026-05-02', '2026-05-31');
    expect(out.find((h) => h.id === 'a')).toBeUndefined();
  });
});

// ── Workspace-mix ───────────────────────────────────────────────────

describe('countriesInUse() / visibleHolidays()', () => {
  it('countriesInUse counts distinct member country tags', () => {
    const members = [
      member({ id: 'a', country: 'PH' }),
      member({ id: 'b', country: 'PH' }),
      member({ id: 'c', country: 'AU' }),
      member({ id: 'd' }), // no country
    ];
    expect(countriesInUse(members)).toEqual(new Set(['PH', 'AU']));
  });

  it('visibleHolidays returns only holidays whose country is in the workspace mix', () => {
    const list: Holiday[] = [
      holiday({ id: 'p', country: 'PH', date: '2026-05-01' }),
      holiday({ id: 'a', country: 'AU', date: '2026-05-02' }),
      holiday({ id: 'g', country: 'global', date: '2026-05-03' }),
    ];
    const phOnly = [member({ country: 'PH' })];
    const out = visibleHolidays(list, phOnly);
    expect(out.map((h) => h.id).sort()).toEqual(['g', 'p']);
  });

  it('empty workspace shows no holidays', () => {
    const list: Holiday[] = [
      holiday({ id: 'p', country: 'PH' }),
      holiday({ id: 'g', country: 'global' }),
    ];
    expect(visibleHolidays(list, [])).toEqual([]);
  });
});

// ── Display helpers ─────────────────────────────────────────────────

describe('countryShortLabel() / countryTint()', () => {
  it('returns a non-empty label for every country', () => {
    expect(countryShortLabel('PH')).toBe('PH');
    expect(countryShortLabel('AU')).toBe('AU');
    expect(countryShortLabel('global')).toBeTruthy();
  });

  it('returns a CSS color value for every country', () => {
    // Phase 8 — global keeps its assigned indigo (rgba); ISO codes
    // hash to deterministic HSL pastels via djb2 so any country
    // works without curating 100+ palette entries.
    expect(countryTint('global')).toMatch(/^rgba/);
    expect(countryTint('PH')).toMatch(/^hsl/);
    expect(countryTint('AU')).toMatch(/^hsl/);
    expect(countryTint('US')).toMatch(/^hsl/);
  });

  it('hashes the same country code to the same tint deterministically', () => {
    // Stability matters — a country re-rendered across sessions
    // should keep its colour. djb2 is content-stable.
    expect(countryTint('US')).toBe(countryTint('US'));
    expect(countryTint('PH')).toBe(countryTint('PH'));
  });
});

// ── Default seed ────────────────────────────────────────────────────

describe('DEFAULT_HOLIDAYS', () => {
  it('seeds both PH and AU for 2026 and 2027', () => {
    const ph2026 = DEFAULT_HOLIDAYS.filter((h) => h.country === 'PH' && h.date.startsWith('2026'));
    const ph2027 = DEFAULT_HOLIDAYS.filter((h) => h.country === 'PH' && h.date.startsWith('2027'));
    const au2026 = DEFAULT_HOLIDAYS.filter((h) => h.country === 'AU' && h.date.startsWith('2026'));
    const au2027 = DEFAULT_HOLIDAYS.filter((h) => h.country === 'AU' && h.date.startsWith('2027'));
    expect(ph2026.length).toBeGreaterThan(0);
    expect(ph2027.length).toBeGreaterThan(0);
    expect(au2026.length).toBeGreaterThan(0);
    expect(au2027.length).toBeGreaterThan(0);
  });

  it('every entry has a stable id, valid date, and active=true', () => {
    for (const h of DEFAULT_HOLIDAYS) {
      expect(h.id).toMatch(/^hol-/);
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.active).toBe(true);
      expect(h.name.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique across the catalog', () => {
    const ids = new Set(DEFAULT_HOLIDAYS.map((h) => h.id));
    expect(ids.size).toBe(DEFAULT_HOLIDAYS.length);
  });
});
