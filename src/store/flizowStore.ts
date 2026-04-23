import { doc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  FlizowData, Client, Service, Task, Member, Contact, QuickLink, Note,
  Touchpoint, ActionItem, TaskComment,
  ColumnId, Priority,
} from '../types/flizow';

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
    today: todayISO(),
    scheduleTaskMap: {},
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
    // `today` always refreshes on load — we never trust a stale anchor.
    today: todayISO(),
    scheduleTaskMap: parsed.scheduleTaskMap ?? base.scheduleTaskMap,
  };
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
    this.save();
  }

  // ── Services ─────────────────────────────────────────────────────────

  addService(service: Service) {
    this.data.services.push(service);
    const client = this.data.clients.find(c => c.id === service.clientId);
    if (client && !client.serviceIds.includes(service.id)) {
      client.serviceIds.push(service.id);
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
    const client = this.data.clients.find(c => c.id === svc.clientId);
    if (client) {
      client.serviceIds = client.serviceIds.filter(sid => sid !== id);
    }
    this.save();
  }

  // ── Tasks ────────────────────────────────────────────────────────────

  addTask(task: Task) {
    this.data.tasks.push(task);
    const service = this.data.services.find(s => s.id === task.serviceId);
    if (service && !service.taskIds.includes(task.id)) {
      service.taskIds.push(task.id);
    }
    this.save();
  }

  updateTask(id: string, patch: Partial<Task>) {
    const t = this.data.tasks.find(t => t.id === id);
    if (!t) return;
    Object.assign(t, patch);
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

  deleteTask(id: string) {
    const t = this.data.tasks.find(t => t.id === id);
    if (!t) return;
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    // Drop every comment + reply hanging off this card.
    this.data.taskComments = this.data.taskComments.filter(c => c.taskId !== id);
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
    t.checklist.push({ id, text: text.trim(), done: false, assigneeId: null });
    this.save();
    return id;
  }

  toggleChecklistItem(taskId: string, itemId: string) {
    const t = this.data.tasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    const item = t.checklist.find(i => i.id === itemId);
    if (!item) return;
    item.done = !item.done;
    this.save();
  }

  updateChecklistItemText(taskId: string, itemId: string, text: string) {
    const t = this.data.tasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    const item = t.checklist.find(i => i.id === itemId);
    if (!item) return;
    const trimmed = text.trim();
    if (!trimmed) return; // empty text = ignore; deletion is a separate call
    item.text = trimmed;
    this.save();
  }

  deleteChecklistItem(taskId: string, itemId: string) {
    const t = this.data.tasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    t.checklist = t.checklist.filter(i => i.id !== itemId);
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
    this.data.taskComments.push(comment);
    this.save();
    return id;
  }

  /** Rewrite a comment's body. Bumps `updatedAt` so the UI can show an
   *  "Edited" hint. No-ops if the id is stale. */
  updateComment(id: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const c = this.data.taskComments.find(c => c.id === id);
    if (!c) return;
    if (c.text === trimmed) return; // no-op guard keeps `updatedAt` honest
    c.text = trimmed;
    c.updatedAt = new Date().toISOString();
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
    this.save();
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

  // ── Client directory: contacts, quick links, team ────────────────────

  addContact(contact: Contact) {
    // Enforce at-most-one primary per client — a new primary bumps the
    // previous one down. The UI also guards this, but the store is the
    // source of truth so duplicate primaries can't leak in via import.
    if (contact.primary) {
      this.data.contacts
        .filter(c => c.clientId === contact.clientId && c.primary)
        .forEach(c => { c.primary = false; });
    }
    this.data.contacts.push(contact);
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
    this.data.quickLinks.push(link);
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
   *  on the Client object, not through here — this is for operators. */
  addTeamMember(clientId: string, memberId: string) {
    const client = this.data.clients.find(c => c.id === clientId);
    if (!client) return;
    if (client.teamIds.includes(memberId)) return;
    client.teamIds.push(memberId);
    this.save();
  }

  removeTeamMember(clientId: string, memberId: string) {
    const client = this.data.clients.find(c => c.id === clientId);
    if (!client) return;
    const next = client.teamIds.filter(id => id !== memberId);
    if (next.length === client.teamIds.length) return;
    client.teamIds = next;
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
