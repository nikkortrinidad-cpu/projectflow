/**
 * Notification derivation — Phase 7 paths.
 *
 * Coverage targets the two new categories layered onto the existing
 * deriveNotifications pipeline:
 *   1. Pending time-off requests visible to Owner/Admin only
 *   2. Decided requests (approved/denied) visible to the requester,
 *      windowed to the last 14 days
 *
 * Each derivation has stable ids — tests assert against them so the
 * read-state mechanism in the panel can rely on the same keys.
 *
 * Phase 7 of the time-off system.
 */

import { describe, it, expect } from 'vitest';
import { deriveNotifications } from '../data/deriveNotifications';
import type { FlizowData, Member, TimeOffRequest } from '../types/flizow';

// ── Fixtures ─────────────────────────────────────────────────────────

function emptyDataWith(overrides: Partial<FlizowData> = {}): FlizowData {
  return {
    clients: [],
    services: [],
    tasks: [],
    members: [],
    integrations: [],
    onboardingItems: [],
    contacts: [],
    quickLinks: [],
    notes: [],
    touchpoints: [],
    actionItems: [],
    taskComments: [],
    taskActivity: [],
    manualAgendaItems: [],
    meetingCaptures: [],
    memberDayOverrides: [],
    today: '2026-05-15',
    opsTasks: [],
    scheduleTaskMap: {},
    favoriteServiceIds: [],
    templateOverrides: [],
    theme: 'light',
    opsSeeded: true,
    trash: [],
    jobTitles: [],
    timeOffRequests: [],
    coverageRules: [],
    holidays: [],
    ...overrides,
  };
}

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'm-1',
  initials: 'M1',
  name: 'Member One',
  color: '#000',
  type: 'operator',
  ...overrides,
});

const req = (overrides: Partial<TimeOffRequest> = {}): TimeOffRequest => ({
  id: `tor-${Math.random().toString(36).slice(2, 9)}`,
  memberId: 'm-1',
  start: '2026-05-20',
  end: '2026-05-22',
  status: 'pending',
  requestedAt: '2026-05-10T10:00:00Z',
  ...overrides,
});

// ── Pending notifications (admin-side) ──────────────────────────────

describe('deriveNotifications — pending time-off requests', () => {
  it('surfaces one pending notification per request to admins', () => {
    const data = emptyDataWith({
      members: [
        member({ id: 'admin-1', name: 'Admin One',    accessLevel: 'admin' }),
        member({ id: 'sarah',   name: 'Sarah Connor', accessLevel: 'member' }),
        member({ id: 'mike',    name: 'Mike Smith',   accessLevel: 'member' }),
      ],
      timeOffRequests: [
        req({ id: 'r1', memberId: 'sarah', status: 'pending' }),
        req({ id: 'r2', memberId: 'mike',  status: 'pending' }),
      ],
    });
    const items = deriveNotifications(data, 'admin-1');
    const pendingItems = items.filter((n) => n.id.startsWith('tor-pending-'));
    expect(pendingItems).toHaveLength(2);
    expect(pendingItems[0].id).toBe('tor-pending-r1');
    expect(pendingItems[0].type).toBe('time_off');
    expect(pendingItems[0].text).toContain('Sarah Connor'); // requester name in bold
  });

  it('also surfaces pending notifications to the workspace owner', () => {
    const data = emptyDataWith({
      members: [
        member({ id: 'owner-1', accessLevel: 'owner' }),
        member({ id: 'sarah',   accessLevel: 'member' }),
      ],
      timeOffRequests: [
        req({ id: 'r1', memberId: 'sarah', status: 'pending' }),
      ],
    });
    const items = deriveNotifications(data, 'owner-1');
    expect(items.some((n) => n.id === 'tor-pending-r1')).toBe(true);
  });

  it("doesn't show pending notifications to plain members", () => {
    const data = emptyDataWith({
      members: [
        member({ id: 'sarah', accessLevel: 'member' }),
        member({ id: 'mike',  accessLevel: 'member' }),
      ],
      timeOffRequests: [
        req({ id: 'r1', memberId: 'mike', status: 'pending' }),
      ],
    });
    const items = deriveNotifications(data, 'sarah');
    expect(items.find((n) => n.id.startsWith('tor-pending-'))).toBeUndefined();
  });

  it("doesn't show pending notifications to viewers", () => {
    const data = emptyDataWith({
      members: [
        member({ id: 'viewer-1', accessLevel: 'viewer' }),
        member({ id: 'sarah',    accessLevel: 'member' }),
      ],
      timeOffRequests: [
        req({ id: 'r1', memberId: 'sarah', status: 'pending' }),
      ],
    });
    const items = deriveNotifications(data, 'viewer-1');
    expect(items.find((n) => n.id.startsWith('tor-pending-'))).toBeUndefined();
  });

  it('caps at 6 pending notifications', () => {
    const data = emptyDataWith({
      members: [
        member({ id: 'admin-1', accessLevel: 'admin' }),
        member({ id: 'sarah',   accessLevel: 'member' }),
      ],
      timeOffRequests: Array.from({ length: 10 }, (_, i) =>
        req({ id: `r${i}`, memberId: 'sarah', status: 'pending' }),
      ),
    });
    const items = deriveNotifications(data, 'admin-1');
    const pending = items.filter((n) => n.id.startsWith('tor-pending-'));
    expect(pending.length).toBeLessThanOrEqual(6);
  });

  it('respects the urgent pref toggle', () => {
    const data = emptyDataWith({
      members: [
        member({ id: 'admin-1', accessLevel: 'admin', notifPrefs: { urgent: false } }),
        member({ id: 'sarah',   accessLevel: 'member' }),
      ],
      timeOffRequests: [
        req({ id: 'r1', memberId: 'sarah', status: 'pending' }),
      ],
    });
    const items = deriveNotifications(data, 'admin-1');
    expect(items.find((n) => n.id.startsWith('tor-pending-'))).toBeUndefined();
  });
});

// ── Decided notifications (requester-side) ──────────────────────────

describe('deriveNotifications — decided time-off requests', () => {
  it('surfaces approved decisions to the requester', () => {
    const data = emptyDataWith({
      members: [member({ id: 'sarah', accessLevel: 'member' })],
      timeOffRequests: [
        req({
          id: 'r1',
          memberId: 'sarah',
          status: 'approved',
          requestedAt: '2026-05-10T10:00:00Z',
          decidedAt: '2026-05-12T10:00:00Z',
        }),
      ],
    });
    const items = deriveNotifications(data, 'sarah');
    const decided = items.find((n) => n.id === 'tor-decided-r1');
    expect(decided).toBeDefined();
    expect(decided?.text.toLowerCase()).toContain('approved');
  });

  it('surfaces denied decisions with the decision note in context', () => {
    const data = emptyDataWith({
      members: [member({ id: 'sarah', accessLevel: 'member' })],
      timeOffRequests: [
        req({
          id: 'r1',
          memberId: 'sarah',
          status: 'denied',
          decidedAt: '2026-05-12T10:00:00Z',
          decisionNote: 'Big launch that week',
        }),
      ],
    });
    const items = deriveNotifications(data, 'sarah');
    const decided = items.find((n) => n.id === 'tor-decided-r1');
    expect(decided?.text.toLowerCase()).toContain('denied');
    expect(decided?.context).toContain('Big launch');
  });

  it("doesn't show another member's decisions", () => {
    const data = emptyDataWith({
      members: [
        member({ id: 'sarah', accessLevel: 'member' }),
        member({ id: 'mike',  accessLevel: 'member' }),
      ],
      timeOffRequests: [
        req({
          id: 'r1',
          memberId: 'mike',
          status: 'approved',
          decidedAt: '2026-05-12T10:00:00Z',
        }),
      ],
    });
    const items = deriveNotifications(data, 'sarah');
    expect(items.find((n) => n.id === 'tor-decided-r1')).toBeUndefined();
  });

  it('windows decided notifications to the last 14 days', () => {
    const data = emptyDataWith({
      // today = '2026-05-15'; cutoff = 2026-05-01
      members: [member({ id: 'sarah', accessLevel: 'member' })],
      timeOffRequests: [
        req({
          id: 'recent',
          memberId: 'sarah',
          status: 'approved',
          decidedAt: '2026-05-12T10:00:00Z',
        }),
        req({
          id: 'stale',
          memberId: 'sarah',
          status: 'approved',
          decidedAt: '2026-04-01T10:00:00Z',
        }),
      ],
    });
    const items = deriveNotifications(data, 'sarah');
    expect(items.find((n) => n.id === 'tor-decided-recent')).toBeDefined();
    expect(items.find((n) => n.id === 'tor-decided-stale')).toBeUndefined();
  });

  it("ignores still-pending requests in the decided category", () => {
    const data = emptyDataWith({
      members: [member({ id: 'sarah', accessLevel: 'member' })],
      timeOffRequests: [
        req({ id: 'r1', memberId: 'sarah', status: 'pending' }),
      ],
    });
    const items = deriveNotifications(data, 'sarah');
    expect(items.find((n) => n.id === 'tor-decided-r1')).toBeUndefined();
  });
});
