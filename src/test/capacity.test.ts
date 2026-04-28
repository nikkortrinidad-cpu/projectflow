/**
 * Capacity helpers — unit tests.
 *
 * Three pure functions, no React, no store. Coverage focuses on the
 * subtle parts: missing-field defaults, override fallback chain,
 * archived/done exclusion, multi-owner tasks not double-counting,
 * and the green/amber/red boundary conditions on zoneFor.
 *
 * Audit: capacity model Phase 1.
 */

import { describe, it, expect } from 'vitest';
import {
  loadFor,
  effectiveCapFor,
  zoneFor,
  DEFAULT_CAP_SOFT,
  DEFAULT_CAP_MAX,
} from '../utils/capacity';
import type { Member, MemberDayOverride, Task } from '../types/flizow';

// ── Fixtures ─────────────────────────────────────────────────────────

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'm1',
  name: 'Test',
  initials: 'TT',
  color: '#000',
  type: 'operator',
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  serviceId: 's1',
  clientId: 'c1',
  title: 'Test task',
  columnId: 'todo',
  priority: 'medium',
  assigneeId: 'm1',
  labels: [],
  dueDate: '2026-04-30',
  createdAt: '2026-04-01T00:00:00.000Z',
  ...overrides,
});

// ── loadFor ──────────────────────────────────────────────────────────

describe('loadFor', () => {
  it('returns 0 when no tasks match', () => {
    expect(loadFor('m1', '2026-04-30', [])).toBe(0);
  });

  it('counts tasks with matching assignee + dueDate', () => {
    const tasks = [
      task({ id: 't1' }),
      task({ id: 't2' }),
      task({ id: 't3' }),
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(3);
  });

  it('uses task.slots when set', () => {
    const tasks = [
      task({ id: 't1', slots: 4 }),
      task({ id: 't2', slots: 2 }),
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(6);
  });

  it('defaults missing slots to 1', () => {
    const tasks = [
      task({ id: 't1' }),                  // no slots → 1
      task({ id: 't2', slots: 3 }),
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(4);
  });

  it('handles fractional slots', () => {
    const tasks = [
      task({ id: 't1', slots: 0.5 }),
      task({ id: 't2', slots: 1.5 }),
      task({ id: 't3', slots: 0 }),        // explicit zero — overhead task
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(2);
  });

  it('excludes tasks for other members', () => {
    const tasks = [
      task({ id: 't1', assigneeId: 'm1' }),
      task({ id: 't2', assigneeId: 'm2' }),
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(1);
  });

  it('excludes tasks on other dates', () => {
    const tasks = [
      task({ id: 't1', dueDate: '2026-04-30' }),
      task({ id: 't2', dueDate: '2026-05-01' }),
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(1);
  });

  it('excludes archived tasks', () => {
    const tasks = [
      task({ id: 't1' }),
      task({ id: 't2', archived: true }),
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(1);
  });

  it('excludes done tasks', () => {
    const tasks = [
      task({ id: 't1' }),
      task({ id: 't2', columnId: 'done' }),
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(1);
  });

  it('does NOT count tasks where the member is in assigneeIds[] but not assigneeId (multi-owner = no shared load)', () => {
    const tasks = [
      // Primary owner is m2; m1 is just a co-owner. m1 absorbs zero slots.
      task({
        id: 't1',
        assigneeId: 'm2',
        assigneeIds: ['m2', 'm1'],
        slots: 3,
      }),
    ];
    expect(loadFor('m1', '2026-04-30', tasks)).toBe(0);
    expect(loadFor('m2', '2026-04-30', tasks)).toBe(3);
  });
});

// ── effectiveCapFor ──────────────────────────────────────────────────

describe('effectiveCapFor', () => {
  it('returns defaults when member has no caps and no override', () => {
    const result = effectiveCapFor('m1', '2026-04-30', [member()], []);
    expect(result).toEqual({ soft: DEFAULT_CAP_SOFT, max: DEFAULT_CAP_MAX });
  });

  it('uses standing caps when set on the member', () => {
    const result = effectiveCapFor(
      'm1',
      '2026-04-30',
      [member({ capSoft: 4, capMax: 6 })],
      [],
    );
    expect(result).toEqual({ soft: 4, max: 6 });
  });

  it('per-day override wins over standing caps', () => {
    const overrides: MemberDayOverride[] = [
      { memberId: 'm1', date: '2026-04-30', capSoft: 2, capMax: 3 },
    ];
    const result = effectiveCapFor(
      'm1',
      '2026-04-30',
      [member({ capSoft: 6, capMax: 8 })],
      overrides,
    );
    expect(result).toEqual({ soft: 2, max: 3 });
  });

  it('per-day override only applies on its date', () => {
    const overrides: MemberDayOverride[] = [
      { memberId: 'm1', date: '2026-04-30', capSoft: 2, capMax: 3 },
    ];
    // Different date — fall back to standing caps.
    const result = effectiveCapFor(
      'm1',
      '2026-05-01',
      [member({ capSoft: 6, capMax: 8 })],
      overrides,
    );
    expect(result).toEqual({ soft: 6, max: 8 });
  });

  it('per-day override only applies to its member', () => {
    const overrides: MemberDayOverride[] = [
      { memberId: 'm2', date: '2026-04-30', capSoft: 2, capMax: 3 },
    ];
    const result = effectiveCapFor(
      'm1',
      '2026-04-30',
      [member({ id: 'm1' }), member({ id: 'm2' })],
      overrides,
    );
    expect(result).toEqual({ soft: DEFAULT_CAP_SOFT, max: DEFAULT_CAP_MAX });
  });

  it('falls back to defaults when the member is not found', () => {
    const result = effectiveCapFor('ghost', '2026-04-30', [member()], []);
    expect(result).toEqual({ soft: DEFAULT_CAP_SOFT, max: DEFAULT_CAP_MAX });
  });
});

// ── zoneFor ──────────────────────────────────────────────────────────

describe('zoneFor', () => {
  const caps = { soft: 6, max: 8 };

  it('returns green when load is under soft cap', () => {
    expect(zoneFor(0, caps)).toBe('green');
    expect(zoneFor(3, caps)).toBe('green');
    expect(zoneFor(6, caps)).toBe('green');           // boundary: load === soft is still green
  });

  it('returns amber when load is over soft but under max', () => {
    expect(zoneFor(7, caps)).toBe('amber');
    expect(zoneFor(8, caps)).toBe('amber');           // boundary: load === max is amber
  });

  it('returns red when load is over max', () => {
    expect(zoneFor(9, caps)).toBe('red');
    expect(zoneFor(15, caps)).toBe('red');
  });

  it('handles fractional loads', () => {
    expect(zoneFor(6.5, caps)).toBe('amber');
    expect(zoneFor(7.99, caps)).toBe('amber');
    expect(zoneFor(8.01, caps)).toBe('red');
  });
});
