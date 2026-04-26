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
  Service,
  Task,
  TemplateRecord,
} from '../types/flizow';

// ── Fixtures ─────────────────────────────────────────────────────────

const baseClient = (overrides: Partial<Client> = {}): Client => ({
  id: 'c1',
  name: 'Acme Corp',
  initials: 'AC',
  logoClass: 'logo-indigo',
  status: 'track',
  industry: 'SaaS',
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
