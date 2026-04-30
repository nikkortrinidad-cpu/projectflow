/**
 * Job-title helpers — unit tests.
 *
 * Coverage targets:
 *   - findJobTitle / findJobTitleByLabel — the lookup primitives
 *   - memberKind — fallback chain (jobTitle → Member.type → 'operator')
 *   - isAccountManager / isOperator — boolean wrappers
 *   - memberJobTitleLabel — display text resolution
 *   - pickMigratedJobTitleId — the Phase-2 migration mapping
 *
 * Phase 2 of the role refactor.
 */

import { describe, it, expect } from 'vitest';
import {
  findJobTitle,
  findJobTitleByLabel,
  memberKind,
  isAccountManager,
  isOperator,
  memberJobTitleLabel,
  pickMigratedJobTitleId,
  DEFAULT_JOB_TITLES,
  SEED_JOB_TITLE_ID_AM,
  SEED_JOB_TITLE_ID_OPERATOR,
} from '../utils/jobTitles';
import type { JobTitle, Member } from '../types/flizow';

// ── Fixtures ─────────────────────────────────────────────────────────

const TITLES: JobTitle[] = [...DEFAULT_JOB_TITLES];

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'm-1',
  initials: 'M1',
  name: 'Member One',
  color: '#000',
  type: 'operator',
  ...overrides,
});

// ── findJobTitle / findJobTitleByLabel ──────────────────────────────

describe('findJobTitle()', () => {
  it('returns the matching title by id', () => {
    const t = findJobTitle(TITLES, SEED_JOB_TITLE_ID_AM);
    expect(t?.label).toBe('Account Manager');
  });

  it('returns undefined for unknown id or empty input', () => {
    expect(findJobTitle(TITLES, 'jt-nonexistent')).toBeUndefined();
    expect(findJobTitle(TITLES, undefined)).toBeUndefined();
    expect(findJobTitle([], SEED_JOB_TITLE_ID_AM)).toBeUndefined();
  });
});

describe('findJobTitleByLabel()', () => {
  it('matches case-insensitively', () => {
    const t = findJobTitleByLabel(TITLES, 'designer');
    expect(t?.id).toBe('jt-designer');
  });

  it('handles surrounding whitespace', () => {
    const t = findJobTitleByLabel(TITLES, '  Designer ');
    expect(t?.id).toBe('jt-designer');
  });

  it('returns undefined for unknown label or empty input', () => {
    expect(findJobTitleByLabel(TITLES, 'Unicorn')).toBeUndefined();
    expect(findJobTitleByLabel(TITLES, undefined)).toBeUndefined();
    expect(findJobTitleByLabel(TITLES, '')).toBeUndefined();
  });
});

// ── memberKind ──────────────────────────────────────────────────────

describe('memberKind()', () => {
  it('reads the JobTitle when jobTitleId resolves', () => {
    const m = member({ jobTitleId: SEED_JOB_TITLE_ID_AM });
    expect(memberKind(m, TITLES)).toBe('account-manager');
  });

  it("falls back to Member.type 'am' → 'account-manager'", () => {
    const m = member({ type: 'am', jobTitleId: undefined });
    expect(memberKind(m, [])).toBe('account-manager');
  });

  it("falls back to Member.type 'operator' → 'operator'", () => {
    const m = member({ type: 'operator', jobTitleId: undefined });
    expect(memberKind(m, [])).toBe('operator');
  });

  it("ignores stale jobTitleId pointing at a deleted title", () => {
    const m = member({ jobTitleId: 'jt-deleted', type: 'am' });
    // No catalog match — falls through to Member.type.
    expect(memberKind(m, TITLES)).toBe('account-manager');
  });
});

describe('isAccountManager() / isOperator()', () => {
  it('returns the correct boolean per member', () => {
    const am = member({ jobTitleId: SEED_JOB_TITLE_ID_AM });
    const op = member({ jobTitleId: SEED_JOB_TITLE_ID_OPERATOR });

    expect(isAccountManager(am, TITLES)).toBe(true);
    expect(isAccountManager(op, TITLES)).toBe(false);

    expect(isOperator(am, TITLES)).toBe(false);
    expect(isOperator(op, TITLES)).toBe(true);
  });
});

// ── memberJobTitleLabel ─────────────────────────────────────────────

describe('memberJobTitleLabel()', () => {
  it('prefers the catalog label when jobTitleId resolves', () => {
    const m = member({ jobTitleId: 'jt-designer', role: 'Old Title' });
    expect(memberJobTitleLabel(m, TITLES)).toBe('Designer');
  });

  it('falls back to the legacy free-text role when no catalog match', () => {
    const m = member({ jobTitleId: undefined, role: 'Senior Strategist' });
    expect(memberJobTitleLabel(m, TITLES)).toBe('Senior Strategist');
  });

  it('returns "Account Manager" derived from the legacy am binary', () => {
    const m = member({ jobTitleId: undefined, role: undefined, type: 'am' });
    expect(memberJobTitleLabel(m, [])).toBe('Account Manager');
  });

  it('returns empty string when nothing useful is available', () => {
    const m = member({ jobTitleId: undefined, role: undefined, type: 'operator' });
    expect(memberJobTitleLabel(m, [])).toBe('');
  });
});

// ── pickMigratedJobTitleId ──────────────────────────────────────────

describe('pickMigratedJobTitleId()', () => {
  it('keeps an already-valid jobTitleId untouched', () => {
    const m = member({ jobTitleId: SEED_JOB_TITLE_ID_OPERATOR });
    expect(pickMigratedJobTitleId(m, TITLES)).toBe(SEED_JOB_TITLE_ID_OPERATOR);
  });

  it('matches the legacy free-text role to a catalog label exactly', () => {
    const m = member({ jobTitleId: undefined, role: 'Designer' });
    expect(pickMigratedJobTitleId(m, TITLES)).toBe('jt-designer');
  });

  it("falls back to the AM seed when role doesn't match and type='am'", () => {
    const m = member({ jobTitleId: undefined, role: undefined, type: 'am' });
    expect(pickMigratedJobTitleId(m, TITLES)).toBe(SEED_JOB_TITLE_ID_AM);
  });

  it("falls back to the Operator seed when role doesn't match and type='operator'", () => {
    const m = member({ jobTitleId: undefined, role: undefined, type: 'operator' });
    expect(pickMigratedJobTitleId(m, TITLES)).toBe(SEED_JOB_TITLE_ID_OPERATOR);
  });

  it('returns undefined when there are no titles in the catalog yet', () => {
    // Before the seed runs (defensive — caller seeds first), there's
    // nothing to migrate to.
    const m = member({ type: 'am' });
    expect(pickMigratedJobTitleId(m, [])).toBeUndefined();
  });

  it('drops a stale jobTitleId pointing at a deleted catalog entry', () => {
    const m = member({ jobTitleId: 'jt-deleted', role: 'Designer' });
    // The pointer is dead → the function re-resolves via label match.
    expect(pickMigratedJobTitleId(m, TITLES)).toBe('jt-designer');
  });
});

// ── Default seed sanity ─────────────────────────────────────────────

describe('DEFAULT_JOB_TITLES', () => {
  it('has exactly five titles and stable ids', () => {
    expect(TITLES).toHaveLength(5);
    const ids = TITLES.map((t) => t.id);
    expect(ids).toContain(SEED_JOB_TITLE_ID_AM);
    expect(ids).toContain(SEED_JOB_TITLE_ID_OPERATOR);
  });

  it('only "Account Manager" is categorised as account-manager kind', () => {
    const ams = TITLES.filter((t) => t.kind === 'account-manager');
    expect(ams).toHaveLength(1);
    expect(ams[0].id).toBe(SEED_JOB_TITLE_ID_AM);
  });

  it('every title is active by default', () => {
    expect(TITLES.every((t) => t.active)).toBe(true);
  });
});
