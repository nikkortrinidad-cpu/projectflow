/**
 * Router — parse() coverage focused on the Phase-7C deep-link paths.
 *
 * Tests run against the internal parser via the test-only export
 * `__parseHashForTest`. Pure function, no DOM, no React.
 *
 * Coverage:
 *   - Existing routes still parse correctly (regression guard)
 *   - Phase 7C: #ops/<sub-tab>?focus=<id>
 *   - Phase 7C: #account/<section>?focus=<id>
 *   - Query strings on non-7C routes are merged into params too
 *   - Unknown / malformed hashes fall back to the default
 */

import { describe, it, expect } from 'vitest';
import { __parseHashForTest as parse } from '../router';

describe('parse() — existing routes (regression)', () => {
  it('empty hash → overview', () => {
    expect(parse('').name).toBe('overview');
  });

  it('#overview', () => {
    const r = parse('#overview');
    expect(r.name).toBe('overview');
    expect(r.params).toEqual({});
  });

  it('#clients', () => {
    expect(parse('#clients').name).toBe('clients');
  });

  it('#clients/<id> → client-detail', () => {
    const r = parse('#clients/cli-acme');
    expect(r.name).toBe('client-detail');
    expect(r.params.id).toBe('cli-acme');
  });

  it('#clients/view/<id>', () => {
    const r = parse('#clients/view/fire');
    expect(r.name).toBe('clients');
    expect(r.params.view).toBe('fire');
  });

  it('#board/<svc>', () => {
    const r = parse('#board/svc-1');
    expect(r.name).toBe('board');
    expect(r.params.id).toBe('svc-1');
  });

  it('#board/<svc>/card/<card>', () => {
    const r = parse('#board/svc-1/card/c-9');
    expect(r.params.id).toBe('svc-1');
    expect(r.params.cardId).toBe('c-9');
  });
});

// ── Phase 7C — Ops sub-tab + focus deep-links ───────────────────────

describe('parse() — Phase 7C ops deep links', () => {
  it('#ops alone', () => {
    const r = parse('#ops');
    expect(r.name).toBe('ops');
    expect(r.params).toEqual({});
  });

  it('#ops/timeoff captures the sub-tab', () => {
    const r = parse('#ops/timeoff');
    expect(r.name).toBe('ops');
    expect(r.params.tab).toBe('timeoff');
  });

  it('#ops/timeoff?focus=tor-abc captures both', () => {
    const r = parse('#ops/timeoff?focus=tor-abc');
    expect(r.name).toBe('ops');
    expect(r.params.tab).toBe('timeoff');
    expect(r.params.focus).toBe('tor-abc');
  });

  it('#ops/board?focus=anything keeps the focus', () => {
    const r = parse('#ops/board?focus=task-1');
    expect(r.params.tab).toBe('board');
    expect(r.params.focus).toBe('task-1');
  });

  it('unknown ops sub-tab still parses; consumer falls back', () => {
    const r = parse('#ops/zzz');
    expect(r.name).toBe('ops');
    expect(r.params.tab).toBe('zzz');
  });

  it('decodes URL-encoded focus values', () => {
    const r = parse('#ops/timeoff?focus=tor%2Fabc%2D1');
    expect(r.params.focus).toBe('tor/abc-1');
  });
});

// ── Phase 7C — Account synthetic route ─────────────────────────────

describe('parse() — Phase 7C account deep links', () => {
  it('#account alone defaults to no section', () => {
    const r = parse('#account');
    expect(r.name).toBe('account');
    expect(r.params.section).toBeUndefined();
  });

  it('#account/timeoff captures the section', () => {
    const r = parse('#account/timeoff');
    expect(r.name).toBe('account');
    expect(r.params.section).toBe('timeoff');
  });

  it('#account/timeoff?focus=tor-1 captures section + focus', () => {
    const r = parse('#account/timeoff?focus=tor-1');
    expect(r.name).toBe('account');
    expect(r.params.section).toBe('timeoff');
    expect(r.params.focus).toBe('tor-1');
  });

  it('#account/holidays carries the section through to the modal', () => {
    const r = parse('#account/holidays');
    expect(r.params.section).toBe('holidays');
  });
});

// ── Multi-key query strings ─────────────────────────────────────────

describe('parse() — query string parsing', () => {
  it('multiple ?key=value pairs merge into params', () => {
    const r = parse('#ops/timeoff?focus=tor-1&secondary=value');
    expect(r.params.focus).toBe('tor-1');
    expect(r.params.secondary).toBe('value');
  });

  it('empty value still produces a key', () => {
    const r = parse('#ops/timeoff?focus=');
    expect(r.params.focus).toBe('');
  });
});

// ── Defensive fallbacks ─────────────────────────────────────────────

describe('parse() — defensive', () => {
  it('unknown top-level route → default overview', () => {
    expect(parse('#unknown').name).toBe('overview');
  });
});
