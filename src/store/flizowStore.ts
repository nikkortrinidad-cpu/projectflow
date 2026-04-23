import { doc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  FlizowData, Client, Service, Task, Member, Contact, QuickLink, Note,
  Touchpoint, ActionItem, TaskComment, TaskActivity, TaskActivityKind,
  ManualAgendaItem, OnboardingItem, ColumnId, Priority,
} from '../types/flizow';
import { ONBOARDING_TEMPLATES } from '../data/onboardingTemplates';
import { TASK_POOLS } from '../data/taskPools';

/**
 * FlizowStore — central data container for the new product surface
 * (Overview, Clients, Analytics, Kanban, WIP, Templates).
 *
 * Mirrors the legacy BoardStore pattern (useSyncExternalStore +
 * localStorage + debounced Firestore write-through) so the two stores
 * behave identically from the UI's point of view. Once the legacy
 * kanban board migrates, BoardStore goes away and this is the only
 * store left.
 *
 * Firestore layout:  flizow/{uid}  →  { data: <FlizowData JSON>, updatedAt }
 * localStorage key:  flizow-state
 */

const STORAGE_KEY = 'flizow-state';
const DOC_COLLECTION = 'flizow';
const FIRESTORE_DEBOUNCE_MS = 1000;

// ── Factory / load / persist ─────────────────────────────────────────────

function emptyData(): FlizowData {
  // New users start empty. The "Load demo data" helper in Account
  // Settings seeds the mockup's demo clients when someone wants to
  // poke around before they've imported their real roster.
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
    today: todayISO(),
    scheduleTaskMap: {},
    favoriteServiceIds: [],
  };
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadFromLocalStorage(): FlizowData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    }
  } catch {
    // Corrupt localStorage shouldn't wedge the app.
  }
  return emptyData();
}

/** Backfill any fields that newer builds added to FlizowData so we can
 *  tolerate a localStorage/Firestore doc written by an older build. */
function migrate(parsed: Partial<FlizowData>): FlizowData {
  const base = emptyData();
  // Older docs may have Client rows without teamIds — backfill.
  const clients = (parsed.clients ?? base.clients).map(c => ({
    ...c,
    teamIds: Array.isArray(c.teamIds) ? c.teamIds : [],
  }));
  return {
    clients,
    services: parsed.services ?? base.services,
    tasks: parsed.tasks ?? base.tasks,
    members: parsed.members ?? base.members,
    integrations: parsed.integrations ?? base.integrations,
    onboardingItems: parsed.onboardingItems ?? base.onboardingItems,
    contacts: parsed.contacts ?? base.contacts,
    quickLinks: parsed.quickLinks ?? base.quickLinks,
    notes: parsed.notes ?? base.notes,
    touchpoints: parsed.touchpoints ?? base.touchpoints,
    actionItems: parsed.actionItems ?? base.actionItems,
    taskComments: parsed.taskComments ?? base.taskComments,
    taskActivity: parsed.taskActivity ?? base.taskActivity,
    manualAgendaItems: parsed.manualAgendaItems ?? base.manualAgendaItems,
    // `today` always refreshes on load — we never trust a stale anchor.
    today: todayISO(),
    scheduleTaskMap: parsed.scheduleTaskMap ?? base.scheduleTaskMap,
    favoriteServiceIds: Array.isArray(parsed.favoriteServiceIds)
      ? parsed.favoriteServiceIds
      : base.favoriteServiceIds,
  };
}

/**
 * Label → deterministic id slug. Used to build stable OnboardingItem ids
 * from template label text, so adding the same service twice would share
 * id prefixes (never happens in practice — serviceIds are unique) and, more
 * importantly, so the ids stay readable in devtools when debugging.
 */
function slugLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'item';
}

// ── Store class ──────────────────────────────────────────────────────────

type Listener = () => void;

class FlizowStore {
  private data: FlizowData;
  private listeners: Set<Listener> = new Set();
  private userId: string | null = null;
  private firestoreUnsub: Unsubscribe | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  /** When we write to Firestore, the snapshot listener would fire right
   *  back with the same payload — this flag swallows that echo. */
  private ignoreNextSnapshot = false;

  constructor() {
    this.data = loadFromLocalStorage();
  }

  // ── Subscription (useSyncExternalStore plumbing) ─────────────────────

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): FlizowData => this.data;

  private notify() {
    // New object reference → React sees a change via Object.is on the snapshot.
    this.data = { ...this.data };
    this.listeners.forEach(l => l());
  }

  // ── Auth / sync ──────────────────────────────────────────────────────

  setUser(
    userId: string | null,
    displayName?: string,
    email?: string,
    photoURL?: string,
  ) {
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }

    // Different user on the same browser? Wipe local state so nothing from
    // the previous session bleeds through.
    if (this.userId && userId && this.userId !== userId) {
      localStorage.removeItem(STORAGE_KEY);
      this.data = emptyData();
    }

    this.userId = userId;

    if (!userId) {
      this.notify();
      return;
    }

    this.upsertOwnMember(userId, displayName, email, photoURL);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    this.notify();

    const docRef = doc(db, DOC_COLLECTION, userId);
    this.firestoreUnsub = onSnapshot(docRef, (snapshot) => {
      if (this.ignoreNextSnapshot) {
        this.ignoreNextSnapshot = false;
        return;
      }
      if (snapshot.exists()) {
        const payload = snapshot.data();
        if (payload && typeof payload.data === 'string') {
          try {
            const cloud = migrate(JSON.parse(payload.data));
            this.data = cloud;
            this.upsertOwnMember(userId, displayName, email, photoURL);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
            this.notify();
          } catch (err) {
            console.error('Failed to parse Flizow cloud state:', err);
          }
        }
      } else {
        // No cloud doc yet — push whatever we have locally.
        this.saveToFirestore();
      }
    });
  }

  /** Ensure there's a member record for the signed-in user. Used so
   *  every assignee lookup resolves even when a user has never been
   *  manually added to the member roster. */
  private upsertOwnMember(
    uid: string,
    displayName?: string,
    email?: string,
    _photoURL?: string,
  ) {
    const existing = this.data.members.find(m => m.id === uid);
    const initials = initialsOf(displayName || email || 'You');
    if (existing) {
      if (displayName) existing.name = displayName;
      existing.initials = existing.initials || initials;
    } else {
      this.data.members.push({
        id: uid,
        initials,
        name: displayName || 'You',
        role: 'Owner',
        color: '#5e5ce6',
        type: 'am',
      });
    }
  }

  getCurrentMemberId(): string | null {
    return this.userId;
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    this.notify();
    this.saveToFirestore();
  }

  private saveToFirestore() {
    if (!this.userId) return;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(async () => {
      try {
        this.ignoreNextSnapshot = true;
        const docRef = doc(db, DOC_COLLECTION, this.userId!);
        await setDoc(docRef, {
          data: JSON.stringify(this.data),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to save Flizow state to Firestore:', err);
        this.ignoreNextSnapshot = false;
      }
    }, FIRESTORE_DEBOUNCE_MS);
  }

  // ── Clients ──────────────────────────────────────────────────────────

  addClient(client: Client) {
    this.data.clients.push(client);
    this.save();
  }

  updateClient(id: string, patch: Partial<Client>) {
    const c = this.data.clients.find(c => c.id === id);
    if (!c) return;
    Object.assign(c, patch);
    this.save();
  }

  deleteClient(id: string) {
    // Cascade: remove the client's services and tasks too so the data
    // stays consistent. No soft-delete yet — add when the UI does.
    const services = this.data.services.filter(s => s.clientId === id);
    const serviceIds = new Set(services.map(s => s.id));
    // Snapshot task ids BEFORE we filter the task list — we need them to
    // cascade the comments.
    const taskIds = new Set(
      this.data.tasks.filter(t => serviceIds.has(t.serviceId)).map(t => t.id),
    );
    this.data.clients = this.data.clients.filter(c => c.id !== id);
    this.data.services = this.data.services.filter(s => !serviceIds.has(s.id));
    this.data.tasks = this.data.tasks.filter(t => !serviceIds.has(t.serviceId));
    this.data.onboardingItems = this.data.onboardingItems.filter(
      o => !serviceIds.has(o.serviceId),
    );
    this.data.integrations = this.data.integrations.filter(i => i.clientId !== id);
    this.data.contacts = this.data.contacts.filter(c => c.clientId !== id);
    this.data.quickLinks = this.data.quickLinks.filter(q => q.clientId !== id);
    this.data.notes = this.data.notes.filter(n => n.clientId !== id);
    this.data.touchpoints = this.data.touchpoints.filter(t => t.clientId !== id);
    this.data.actionItems = this.data.actionItems.filter(a => a.clientId !== id);
    this.data.taskComments = this.data.taskComments.filter(c => !taskIds.has(c.taskId));
    this.data.taskActivity = this.data.taskActivity.filter(a => !taskIds.has(a.taskId));
    this.save();
  }

  // ── Services ─────────────────────────────────────────────────────────

  addService(service: Service) {
    // Seed 3 starter tasks into To Do so the board doesn't open empty.
    // This is the delivery side of the Add Service modal's promise:
    // "Seeds the board with starter columns and a few example cards."
    // Pulls the first 3 titles from the template's task pool rather than
    // a random sample — determinism keeps the user from seeing the same
    // service with different starter cards on different devices.
    const pool = TASK_POOLS[service.templateKey] ?? [];
    const starterTitles = pool.slice(0, 3);
    const nowISO = new Date().toISOString();
    const dueISO = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const seededTasks: Task[] = starterTitles.map((title, idx) => ({
      id: `${service.id}-starter-${idx}`,
      serviceId: service.id,
      clientId: service.clientId,
      title,
      columnId: 'todo',
      priority: 'medium',
      assigneeId: null,
      labels: [],
      dueDate: dueISO,
      createdAt: nowISO,
    }));

    // Replace the service's taskIds with the ids of the seeded cards so
    // the ServiceCard task counters + onboarding group lookups see them.
    const serviceWithTasks: Service = {
      ...service,
      taskIds: seededTasks.map(t => t.id),
    };

    // Replace array refs (not `.push`) so `useMemo([data.services])` consumers
    // on ClientDetailPage recompute. Same trick on the client's serviceIds so
    // the client-level memos see the new membership.
    this.data.services = [...this.data.services, serviceWithTasks];
    this.data.clients = this.data.clients.map(c =>
      c.id === service.clientId && !c.serviceIds.includes(service.id)
        ? { ...c, serviceIds: [...c.serviceIds, service.id] }
        : c,
    );
    if (seededTasks.length > 0) {
      this.data.tasks = [...this.data.tasks, ...seededTasks];
    }

    // Seed the onboarding checklist from the template so the Onboarding
    // tab has real work the moment the service exists. Everything starts
    // undone — the user just created this, there's no ground truth for
    // what's already in progress.
    const tmpl = ONBOARDING_TEMPLATES[service.templateKey];
    if (tmpl) {
      const seeded: OnboardingItem[] = [
        ...tmpl.client.map(label => ({
          id: `${service.id}-${slugLabel(label)}`,
          serviceId: service.id,
          group: 'client' as const,
          label,
          done: false,
        })),
        ...tmpl.us.map(label => ({
          id: `${service.id}-${slugLabel(label)}`,
          serviceId: service.id,
          group: 'us' as const,
          label,
          done: false,
        })),
      ];
      this.data.onboardingItems = [...this.data.onboardingItems, ...seeded];
    }

    this.save();
  }

  updateService(id: string, patch: Partial<Service>) {
    const s = this.data.services.find(s => s.id === id);
    if (!s) return;
    Object.assign(s, patch);
    this.save();
  }

  deleteService(id: string) {
    const svc = this.data.services.find(s => s.id === id);
    if (!svc) return;
    const taskIds = new Set(
      this.data.tasks.filter(t => t.serviceId === id).map(t => t.id),
    );
    this.data.services = this.data.services.filter(s => s.id !== id);
    this.data.tasks = this.data.tasks.filter(t => t.serviceId !== id);
    this.data.onboardingItems = this.data.onboardingItems.filter(o => o.serviceId !== id);
    this.data.taskComments = this.data.taskComments.filter(c => !taskIds.has(c.taskId));
    this.data.taskActivity = this.data.taskActivity.filter(a => !taskIds.has(a.taskId));
    const client = this.data.clients.find(c => c.id === svc.clientId);
    if (client) {
      client.serviceIds = client.serviceIds.filter(sid => sid !== id);
    }
    // A deleted service can't stay pinned on the Overview — a dead chip
    // would 404 on click. Cascade the favorites list so the pin state
    // always matches what exists.
    this.data.favoriteServiceIds = this.data.favoriteServiceIds.filter(sid => sid !== id);
    this.save();
  }

  /**
   * Move a service one step up or down within its client's serviceIds
   * list. The list is the documented source of truth for display order
   * (see Client.serviceIds in types/flizow). A bounded nudge is easier
   * to reason about than full drag-drop for a strip of 3–6 services —
   * and a lot harder to get wrong with a slip of the mouse.
   *
   * No-op when the service is already at the edge in the requested
   * direction, so the caller can wire ↑/↓ buttons without needing to
   * check bounds itself.
   */
  reorderService(serviceId: string, direction: 'up' | 'down') {
    const svc = this.data.services.find(s => s.id === serviceId);
    if (!svc) return;
    const client = this.data.clients.find(c => c.id === svc.clientId);
    if (!client) return;
    const ids = client.serviceIds.slice();
    const i = ids.indexOf(serviceId);
    if (i === -1) return;
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    client.serviceIds = ids;
    this.save();
  }

  // ── Favorites ───────────────────────────────────────────────────────
  //
  // Star/unstar a service. Drives the "My Boards" strip on the Overview.
  // We store insertion-ordered ids, not a set, so the strip order
  // matches the order the user starred — newest pin at the end. A
  // second call with the same id removes it (toggle).
  toggleServiceFavorite(serviceId: string) {
    const current = this.data.favoriteServiceIds;
    const idx = current.indexOf(serviceId);
    if (idx === -1) {
      this.data.favoriteServiceIds = [...current, serviceId];
    } else {
      this.data.favoriteServiceIds = current.filter((id) => id !== serviceId);
    }
    this.save();
  }

  // ── Activity log helper ─────────────────────────────────────────────
  //
  // Called from every task-level mutation. The entry's `text` is the
  // final pre-formatted string the Activity tab will render — keeping
  // the formatting at write time means the renderer is a plain `.map`
  // with no lookups or conditional logic. That's intentional: activity
  // feeds read like a log file, and log files shouldn't re-hydrate.

  private logActivity(taskId: string, kind: TaskActivityKind, text: string) {
    const task = this.data.tasks.find(t => t.id === taskId);
    if (!task) return; // guard — e.g. activity logged after cascade delete
    const entry: TaskActivity = {
      id: `ac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      taskId,
      actorId: this.userId ?? 'user-1',
      kind,
      text,
      createdAt: new Date().toISOString(),
    };
    // Replace the array so downstream useMemo([taskActivity]) refreshes.
    this.data.taskActivity = [...this.data.taskActivity, entry];
  }

  // ── Tasks ────────────────────────────────────────────────────────────

  addTask(task: Task) {
    this.data.tasks.push(task);
    const service = this.data.services.find(s => s.id === task.serviceId);
    if (service && !service.taskIds.includes(task.id)) {
      service.taskIds.push(task.id);
    }
    this.logActivity(task.id, 'created', 'created this card');
    this.save();
  }

  updateTask(id: string, patch: Partial<Task>) {
    const t = this.data.tasks.find(t => t.id === id);
    if (!t) return;
    // Snapshot the fields we care about before the patch lands so we can
    // emit granular activity entries per change. We only log changes
    // that a user would recognise as meaningful — drop everything else.
    const before = {
      columnId: t.columnId,
      priority: t.priority,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      startDate: t.startDate,
      assigneeIds: Array.isArray(t.assigneeIds)
        ? [...t.assigneeIds]
        : (t.assigneeId ? [t.assigneeId] : []),
      labels: [...(t.labels ?? [])],
    };
    Object.assign(t, patch);
    const after = {
      columnId: t.columnId,
      priority: t.priority,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      startDate: t.startDate,
      assigneeIds: Array.isArray(t.assigneeIds)
        ? [...t.assigneeIds]
        : (t.assigneeId ? [t.assigneeId] : []),
      labels: [...(t.labels ?? [])],
    };

    if (before.columnId !== after.columnId) {
      this.logActivity(id, 'moved', `moved this card to ${columnLabel(after.columnId)}`);
    }
    if (before.priority !== after.priority) {
      this.logActivity(id, 'priority', `set priority to ${priorityLabel(after.priority)}`);
    }
    if (before.title !== after.title) {
      this.logActivity(id, 'title', `renamed this card to "${after.title}"`);
    }
    if ((before.description ?? '') !== (after.description ?? '')) {
      const hadBefore = !!before.description?.trim();
      const hasAfter = !!after.description?.trim();
      const text = !hadBefore && hasAfter
        ? 'added a description'
        : hadBefore && !hasAfter
          ? 'cleared the description'
          : 'edited the description';
      this.logActivity(id, 'description', text);
    }
    if (before.dueDate !== after.dueDate) {
      const text = !before.dueDate && after.dueDate
        ? `set the due date to ${formatDayLabel(after.dueDate)}`
        : before.dueDate && !after.dueDate
          ? 'removed the due date'
          : `changed the due date to ${formatDayLabel(after.dueDate || '')}`;
      this.logActivity(id, 'dueDate', text);
    }
    if ((before.startDate ?? '') !== (after.startDate ?? '')) {
      const text = !before.startDate && after.startDate
        ? `set the start date to ${formatDayLabel(after.startDate)}`
        : before.startDate && !after.startDate
          ? 'removed the start date'
          : `changed the start date to ${formatDayLabel(after.startDate || '')}`;
      this.logActivity(id, 'startDate', text);
    }
    // Diff the assignee sets symmetrically so a swap reads as "added X,
    // removed Y" rather than "replaced".
    const beforeA = new Set(before.assigneeIds);
    const afterA = new Set(after.assigneeIds);
    for (const mid of afterA) {
      if (!beforeA.has(mid)) {
        const name = this.memberDisplay(mid);
        this.logActivity(id, 'assignee', `added ${name}`);
      }
    }
    for (const mid of beforeA) {
      if (!afterA.has(mid)) {
        const name = this.memberDisplay(mid);
        this.logActivity(id, 'assignee', `removed ${name}`);
      }
    }
    // Labels — same symmetric diff, with the BOARD_LABELS lookup in
    // the renderer translating ids back to pretty names. The store
    // deliberately logs the raw id and prefixes "label" for clarity
    // without importing the constants module.
    const beforeL = new Set(before.labels);
    const afterL = new Set(after.labels);
    for (const lid of afterL) {
      if (!beforeL.has(lid)) this.logActivity(id, 'label', `added label ${labelText(lid)}`);
    }
    for (const lid of beforeL) {
      if (!afterL.has(lid)) this.logActivity(id, 'label', `removed label ${labelText(lid)}`);
    }

    this.save();
  }

  /** Shorthand for the most common mutation — dragging a card across
   *  columns. Separate method so analytics/undo can hook the event
   *  cleanly later. */
  moveTask(id: string, columnId: ColumnId) {
    this.updateTask(id, { columnId });
  }

  setTaskPriority(id: string, priority: Priority) {
    this.updateTask(id, { priority });
  }

  /** Resolve an actor/assignee id to a printable name for activity
   *  text. Falls back to "Unknown" so a deleted member doesn't break
   *  a rendered row. */
  private memberDisplay(id: string | null | undefined): string {
    if (!id) return 'Unknown';
    const m = this.data.members.find(m => m.id === id);
    return m?.name || 'Unknown';
  }

  deleteTask(id: string) {
    const t = this.data.tasks.find(t => t.id === id);
    if (!t) return;
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    // Drop every comment + reply + activity entry hanging off this card.
    this.data.taskComments = this.data.taskComments.filter(c => c.taskId !== id);
    this.data.taskActivity = this.data.taskActivity.filter(a => a.taskId !== id);
    const service = this.data.services.find(s => s.id === t.serviceId);
    if (service) {
      service.taskIds = service.taskIds.filter(tid => tid !== id);
    }
    // If this was a schedule-seeded card, clean up the mapping.
    if (this.data.scheduleTaskMap[id]) {
      delete this.data.scheduleTaskMap[id];
    }
    this.save();
  }

  // ── Task checklist ──────────────────────────────────────────────────
  //
  // Checklists live on Task.checklist (optional). We initialise the
  // array lazily so older tasks don't need a migration step — first
  // write creates it, subsequent writes mutate in place.

  addChecklistItem(taskId: string, text: string): string | null {
    const t = this.data.tasks.find(t => t.id === taskId);
    if (!t) return null;
    if (!t.checklist) t.checklist = [];
    const id = `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const trimmed = text.trim();
    t.checklist.push({ id, text: trimmed, done: false, assigneeId: null });
    this.logActivity(taskId, 'checklistAdded', `added checklist item "${trimmed}"`);
    this.save();
    return id;
  }

  toggleChecklistItem(taskId: string, itemId: string) {
    const t = this.data.tasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    const item = t.checklist.find(i => i.id === itemId);
    if (!item) return;
    item.done = !item.done;
    this.logActivity(
      taskId,
      'checklistToggled',
      item.done
        ? `checked off "${item.text}"`
        : `unchecked "${item.text}"`,
    );
    this.save();
  }

  updateChecklistItemText(taskId: string, itemId: string, text: string) {
    const t = this.data.tasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    const item = t.checklist.find(i => i.id === itemId);
    if (!item) return;
    const trimmed = text.trim();
    if (!trimmed) return; // empty text = ignore; deletion is a separate call
    if (trimmed === item.text) return; // no-op — don't spam the activity log
    const old = item.text;
    item.text = trimmed;
    this.logActivity(
      taskId,
      'checklistRenamed',
      `renamed checklist item "${old}" to "${trimmed}"`,
    );
    this.save();
  }

  deleteChecklistItem(taskId: string, itemId: string) {
    const t = this.data.tasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    const item = t.checklist.find(i => i.id === itemId);
    if (!item) return;
    t.checklist = t.checklist.filter(i => i.id !== itemId);
    this.logActivity(taskId, 'checklistDeleted', `deleted checklist item "${item.text}"`);
    this.save();
  }

  // ── Task comments ───────────────────────────────────────────────────
  //
  // Flat storage — every comment on every task lives in
  // `data.taskComments`. The modal filters by taskId at read time. One
  // level of threading: `parentId` points at the top-level comment a
  // reply is attached to. Top-level comments omit parentId.
  //
  // authorId is always the signed-in user for now. Later, when we add
  // @mentions or bot-posted activity, we'll widen this to accept any
  // Member id.

  /** Post a new comment or reply. Returns the generated id so the caller
   *  can focus the new entry or navigate to its anchor. */
  addComment(
    taskId: string,
    text: string,
    parentId: string | null = null,
  ): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const task = this.data.tasks.find(t => t.id === taskId);
    if (!task) return null;
    // Authorship falls back to a synthetic "you" id if no user is signed
    // in — the seed demo data uses the same fallback so the UI renders
    // consistently out of the box.
    const authorId = this.userId ?? 'user-1';
    const id = `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const comment: TaskComment = {
      id,
      taskId,
      authorId,
      text: trimmed,
      createdAt: new Date().toISOString(),
      parentId: parentId || undefined,
    };
    // Replace (don't mutate in place) so consumers that memoise on the
    // array reference re-run. `notify()` wraps `this.data` but leaves
    // inner arrays untouched, so mutating in place would let a cached
    // `useMemo([comments])` miss the addition.
    this.data.taskComments = [...this.data.taskComments, comment];
    this.logActivity(
      taskId,
      'commentAdded',
      parentId ? 'replied to a comment' : 'posted a comment',
    );
    this.save();
    return id;
  }

  /** Rewrite a comment's body. Bumps `updatedAt` so the UI can show an
   *  "Edited" hint. No-ops if the id is stale. */
  updateComment(id: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const existing = this.data.taskComments.find(c => c.id === id);
    if (!existing) return;
    if (existing.text === trimmed) return; // no-op guard keeps updatedAt honest
    const patched: TaskComment = {
      ...existing,
      text: trimmed,
      updatedAt: new Date().toISOString(),
    };
    // Splice-replace so the array reference changes (see addComment).
    this.data.taskComments = this.data.taskComments.map(c =>
      c.id === id ? patched : c,
    );
    this.save();
  }

  /** Delete a comment. If the comment is a top-level entry, its replies
   *  are deleted too — an orphaned reply with no parent has nowhere to
   *  render. */
  deleteComment(id: string) {
    const c = this.data.taskComments.find(c => c.id === id);
    if (!c) return;
    const isTopLevel = !c.parentId;
    this.data.taskComments = this.data.taskComments.filter((other) => {
      if (other.id === id) return false;
      if (isTopLevel && other.parentId === id) return false;
      return true;
    });
    this.logActivity(
      c.taskId,
      'commentDeleted',
      isTopLevel ? 'deleted a comment' : 'deleted a reply',
    );
    this.save();
  }

  // ── Manual agenda items (WIP) ────────────────────────────────────────

  /**
   * Add a manual agenda item raised via the "Add agenda item" modal on
   * the Weekly WIP page.
   *
   * `position` is either 'top' (rank below the lowest existing rank) or
   * 'bottom' (rank above the highest existing rank). We keep ranks dense
   * and unique per-user; no attempt to gap them for later inserts. The
   * UI only surfaces top/bottom for now — fine-grained inserts are a
   * follow-up.
   */
  addManualAgendaItem(input: {
    title: string;
    clientId?: string | null;
    note?: string;
    position?: 'top' | 'bottom';
  }): ManualAgendaItem {
    const ranks = this.data.manualAgendaItems.map(m => m.rank);
    const minRank = ranks.length ? Math.min(...ranks) : 1;
    const maxRank = ranks.length ? Math.max(...ranks) : 0;
    const position = input.position ?? 'bottom';
    const rank = position === 'top' ? minRank - 1 : maxRank + 1;

    const item: ManualAgendaItem = {
      id: `ma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: input.title,
      clientId: input.clientId ?? null,
      note: input.note ?? '',
      rank,
      createdAt: new Date().toISOString(),
    };
    // Replace the array so useMemo([manualAgendaItems]) consumers recompute.
    this.data.manualAgendaItems = [...this.data.manualAgendaItems, item];
    this.save();
    return item;
  }

  updateManualAgendaItem(id: string, patch: Partial<Omit<ManualAgendaItem, 'id' | 'createdAt'>>) {
    const idx = this.data.manualAgendaItems.findIndex(m => m.id === id);
    if (idx === -1) return;
    const next = { ...this.data.manualAgendaItems[idx], ...patch };
    this.data.manualAgendaItems = [
      ...this.data.manualAgendaItems.slice(0, idx),
      next,
      ...this.data.manualAgendaItems.slice(idx + 1),
    ];
    this.save();
  }

  deleteManualAgendaItem(id: string) {
    const before = this.data.manualAgendaItems.length;
    this.data.manualAgendaItems = this.data.manualAgendaItems.filter(m => m.id !== id);
    if (this.data.manualAgendaItems.length !== before) this.save();
  }

  // ── Members ──────────────────────────────────────────────────────────

  addMember(member: Member) {
    if (this.data.members.some(m => m.id === member.id)) return;
    this.data.members.push(member);
    this.save();
  }

  updateMember(id: string, patch: Partial<Member>) {
    const m = this.data.members.find(m => m.id === id);
    if (!m) return;
    Object.assign(m, patch);
    this.save();
  }

  removeMember(id: string) {
    // Leave any tasks assigned to this member untouched — the UI can
    // show "Unknown" until someone reassigns them.
    this.data.members = this.data.members.filter(m => m.id !== id);
    this.save();
  }

  // ── Onboarding ───────────────────────────────────────────────────────

  /** Flip a single onboarding checkbox. No-op when the id is stale so a
   *  retried click from a re-render can't toss an error. */
  toggleOnboardingItem(id: string) {
    const item = this.data.onboardingItems.find(o => o.id === id);
    if (!item) return;
    item.done = !item.done;
    this.save();
  }

  /** Append a user-added onboarding item to a service's checklist. Used
   *  by the inline "+ Add item" composer on the Onboarding tab. Replaces
   *  the array ref (not `.push`) so useMemo([onboardingItems]) consumers
   *  on ClientDetailPage recompute. */
  addOnboardingItem(item: OnboardingItem) {
    this.data.onboardingItems = [...this.data.onboardingItems, item];
    this.save();
  }

  /** Remove an onboarding item. Template-seeded and user-added items are
   *  treated the same — if a user decides a step doesn't apply to this
   *  client, they can delete it outright rather than leave a permanently
   *  unchecked row polluting the "items left" counter. Low-cost data,
   *  so no confirm dialog — the UI only exposes the × on hover. */
  deleteOnboardingItem(id: string) {
    this.data.onboardingItems = this.data.onboardingItems.filter(o => o.id !== id);
    this.save();
  }

  /** Rename an onboarding item. Used by the double-click-to-edit
   *  affordance on OnboardingRow. Ignored if the new label is empty —
   *  the caller is expected to validate but this method hardens it. */
  updateOnboardingItem(id: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const item = this.data.onboardingItems.find(o => o.id === id);
    if (!item) return;
    item.label = trimmed;
    this.save();
  }

  // ── Client directory: contacts, quick links, team ────────────────────

  addContact(contact: Contact) {
    // Enforce at-most-one primary per client — a new primary bumps the
    // previous one down. The UI also guards this, but the store is the
    // source of truth so duplicate primaries can't leak in via import.
    // Replace the array ref (not `.push`) so useMemo([data.contacts])
    // consumers on the Client Detail About tab recompute.
    const demoted = contact.primary
      ? this.data.contacts.map(c =>
          c.clientId === contact.clientId && c.primary
            ? { ...c, primary: false }
            : c,
        )
      : this.data.contacts;
    this.data.contacts = [...demoted, contact];
    this.save();
  }

  updateContact(id: string, patch: Partial<Contact>) {
    const c = this.data.contacts.find(c => c.id === id);
    if (!c) return;
    if (patch.primary) {
      this.data.contacts
        .filter(x => x.clientId === c.clientId && x.primary && x.id !== id)
        .forEach(x => { x.primary = false; });
    }
    Object.assign(c, patch);
    this.save();
  }

  deleteContact(id: string) {
    this.data.contacts = this.data.contacts.filter(c => c.id !== id);
    this.save();
  }

  addQuickLink(link: QuickLink) {
    // Replace array ref so useMemo([data.quickLinks]) consumers recompute.
    this.data.quickLinks = [...this.data.quickLinks, link];
    this.save();
  }

  updateQuickLink(id: string, patch: Partial<QuickLink>) {
    const q = this.data.quickLinks.find(q => q.id === id);
    if (!q) return;
    Object.assign(q, patch);
    this.save();
  }

  deleteQuickLink(id: string) {
    this.data.quickLinks = this.data.quickLinks.filter(q => q.id !== id);
    this.save();
  }

  /** Add a member to a client's project team. AMs go through `amId`
   *  on the Client object, not through here — this is for operators.
   *  Replaces the clients array ref so useMemo([data.clients]) consumers
   *  (e.g. the About tab's TeamGrid) recompute. */
  addTeamMember(clientId: string, memberId: string) {
    let changed = false;
    const clients = this.data.clients.map(c => {
      if (c.id !== clientId) return c;
      if (c.teamIds.includes(memberId)) return c;
      changed = true;
      return { ...c, teamIds: [...c.teamIds, memberId] };
    });
    if (!changed) return;
    this.data.clients = clients;
    this.save();
  }

  removeTeamMember(clientId: string, memberId: string) {
    let changed = false;
    const clients = this.data.clients.map(c => {
      if (c.id !== clientId) return c;
      const next = c.teamIds.filter(id => id !== memberId);
      if (next.length === c.teamIds.length) return c;
      changed = true;
      return { ...c, teamIds: next };
    });
    if (!changed) return;
    this.data.clients = clients;
    this.save();
  }

  // ── Notes ────────────────────────────────────────────────────────────

  addNote(note: Note) {
    this.data.notes.push(note);
    this.save();
  }

  /** Update the body, pinned state, or lock on a note. Bumps updatedAt
   *  whenever the body changed so the list sort stays honest. */
  updateNote(id: string, patch: Partial<Note>) {
    const n = this.data.notes.find(n => n.id === id);
    if (!n) return;
    // Only bump updatedAt when the body actually moved — tagging a note
    // as pinned shouldn't re-shuffle the sort order by modification time.
    if (patch.body !== undefined && patch.body !== n.body) {
      n.updatedAt = new Date().toISOString();
    }
    Object.assign(n, patch);
    this.save();
  }

  deleteNote(id: string) {
    this.data.notes = this.data.notes.filter(n => n.id !== id);
    this.save();
  }

  toggleNotePinned(id: string) {
    const n = this.data.notes.find(n => n.id === id);
    if (!n) return;
    n.pinned = !n.pinned;
    this.save();
  }

  toggleNoteLocked(id: string) {
    const n = this.data.notes.find(n => n.id === id);
    if (!n) return;
    n.locked = !n.locked;
    this.save();
  }

  // ── Touchpoints ──────────────────────────────────────────────────────

  addTouchpoint(touchpoint: Touchpoint) {
    this.data.touchpoints.push(touchpoint);
    this.save();
  }

  updateTouchpoint(id: string, patch: Partial<Touchpoint>) {
    const t = this.data.touchpoints.find(t => t.id === id);
    if (!t) return;
    Object.assign(t, patch);
    this.save();
  }

  /** Toggle the TL;DR lock. Once a TL;DR is locked any edit has to go
   *  through the edit-history trail — for now that just means the text
   *  flips to read-only in the UI. */
  toggleTouchpointLock(id: string) {
    const t = this.data.touchpoints.find(t => t.id === id);
    if (!t) return;
    t.tldrLocked = !t.tldrLocked;
    this.save();
  }

  deleteTouchpoint(id: string) {
    this.data.touchpoints = this.data.touchpoints.filter(t => t.id !== id);
    // Cascade: a touchpoint with no parent meeting has nowhere to live,
    // so action items go too. Promoted cards remain untouched on the
    // kanban board — losing a meeting shouldn't wipe downstream work.
    this.data.actionItems = this.data.actionItems.filter(a => a.touchpointId !== id);
    this.save();
  }

  // ── Action items ─────────────────────────────────────────────────────

  addActionItem(item: ActionItem) {
    this.data.actionItems.push(item);
    this.save();
  }

  updateActionItem(id: string, patch: Partial<ActionItem>) {
    const a = this.data.actionItems.find(a => a.id === id);
    if (!a) return;
    Object.assign(a, patch);
    this.save();
  }

  toggleActionItem(id: string) {
    const a = this.data.actionItems.find(a => a.id === id);
    if (!a) return;
    a.done = !a.done;
    this.save();
  }

  deleteActionItem(id: string) {
    this.data.actionItems = this.data.actionItems.filter(a => a.id !== id);
    this.save();
  }

  /** Promote a touchpoint action item to a kanban card on one of the
   *  client's service boards. Creates a new Task seeded with the action
   *  item's text, assignee, and due date, lands it in the To Do column,
   *  and back-links the action item so its row swaps from "Promote to
   *  card" to "On board" on the next render.
   *
   *  Returns the new task id so the UI can route/open the card after. */
  promoteActionItem(actionItemId: string, serviceId: string): string | null {
    const item = this.data.actionItems.find(a => a.id === actionItemId);
    if (!item) return null;
    const service = this.data.services.find(s => s.id === serviceId);
    if (!service) return null;

    const now = new Date().toISOString();
    const taskId = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const task: Task = {
      id: taskId,
      serviceId: service.id,
      clientId: service.clientId,
      title: item.text,
      columnId: 'todo',
      priority: 'medium',
      assigneeId: item.assigneeId ?? null,
      labels: [],
      dueDate: item.dueDate,
      createdAt: now,
    };

    this.data.tasks.push(task);
    if (!service.taskIds.includes(taskId)) service.taskIds.push(taskId);
    // Activity entry makes the provenance findable from the card side —
    // the first line of the card's history tells you it came from a
    // meeting follow-up, not a raw +Add Card.
    this.logActivity(
      taskId,
      'created',
      `promoted from meeting action item: "${item.text}"`,
    );
    item.promotedCardId = taskId;
    this.save();
    return taskId;
  }

  // ── Bulk / dev helpers ───────────────────────────────────────────────

  /** Replace the entire dataset. Used by the demo-seed loader and the
   *  "Reset workspace" danger-zone action. */
  replaceAll(next: FlizowData) {
    this.data = migrate(next);
    this.save();
  }

  reset() {
    this.replaceAll(emptyData());
  }

  /** Dev helper: seed the workspace with the 50 demo clients from the
   *  mockup. Dynamic import so the demo bundle only loads when the user
   *  actually clicks "Load demo data" — keeps the main chunk lean. */
  async loadDemoData() {
    const { generateDemoData } = await import('../data/demoData');
    this.replaceAll(generateDemoData());
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Pretty names for the five kanban columns. Used by the activity log
 *  so moves read as "moved this card to In Progress" rather than the
 *  raw id. */
function columnLabel(id: ColumnId): string {
  switch (id) {
    case 'todo':       return 'To Do';
    case 'inprogress': return 'In Progress';
    case 'blocked':    return 'Blocked';
    case 'review':     return 'Needs Review';
    case 'done':       return 'Done';
  }
}

function priorityLabel(p: Priority): string {
  switch (p) {
    case 'urgent': return 'Urgent';
    case 'high':   return 'High';
    case 'medium': return 'Medium';
    case 'low':    return 'Low';
  }
}

/** Format an ISO YYYY-MM-DD string as "Mar 4". Used in activity text.
 *  Parses via UTC so timezone drift doesn't flip the displayed day. */
function formatDayLabel(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Activity log prints raw label ids so the store stays decoupled from
 *  the BOARD_LABELS constants. Wrapping it in this helper gives us a
 *  single place to prettify later. */
function labelText(id: string): string {
  return id;
}

function initialsOf(nameOrEmail: string): string {
  const cleaned = nameOrEmail.split('@')[0].replace(/[^\w\s]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ── Singleton export ─────────────────────────────────────────────────────

export const flizowStore = new FlizowStore();
export type { FlizowStore };
