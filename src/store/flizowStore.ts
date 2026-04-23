import { doc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  FlizowData, Client, Service, Task, Member, ColumnId, Priority,
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
  return {
    clients: parsed.clients ?? base.clients,
    services: parsed.services ?? base.services,
    tasks: parsed.tasks ?? base.tasks,
    members: parsed.members ?? base.members,
    integrations: parsed.integrations ?? base.integrations,
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
    this.data.clients = this.data.clients.filter(c => c.id !== id);
    this.data.services = this.data.services.filter(s => !serviceIds.has(s.id));
    this.data.tasks = this.data.tasks.filter(t => !serviceIds.has(t.serviceId));
    this.data.integrations = this.data.integrations.filter(i => i.clientId !== id);
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
    this.data.services = this.data.services.filter(s => s.id !== id);
    this.data.tasks = this.data.tasks.filter(t => t.serviceId !== id);
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
