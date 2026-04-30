/**
 * migrateWorkspaceAccessRoles — coverage for the rules-tightening
 * memberRoles backfill (May 1, 2026).
 *
 * The pure migration sweep lives in flizowStore.ts and is exported
 * for direct testing here. Coverage:
 *   - Backfills memberRoles when missing from a legacy doc
 *   - Re-syncs memberRoles when it drifts from members[] (e.g. an
 *     out-of-band write that changed members but not the map)
 *   - Idempotent on a fully-migrated doc
 *   - Owner uid always lands in memberRoles as 'owner'
 *   - 'editor' members migrate to 'member' AND get the right role
 *     in memberRoles
 *
 * Phase 1 of the Firestore-rule tightening.
 */

import { describe, it, expect } from 'vitest';
import { migrateWorkspaceAccessRoles } from '../store/flizowStore';
import type { WorkspaceDoc, FlizowData, AccessRole } from '../types/flizow';

// ── Fixtures ────────────────────────────────────────────────────────

function emptyData(): FlizowData {
  return {
    clients: [], services: [], tasks: [], members: [],
    integrations: [], onboardingItems: [], contacts: [], quickLinks: [],
    notes: [], touchpoints: [], actionItems: [], taskComments: [],
    taskActivity: [], manualAgendaItems: [], meetingCaptures: [],
    memberDayOverrides: [], today: '2026-05-01',
    opsTasks: [], scheduleTaskMap: {}, favoriteServiceIds: [],
    templateOverrides: [], theme: 'light', opsSeeded: true, trash: [],
    jobTitles: [], timeOffRequests: [], coverageRules: [], holidays: [],
    holidayObservations: [], creditExpiryPolicy: 'end-of-year',
  };
}

function workspace(overrides: Partial<WorkspaceDoc> = {}): WorkspaceDoc {
  return {
    ownerUid: 'owner-uid',
    name: 'Test Workspace',
    initials: 'TW',
    color: '#5e5ce6',
    members: [],
    memberUids: [],
    memberRoles: {},
    pendingInvites: [],
    data: emptyData(),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── memberRoles backfill ────────────────────────────────────────────

describe('migrateWorkspaceAccessRoles — memberRoles backfill', () => {
  it('backfills memberRoles when missing on a legacy doc', () => {
    // Pre-2026-05-01 doc: members[] populated, memberRoles is an
    // empty object (or absent). Migration should derive the map
    // from members[].
    const ws = workspace({
      members: [
        { uid: 'owner-uid', role: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
        { uid: 'sarah-uid', role: 'admin', joinedAt: '2026-02-01T00:00:00Z' },
        { uid: 'mike-uid',  role: 'member', joinedAt: '2026-02-15T00:00:00Z' },
      ],
      memberUids: ['owner-uid', 'sarah-uid', 'mike-uid'],
      memberRoles: {}, // empty — pre-tightening
    });
    const out = migrateWorkspaceAccessRoles(ws);
    expect(out.changed).toBe(true);
    expect(out.ws.memberRoles).toEqual({
      'owner-uid': 'owner',
      'sarah-uid': 'admin',
      'mike-uid':  'member',
    });
  });

  it('migrates legacy editor → member AND lands the right role in memberRoles', () => {
    const ws = workspace({
      members: [
        { uid: 'owner-uid', role: 'admin' as AccessRole, joinedAt: '2026-01-01T00:00:00Z' },
        // Old enum: editor → migrates to member.
        { uid: 'sarah-uid', role: 'editor' as unknown as AccessRole, joinedAt: '2026-02-01T00:00:00Z' },
      ],
      memberUids: ['owner-uid', 'sarah-uid'],
      memberRoles: {}, // empty — pre-tightening
    });
    const out = migrateWorkspaceAccessRoles(ws);
    expect(out.changed).toBe(true);
    // Owner uid always lands as 'owner' (overrides whatever was there).
    expect(out.ws.memberRoles['owner-uid']).toBe('owner');
    // editor → member.
    expect(out.ws.memberRoles['sarah-uid']).toBe('member');
    // members[] also gets the new role string.
    expect(out.ws.members.find((m) => m.uid === 'sarah-uid')?.role).toBe('member');
  });

  it('re-syncs memberRoles when it drifts from members[]', () => {
    // Edge case: out-of-band write changed members[] without
    // updating memberRoles. Migration should re-derive.
    const ws = workspace({
      members: [
        { uid: 'owner-uid', role: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
        { uid: 'sarah-uid', role: 'admin', joinedAt: '2026-02-01T00:00:00Z' },
      ],
      memberUids: ['owner-uid', 'sarah-uid'],
      memberRoles: {
        // Stale: sarah is 'member' here but actually 'admin' on members[].
        'owner-uid': 'owner',
        'sarah-uid': 'member',
      },
    });
    const out = migrateWorkspaceAccessRoles(ws);
    expect(out.changed).toBe(true);
    expect(out.ws.memberRoles['sarah-uid']).toBe('admin');
  });

  it('is idempotent on a fully-migrated doc', () => {
    const ws = workspace({
      members: [
        { uid: 'owner-uid', role: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
        { uid: 'sarah-uid', role: 'member', joinedAt: '2026-02-01T00:00:00Z' },
      ],
      memberUids: ['owner-uid', 'sarah-uid'],
      memberRoles: {
        'owner-uid': 'owner',
        'sarah-uid': 'member',
      },
    });
    const out = migrateWorkspaceAccessRoles(ws);
    expect(out.changed).toBe(false);
  });

  it("flags drift when member count differs (someone was added but map didn't update)", () => {
    const ws = workspace({
      members: [
        { uid: 'owner-uid', role: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
        { uid: 'sarah-uid', role: 'member', joinedAt: '2026-02-01T00:00:00Z' },
      ],
      memberUids: ['owner-uid', 'sarah-uid'],
      memberRoles: {
        // Only the owner — sarah missing.
        'owner-uid': 'owner',
      },
    });
    const out = migrateWorkspaceAccessRoles(ws);
    expect(out.changed).toBe(true);
    expect(Object.keys(out.ws.memberRoles).length).toBe(2);
  });
});
