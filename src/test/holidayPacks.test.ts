/**
 * holidayPacks — coverage for the curated specials registry.
 *
 * The packs are static data, so coverage targets the shape contract:
 *   - Every pack has stable + unique ids
 *   - Every entry parses as a valid Holiday
 *   - Lookup helpers behave (case-insensitive, missing-key safety)
 *   - Pack ids match the legacy DEFAULT_HOLIDAYS namespace so an
 *     "Add pack" on a workspace seeded with the old default is
 *     a no-op (importHolidays dedup catches duplicates by id)
 *
 * Phase 9.5 — built-in specials packs.
 */

import { describe, it, expect } from 'vitest';
import { HOLIDAY_PACKS, getHolidayPack, hasHolidayPack } from '../data/holidayPacks';
import { DEFAULT_HOLIDAYS } from '../data/holidaySeed';

describe('HOLIDAY_PACKS registry', () => {
  it('exposes packs for at least PH and AU', () => {
    expect(Object.keys(HOLIDAY_PACKS).sort()).toEqual(expect.arrayContaining(['PH', 'AU']));
  });

  it('every pack has the expected shape', () => {
    for (const code of Object.keys(HOLIDAY_PACKS)) {
      const pack = HOLIDAY_PACKS[code];
      expect(pack.country).toBe(code);
      expect(pack.label.length).toBeGreaterThan(0);
      expect(pack.description.length).toBeGreaterThan(0);
      expect(pack.yearsCovered.length).toBeGreaterThan(0);
      expect(pack.holidays.length).toBeGreaterThan(0);
    }
  });

  it('every pack entry is a valid Holiday', () => {
    for (const pack of Object.values(HOLIDAY_PACKS)) {
      for (const h of pack.holidays) {
        expect(h.id).toMatch(/^hol-/);
        expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(h.name.length).toBeGreaterThan(0);
        expect(h.country).toBe(pack.country);
        expect(h.active).toBe(true);
        expect(['public', 'special']).toContain(h.type);
      }
    }
  });

  it('ids are unique within each pack', () => {
    for (const pack of Object.values(HOLIDAY_PACKS)) {
      const ids = pack.holidays.map((h) => h.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });

  it('PH pack covers 2026 + 2027', () => {
    const pack = HOLIDAY_PACKS.PH;
    expect(pack.yearsCovered).toEqual([2026, 2027]);
    const has2026 = pack.holidays.some((h) => h.date.startsWith('2026'));
    const has2027 = pack.holidays.some((h) => h.date.startsWith('2027'));
    expect(has2026).toBe(true);
    expect(has2027).toBe(true);
  });

  it('PH pack carries only specials (none of the publics Nager already covers)', () => {
    const pack = HOLIDAY_PACKS.PH;
    for (const h of pack.holidays) {
      expect(h.type).toBe('special');
    }
  });

  it('AU pack carries state-scoped entries (every entry has states[])', () => {
    const pack = HOLIDAY_PACKS.AU;
    for (const h of pack.holidays) {
      expect(h.states).toBeDefined();
      expect(h.states!.length).toBeGreaterThan(0);
    }
  });

  it('pack ids match the legacy DEFAULT_HOLIDAYS namespace', () => {
    // Same ids → re-applying the pack on a workspace that was
    // seeded with the old DEFAULT_HOLIDAYS doesn't double-up.
    // The store's importHolidays dedupes by id.
    const seedIds = new Set(DEFAULT_HOLIDAYS.map((h) => h.id));
    for (const pack of Object.values(HOLIDAY_PACKS)) {
      for (const h of pack.holidays) {
        expect(seedIds.has(h.id)).toBe(true);
      }
    }
  });
});

describe('getHolidayPack() / hasHolidayPack()', () => {
  it('finds PH and AU', () => {
    expect(hasHolidayPack('PH')).toBe(true);
    expect(getHolidayPack('PH')!.country).toBe('PH');
    expect(hasHolidayPack('AU')).toBe(true);
  });

  it('returns undefined / false for countries without a pack', () => {
    expect(hasHolidayPack('US')).toBe(false);
    expect(getHolidayPack('US')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(hasHolidayPack('ph')).toBe(true);
    expect(getHolidayPack('au')!.country).toBe('AU');
  });

  it('returns false for empty / nonsense codes', () => {
    expect(hasHolidayPack('')).toBe(false);
    expect(hasHolidayPack('XX')).toBe(false);
  });
});
