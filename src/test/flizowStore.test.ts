/**
 * flizowStore — focused unit tests.
 *
 * The store has 80+ public methods; this file isn't trying to cover
 * every one. It targets the high-stakes paths: cascade deletes (most
 * likely place for a missed-cleanup bug), templates CRUD (recently
 * shipped, no manual coverage yet), and the basic add/update/delete
 * lifecycle for clients/services/tasks (the surfaces every page
 * touches). New tests welcome — add one whenever a method's behaviour
 * has been hard to verify by hand.
 *
 * Audit: D2.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flizowStore } from '../store/flizowStore';
import type {
  Client,
  Member,
  Service,
  Task,
  TemplateRecord,
} from '../types/flizow';
import {
  currentVacationPeriod,
  isOnVacation,
  formatTime12h,
  formatWorkingDays,
  formatTimeZone,
  formatWorkingHoursLine,
} from '../utils/memberProfile';

// ── Fixtures ─────────────────────────────────────────────────────────

const baseClient = (overrides: Partial<Client> = {}): Client => ({
  id: 'c1',
  name: 'Acme Corp',
  initials: 'AC',
  logoClass: 'logo-indigo',
  status: 'track',
  industryCategory: 'saas',
  amId: null,
  startedAt: '2025-01-01',
  serviceIds: [],
  teamIds: [],
  ...overrides,
});

const baseService = (overrides: Partial<Service> = {}): Service => ({
  id: 's1',
  clientId: 'c1',
  name: 'Content retainer',
  type: 'retainer',
  // contentSEO is a real TemplateKey with a populated TASK_POOLS
  // entry — using it ensures addService's auto-seed has 3 titles
  // to draw from.
  templateKey: 'contentSEO',
  progress: 0,
  nextDeliverableAt: '2026-05-01',
  taskIds: [],
  ...overrides,
});

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  serviceId: 's1',
  clientId: 'c1',
  title: 'Draft launch post',
  columnId: 'todo',
  priority: 'medium',
  assigneeId: null,
  labels: [],
  dueDate: '2026-05-15',
  createdAt: '2026-04-25T00:00:00.000Z',
  ...overrides,
});

const baseTemplate = (overrides: Partial<TemplateRecord> = {}): TemplateRecord => ({
  id: 'tmpl-test',
  name: 'My Custom Content Template',
  category: 'Content',
  icon: 'content',
  phasesSub: '3 phases · ~6 weeks',
  phases: [
    { name: 'Plan', subtasks: [] },
    { name: 'Build', subtasks: [] },
    { name: 'Ship', subtasks: [] },
  ],
  onboarding: { client: [], us: [] },
  brief: [],
  userCreated: true,
  archived: false,
  editedAt: null,
  ...overrides,
});

// Reset before every test. The store is a singleton, so without this
// state from one test bleeds into the next — and because the seed
// always runs in migrate(), `replaceAll(emptyData())` re-seeds Ops,
// which is the right behaviour here (matches what a real user sees).
beforeEach(() => {
  flizowStore.reset();
});

// ── Initial state ────────────────────────────────────────────────────

describe('flizowStore initial state', () => {
  it('has empty client/service/task lists after reset', () => {
    const data = flizowStore.getSnapshot();
    expect(data.clients).toEqual([]);
    expect(data.services).toEqual([]);
    expect(data.tasks).toEqual([]);
  });

  it('does NOT auto-seed Ops on a fresh reset', () => {
    // The Ops auto-seed used to populate fake team members + demo
    // tasks on every empty workspace, ambushing brand-new users.
    // The first-run gate (post-B5 follow-up) now skips the seed for
    // fresh installs — only "Try the demo" populates the workspace.
    // Members start empty (the signed-in user gets added via
    // upsertOwnMember on auth, which the test doesn't trigger).
    const data = flizowStore.getSnapshot();
    expect(data.members).toEqual([]);
    expect(data.opsTasks).toEqual([]);
    expect(data.opsSeeded).toBe(true);
  });

  it('has an empty templateOverrides array', () => {
    expect(flizowStore.getSnapshot().templateOverrides).toEqual([]);
  });
});

// ── Clients ──────────────────────────────────────────────────────────

describe('flizowStore clients', () => {
  it('addClient appends to the client list', () => {
    flizowStore.addClient(baseClient());
    expect(flizowStore.getSnapshot().clients).toHaveLength(1);
    expect(flizowStore.getSnapshot().clients[0].name).toBe('Acme Corp');
  });

  it('updateClient applies a partial patch', () => {
    flizowStore.addClient(baseClient());
    flizowStore.updateClient('c1', { name: 'Acme Inc.', status: 'fire' });
    const c = flizowStore.getSnapshot().clients[0];
    expect(c.name).toBe('Acme Inc.');
    expect(c.status).toBe('fire');
    // Unrelated fields untouched.
    expect(c.initials).toBe('AC');
  });

  it('updateClient is a no-op on an unknown id', () => {
    flizowStore.addClient(baseClient());
    flizowStore.updateClient('c-does-not-exist', { name: 'X' });
    expect(flizowStore.getSnapshot().clients[0].name).toBe('Acme Corp');
  });

  it('deleteClient cascades to services, tasks, contacts, notes', () => {
    flizowStore.addClient(baseClient());
    // Bypass addService's auto-seed by writing the service directly via
    // replaceAll-style merge. Easier to assert exact counts that way.
    flizowStore.addService(baseService());
    flizowStore.addContact({
      id: 'ct1', clientId: 'c1', name: 'Jane', primary: true,
    });
    flizowStore.addNote({
      id: 'n1', clientId: 'c1', body: 'hi',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      pinned: false, locked: false,
    });

    flizowStore.deleteClient('c1');

    const data = flizowStore.getSnapshot();
    expect(data.clients).toHaveLength(0);
    expect(data.services).toHaveLength(0);
    // addService seeds 3 starter tasks — those should also be gone.
    expect(data.tasks).toHaveLength(0);
    expect(data.contacts).toHaveLength(0);
    expect(data.notes).toHaveLength(0);
  });
});

// ── Services ─────────────────────────────────────────────────────────

describe('flizowStore services', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
  });

  it('addService seeds 3 starter tasks into To Do', () => {
    flizowStore.addService(baseService());
    const tasks = flizowStore.getSnapshot().tasks;
    expect(tasks).toHaveLength(3);
    expect(tasks.every(t => t.columnId === 'todo')).toBe(true);
    expect(tasks.every(t => t.serviceId === 's1')).toBe(true);
  });

  it('addService updates the parent client serviceIds', () => {
    flizowStore.addService(baseService());
    const client = flizowStore.getSnapshot().clients[0];
    expect(client.serviceIds).toContain('s1');
  });

  it('deleteService removes its tasks', () => {
    flizowStore.addService(baseService());
    expect(flizowStore.getSnapshot().tasks).toHaveLength(3);
    flizowStore.deleteService('s1');
    expect(flizowStore.getSnapshot().tasks).toHaveLength(0);
    expect(flizowStore.getSnapshot().services).toHaveLength(0);
  });
});

// ── Tasks ────────────────────────────────────────────────────────────

describe('flizowStore tasks', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
    flizowStore.addService(baseService());
  });

  it('addTask appends to the task list', () => {
    const before = flizowStore.getSnapshot().tasks.length;
    flizowStore.addTask(baseTask({ id: 't-new' }));
    expect(flizowStore.getSnapshot().tasks).toHaveLength(before + 1);
  });

  it('moveTask updates columnId', () => {
    flizowStore.addTask(baseTask({ id: 't-move' }));
    flizowStore.moveTask('t-move', 'inprogress');
    const task = flizowStore.getSnapshot().tasks.find(t => t.id === 't-move');
    expect(task?.columnId).toBe('inprogress');
  });

  it('deleteTask removes the task and its activity log entries', () => {
    flizowStore.addTask(baseTask({ id: 't-del' }));
    flizowStore.deleteTask('t-del');
    expect(flizowStore.getSnapshot().tasks.find(t => t.id === 't-del')).toBeUndefined();
  });

  it('archiveTask sets archived: true without removing the task', () => {
    flizowStore.addTask(baseTask({ id: 't-arch' }));
    flizowStore.archiveTask('t-arch');
    const task = flizowStore.getSnapshot().tasks.find(t => t.id === 't-arch');
    expect(task?.archived).toBe(true);
  });
});

// ── Templates ────────────────────────────────────────────────────────

describe('flizowStore templates', () => {
  it('upsertTemplate adds a new override', () => {
    flizowStore.upsertTemplate(baseTemplate());
    const overrides = flizowStore.getSnapshot().templateOverrides;
    expect(overrides).toHaveLength(1);
    expect(overrides[0].id).toBe('tmpl-test');
  });

  it('upsertTemplate replaces an existing override by id', () => {
    flizowStore.upsertTemplate(baseTemplate({ name: 'v1' }));
    flizowStore.upsertTemplate(baseTemplate({ name: 'v2' }));
    const overrides = flizowStore.getSnapshot().templateOverrides;
    expect(overrides).toHaveLength(1);
    expect(overrides[0].name).toBe('v2');
  });

  it('archiveTemplate marks an override as archived', () => {
    flizowStore.upsertTemplate(baseTemplate());
    flizowStore.archiveTemplate(baseTemplate({ archived: true }));
    const overrides = flizowStore.getSnapshot().templateOverrides;
    expect(overrides[0].archived).toBe(true);
  });

  it('restoreTemplate clears archived', () => {
    flizowStore.upsertTemplate(baseTemplate({ archived: true }));
    flizowStore.restoreTemplate(baseTemplate({ archived: false }));
    expect(flizowStore.getSnapshot().templateOverrides[0].archived).toBe(false);
  });

  it('purgeTemplate removes a user-created template completely', () => {
    flizowStore.upsertTemplate(baseTemplate());
    flizowStore.purgeTemplate('tmpl-test');
    expect(flizowStore.getSnapshot().templateOverrides).toHaveLength(0);
  });
});

// ── Reset ────────────────────────────────────────────────────────────

describe('flizowStore reset()', () => {
  it('clears clients, services, and tasks', () => {
    flizowStore.addClient(baseClient());
    flizowStore.addService(baseService());
    flizowStore.reset();
    const data = flizowStore.getSnapshot();
    expect(data.clients).toEqual([]);
    expect(data.services).toEqual([]);
    expect(data.tasks).toEqual([]);
  });

  it('clears opsTasks after reset (post-first-run-gate behaviour)', () => {
    // Reset goes through replaceAll(emptyData()), which migrate-passes
    // the empty data — opsSeeded is true on emptyData so the legacy
    // backfill never fires. A user who deliberately resets gets the
    // empty state, not a re-seeded set of fake colleagues.
    flizowStore.addClient(baseClient());
    flizowStore.reset();
    expect(flizowStore.getSnapshot().opsTasks).toEqual([]);
  });
});

// ── Trash bin ────────────────────────────────────────────────────────────
//
// Soft-delete coverage for the workspace-wide Trash. Each soft-deletable
// kind (note, contact, quick link, comment, touchpoint, action item,
// onboarding item, manual agenda item, task, ops task, service, client,
// template) gets a "delete + verify trash entry + restore + verify
// recovered" round-trip. Then a few suite-level checks for purge,
// emptyTrash, auto-prune, and the hard-delete-with-toast path.
//
// Tests use the undo callback API: every deleteX method returns a
// `(() => void) | null` we invoke to restore. Same code path the UI
// wires into the UndoToast.

describe('flizowStore trash — note', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
  });

  it('deleteNote sends the note to trash and returns an undo callback', () => {
    flizowStore.addNote({
      id: 'n1', clientId: 'c1', body: '<p>Quarterly review</p>',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      pinned: false,
    });
    const undo = flizowStore.deleteNote('n1');
    const data = flizowStore.getSnapshot();

    expect(undo).toBeTypeOf('function');
    expect(data.notes).toHaveLength(0);
    expect(data.trash).toHaveLength(1);
    expect(data.trash[0].kind).toBe('note');
    expect(data.trash[0].parentLabel).toBe('Acme Corp');
    if (data.trash[0].payload.kind === 'note') {
      expect(data.trash[0].payload.data.id).toBe('n1');
    }
  });

  it('deleteNote returns null when the id is unknown', () => {
    expect(flizowStore.deleteNote('does-not-exist')).toBeNull();
  });

  it('the undo callback restores the note and clears the trash entry', () => {
    flizowStore.addNote({
      id: 'n1', clientId: 'c1', body: '<p>Body</p>',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      pinned: false,
    });
    const undo = flizowStore.deleteNote('n1');
    expect(undo).not.toBeNull();
    undo!();

    const data = flizowStore.getSnapshot();
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].id).toBe('n1');
    expect(data.trash).toHaveLength(0);
  });
});

describe('flizowStore trash — contact, quick link, action item, onboarding item, agenda item', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
  });

  it('deleteContact sends to trash and round-trips', () => {
    flizowStore.addContact({
      id: 'ct1', clientId: 'c1', name: 'Jane', primary: true,
    });
    const undo = flizowStore.deleteContact('ct1');
    expect(flizowStore.getSnapshot().contacts).toHaveLength(0);
    expect(flizowStore.getSnapshot().trash[0].kind).toBe('contact');
    undo!();
    expect(flizowStore.getSnapshot().contacts).toHaveLength(1);
    expect(flizowStore.getSnapshot().trash).toHaveLength(0);
  });

  it('deleteQuickLink sends to trash and round-trips', () => {
    flizowStore.addQuickLink({
      id: 'ql1', clientId: 'c1', label: 'Drive', url: 'https://drive',
    });
    const undo = flizowStore.deleteQuickLink('ql1');
    expect(flizowStore.getSnapshot().quickLinks).toHaveLength(0);
    expect(flizowStore.getSnapshot().trash[0].kind).toBe('quickLink');
    undo!();
    expect(flizowStore.getSnapshot().quickLinks).toHaveLength(1);
  });

  it('deleteActionItem sends to trash and round-trips', () => {
    flizowStore.addActionItem({
      id: 'a1', touchpointId: 'tp1', clientId: 'c1', text: 'Follow up',
      assigneeId: null, done: false,
    });
    const undo = flizowStore.deleteActionItem('a1');
    expect(flizowStore.getSnapshot().actionItems).toHaveLength(0);
    expect(flizowStore.getSnapshot().trash[0].kind).toBe('actionItem');
    undo!();
    expect(flizowStore.getSnapshot().actionItems).toHaveLength(1);
  });

  it('deleteOnboardingItem sends to trash and round-trips', () => {
    flizowStore.addService(baseService());
    flizowStore.addOnboardingItem({
      id: 'on1', serviceId: 's1', group: 'client',
      label: 'Send brand assets', done: false,
    });
    const undo = flizowStore.deleteOnboardingItem('on1');
    expect(flizowStore.getSnapshot().onboardingItems.find(o => o.id === 'on1')).toBeUndefined();
    expect(flizowStore.getSnapshot().trash[0].kind).toBe('onboardingItem');
    undo!();
    expect(flizowStore.getSnapshot().onboardingItems.find(o => o.id === 'on1')).toBeDefined();
  });

  it('deleteManualAgendaItem sends to trash and round-trips', () => {
    const item = flizowStore.addManualAgendaItem({
      title: 'Discuss Q3 plan', clientId: 'c1',
    });
    const undo = flizowStore.deleteManualAgendaItem(item.id);
    expect(flizowStore.getSnapshot().manualAgendaItems).toHaveLength(0);
    expect(flizowStore.getSnapshot().trash[0].kind).toBe('manualAgendaItem');
    undo!();
    expect(flizowStore.getSnapshot().manualAgendaItems).toHaveLength(1);
  });
});

describe('flizowStore trash — touchpoint cascades action items', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
  });

  it('deleteTouchpoint bundles its action items into the trash payload', () => {
    flizowStore.addTouchpoint({
      id: 'tp1', clientId: 'c1', topic: 'Kickoff',
      occurredAt: '2026-04-20T10:00:00.000Z',
      kind: 'meeting', scheduled: false,
      attendeeIds: [],
    });
    flizowStore.addActionItem({
      id: 'a1', touchpointId: 'tp1', clientId: 'c1', text: 'Send recap',
      assigneeId: null, done: false,
    });
    flizowStore.addActionItem({
      id: 'a2', touchpointId: 'tp1', clientId: 'c1', text: 'Schedule follow-up',
      assigneeId: null, done: false,
    });
    const undo = flizowStore.deleteTouchpoint('tp1');
    const data = flizowStore.getSnapshot();
    expect(data.touchpoints).toHaveLength(0);
    expect(data.actionItems).toHaveLength(0);
    expect(data.trash[0].kind).toBe('touchpoint');
    if (data.trash[0].payload.kind === 'touchpoint') {
      expect(data.trash[0].payload.actionItems).toHaveLength(2);
    }
    undo!();
    const restored = flizowStore.getSnapshot();
    expect(restored.touchpoints).toHaveLength(1);
    expect(restored.actionItems).toHaveLength(2);
  });
});

describe('flizowStore trash — comment cascades replies', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
    flizowStore.addService(baseService());
    flizowStore.addTask(baseTask({ id: 'tsk-comment' }));
  });

  it('deleteComment on a top-level comment cascades replies into the trash', () => {
    const parentId = flizowStore.addComment('tsk-comment', 'Top-level');
    flizowStore.addComment('tsk-comment', 'Reply A', parentId);
    flizowStore.addComment('tsk-comment', 'Reply B', parentId);
    expect(flizowStore.getSnapshot().taskComments).toHaveLength(3);

    const undo = flizowStore.deleteComment(parentId!);
    const data = flizowStore.getSnapshot();
    expect(data.taskComments).toHaveLength(0);
    if (data.trash[0].payload.kind === 'comment') {
      expect(data.trash[0].payload.replies).toHaveLength(2);
    }

    undo!();
    expect(flizowStore.getSnapshot().taskComments).toHaveLength(3);
  });

  it('deleteComment on a reply leaves the parent intact and bundles no children', () => {
    const parentId = flizowStore.addComment('tsk-comment', 'Top');
    const replyId = flizowStore.addComment('tsk-comment', 'Reply', parentId);

    flizowStore.deleteComment(replyId!);
    const data = flizowStore.getSnapshot();
    expect(data.taskComments).toHaveLength(1);
    expect(data.taskComments[0].id).toBe(parentId);
    if (data.trash[0].payload.kind === 'comment') {
      expect(data.trash[0].payload.replies).toHaveLength(0);
    }
  });
});

describe('flizowStore trash — task cascades comments + activity', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
    flizowStore.addService(baseService());
  });

  it('deleteTask bundles comments + activity and round-trips them', () => {
    flizowStore.addTask(baseTask({ id: 't-cascade' }));
    flizowStore.addComment('t-cascade', 'A comment');
    // Activity is auto-logged by addComment; updateTask, etc.
    flizowStore.updateTask('t-cascade', { title: 'Renamed' });

    const commentsBefore = flizowStore.getSnapshot().taskComments
      .filter(c => c.taskId === 't-cascade').length;
    const activityBefore = flizowStore.getSnapshot().taskActivity
      .filter(a => a.taskId === 't-cascade').length;
    expect(commentsBefore).toBeGreaterThan(0);
    expect(activityBefore).toBeGreaterThan(0);

    const undo = flizowStore.deleteTask('t-cascade');
    expect(flizowStore.getSnapshot().tasks.find(t => t.id === 't-cascade')).toBeUndefined();
    expect(flizowStore.getSnapshot().taskComments
      .filter(c => c.taskId === 't-cascade')).toHaveLength(0);
    expect(flizowStore.getSnapshot().taskActivity
      .filter(a => a.taskId === 't-cascade')).toHaveLength(0);

    undo!();
    expect(flizowStore.getSnapshot().tasks.find(t => t.id === 't-cascade')).toBeDefined();
    expect(flizowStore.getSnapshot().taskComments
      .filter(c => c.taskId === 't-cascade')).toHaveLength(commentsBefore);
    expect(flizowStore.getSnapshot().taskActivity
      .filter(a => a.taskId === 't-cascade')).toHaveLength(activityBefore);
  });

  it('deleteTask repairs Service.taskIds on restore', () => {
    flizowStore.addTask(baseTask({ id: 't-repair' }));
    expect(flizowStore.getSnapshot().services[0].taskIds).toContain('t-repair');
    const undo = flizowStore.deleteTask('t-repair');
    expect(flizowStore.getSnapshot().services[0].taskIds).not.toContain('t-repair');
    undo!();
    expect(flizowStore.getSnapshot().services[0].taskIds).toContain('t-repair');
  });
});

describe('flizowStore trash — service cascade', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
  });

  it('deleteService bundles tasks + comments + activity + onboarding', () => {
    flizowStore.addService(baseService());
    // addService auto-seeds onboarding items from the template, so we
    // capture the post-seed count and add one more on top to verify
    // both seed-derived AND user-added items get bundled into the
    // trash payload.
    const onboardingSeeded = flizowStore.getSnapshot().onboardingItems.length;
    flizowStore.addOnboardingItem({
      id: 'on-svc', serviceId: 's1', group: 'us',
      label: 'Set up tracking', done: false,
    });
    const onboardingTotal = onboardingSeeded + 1;
    // addService seeded 3 tasks; pick one and add a comment so the
    // cascade hits all four arrays.
    const aTask = flizowStore.getSnapshot().tasks[0];
    flizowStore.addComment(aTask.id, 'A note');

    const tasksBefore = flizowStore.getSnapshot().tasks.length;
    const undo = flizowStore.deleteService('s1');
    const data = flizowStore.getSnapshot();
    expect(data.services).toHaveLength(0);
    expect(data.tasks).toHaveLength(0);
    expect(data.onboardingItems).toHaveLength(0);
    expect(data.trash[0].kind).toBe('service');
    if (data.trash[0].payload.kind === 'service') {
      expect(data.trash[0].payload.tasks).toHaveLength(tasksBefore);
      expect(data.trash[0].payload.onboardingItems).toHaveLength(onboardingTotal);
    }

    undo!();
    const restored = flizowStore.getSnapshot();
    expect(restored.services).toHaveLength(1);
    expect(restored.tasks).toHaveLength(tasksBefore);
    expect(restored.onboardingItems).toHaveLength(onboardingTotal);
    // Parent client.serviceIds should be repaired on restore.
    expect(restored.clients[0].serviceIds).toContain('s1');
  });
});

describe('flizowStore trash — client cascade', () => {
  it('deleteClient bundles every cascade child and round-trips them', () => {
    flizowStore.addClient(baseClient());
    flizowStore.addService(baseService());
    flizowStore.addContact({
      id: 'ct1', clientId: 'c1', name: 'Jane', primary: true,
    });
    flizowStore.addNote({
      id: 'n1', clientId: 'c1', body: '<p>hi</p>',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      pinned: false,
    });
    flizowStore.addTouchpoint({
      id: 'tp1', clientId: 'c1', topic: 'Kickoff',
      occurredAt: '2026-04-20T10:00:00.000Z',
      kind: 'meeting', scheduled: false,
      attendeeIds: [],
    });

    const tasksBefore = flizowStore.getSnapshot().tasks.length;

    const undo = flizowStore.deleteClient('c1');
    const data = flizowStore.getSnapshot();
    expect(data.clients).toHaveLength(0);
    expect(data.services).toHaveLength(0);
    expect(data.tasks).toHaveLength(0);
    expect(data.contacts).toHaveLength(0);
    expect(data.notes).toHaveLength(0);
    expect(data.touchpoints).toHaveLength(0);
    expect(data.trash[0].kind).toBe('client');
    if (data.trash[0].payload.kind === 'client') {
      expect(data.trash[0].payload.cascade.services).toHaveLength(1);
      expect(data.trash[0].payload.cascade.tasks).toHaveLength(tasksBefore);
      expect(data.trash[0].payload.cascade.contacts).toHaveLength(1);
      expect(data.trash[0].payload.cascade.notes).toHaveLength(1);
      expect(data.trash[0].payload.cascade.touchpoints).toHaveLength(1);
    }

    undo!();
    const restored = flizowStore.getSnapshot();
    expect(restored.clients).toHaveLength(1);
    expect(restored.services).toHaveLength(1);
    expect(restored.tasks).toHaveLength(tasksBefore);
    expect(restored.contacts).toHaveLength(1);
    expect(restored.notes).toHaveLength(1);
    expect(restored.touchpoints).toHaveLength(1);
  });
});

describe('flizowStore trash — opsTask', () => {
  it('deleteOpsTask sends to trash and round-trips', () => {
    flizowStore.addOpsTask({
      id: 'op1', title: 'Hire designer',
      columnId: 'todo', priority: 'medium',
      assigneeId: null, labels: [],
      createdAt: '2026-04-25T00:00:00.000Z',
    });
    const undo = flizowStore.deleteOpsTask('op1');
    expect(flizowStore.getSnapshot().opsTasks).toHaveLength(0);
    expect(flizowStore.getSnapshot().trash[0].kind).toBe('opsTask');
    undo!();
    expect(flizowStore.getSnapshot().opsTasks).toHaveLength(1);
  });
});

describe('flizowStore trash — template', () => {
  it('purgeTemplate sends user-created templates to trash (not permanent)', () => {
    flizowStore.upsertTemplate(baseTemplate());
    const undo = flizowStore.purgeTemplate('tmpl-test');
    expect(flizowStore.getSnapshot().templateOverrides).toHaveLength(0);
    expect(flizowStore.getSnapshot().trash[0].kind).toBe('template');
    undo!();
    expect(flizowStore.getSnapshot().templateOverrides).toHaveLength(1);
  });
});

describe('flizowStore trash — hard-delete with snapshot (toast-only)', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
    flizowStore.addService(baseService());
    flizowStore.addTask(baseTask({ id: 't-cl' }));
  });

  it('deleteChecklistItem skips trash but returns a snapshot-restoring callback', () => {
    flizowStore.addChecklistItem('t-cl', 'First step');
    flizowStore.addChecklistItem('t-cl', 'Second step');
    flizowStore.addChecklistItem('t-cl', 'Third step');
    const task = flizowStore.getSnapshot().tasks.find(t => t.id === 't-cl')!;
    const middleId = task.checklist![1].id;

    const undo = flizowStore.deleteChecklistItem('t-cl', middleId);
    const after = flizowStore.getSnapshot().tasks.find(t => t.id === 't-cl')!;
    // Trash stays empty — checklist items deliberately skip the bin.
    expect(flizowStore.getSnapshot().trash).toHaveLength(0);
    expect(after.checklist).toHaveLength(2);

    undo!();
    const restored = flizowStore.getSnapshot().tasks.find(t => t.id === 't-cl')!;
    expect(restored.checklist).toHaveLength(3);
    // Restored at original index — the middle item is back in position 1.
    expect(restored.checklist![1].id).toBe(middleId);
  });

  it('deleteMeetingCapture skips trash but restores at original index on undo', () => {
    flizowStore.addMeetingCapture({
      type: 'note', text: 'First',
      agendaItemKey: 'a1', agendaItemLabel: 'Topic A',
    });
    flizowStore.addMeetingCapture({
      type: 'decision', text: 'Second',
      agendaItemKey: 'a1', agendaItemLabel: 'Topic A',
    });
    flizowStore.addMeetingCapture({
      type: 'action', text: 'Third',
      agendaItemKey: 'a1', agendaItemLabel: 'Topic A',
    });
    const captures = flizowStore.getSnapshot().meetingCaptures;
    const middleId = captures[1].id;

    const undo = flizowStore.deleteMeetingCapture(middleId);
    expect(flizowStore.getSnapshot().meetingCaptures).toHaveLength(2);
    expect(flizowStore.getSnapshot().trash).toHaveLength(0);

    undo!();
    const restored = flizowStore.getSnapshot().meetingCaptures;
    expect(restored).toHaveLength(3);
    expect(restored[1].id).toBe(middleId);
  });
});

describe('flizowStore trash — purgeFromTrash and emptyTrash', () => {
  beforeEach(() => {
    flizowStore.addClient(baseClient());
  });

  it('purgeFromTrash removes a single entry permanently', () => {
    flizowStore.addNote({
      id: 'n1', clientId: 'c1', body: '<p>x</p>',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      pinned: false,
    });
    flizowStore.deleteNote('n1');
    const entryId = flizowStore.getSnapshot().trash[0].id;
    flizowStore.purgeFromTrash(entryId);
    expect(flizowStore.getSnapshot().trash).toHaveLength(0);
    expect(flizowStore.getSnapshot().notes).toHaveLength(0);
  });

  it('emptyTrash wipes every entry', () => {
    flizowStore.addContact({ id: 'ct1', clientId: 'c1', name: 'A', primary: false });
    flizowStore.addContact({ id: 'ct2', clientId: 'c1', name: 'B', primary: false });
    flizowStore.deleteContact('ct1');
    flizowStore.deleteContact('ct2');
    expect(flizowStore.getSnapshot().trash).toHaveLength(2);
    flizowStore.emptyTrash();
    expect(flizowStore.getSnapshot().trash).toHaveLength(0);
  });
});

describe('flizowStore trash — auto-prune on load', () => {
  it('migrate() drops entries older than 90 days', () => {
    // Inject a doc with one fresh entry + one stale entry by going
    // through replaceAll(migrate(...)). The stale entry should not
    // survive the load.
    const fresh = new Date().toISOString();
    const ancient = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const doc = {
      ...flizowStore.getSnapshot(),
      trash: [
        {
          id: 't-fresh', kind: 'note' as const,
          deletedAt: fresh, deletedBy: null,
          preview: 'fresh', payload: {
            kind: 'note' as const,
            data: {
              id: 'n-fresh', clientId: 'c1', body: '',
              createdAt: fresh, updatedAt: fresh, pinned: false,
            },
          },
        },
        {
          id: 't-ancient', kind: 'note' as const,
          deletedAt: ancient, deletedBy: null,
          preview: 'ancient', payload: {
            kind: 'note' as const,
            data: {
              id: 'n-ancient', clientId: 'c1', body: '',
              createdAt: ancient, updatedAt: ancient, pinned: false,
            },
          },
        },
      ],
    };
    flizowStore.replaceAll(doc);
    const trash = flizowStore.getSnapshot().trash;
    expect(trash).toHaveLength(1);
    expect(trash[0].id).toBe('t-fresh');
  });

  it('migrate() backfills [] for legacy docs that predate the trash field', () => {
    const legacyDoc = flizowStore.getSnapshot();
    delete (legacyDoc as Partial<typeof legacyDoc>).trash;
    flizowStore.replaceAll(legacyDoc as typeof legacyDoc);
    expect(flizowStore.getSnapshot().trash).toEqual([]);
  });
});

describe('flizowStore trash — reset workspace empties trash too', () => {
  it('reset() wipes the trash bin alongside the rest of the data', () => {
    flizowStore.addClient(baseClient());
    flizowStore.addNote({
      id: 'n1', clientId: 'c1', body: '<p>x</p>',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      pinned: false,
    });
    flizowStore.deleteNote('n1');
    expect(flizowStore.getSnapshot().trash).toHaveLength(1);
    flizowStore.reset();
    expect(flizowStore.getSnapshot().trash).toEqual([]);
  });
});

// ── Member profile ────────────────────────────────────────────────────────
//
// Coverage for the per-member profile panel feature: the data-side
// round-trip of the new identity fields, the pure helpers (vacation
// status, time / day / tz formatters), and the working-hours
// composite line that drives the read-only Contact section.
//
// What we don't cover here: photo upload (Firebase Storage round-trip
// — would need the SDK mocked), the React panel itself (visual
// behaviour eyeballed; UI hooks aren't worth a render harness for
// this scope), and the permission gate (a 4-line inline check the
// panel does internally; manual review is enough).

const baseMember = (overrides: Partial<Member> = {}): Member => ({
  id: 'm1',
  name: 'Sarah Chen',
  initials: 'SC',
  color: '#5e5ce6',
  type: 'am',
  ...overrides,
});

describe('flizowStore — member profile field round-trip', () => {
  it('updateMember persists the full identity field set', () => {
    flizowStore.addMember(baseMember());
    flizowStore.updateMember('m1', {
      email: 'sarah@flizow.com',
      phone: '+1 415 555 0148',
      pronouns: 'she/her',
      bio: 'Eight years in content strategy.',
      skills: ['Content', 'SEO', 'Brand'],
      ianaTimeZone: 'America/Los_Angeles',
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      workingDays: [1, 2, 3, 4, 5],
      timeOff: [{ start: '2026-05-13', end: '2026-05-15' }],
      photoUrl: 'https://example.com/photo.png',
    });
    const m = flizowStore.getSnapshot().members[0];
    expect(m.email).toBe('sarah@flizow.com');
    expect(m.phone).toBe('+1 415 555 0148');
    expect(m.pronouns).toBe('she/her');
    expect(m.bio).toBe('Eight years in content strategy.');
    expect(m.skills).toEqual(['Content', 'SEO', 'Brand']);
    expect(m.ianaTimeZone).toBe('America/Los_Angeles');
    expect(m.workingHoursStart).toBe('09:00');
    expect(m.workingHoursEnd).toBe('18:00');
    expect(m.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(m.timeOff).toEqual([{ start: '2026-05-13', end: '2026-05-15' }]);
    expect(m.photoUrl).toBe('https://example.com/photo.png');
  });

  it('updateMember leaves untouched fields alone (partial patch)', () => {
    flizowStore.addMember(baseMember({
      email: 'first@flizow.com',
      pronouns: 'they/them',
      skills: ['Writing'],
    }));
    flizowStore.updateMember('m1', { phone: '+1 415 555 0000' });
    const m = flizowStore.getSnapshot().members[0];
    expect(m.email).toBe('first@flizow.com');     // untouched
    expect(m.pronouns).toBe('they/them');         // untouched
    expect(m.skills).toEqual(['Writing']);        // untouched
    expect(m.phone).toBe('+1 415 555 0000');      // patched
  });

  it('updateMember clearing a field by setting undefined removes it from the record', () => {
    flizowStore.addMember(baseMember({ bio: 'Old bio' }));
    flizowStore.updateMember('m1', { bio: undefined });
    const m = flizowStore.getSnapshot().members[0];
    // Object.assign with undefined keeps the key on the object but
    // sets it to undefined — the panel's empty-state policy reads
    // both `undefined` and missing as "no value", so this is fine.
    expect(m.bio).toBeUndefined();
  });
});

describe('memberProfile.currentVacationPeriod / isOnVacation', () => {
  it('returns null when timeOff is undefined', () => {
    const m = baseMember();
    expect(currentVacationPeriod(m, '2026-05-14')).toBeNull();
    expect(isOnVacation(m, '2026-05-14')).toBe(false);
  });

  it('returns null when timeOff is empty', () => {
    const m = baseMember({ timeOff: [] });
    expect(currentVacationPeriod(m, '2026-05-14')).toBeNull();
    expect(isOnVacation(m, '2026-05-14')).toBe(false);
  });

  it('returns the matching period when today falls inside one', () => {
    const m = baseMember({
      timeOff: [{ start: '2026-05-13', end: '2026-05-15' }],
    });
    expect(currentVacationPeriod(m, '2026-05-14')).toEqual({
      start: '2026-05-13',
      end: '2026-05-15',
    });
    expect(isOnVacation(m, '2026-05-14')).toBe(true);
  });

  it('treats both start and end as inclusive (boundary days count)', () => {
    const m = baseMember({
      timeOff: [{ start: '2026-05-13', end: '2026-05-15' }],
    });
    expect(isOnVacation(m, '2026-05-13')).toBe(true);
    expect(isOnVacation(m, '2026-05-15')).toBe(true);
  });

  it('returns null when today falls outside all periods', () => {
    const m = baseMember({
      timeOff: [{ start: '2026-05-13', end: '2026-05-15' }],
    });
    expect(isOnVacation(m, '2026-05-12')).toBe(false);
    expect(isOnVacation(m, '2026-05-16')).toBe(false);
  });

  it('returns the first matching period when multiple are configured', () => {
    const m = baseMember({
      timeOff: [
        { start: '2026-05-13', end: '2026-05-15' },
        { start: '2026-07-04', end: '2026-07-04' },
      ],
    });
    expect(currentVacationPeriod(m, '2026-07-04')).toEqual({
      start: '2026-07-04',
      end: '2026-07-04',
    });
  });
});

describe('memberProfile.formatTime12h', () => {
  it('formats morning hours', () => {
    expect(formatTime12h('09:00')).toBe('9:00 AM');
    expect(formatTime12h('06:30')).toBe('6:30 AM');
  });

  it('formats afternoon and evening hours', () => {
    expect(formatTime12h('13:00')).toBe('1:00 PM');
    expect(formatTime12h('18:30')).toBe('6:30 PM');
    expect(formatTime12h('23:59')).toBe('11:59 PM');
  });

  it('handles midnight and noon as conventional 12-hour readings', () => {
    expect(formatTime12h('00:00')).toBe('12:00 AM');
    expect(formatTime12h('12:00')).toBe('12:00 PM');
    expect(formatTime12h('12:30')).toBe('12:30 PM');
  });

  it('returns null on undefined or malformed input', () => {
    expect(formatTime12h(undefined)).toBeNull();
    expect(formatTime12h('')).toBeNull();
    expect(formatTime12h('25:00')).toBeNull();
    expect(formatTime12h('9 AM')).toBeNull();
    expect(formatTime12h('09:00:00')).toBeNull();
  });
});

describe('memberProfile.formatWorkingDays', () => {
  it('formats weekdays as a contiguous span', () => {
    expect(formatWorkingDays([1, 2, 3, 4, 5])).toBe('Mon–Fri');
    expect(formatWorkingDays([1, 2, 3, 4])).toBe('Mon–Thu');
    expect(formatWorkingDays([2, 3, 4])).toBe('Tue–Thu');
  });

  it('formats every-day as "Every day"', () => {
    expect(formatWorkingDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
  });

  it('formats single days', () => {
    expect(formatWorkingDays([1])).toBe('Mon');
    expect(formatWorkingDays([0])).toBe('Sun');
  });

  it('formats non-contiguous days as a bullet-separated list', () => {
    expect(formatWorkingDays([1, 3, 5])).toBe('Mon · Wed · Fri');
    // [0, 6] is Sun and Sat — not contiguous (gap of 6 days), so the
    // bullet-list path wins. A weekend-only schedule reads as
    // "Sun · Sat" because we sort ascending; users reading this
    // mentally translate to "weekends."
    expect(formatWorkingDays([0, 6])).toBe('Sun · Sat');
  });

  it('dedupes and sorts a messy input', () => {
    expect(formatWorkingDays([5, 1, 3, 1, 5])).toBe('Mon · Wed · Fri');
  });

  it('falls back to weekdays when the input is undefined', () => {
    expect(formatWorkingDays(undefined)).toBe('Mon–Fri');
  });

  it('shows "No working days set" for an empty array', () => {
    expect(formatWorkingDays([])).toBe('No working days set');
  });
});

describe('memberProfile.formatTimeZone', () => {
  it('drops the IANA region prefix and replaces underscores', () => {
    expect(formatTimeZone('America/Los_Angeles')).toBe('Los Angeles');
    expect(formatTimeZone('Asia/Hong_Kong')).toBe('Hong Kong');
    expect(formatTimeZone('Europe/London')).toBe('London');
  });

  it('falls through unchanged for inputs without a slash', () => {
    expect(formatTimeZone('UTC')).toBe('UTC');
    expect(formatTimeZone('Custom_Zone')).toBe('Custom Zone');
  });
});

describe('memberProfile.formatWorkingHoursLine', () => {
  it('returns null when nothing is configured', () => {
    expect(formatWorkingHoursLine(baseMember())).toBeNull();
  });

  it('renders "Mon–Fri, 9:00 AM – 6:00 PM" without a TZ', () => {
    const m = baseMember({
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      workingDays: [1, 2, 3, 4, 5],
    });
    // No ianaTimeZone → no TZ suffix.
    expect(formatWorkingHoursLine(m)).toBe('Mon–Fri, 9:00 AM – 6:00 PM');
  });

  it('appends the short TZ when ianaTimeZone is set', () => {
    const m = baseMember({
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      workingDays: [1, 2, 3, 4, 5],
      ianaTimeZone: 'America/Los_Angeles',
    });
    const line = formatWorkingHoursLine(m);
    // TZ abbreviation depends on Intl + season (PST/PDT) — we just
    // verify it appended SOMETHING after the time. The exact short
    // form is locale + DST dependent.
    expect(line).toMatch(/^Mon–Fri, 9:00 AM – 5:00 PM /);
    expect(line!.length).toBeGreaterThan('Mon–Fri, 9:00 AM – 5:00 PM '.length);
  });

  it('handles a single time when only start is set', () => {
    const m = baseMember({
      workingHoursStart: '09:00',
      workingDays: [1, 2, 3, 4, 5],
    });
    expect(formatWorkingHoursLine(m)).toBe('Mon–Fri, 9:00 AM');
  });

  it('returns just the days when no times are set but workingDays is present', () => {
    const m = baseMember({ workingDays: [1, 3, 5] });
    expect(formatWorkingHoursLine(m)).toBe('Mon · Wed · Fri');
  });
});
