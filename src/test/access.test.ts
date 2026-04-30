/**
 * Access role helpers — unit tests.
 *
 * Two pure pieces under test:
 *   1. `can(role, action)` — the permission matrix.
 *   2. `migrateAccessRole(value, isOwnerUid)` — the legacy mapper.
 *
 * Coverage focuses on the boundary cases that are easiest to break:
 *   - Tier inversions (Member can't do Admin things)
 *   - Owner uid wins over the literal old value
 *   - Unknown / undefined inputs deny by default
 *   - 'editor' (legacy) translates to 'member'
 *
 * Phase 1 of the role refactor. Grows alongside the can() matrix as
 * later phases add more granular actions.
 */

import { describe, it, expect } from 'vitest';
import {
  can,
  migrateAccessRole,
  ACCESS_ROLE_LABEL,
  ACCESS_ROLE_DESCRIPTION,
  type Action,
} from '../utils/access';
import type { AccessRole } from '../types/flizow';

// ── can(): page-visibility actions ───────────────────────────────────

describe('can() — page visibility', () => {
  it('allows everyone to view Home and Clients (default surfaces)', () => {
    const roles: AccessRole[] = ['owner', 'admin', 'member', 'viewer'];
    for (const r of roles) {
      expect(can(r, 'view:home')).toBe(true);
      expect(can(r, 'view:clients')).toBe(true);
    }
  });

  it('hides Ops and Templates from Members and Viewers', () => {
    expect(can('member', 'view:ops')).toBe(false);
    expect(can('viewer', 'view:ops')).toBe(false);
    expect(can('member', 'view:templates')).toBe(false);
    expect(can('viewer', 'view:templates')).toBe(false);
  });

  it('shows Ops and Templates to Owner and Admin', () => {
    expect(can('owner', 'view:ops')).toBe(true);
    expect(can('admin', 'view:ops')).toBe(true);
    expect(can('owner', 'view:templates')).toBe(true);
    expect(can('admin', 'view:templates')).toBe(true);
  });

  it('Member sees Analytics + Weekly WIP per the role spec', () => {
    expect(can('member', 'view:analytics')).toBe(true);
    expect(can('member', 'view:wip')).toBe(true);
  });

  it('Viewer is read-only and does not see Analytics or WIP', () => {
    expect(can('viewer', 'view:analytics')).toBe(false);
    expect(can('viewer', 'view:wip')).toBe(false);
  });
});

// ── can(): workspace management actions ──────────────────────────────

describe('can() — workspace management', () => {
  it('only Owner can manage billing or transfer ownership', () => {
    expect(can('owner', 'manage:billing')).toBe(true);
    expect(can('admin', 'manage:billing')).toBe(false);
    expect(can('member', 'manage:billing')).toBe(false);

    expect(can('owner', 'transfer:ownership')).toBe(true);
    expect(can('admin', 'transfer:ownership')).toBe(false);
  });

  it('Owner and Admin can manage members + workspace settings', () => {
    expect(can('owner', 'manage:members')).toBe(true);
    expect(can('admin', 'manage:members')).toBe(true);
    expect(can('owner', 'manage:workspace')).toBe(true);
    expect(can('admin', 'manage:workspace')).toBe(true);
  });

  it('Member and Viewer cannot manage members', () => {
    expect(can('member', 'manage:members')).toBe(false);
    expect(can('viewer', 'manage:members')).toBe(false);
  });
});

// ── can(): time off ──────────────────────────────────────────────────

describe('can() — time off', () => {
  it('every role can submit time off, including viewer', () => {
    // Read-only on the app doesn't mean "can't take a holiday."
    const roles: AccessRole[] = ['owner', 'admin', 'member', 'viewer'];
    for (const r of roles) {
      expect(can(r, 'submit:time-off')).toBe(true);
    }
  });

  it('only Owner and Admin can approve time off', () => {
    expect(can('owner', 'approve:time-off')).toBe(true);
    expect(can('admin', 'approve:time-off')).toBe(true);
    expect(can('member', 'approve:time-off')).toBe(false);
    expect(can('viewer', 'approve:time-off')).toBe(false);
  });
});

// ── can(): defensive / edge-case behaviour ───────────────────────────

describe('can() — edge cases', () => {
  it('returns false for undefined role on every action', () => {
    // Deny-by-default matters — legacy demo members have undefined
    // accessLevel and we don't want them silently treated as admin.
    const actions: Action[] = [
      'view:home',
      'manage:members',
      'submit:time-off',
      'approve:time-off',
    ];
    for (const a of actions) {
      expect(can(undefined, a)).toBe(false);
    }
  });
});

// ── migrateAccessRole() ──────────────────────────────────────────────

describe('migrateAccessRole()', () => {
  it("maps the workspace owner's uid to 'owner' regardless of old value", () => {
    expect(migrateAccessRole('admin',  true)).toBe('owner');
    expect(migrateAccessRole('editor', true)).toBe('owner');
    expect(migrateAccessRole('viewer', true)).toBe('owner');
    expect(migrateAccessRole(undefined, true)).toBe('owner');
  });

  it("translates legacy 'editor' to 'member' for non-owners", () => {
    expect(migrateAccessRole('editor', false)).toBe('member');
  });

  it('preserves valid current values for non-owners', () => {
    expect(migrateAccessRole('admin',  false)).toBe('admin');
    expect(migrateAccessRole('member', false)).toBe('member');
    expect(migrateAccessRole('viewer', false)).toBe('viewer');
    expect(migrateAccessRole('owner',  false)).toBe('owner');
  });

  it('returns undefined for unknown / undefined non-owner values', () => {
    // Caller decides the default; the migration function won't
    // invent a role for legacy members that never had one.
    expect(migrateAccessRole(undefined, false)).toBe(undefined);
    expect(migrateAccessRole('superuser', false)).toBe(undefined);
    expect(migrateAccessRole('', false)).toBe(undefined);
  });
});

// ── Display labels (smoke test) ──────────────────────────────────────

describe('ACCESS_ROLE_LABEL + DESCRIPTION', () => {
  it('has a non-empty label and description for every role', () => {
    const roles: AccessRole[] = ['owner', 'admin', 'member', 'viewer'];
    for (const r of roles) {
      expect(ACCESS_ROLE_LABEL[r]).toBeTruthy();
      expect(ACCESS_ROLE_DESCRIPTION[r]).toBeTruthy();
      // Sanity: descriptions are sentences, not empty filler.
      expect(ACCESS_ROLE_DESCRIPTION[r].length).toBeGreaterThan(20);
    }
  });
});
