/**
 * holidayExport — coverage for the JSON portability path.
 *
 * Targets:
 *   - buildHolidayExport produces the wire format
 *   - exportFilename slugs the workspace name + dates the file
 *   - parseHolidayImport branches by failure mode
 *     - invalid-json (file isn't JSON)
 *     - wrong-shape (JSON but not our shape)
 *     - unsupported-version (right shape, wrong version)
 *     - success — even with a few malformed rows mixed in
 *   - Lenient row recovery: drop bad rows, keep good ones
 *
 * Phase 9.5 — JSON portability.
 */

import { describe, it, expect } from 'vitest';
import {
  buildHolidayExport,
  exportFilename,
  parseHolidayImport,
} from '../utils/holidayExport';
import type { Holiday } from '../types/flizow';

const sampleHoliday = (overrides: Partial<Holiday> = {}): Holiday => ({
  id: 'hol-test-1',
  name: 'Sample Holiday',
  date: '2026-05-01',
  country: 'PH',
  type: 'public',
  defaultObservation: 'observed',
  active: true,
  ...overrides,
});

// ── Export ─────────────────────────────────────────────────────────

describe('buildHolidayExport()', () => {
  it('returns version-1 shape with the holidays + meta', () => {
    const out = buildHolidayExport(
      [sampleHoliday(), sampleHoliday({ id: 'hol-test-2', date: '2026-12-25' })],
      'Acme',
      '2026-05-01T12:00:00Z',
    );
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe('2026-05-01T12:00:00Z');
    expect(out.workspaceName).toBe('Acme');
    expect(out.holidays.length).toBe(2);
  });

  it('omits workspaceName when not provided', () => {
    const out = buildHolidayExport([], undefined, '2026-05-01T00:00:00Z');
    expect(out.workspaceName).toBeUndefined();
  });

  it('returns a slice — mutating the output does not mutate the input', () => {
    const input = [sampleHoliday()];
    const out = buildHolidayExport(input, 'Acme');
    out.holidays.push(sampleHoliday({ id: 'hol-test-x' }));
    expect(input.length).toBe(1);
  });
});

describe('exportFilename()', () => {
  it('slugs the workspace name + appends the date', () => {
    expect(exportFilename('Acme Co.', '2026-05-01T12:00:00Z')).toBe(
      'flizow-holidays-acme-co-2026-05-01.json',
    );
  });

  it('falls back to "workspace" when name is missing', () => {
    expect(exportFilename(undefined, '2026-05-01T00:00:00Z')).toBe(
      'flizow-holidays-workspace-2026-05-01.json',
    );
  });

  it('strips weird characters from the slug', () => {
    expect(exportFilename('!!! Hello, World @@@', '2026-05-01T00:00:00Z')).toBe(
      'flizow-holidays-hello-world-2026-05-01.json',
    );
  });

  it('caps the slug at 32 chars', () => {
    const longName = 'A'.repeat(100);
    const f = exportFilename(longName, '2026-05-01T00:00:00Z');
    // Format: flizow-holidays-{slug<=32}-2026-05-01.json
    const slug = f.replace(/^flizow-holidays-/, '').replace(/-2026-05-01\.json$/, '');
    expect(slug.length).toBeLessThanOrEqual(32);
  });
});

// ── Import ─────────────────────────────────────────────────────────

describe('parseHolidayImport()', () => {
  it('parses a valid v1 export', () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: '2026-05-01T00:00:00Z',
      workspaceName: 'Acme',
      holidays: [sampleHoliday(), sampleHoliday({ id: 'hol-2', date: '2026-12-25' })],
    });
    const result = parseHolidayImport(json);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.total).toBe(2);
      expect(result.workspaceName).toBe('Acme');
      expect(result.exportedAt).toBe('2026-05-01T00:00:00Z');
    }
  });

  it('rejects invalid JSON', () => {
    const result = parseHolidayImport('this is not json');
    expect(result.kind).toBe('invalid-json');
  });

  it('rejects JSON that is not an object', () => {
    const result = parseHolidayImport(JSON.stringify(['hi']));
    expect(result.kind).toBe('wrong-shape');
  });

  it('rejects JSON without a holidays field', () => {
    const result = parseHolidayImport(JSON.stringify({ version: 1, exportedAt: 'x' }));
    expect(result.kind).toBe('wrong-shape');
  });

  it('rejects unsupported version', () => {
    const result = parseHolidayImport(
      JSON.stringify({ version: 2, holidays: [] }),
    );
    expect(result.kind).toBe('unsupported-version');
    if (result.kind === 'unsupported-version') {
      expect(result.version).toBe(2);
    }
  });

  it('rejects missing version', () => {
    const result = parseHolidayImport(JSON.stringify({ holidays: [] }));
    expect(result.kind).toBe('unsupported-version');
  });

  it('drops rows with missing required fields but keeps the good ones', () => {
    const json = JSON.stringify({
      version: 1,
      holidays: [
        sampleHoliday(),
        { id: '', name: 'No id', date: '2026-05-01', country: 'PH' }, // missing id
        { id: 'x', name: 'No date', country: 'PH' },                  // missing date
        { id: 'y', date: '2026/05/01', name: 'Bad date', country: 'PH' }, // wrong format
        sampleHoliday({ id: 'hol-good-2', date: '2026-12-25' }),
      ],
    });
    const result = parseHolidayImport(json);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.total).toBe(2); // only the two good ones survive
    }
  });

  it("defaults type to 'public' when the value is unrecognized", () => {
    const json = JSON.stringify({
      version: 1,
      holidays: [
        {
          id: 'hol-x',
          name: 'X',
          date: '2026-05-01',
          country: 'PH',
          type: 'wibble', // not 'public' / 'special'
          defaultObservation: 'observed',
        },
      ],
    });
    const result = parseHolidayImport(json);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.holidays[0].type).toBe('public');
    }
  });

  it('preserves states[] when present', () => {
    const json = JSON.stringify({
      version: 1,
      holidays: [
        sampleHoliday({ id: 'hol-au', country: 'AU', states: ['VIC', 'NSW'] }),
      ],
    });
    const result = parseHolidayImport(json);
    if (result.kind === 'success') {
      expect(result.holidays[0].states).toEqual(['VIC', 'NSW']);
    }
  });

  it('preserves active=false when import has it', () => {
    const json = JSON.stringify({
      version: 1,
      holidays: [sampleHoliday({ active: false })],
    });
    const result = parseHolidayImport(json);
    if (result.kind === 'success') {
      expect(result.holidays[0].active).toBe(false);
    }
  });

  it('round-trips a build → parse with the same holidays', () => {
    const originals: Holiday[] = [
      sampleHoliday({ id: 'hol-1', date: '2026-05-01' }),
      sampleHoliday({ id: 'hol-2', date: '2026-12-25', country: 'AU', states: ['VIC'] }),
    ];
    const exported = buildHolidayExport(originals, 'Round-trip');
    const result = parseHolidayImport(JSON.stringify(exported));
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.holidays).toEqual(originals);
    }
  });
});
