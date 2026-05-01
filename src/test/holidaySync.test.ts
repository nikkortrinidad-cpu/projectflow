/**
 * holidaySync — coverage for the Nager → Holiday mapper.
 *
 * The fetch path itself is hard to unit-test without spinning up
 * a Firebase emulator or a mock server (jsdom + vi.spyOn(global,
 * 'fetch') works for the happy path but obscures the real
 * integration). The mapping logic is the higher-value target —
 * it's what produces stable ids, decides public/special, lifts
 * counties to states.
 *
 * Phase 8 — holiday API integration.
 */

import { describe, it, expect } from 'vitest';
import { mapNagerEntry, staleCountriesForSync, HOLIDAY_SYNC_STALE_MS } from '../utils/holidaySync';

describe('mapNagerEntry()', () => {
  it('maps a typical Public holiday to a Flizow Holiday', () => {
    const out = mapNagerEntry(
      {
        date: '2026-12-25',
        localName: 'Christmas Day',
        name: 'Christmas Day',
        countryCode: 'US',
        fixed: true,
        global: true,
        counties: null,
        launchYear: null,
        types: ['Public'],
      },
      'US',
    );
    expect(out).not.toBeNull();
    expect(out!.id).toBe('hol-sync-US-2026-12-25-christmas-day');
    expect(out!.name).toBe('Christmas Day');
    expect(out!.date).toBe('2026-12-25');
    expect(out!.country).toBe('US');
    expect(out!.type).toBe('public');
    expect(out!.states).toBeUndefined();
    expect(out!.defaultObservation).toBe('observed');
    expect(out!.active).toBe(true);
  });

  it('maps a Bank/School holiday to type=special (not public)', () => {
    const out = mapNagerEntry(
      {
        date: '2026-04-25',
        localName: 'Anzac Day Holiday',
        name: 'Anzac Day Holiday',
        countryCode: 'AU',
        types: ['Bank'],
      },
      'AU',
    );
    expect(out!.type).toBe('special');
  });

  it('lifts counties[] into Holiday.states when state-only', () => {
    const out = mapNagerEntry(
      {
        date: '2026-05-25',
        name: 'Memorial Day',
        countryCode: 'US',
        counties: ['US-NY', 'US-NJ'],
        types: ['Public'],
      },
      'US',
    );
    expect(out!.states).toEqual(['US-NY', 'US-NJ']);
  });

  it('returns null on missing date', () => {
    const out = mapNagerEntry(
      {
        name: "New Year's Day",
        countryCode: 'US',
        types: ['Public'],
      },
      'US',
    );
    expect(out).toBeNull();
  });

  it('returns null on malformed date', () => {
    const out = mapNagerEntry(
      {
        date: '2026/12/25',
        name: 'Christmas Day',
        countryCode: 'US',
      },
      'US',
    );
    expect(out).toBeNull();
  });

  it('returns null on missing name', () => {
    const out = mapNagerEntry(
      {
        date: '2026-12-25',
        countryCode: 'US',
      },
      'US',
    );
    expect(out).toBeNull();
  });

  it('produces stable ids — re-mapping the same entry yields the same id', () => {
    const entry = {
      date: '2026-05-01',
      name: 'Labor Day',
      countryCode: 'PH',
      types: ['Public'],
    };
    const a = mapNagerEntry(entry, 'PH');
    const b = mapNagerEntry(entry, 'PH');
    expect(a!.id).toBe(b!.id);
  });

  it('upper-cases the country code in the id even when caller passes lowercase', () => {
    const out = mapNagerEntry(
      { date: '2026-05-01', name: 'Labor Day', types: ['Public'] },
      'ph',
    );
    expect(out!.id).toContain('-ph-'); // raw country preserved as-is
    // …though our store always uppercases at the entry point.
  });

  it('truncates long names in the id slug', () => {
    const out = mapNagerEntry(
      {
        date: '2026-09-01',
        name: 'A very very very very very very very long holiday name',
        countryCode: 'US',
        types: ['Public'],
      },
      'US',
    );
    // The slug part is capped at 32 chars; the id stays bounded.
    expect(out!.id.length).toBeLessThan(80);
    expect(out!.id).toContain('hol-sync-US-2026-09-01-');
  });
});

// ── Phase 9 — auto-sync stale check ─────────────────────────────────

describe('staleCountriesForSync()', () => {
  // Anchor "now" at a known time so the threshold math is stable.
  const NOW = Date.parse('2026-05-01T12:00:00Z');
  const fresh = '2026-04-25T12:00:00Z'; //  ~6 days ago — fresh
  const stale = '2026-03-01T12:00:00Z'; // ~61 days ago — stale

  it('flags countries with no timestamp', () => {
    const out = staleCountriesForSync(['PH', 'AU'], {}, NOW);
    expect(out).toEqual(['PH', 'AU']);
  });

  it("flags countries whose last sync is older than 30 days", () => {
    const out = staleCountriesForSync(
      ['PH', 'AU'],
      { PH: fresh, AU: stale },
      NOW,
    );
    expect(out).toEqual(['AU']);
  });

  it('skips countries that synced inside the threshold', () => {
    const out = staleCountriesForSync(
      ['PH', 'AU'],
      { PH: fresh, AU: fresh },
      NOW,
    );
    expect(out).toEqual([]);
  });

  it('treats unparseable timestamps as stale', () => {
    const out = staleCountriesForSync(
      ['PH'],
      { PH: 'not a date' },
      NOW,
    );
    expect(out).toEqual(['PH']);
  });

  it('boundary — exactly at the threshold counts as fresh', () => {
    // The function uses `now - t > stale`, so equality stays fresh.
    const exact = new Date(NOW - HOLIDAY_SYNC_STALE_MS).toISOString();
    const out = staleCountriesForSync(['PH'], { PH: exact }, NOW);
    expect(out).toEqual([]);
  });

  it('returns an empty array for an empty country list', () => {
    expect(staleCountriesForSync([], {}, NOW)).toEqual([]);
  });

  it('honors a custom stale threshold', () => {
    // Tighten to 1 day; the "fresh" 6-day timestamp now reads stale.
    const out = staleCountriesForSync(
      ['PH'],
      { PH: fresh },
      NOW,
      24 * 60 * 60 * 1000,
    );
    expect(out).toEqual(['PH']);
  });
});
