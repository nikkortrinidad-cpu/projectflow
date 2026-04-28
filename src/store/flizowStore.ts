import { doc, setDoc, getDoc, onSnapshot, deleteField, type Unsubscribe } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import type {
  FlizowData, Client, Service, Task, Member, Contact, QuickLink, Note,
  Touchpoint, ActionItem, TaskComment, TaskActivity, TaskActivityKind,
  ManualAgendaItem, OnboardingItem, ColumnId, Priority, OpsTask,
  TaskChecklistItem,
  TemplateRecord, AccessLevel, WorkspaceDoc, WorkspaceMembership,
  PendingInvite,
} from '../types/flizow';
import { ONBOARDING_TEMPLATES } from '../data/onboardingTemplates';
import { TASK_POOLS } from '../data/taskPools';
import { findTemplate } from '../data/templates';
import { OPS_TEAM_MEMBERS, OPS_TASK_SEED } from '../data/opsSeed';

/**
 * FlizowStore — central data container.
 *
 * As of 2026-04-27, this is workspace-centric (multi-user). Each
 * signed-in user belongs to exactly one workspace, identified by
 * `workspaces/{wsId}` in Firestore, and a `users/{uid}` lookup doc
 * tells us which workspace they're in. The wsId for a workspace is
 * the original owner's UID — simple mapping, no ID generator needed.
 *
 * Firestore layout (current):
 *   workspaces/{wsId} → WorkspaceDoc (data + members + invites)
 *   users/{uid}       → { workspaceId }
 *
 * Firestore layout (legacy, for migration only):
 *   flizow/{uid} → { data: <FlizowData JSON>, updatedAt }
 *
 * On first sign-in post-deploy, if `users/{uid}` is absent we look at
 * `flizow/{uid}`. If it has data, we migrate it into a new workspace
 * with the current user as owner. Legacy doc is left in place as a
 * one-week safety net.
 */

const STORAGE_KEY = 'flizow-state';
const WORKSPACES_COLLECTION = 'workspaces';
const USERS_COLLECTION = 'users';
const LEGACY_COLLECTION = 'flizow';
const FIRESTORE_DEBOUNCE_MS = 1000;
/** sessionStorage key — pre-auth, App.tsx stashes `?join=...&token=...`
 *  query params here so the post-sign-in setUser path can pick them
 *  up and run the accept-invite flow. */
const PENDING_JOIN_KEY = 'flizow-pending-join';

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
    memberDayOverrides: [],
    opsTasks: [],
    today: todayISO(),
    scheduleTaskMap: {},
    favoriteServiceIds: [],
    templateOverrides: [],
    theme: 'light',
    // True by default in emptyData — a fresh empty workspace is
    // explicitly NOT owed an auto-seed. The migrate() path handles
    // the legacy backfill case where a returning user has data but
    // no flag yet.
    opsSeeded: true,
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

  // Ops-seed gate. The auto-seed used to fire on every fresh load
  // where the seed conditions were met — which meant a brand-new user
  // signing in for the first time landed on an Ops board pre-populated
  // with 12 fake colleagues and 12 demo tasks. Confusing against the
  // "No clients yet" state on every other surface. Now:
  //   - opsSeeded === true → respect whatever the user has, never seed
  //   - opsSeeded undefined/false (legacy data only) → run the seed
  //     ONCE for backward-compat, then flip the flag forever
  //   - emptyData() defaults opsSeeded to true so brand-new users
  //     never trigger the legacy backfill path
  // The "Try the demo" CTA on Overview is the explicit way to populate
  // the workspace — including Ops, which the demoData generator now
  // bundles itself instead of relying on this seed.
  const existingMembers = parsed.members ?? base.members;
  const isLegacyUnseeded = parsed.opsSeeded !== true;
  let members = existingMembers;
  let opsTasks = parsed.opsTasks ?? base.opsTasks;
  if (isLegacyUnseeded) {
    // Members seed: idempotent per id (preserves user renames/colours).
    const missingOpsTeam = OPS_TEAM_MEMBERS.filter(
      seed => !existingMembers.some(m => m.id === seed.id),
    );
    if (missingOpsTeam.length) {
      members = [...existingMembers, ...missingOpsTeam];
    }
    // Tasks seed: only if the pile is empty AND this is legacy data
    // (i.e. there's already a workspace built up — clients, services,
    // notes). Brand-new users with empty everything get NOTHING.
    const hasWorkspaceData =
      (parsed.clients?.length ?? 0) > 0 ||
      (parsed.services?.length ?? 0) > 0 ||
      (parsed.notes?.length ?? 0) > 0 ||
      (parsed.contacts?.length ?? 0) > 0;
    if (opsTasks.length === 0 && hasWorkspaceData) {
      opsTasks = OPS_TASK_SEED.map(t => ({ ...t }));
    }
  }

  return {
    clients,
    services: parsed.services ?? base.services,
    tasks: parsed.tasks ?? base.tasks,
    members,
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
    // Capacity model added 2026-04-28; older docs need an empty array.
    memberDayOverrides: Array.isArray(parsed.memberDayOverrides)
      ? parsed.memberDayOverrides
      : base.memberDayOverrides,
    opsTasks,
    // `today` always refreshes on load — we never trust a stale anchor.
    today: todayISO(),
    scheduleTaskMap: parsed.scheduleTaskMap ?? base.scheduleTaskMap,
    favoriteServiceIds: Array.isArray(parsed.favoriteServiceIds)
      ? parsed.favoriteServiceIds
      : base.favoriteServiceIds,
    // Older docs predate the templates admin editor — backfill empty.
    // The resolver in data/templates.ts treats an empty overrides
    // array as "render the five built-ins as-is."
    templateOverrides: Array.isArray(parsed.templateOverrides)
      ? parsed.templateOverrides
      : base.templateOverrides,
    // Theme migrated here from the legacy BoardStore (audit: D3).
    // Older docs may not carry a theme field — fall back to light.
    // We also accept the legacy localStorage key once on load, so a
    // returning user keeps whatever they had set.
    theme: parsed.theme === 'dark' ? 'dark' : (legacyTheme() ?? 'light'),
    // Always flip to true after migrate runs. New users opted out of
    // auto-seed via emptyData; legacy users either got the one-shot
    // backfill above or didn't qualify. Either way, future loads
    // respect their state.
    opsSeeded: true,
  };
}

/** One-shot read of the legacy BoardStore's theme cookie. Only used
 *  by migrate() so a returning user's "dark" preference doesn't get
 *  reset to light when we drop the legacy store. The localStorage
 *  payload is the entire BoardState; we just pick `.theme`. */
function legacyTheme(): 'light' | 'dark' | null {
  try {
    const raw = localStorage.getItem('kanban-board-state');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const theme = (parsed as { theme?: unknown }).theme;
      if (theme === 'dark' || theme === 'light') return theme;
    }
  } catch { /* corrupt payload — ignore */ }
  return null;
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

/** Derive a 2-letter workspace tile from a workspace name. Splits on
 *  whitespace, takes the first letter of the first two words. Falls
 *  back to the first two characters when the name is one word. The
 *  user can override this in the Workspace tab — derivation only
 *  fires when seeding a new workspace or auto-deriving for a doc
 *  that pre-dated the identity slice. */
function deriveWorkspaceInitials(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 'WS';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Pre-auth stash for invite query params. App.tsx reads `?join=&token=`
 *  on boot and calls `stashPendingJoin` so the params survive the
 *  Google sign-in redirect. setUser then reads it to run the accept
 *  flow inside resolveWorkspaceId. sessionStorage (not localStorage)
 *  so the stash dies with the tab — leftover invite tokens don't
 *  haunt future sessions. */
export function stashPendingJoin(workspaceId: string, token: string, name?: string): void {
  try {
    sessionStorage.setItem(
      PENDING_JOIN_KEY,
      JSON.stringify({ workspaceId, token, ...(name ? { name } : {}) }),
    );
  } catch { /* private mode — invite just won't auto-resume across sign-in */ }
}

export function readPendingJoin(): { workspaceId: string; token: string; name?: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_JOIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.workspaceId && parsed.token) {
      return {
        workspaceId: String(parsed.workspaceId),
        token: String(parsed.token),
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
      };
    }
  } catch { /* corrupt — clear it */ }
  return null;
}

export function clearPendingJoin(): void {
  try { sessionStorage.removeItem(PENDING_JOIN_KEY); } catch { /* ignore */ }
}

// ── Store class ──────────────────────────────────────────────────────────

type Listener = () => void;

class FlizowStore {
  private data: FlizowData;
  private listeners: Set<Listener> = new Set();
  private userId: string | null = null;
  /** Workspace the signed-in user belongs to. Null in local-only /
   *  dev-bypass mode. Set during setUser(uid). */
  private workspaceId: string | null = null;
  /** Workspace-level metadata: identity (name/initials/color/logoUrl),
   *  members, invites, ownerUid, timestamps. Separate from `data`
   *  (which holds clients/services/etc.) so the Members UI can
   *  subscribe without re-rendering on every card edit. */
  private workspaceMeta: {
    ownerUid: string;
    name: string;
    initials: string;
    color: string;
    logoUrl?: string;
    members: WorkspaceMembership[];
    pendingInvites: PendingInvite[];
    createdAt: string;
  } | null = null;
  private workspaceListeners: Set<Listener> = new Set();
  private firestoreUnsub: Unsubscribe | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  /** When we write to Firestore, the snapshot listener would fire right
   *  back with the same payload — this flag swallows that echo. */
  private ignoreNextSnapshot = false;
  /** User-facing sync error. null when everything is healthy. Set when
   *  localStorage quota is hit, when Firestore writes fail, when the
   *  user is offline. App.tsx renders a banner reading this. Cleared
   *  on the next successful save. Audit: error/offline HIGH (silent
   *  Firestore failures + silent localStorage quota errors). */
  private syncError: string | null = null;
  private syncErrorListeners: Set<Listener> = new Set();

  constructor() {
    this.data = loadFromLocalStorage();
  }

  /** Wrap localStorage.setItem so a thrown QuotaExceededError (Safari
   *  private mode, full device storage, etc.) gets surfaced to the UI
   *  instead of crashing the whole app. Returns true on success.
   *  Audit: error/offline HIGH (4 unguarded setItem calls). */
  private safeSetItem(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[flizowStore] localStorage write failed:', err);
      this.setSyncError(
        "Couldn't save to local storage — your browser may be full or in private mode. Changes still try to sync to the cloud.",
      );
      return false;
    }
  }

  // ── Sync-error subscription (parallel to data subscription) ─────────

  /** Separate listener set so a banner re-render doesn't cascade all
   *  data consumers, and a data mutation doesn't re-render the banner
   *  unless the error state actually changed. */
  subscribeSyncError = (listener: Listener): (() => void) => {
    this.syncErrorListeners.add(listener);
    return () => { this.syncErrorListeners.delete(listener); };
  };

  getSyncError = (): string | null => this.syncError;

  private setSyncError(msg: string | null) {
    if (this.syncError === msg) return;
    this.syncError = msg;
    this.syncErrorListeners.forEach((l) => l());
  }

  /** Called by the UI when the user dismisses the sync banner. Doesn't
   *  guarantee subsequent saves will succeed — just clears the message
   *  so it's not a permanent fixture. */
  clearSyncError = () => {
    this.setSyncError(null);
  };

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

  /** Async because workspace resolution (lookup → migrate → subscribe)
   *  involves multiple Firestore round trips. Callers don't need to
   *  await; they can fire-and-forget. The store handles its own state
   *  updates via notify() once the workspace lands. */
  async setUser(
    userId: string | null,
    displayName?: string,
    email?: string,
    photoURL?: string,
  ): Promise<void> {
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }

    // Different user on the same browser? Wipe local state so nothing from
    // the previous session bleeds through.
    if (this.userId && userId && this.userId !== userId) {
      localStorage.removeItem(STORAGE_KEY);
      this.data = emptyData();
      this.workspaceMeta = null;
      this.workspaceId = null;
    }

    this.userId = userId;

    if (!userId) {
      this.workspaceId = null;
      this.workspaceMeta = null;
      this.notify();
      this.notifyWorkspace();
      return;
    }

    // Resolve which workspace this user belongs to. Three cases handled
    // inside resolveWorkspaceId: existing user via users/{uid} lookup,
    // legacy single-user data at flizow/{uid} (migrated to a new
    // workspace), pending invite stashed by App.tsx (joined to an
    // inviter's workspace), or brand-new user (fresh workspace).
    let wsId: string;
    try {
      wsId = await this.resolveWorkspaceId(userId, displayName, email, photoURL);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[flizowStore] workspace resolution failed:', err);
      this.setSyncError(
        "Couldn't load your workspace. Reload to retry. If this keeps happening, check your connection.",
      );
      return;
    }
    this.workspaceId = wsId;

    // Subscribe to the workspace doc. Snapshot fires immediately with
    // current data, then on every server-side change.
    const wsRef = doc(db, WORKSPACES_COLLECTION, wsId);
    this.firestoreUnsub = onSnapshot(wsRef, (snap) => {
      if (this.ignoreNextSnapshot) {
        this.ignoreNextSnapshot = false;
        return;
      }
      if (!snap.exists()) {
        // Workspace was deleted from under us. Edge case for MVP — log
        // and keep showing what we have locally. A later pass might
        // surface a "workspace removed" banner.
        // eslint-disable-next-line no-console
        console.warn('[flizowStore] workspace doc disappeared:', wsId);
        return;
      }
      const ws = snap.data() as WorkspaceDoc;
      // Pull data through migrate() so older fields backfill (theme,
      // opsSeeded, templateOverrides, etc.). Same pattern as before;
      // just sourced from the workspace doc instead of flizow/{uid}.
      const cloud = migrate(ws.data ?? {});
      this.data = cloud;
      // Identity backfill for workspaces created before the
      // name/initials/color slice landed. Default name derives from
      // the owner's cached display name (best-effort: pull from the
      // owner's WorkspaceMembership record). If everything's
      // missing, fall back to "My workspace" rather than blank.
      const ownerMember = (ws.members ?? []).find((m) => m.uid === ws.ownerUid);
      const fallbackName = ownerMember?.displayName
        ? `${ownerMember.displayName}'s workspace`
        : 'My workspace';
      const wsName = ws.name || fallbackName;
      const wsInitials = ws.initials || deriveWorkspaceInitials(wsName);
      const wsColor = ws.color || '#5e5ce6';
      this.workspaceMeta = {
        ownerUid: ws.ownerUid,
        name: wsName,
        initials: wsInitials,
        color: wsColor,
        logoUrl: ws.logoUrl || undefined,
        members: ws.members ?? [],
        pendingInvites: ws.pendingInvites ?? [],
        createdAt: ws.createdAt || new Date().toISOString(),
      };
      // If the cloud doc was missing identity fields, push the
      // backfilled values so subsequent reads (and other devices)
      // see the defaults. Wrapped in a one-shot guard so this fires
      // exactly once per session at most.
      const needsIdentityBackfill = !ws.name || !ws.initials || !ws.color;
      if (needsIdentityBackfill && this.userId === ws.ownerUid) {
        this.persistWorkspaceIdentity({
          name: wsName,
          initials: wsInitials,
          color: wsColor,
        }).catch(() => { /* non-fatal — banner already covers sync errors */ });
      }
      this.upsertOwnMember(userId, displayName, email, photoURL);
      this.safeSetItem(STORAGE_KEY, JSON.stringify(this.data));
      this.notify();
      this.notifyWorkspace();
    });
  }

  /** Decide which workspace this user belongs to. Side effects:
   *   - Creates `users/{uid}` lookup doc if missing
   *   - Migrates legacy `flizow/{uid}` data into a new workspace
   *   - Joins a workspace via stashed invite if present
   *   - Creates a fresh empty workspace for first-time users
   */
  private async resolveWorkspaceId(
    uid: string,
    displayName?: string,
    email?: string,
    photoURL?: string,
  ): Promise<string> {
    // 1. Already in the system? users/{uid} lookup tells us where.
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data() as { workspaceId?: string };
      if (data.workspaceId) return data.workspaceId;
    }

    // 2. Pending invite stashed by App.tsx pre-auth? Try to join.
    //    If the invite is valid, this user becomes a member of an
    //    existing workspace.
    const pending = readPendingJoin();
    if (pending) {
      try {
        await this.acceptPendingJoin(pending, uid, displayName, email, photoURL);
        clearPendingJoin();
        // After successful join, write the lookup and return the wsId.
        await setDoc(userDocRef, { workspaceId: pending.workspaceId });
        return pending.workspaceId;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[flizowStore] invite accept failed:', err);
        clearPendingJoin();
        // Fall through to legacy/fresh path so the user isn't stranded.
      }
    }

    // 3. Legacy single-user doc at flizow/{uid}? Migrate it forward.
    const legacyRef = doc(db, LEGACY_COLLECTION, uid);
    const legacySnap = await getDoc(legacyRef);
    let legacyData: FlizowData | null = null;
    if (legacySnap.exists()) {
      const payload = legacySnap.data();
      if (payload && typeof payload.data === 'string') {
        try {
          legacyData = migrate(JSON.parse(payload.data) as Partial<FlizowData>);
        } catch {
          // Corrupt JSON in legacy doc — proceed as a fresh user.
        }
      }
    }

    // 4. Create a new workspace doc with this user as sole owner.
    //    The workspace ID is the user's UID — clean 1:1 mapping for
    //    the lifetime of the workspace.
    const wsId = uid;
    const now = new Date().toISOString();
    const initials = initialsOf(displayName || email || 'You');
    const ownMembership: WorkspaceMembership = {
      uid,
      displayName: displayName || undefined,
      email: email || undefined,
      photoURL: photoURL || undefined,
      role: 'admin',
      joinedAt: now,
    };
    // Seed workspace identity. Name derives from the owner's display
    // name ("Nikko Trinidad's workspace"); initials + color get
    // sensible defaults the user can change in Account Settings.
    const wsName = displayName
      ? `${displayName}'s workspace`
      : 'My workspace';
    const wsDoc: WorkspaceDoc = {
      ownerUid: uid,
      name: wsName,
      initials: deriveWorkspaceInitials(wsName),
      color: '#5e5ce6',
      members: [ownMembership],
      memberUids: [uid],
      pendingInvites: [],
      data: legacyData ?? emptyData(),
      createdAt: now,
      updatedAt: now,
    };
    // Make sure the legacy data also has THIS user as a Member record
    // (not just a workspace member) so assignee pickers etc. resolve.
    const ownMember = wsDoc.data.members.find((m) => m.id === uid);
    if (!ownMember) {
      wsDoc.data.members.push({
        id: uid,
        initials,
        name: displayName || 'You',
        role: 'Owner',
        color: '#5e5ce6',
        type: 'am',
        accessLevel: 'admin',
      });
    }
    const wsRef = doc(db, WORKSPACES_COLLECTION, wsId);
    await setDoc(wsRef, wsDoc);
    await setDoc(userDocRef, { workspaceId: wsId });
    return wsId;
  }

  /** Validate a pending invite and add the current user to the
   *  target workspace. Throws on any validation failure (caller
   *  catches and falls through to the legacy/fresh path). */
  private async acceptPendingJoin(
    pending: { workspaceId: string; token: string },
    uid: string,
    displayName?: string,
    email?: string,
    photoURL?: string,
  ): Promise<void> {
    const wsRef = doc(db, WORKSPACES_COLLECTION, pending.workspaceId);
    const snap = await getDoc(wsRef);
    if (!snap.exists()) throw new Error('Invite target workspace not found');
    const ws = snap.data() as WorkspaceDoc;
    const invite = (ws.pendingInvites ?? []).find((i) => i.token === pending.token);
    if (!invite) throw new Error('Invite token not found or already used');

    // Already a member? Just consume the invite and skip adding.
    const alreadyMember = (ws.memberUids ?? []).includes(uid);
    const now = new Date().toISOString();
    const newMembership: WorkspaceMembership = {
      uid,
      displayName: displayName || undefined,
      email: email || undefined,
      photoURL: photoURL || undefined,
      role: invite.role,
      joinedAt: now,
    };
    const nextMembers = alreadyMember
      ? ws.members
      : [...(ws.members ?? []), newMembership];
    const nextMemberUids = alreadyMember
      ? ws.memberUids
      : [...(ws.memberUids ?? []), uid];
    const nextPendingInvites = (ws.pendingInvites ?? []).filter(
      (i) => i.token !== pending.token,
    );
    await setDoc(wsRef, {
      ...ws,
      members: nextMembers,
      memberUids: nextMemberUids,
      pendingInvites: nextPendingInvites,
      updatedAt: now,
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
      // Backfill accessLevel for returning users from before the field
      // existed. The workspace owner is always admin; ?? preserves any
      // future override (e.g. if we ever support transferring ownership).
      existing.accessLevel = existing.accessLevel ?? 'admin';
    } else {
      this.data.members.push({
        id: uid,
        initials,
        name: displayName || 'You',
        role: 'Owner',
        color: '#5e5ce6',
        type: 'am',
        accessLevel: 'admin',
      });
    }
  }

  getCurrentMemberId(): string | null {
    return this.userId;
  }

  // ── Workspace subscription (parallel to data subscription) ──────────

  /** Members + invites + ownerUid live behind their own observable so
   *  the Members UI doesn't re-render on every card move. */
  subscribeWorkspace = (listener: Listener): (() => void) => {
    this.workspaceListeners.add(listener);
    return () => { this.workspaceListeners.delete(listener); };
  };

  getWorkspaceMeta = (): typeof this.workspaceMeta => this.workspaceMeta;

  getWorkspaceId = (): string | null => this.workspaceId;

  private notifyWorkspace() {
    this.workspaceListeners.forEach((l) => l());
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private save() {
    this.safeSetItem(STORAGE_KEY, JSON.stringify(this.data));
    this.notify();
    this.saveToFirestore();
  }

  private saveToFirestore() {
    if (!this.userId || !this.workspaceId || !this.workspaceMeta) return;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(async () => {
      try {
        this.ignoreNextSnapshot = true;
        const wsRef = doc(db, WORKSPACES_COLLECTION, this.workspaceId!);
        // Write the full workspace doc shape — data + the metadata we
        // already have in memory. Workspace metadata changes (members,
        // invites) go through dedicated methods that also write the
        // workspace doc; this is the data-only path that fires after
        // every store mutation.
        await setDoc(wsRef, {
          ownerUid: this.workspaceMeta!.ownerUid,
          members: this.workspaceMeta!.members,
          memberUids: this.workspaceMeta!.members.map((m) => m.uid),
          pendingInvites: this.workspaceMeta!.pendingInvites,
          data: this.data,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        if (this.syncError) this.setSyncError(null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to save Flizow state to Firestore:', err);
        this.ignoreNextSnapshot = false;
        const code = (err as { code?: string } | null)?.code ?? '';
        let msg: string;
        if (code === 'permission-denied') {
          msg = 'Cloud save failed — you may have been signed out. Reload to sign back in.';
        } else if (code === 'unavailable' || code === 'deadline-exceeded') {
          msg = "You're offline. Changes are saved locally and will sync when you reconnect.";
        } else if (code === 'resource-exhausted') {
          msg = 'Cloud save failed — daily write limit hit. Try again later.';
        } else {
          msg = "Couldn't sync to the cloud. Changes are saved locally for now.";
        }
        this.setSyncError(msg);
      }
    }, FIRESTORE_DEBOUNCE_MS);
  }

  // ── Workspace identity ────────────────────────────────────────────────

  /** Patch workspace name / initials / color. Owner-only — non-owners
   *  hit the Firestore rule (member can write but the UI hides the
   *  controls anyway). All three fields optional; only the keys
   *  actually present in `patch` get changed. */
  async updateWorkspaceIdentity(patch: {
    name?: string;
    initials?: string;
    color?: string;
  }): Promise<void> {
    if (!this.workspaceId || !this.workspaceMeta) return;
    // Local optimistic update so the UI feels instant. The snapshot
    // listener will reconcile on the next round-trip.
    this.workspaceMeta = {
      ...this.workspaceMeta,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.initials !== undefined ? { initials: patch.initials } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    };
    this.notifyWorkspace();
    await this.persistWorkspaceIdentity({
      name: this.workspaceMeta.name,
      initials: this.workspaceMeta.initials,
      color: this.workspaceMeta.color,
    });
  }

  /** Internal: write the identity fields to Firestore. Used by both
   *  the explicit edit path (updateWorkspaceIdentity) and the silent
   *  backfill when an existing workspace doc lacks identity fields. */
  private async persistWorkspaceIdentity(fields: {
    name: string;
    initials: string;
    color: string;
  }): Promise<void> {
    if (!this.workspaceId) return;
    const wsRef = doc(db, WORKSPACES_COLLECTION, this.workspaceId);
    await setDoc(wsRef, {
      name: fields.name,
      initials: fields.initials,
      color: fields.color,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  // ── Workspace logo (Firebase Storage) ─────────────────────────────────

  /** Upload an image file as the workspace logo. Stores at
   *  `workspaces/{wsId}/logo` (single file per workspace, overwrites
   *  on re-upload — no orphaned files to clean up). After upload,
   *  writes the download URL to the workspace doc's `logoUrl` so all
   *  members see the new logo on their next snapshot.
   *
   *  Caller responsibilities:
   *    - File-type check (the UI restricts the picker to image/*)
   *    - Size check before calling (Storage rules also enforce a
   *      5MB cap as defense-in-depth, but a client-side warning is
   *      a better UX than a Storage permission-denied error)
   *
   *  Throws on failure — caller surfaces the error in the UI. */
  async uploadWorkspaceLogo(file: File): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Cannot upload logo — no active workspace');
    }
    // Single file per workspace. Re-uploads overwrite, so we don't
    // accumulate orphan files in Storage. The path stays simple;
    // the cache-bust lives in the URL we write to Firestore.
    const objectPath = `workspaces/${this.workspaceId}/logo`;
    const objectRef = storageRef(storage, objectPath);

    // Race the upload against a 60-second timeout. Without this, if
    // Firebase Storage is misconfigured (bucket doesn't exist, rules
    // not published, project Storage not enabled) the upload promise
    // can hang silently, leaving the UI stuck on "Uploading…". 60
    // seconds is generous for slow networks but short enough that
    // a real configuration issue surfaces quickly.
    const timeoutMs = 60_000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(
          `Upload timed out after ${timeoutMs / 1000}s. Check that Firebase Storage is enabled in your Firebase console and the Storage rules from docs/firestore-rules.md are published.`,
        )),
        timeoutMs,
      );
    });
    await Promise.race([
      uploadBytes(objectRef, file, {
        contentType: file.type || 'image/png',
      }),
      timeoutPromise,
    ]);
    const url = await Promise.race([getDownloadURL(objectRef), timeoutPromise]);
    // Append a cache-bust query so re-uploads of the SAME path show
    // immediately (Firebase's download URL is stable per object;
    // browsers cache aggressively). The query is harmless to
    // Firebase Storage — it ignores unknown params.
    const bustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    if (!this.workspaceMeta) return;
    this.workspaceMeta = { ...this.workspaceMeta, logoUrl: bustedUrl };
    this.notifyWorkspace();
    const wsRef = doc(db, WORKSPACES_COLLECTION, this.workspaceId);
    await setDoc(wsRef, {
      logoUrl: bustedUrl,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  /** Remove the workspace logo. Deletes the Storage object AND
   *  clears `logoUrl` from the workspace doc. The avatar tile falls
   *  back to initials + color rendering. Storage delete failures are
   *  swallowed (orphan file is harmless; the doc-level clear is
   *  what matters for rendering). */
  async removeWorkspaceLogo(): Promise<void> {
    if (!this.workspaceId || !this.workspaceMeta) return;
    // Optimistic local clear.
    this.workspaceMeta = { ...this.workspaceMeta, logoUrl: undefined };
    this.notifyWorkspace();
    // Clear the doc field. deleteField() removes it from Firestore
    // entirely (vs writing null) so the read-back doesn't carry a
    // null value forever.
    const wsRef = doc(db, WORKSPACES_COLLECTION, this.workspaceId);
    await setDoc(wsRef, {
      logoUrl: deleteField(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    // Best-effort delete the Storage object too.
    try {
      const objectRef = storageRef(storage, `workspaces/${this.workspaceId}/logo`);
      await deleteObject(objectRef);
    } catch {
      // Object might not exist (never uploaded) or permission
      // failed — non-fatal. The Firestore clear is the source of
      // truth for rendering.
    }
  }

  // ── Member + invite operations ────────────────────────────────────────

  /** Generate an invite link that any new user can click to join this
   *  workspace as an Editor (or whatever role passed). Returns the
   *  full URL to share. Token is a single-use random string stored on
   *  the workspace doc; consumed atomically when the invitee accepts. */
  async createInvite(role: AccessLevel = 'editor', note?: string): Promise<string> {
    if (!this.workspaceId || !this.workspaceMeta || !this.userId) {
      throw new Error('Cannot invite — no active workspace');
    }
    const token = `inv_${Math.random().toString(36).slice(2, 11)}${Math.random().toString(36).slice(2, 11)}`;
    const newInvite: PendingInvite = {
      token,
      role,
      createdAt: new Date().toISOString(),
      createdByUid: this.userId,
      note: note?.trim() || undefined,
    };
    this.workspaceMeta = {
      ...this.workspaceMeta,
      pendingInvites: [...this.workspaceMeta.pendingInvites, newInvite],
    };
    // Persist immediately (skip the data-only debounce) so the link
    // works the second the inviter copies it.
    const wsRef = doc(db, WORKSPACES_COLLECTION, this.workspaceId);
    await setDoc(wsRef, {
      pendingInvites: this.workspaceMeta.pendingInvites,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    this.notifyWorkspace();
    // Build the URL. Use window.location.origin + the app's base path
    // so the link works regardless of dev/prod hosting.
    // Include the workspace name in the URL as a `n` (name) param so
    // the invite-landing page can show "You've been invited to join
    // Acme Marketing" BEFORE the user signs in. Pre-auth, Firestore
    // rules prevent reading the workspace doc to fetch the name, so
    // we ferry it through the URL. Trust model: an attacker could
    // construct a link with a fake name, but the wsId + token combo
    // still has to match a real pending invite — the worst they can
    // do is mislead the invitee about which workspace; the actual
    // join (post-sign-in) hits the real workspace doc.
    const base = window.location.origin + window.location.pathname.split('#')[0];
    const wsName = this.workspaceMeta?.name ?? '';
    const nameParam = wsName ? `&n=${encodeURIComponent(wsName)}` : '';
    return `${base}?join=${encodeURIComponent(this.workspaceId)}&token=${encodeURIComponent(token)}${nameParam}`;
  }

  /** Revoke an outstanding invite by token. The link becomes invalid
   *  immediately — anyone who hadn't clicked it yet gets "invite not
   *  found" on next attempt. */
  async revokeInvite(token: string): Promise<void> {
    if (!this.workspaceId || !this.workspaceMeta) return;
    const next = this.workspaceMeta.pendingInvites.filter((i) => i.token !== token);
    this.workspaceMeta = { ...this.workspaceMeta, pendingInvites: next };
    const wsRef = doc(db, WORKSPACES_COLLECTION, this.workspaceId);
    await setDoc(wsRef, {
      pendingInvites: next,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    this.notifyWorkspace();
  }

  /** Remove a workspace member (sign-in user). Distinct from
   *  removeMember() further down, which operates on the agency-side
   *  Member roster (assignees, AMs, operators — records that may not
   *  have a sign-in account). Owner can't be removed; the caller
   *  should hide the remove button for the owner row. */
  async removeWorkspaceMember(uid: string): Promise<void> {
    if (!this.workspaceId || !this.workspaceMeta) return;
    if (uid === this.workspaceMeta.ownerUid) {
      throw new Error("Can't remove the workspace owner");
    }
    const nextMembers = this.workspaceMeta.members.filter((m) => m.uid !== uid);
    const nextMemberUids = nextMembers.map((m) => m.uid);
    this.workspaceMeta = {
      ...this.workspaceMeta,
      members: nextMembers,
    };
    const wsRef = doc(db, WORKSPACES_COLLECTION, this.workspaceId);
    await setDoc(wsRef, {
      members: nextMembers,
      memberUids: nextMemberUids,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    // Also clear the user's lookup so they don't keep loading this
    // workspace on next sign-in. Best-effort — failure here means the
    // removed user might briefly land back on the workspace until the
    // Firestore rule blocks them.
    try {
      await setDoc(doc(db, USERS_COLLECTION, uid), { workspaceId: null }, { merge: true });
    } catch { /* swallow — non-fatal */ }
    this.notifyWorkspace();
  }

  /** Update a member's access level. The owner's level stays admin. */
  async changeMemberRole(uid: string, role: AccessLevel): Promise<void> {
    if (!this.workspaceId || !this.workspaceMeta) return;
    if (uid === this.workspaceMeta.ownerUid && role !== 'admin') {
      throw new Error("Workspace owner must remain admin");
    }
    const nextMembers = this.workspaceMeta.members.map((m) =>
      m.uid === uid ? { ...m, role } : m,
    );
    this.workspaceMeta = { ...this.workspaceMeta, members: nextMembers };
    const wsRef = doc(db, WORKSPACES_COLLECTION, this.workspaceId);
    await setDoc(wsRef, {
      members: nextMembers,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    this.notifyWorkspace();
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

  archiveClient(id: string) {
    // Soft-archive: flip a flag + stamp the time. The client and all
    // its data (services, tasks, contacts, etc.) stay in the store
    // exactly as they were so unarchive is a clean reverse. Archived
    // clients drop out of the main list views via filterClients in
    // ClientsPage; the dedicated "Archived" saved-view chip surfaces
    // them when the user wants to restore.
    const c = this.data.clients.find(c => c.id === id);
    if (!c) return;
    c.archived = true;
    c.archivedAt = new Date().toISOString();
    this.save();
  }

  unarchiveClient(id: string) {
    // Reverse of archiveClient. Use `delete` to actually remove the
    // properties from the JS object — the type marks them optional, so
    // active clients carry no `archived` / `archivedAt` keys at all.
    // Firestore's ignoreUndefinedProperties strips them on the next
    // write either way; the delete is a belt-and-braces clean shape.
    const c = this.data.clients.find(c => c.id === id);
    if (!c) return;
    delete (c as { archived?: boolean }).archived;
    delete (c as { archivedAt?: string }).archivedAt;
    this.save();
  }

  /**
   * Wipe every client/service/task plus the records that cascade off
   * them. Workspace identity (name/logo/owner), templates, theme,
   * today anchor, and the ops-seed flag all stay — this is a "reset
   * the work" action, not a "delete the account" action.
   *
   * Members: kept-ish. The demo-data loader pumps DEMO_AMS + OPS_TEAM
   * into `data.members` with synthetic ids ('am-1', 'op-3', etc.).
   * Those need to go on a clear; otherwise the Analytics page's team
   * workload bar still shows fake teammates after the workspace looks
   * empty everywhere else. The owner + any real invited teammates
   * have Firebase UIDs that match an entry in `workspaceMeta.memberUids`
   * — we keep those, drop the rest.
   *
   * Used today by Account Settings → Workspace → Danger zone. Owner-
   * only at the UI; the store doesn't gate (gating belongs at the
   * call site, not in the data layer).
   *
   * Single save() at the end syncs to Firestore in one write rather
   * than fourteen.
   */
  clearWorkspace() {
    this.data.clients = [];
    this.data.services = [];
    this.data.tasks = [];
    this.data.onboardingItems = [];
    this.data.integrations = [];
    this.data.contacts = [];
    this.data.quickLinks = [];
    this.data.notes = [];
    this.data.touchpoints = [];
    this.data.actionItems = [];
    this.data.taskComments = [];
    this.data.taskActivity = [];
    this.data.manualAgendaItems = [];
    this.data.memberDayOverrides = [];
    this.data.opsTasks = [];
    this.data.scheduleTaskMap = {};
    this.data.favoriteServiceIds = [];
    // Workspace-level Ops brief gets wiped too — it's project-y data,
    // not identity, and a "fresh start" should mean no leftover doc.
    delete this.data.opsBrief;
    delete this.data.opsBriefUpdatedAt;
    // Filter demo members out, keep real workspace members. Synthetic
    // ids ('am-1' etc.) seeded by loadDemoData aren't in the
    // workspace's members list; real Firebase UIDs are.
    const realUids = new Set(
      (this.workspaceMeta?.members ?? []).map(m => m.uid),
    );
    this.data.members = this.data.members.filter(m => realUids.has(m.id));
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
    // Seed cards into the To Do column so the board doesn't open empty.
    //
    // Phase-driven seeding (added 2026-04-27): if the resolved template
    // declares `phases`, each phase becomes one card titled with the
    // phase name, with the phase's subtasks pre-loaded as a checklist
    // on that card. This is the delivery for what the Templates page
    // promises ("Phase cards land in To Do; onboarding runs in
    // parallel on its own tab"). No hard gate on onboarding — the AM
    // can start phase work immediately and fill in setup at their
    // own pace. See built-in templates' `phases[i].subtasks` for the
    // canonical content.
    //
    // TASK_POOLS fallback: user-created templates ship with `phases:
    // []`, so we fall back to the original "first 3 strings from
    // TASK_POOLS" behavior to avoid an empty board on day 1. Real
    // user-created templates will eventually have phases authored
    // through the editor; until then this keeps the empty case from
    // shipping a blank board.
    const liveTemplate = findTemplate(this.data.templateOverrides, service.templateKey);
    const nowISO = new Date().toISOString();
    let seededTasks: Task[];

    if (liveTemplate && liveTemplate.phases.length > 0) {
      // Stagger due dates by week so the schedule grid spreads them
      // across the calendar instead of piling every phase on day 7.
      // Phase 0 → 7d, phase 1 → 14d, etc. AM can adjust later.
      seededTasks = liveTemplate.phases.map((phase, idx) => {
        const dueOffsetDays = (idx + 1) * 7;
        const dueISO = new Date(Date.now() + dueOffsetDays * 86_400_000)
          .toISOString().slice(0, 10);
        const checklist: TaskChecklistItem[] = phase.subtasks.map((text, i) => ({
          id: `${service.id}-phase-${idx}-c${i}`,
          text,
          done: false,
          assigneeId: null,
        }));
        return {
          id: `${service.id}-phase-${idx}`,
          serviceId: service.id,
          clientId: service.clientId,
          title: phase.name,
          columnId: 'todo',
          priority: 'medium',
          assigneeId: null,
          labels: [],
          dueDate: dueISO,
          createdAt: nowISO,
          checklist,
        };
      });
    } else {
      // Fallback for templates with no phases (typically user-created
      // ones that haven't authored phases yet). Pulls the first 3
      // titles from TASK_POOLS deterministically — same ids the
      // pre-2026-04-27 implementation produced, so reloads of older
      // services don't shift card identity.
      const pool = TASK_POOLS[service.templateKey] ?? [];
      const starterTitles = pool.slice(0, 3);
      const dueISO = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      seededTasks = starterTitles.map((title, idx) => ({
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
    }

    // Seed the project brief from the template's brief array. Each
    // entry becomes a single <h2> heading; the AM fills in the body
    // underneath. Beats opening a blank canvas — the headings are the
    // template's curated "things this brief should cover" prompts.
    // No briefUpdatedAt set yet — the brief becomes "officially edited"
    // only on the first explicit Save through the Brief modal.
    const seededBrief = liveTemplate?.brief?.length
      ? liveTemplate.brief.map(heading => `<h2>${heading}</h2><p></p>`).join('')
      : undefined;

    // Replace the service's taskIds with the ids of the seeded cards so
    // the ServiceCard task counters + onboarding group lookups see them.
    const serviceWithTasks: Service = {
      ...service,
      taskIds: seededTasks.map(t => t.id),
      ...(seededBrief ? { brief: seededBrief } : {}),
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

  /** Atomic write for the project brief — sets both `brief` (HTML) and
   *  `briefUpdatedAt` (now) in one save. The "Last updated · 3d ago"
   *  indicator on the board's brief strip reads `briefUpdatedAt` so
   *  this needs to advance whenever the brief content changes. */
  updateServiceBrief(id: string, brief: string) {
    const s = this.data.services.find(s => s.id === id);
    if (!s) return;
    s.brief = brief;
    s.briefUpdatedAt = new Date().toISOString();
    this.save();
  }

  /** Same shape as updateServiceBrief but for the Ops board's
   *  workspace-level brief. The Ops board has no Service object to
   *  hang the brief off of, so it lives directly on FlizowData. */
  updateOpsBrief(brief: string) {
    this.data.opsBrief = brief;
    this.data.opsBriefUpdatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Set or replace the per-day cap override for a (member, date) pair.
   * Beats the member's standing capSoft/capMax for that single date.
   * Used today for PTO, workshop-heavy days, and other partial-
   * availability cases — the user clicks the ⋯ next to a day header
   * on My Schedule and dials in a smaller cap.
   *
   * Idempotent in the array sense: if an override already exists for
   * the (memberId, date) pair, we replace it rather than append; the
   * resolver (effectiveCapFor) only reads the first match anyway, but
   * keeping the array clean makes export/import diffs readable.
   */
  setMemberDayCap(memberId: string, date: string, capSoft: number, capMax: number) {
    const idx = this.data.memberDayOverrides.findIndex(
      o => o.memberId === memberId && o.date === date,
    );
    const next = { memberId, date, capSoft, capMax };
    if (idx === -1) {
      this.data.memberDayOverrides = [...this.data.memberDayOverrides, next];
    } else {
      const copy = this.data.memberDayOverrides.slice();
      copy[idx] = next;
      this.data.memberDayOverrides = copy;
    }
    this.save();
  }

  /** Drop the per-day override for a (member, date) pair, falling back
   *  to the member's standing caps. No-op when no override exists. */
  clearMemberDayCap(memberId: string, date: string) {
    const next = this.data.memberDayOverrides.filter(
      o => !(o.memberId === memberId && o.date === date),
    );
    if (next.length === this.data.memberDayOverrides.length) return;
    this.data.memberDayOverrides = next;
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

  // ── Column WIP limits ───────────────────────────────────────────────
  //
  // Pass `null` (or omit) to clear the cap on that column — we want a
  // single API shape, so "no limit" is expressed by clearing rather
  // than setting 0 (which would read as "zero allowed" and confuse the
  // display format). Values are clamped to [1, 99] — lower bound so we
  // don't store an unusable limit, upper bound so the chip always fits
  // two digits.
  setColumnLimit(serviceId: string, columnId: ColumnId, limit: number | null) {
    const svc = this.data.services.find((s) => s.id === serviceId);
    if (!svc) return;
    const next: Partial<Record<ColumnId, number>> = { ...(svc.columnLimits ?? {}) };
    if (limit === null || !Number.isFinite(limit)) {
      delete next[columnId];
    } else {
      const clamped = Math.max(1, Math.min(99, Math.round(limit)));
      next[columnId] = clamped;
    }
    svc.columnLimits = Object.keys(next).length ? next : undefined;
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

  // ── Template overrides (admin editor) ───────────────────────────────
  //
  // The five built-in templates live in src/data/builtInTemplates.ts as
  // pristine defaults. Edits and user-created templates ride in
  // data.templateOverrides. The resolver (src/data/templates.ts) overlays
  // overrides onto built-ins at read time, so a fresh install with an
  // empty array still surfaces the five built-ins as-is.
  //
  // Snapshot semantics: services seed their onboarding/phases at
  // creation time and never re-read from a template after that. So an
  // edit here never mutates an in-flight service — it only changes
  // what NEW services started with this template will be seeded with.
  // Audit: templates M2.

  /** Upsert an override record. If `id` exists in templateOverrides
   *  already, the entry is replaced; otherwise it's appended. The
   *  caller passes the full record (not a patch) so the call site
   *  is the single source of truth for the new shape. */
  upsertTemplate(record: TemplateRecord) {
    const next = { ...record, editedAt: new Date().toISOString() };
    const idx = this.data.templateOverrides.findIndex((t) => t.id === record.id);
    if (idx === -1) {
      this.data.templateOverrides = [...this.data.templateOverrides, next];
    } else {
      const copy = this.data.templateOverrides.slice();
      copy[idx] = next;
      this.data.templateOverrides = copy;
    }
    this.save();
  }

  /** Drop an override for a built-in template, reverting it to the
   *  pristine BUILT_IN_TEMPLATES record. No-op for user-created
   *  templates (they have no default to roll back to — purgeTemplate
   *  is the action for those). */
  resetTemplate(id: string) {
    this.data.templateOverrides = this.data.templateOverrides.filter(
      (t) => t.id !== id,
    );
    this.save();
  }

  /** Soft-delete: hide from the picker, keep the record so existing
   *  services can still resolve their template name. Works on both
   *  built-in templates (which become an override row) and
   *  user-created records (which already live in overrides). The
   *  caller passes the resolved record (built-in or override) so we
   *  don't lose its current shape on archive. */
  archiveTemplate(record: TemplateRecord) {
    this.upsertTemplate({ ...record, archived: true });
  }

  /** Bring an archived template back into the picker. Inverse of
   *  archiveTemplate. */
  restoreTemplate(record: TemplateRecord) {
    this.upsertTemplate({ ...record, archived: false });
  }

  /** Hard-delete a user-created template. Built-in templates can't be
   *  purged — call archiveTemplate instead. The caller is expected to
   *  check `userCreated` first. */
  purgeTemplate(id: string) {
    this.data.templateOverrides = this.data.templateOverrides.filter(
      (t) => t.id !== id,
    );
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
    // Either kind of task may own an activity row now. We check both so
    // a post-cascade-delete call still no-ops, but an ops card editing
    // its title doesn't get swallowed because it's not in `data.tasks`.
    const task =
      this.data.tasks.find(t => t.id === taskId) ||
      this.data.opsTasks.find(t => t.id === taskId);
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
    const idx = this.data.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const original = this.data.tasks[idx];
    // Snapshot the fields we care about before the patch lands so we can
    // emit granular activity entries per change. We only log changes
    // that a user would recognise as meaningful — drop everything else.
    const before = {
      columnId: original.columnId,
      priority: original.priority,
      title: original.title,
      description: original.description,
      dueDate: original.dueDate,
      startDate: original.startDate,
      assigneeIds: Array.isArray(original.assigneeIds)
        ? [...original.assigneeIds]
        : (original.assigneeId ? [original.assigneeId] : []),
      labels: [...(original.labels ?? [])],
    };
    // Replace-in-array rather than mutate-in-place. `notify()` only
    // spreads the top-level data object — if we mutated the task via
    // Object.assign, `data.tasks` would keep the same array ref and
    // any `useMemo([tasks])` consumer would skip recomputing. The UI
    // then renders the pre-move bucketing even though the underlying
    // card has already changed column. New array ref → memo invalidates
    // → board re-renders.
    const updated: Task = { ...original, ...patch };
    this.data.tasks = [
      ...this.data.tasks.slice(0, idx),
      updated,
      ...this.data.tasks.slice(idx + 1),
    ];
    const after = {
      columnId: updated.columnId,
      priority: updated.priority,
      title: updated.title,
      description: updated.description,
      dueDate: updated.dueDate,
      startDate: updated.startDate,
      assigneeIds: Array.isArray(updated.assigneeIds)
        ? [...updated.assigneeIds]
        : (updated.assigneeId ? [updated.assigneeId] : []),
      labels: [...(updated.labels ?? [])],
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

  /**
   * Clone a task into a brand-new card on the same service. The copy
   * lands in To Do with a "(copy)" suffix, so it's easy to tell apart
   * from the original and doesn't pollute Done/Review. Checklist items
   * come along but get fresh ids; comments + activity do not — a
   * duplicate is a new card that happens to start with the same text,
   * not a branch of the old thread.
   *
   * Returns the new task id so callers can open it in the modal.
   */
  duplicateTask(id: string): string | null {
    const src = this.data.tasks.find(t => t.id === id);
    if (!src) return null;
    const now = new Date().toISOString();
    const newId = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const copy: Task = {
      id: newId,
      serviceId: src.serviceId,
      clientId: src.clientId,
      title: `${src.title} (copy)`,
      // Always land in To Do — duplicating a Done card back into Done
      // would create a phantom "completed" card that was never done.
      columnId: 'todo',
      priority: src.priority,
      assigneeId: src.assigneeId,
      labels: [...(src.labels ?? [])],
      // Clear the due date so the duplicate doesn't show up as overdue
      // the moment it's created. The user can pick a new one.
      dueDate: '',
      createdAt: now,
      severity: src.severity,
      // Deliberately skip blockerReason — duplicates aren't blocked
      // by default, no matter the source's state.
      blockerReason: undefined,
      // Schedule meta is source-specific — don't carry it over.
      _schedule: undefined,
      startDate: undefined,
      description: src.description,
      checklist: src.checklist
        ? src.checklist.map(item => ({
            id: `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            text: item.text,
            done: false,  // reset progress — a fresh card starts fresh
            assigneeId: item.assigneeId,
          }))
        : undefined,
      assigneeIds: src.assigneeIds ? [...src.assigneeIds] : undefined,
    };
    this.data.tasks.push(copy);
    const service = this.data.services.find(s => s.id === copy.serviceId);
    if (service && !service.taskIds.includes(newId)) {
      service.taskIds.push(newId);
    }
    this.logActivity(newId, 'created', `duplicated from "${src.title}"`);
    this.save();
    return newId;
  }

  /**
   * Soft-hide a task from the active board. Archived tasks keep every
   * other field intact — column, checklist, comments, activity, due
   * date — so the restore is a single-field flip. They drop out of
   * column rendering, WIP counts, and active analytics, but the row
   * stays in the store so we don't lose history.
   *
   * Idempotent: calling archiveTask on an already-archived card is a
   * no-op (no duplicate activity log entry, no spurious save).
   */
  archiveTask(id: string) {
    const task = this.data.tasks.find(t => t.id === id);
    if (!task || task.archived) return;
    task.archived = true;
    task.archivedAt = new Date().toISOString();
    this.logActivity(id, 'archived', 'archived this card');
    this.save();
  }

  /**
   * Bring an archived task back to the active board. Pairs with
   * archiveTask — same idempotency, same activity-log shape. The task
   * returns to whatever column it was parked in when it was archived,
   * so users don't need to re-sort anything.
   */
  unarchiveTask(id: string) {
    const task = this.data.tasks.find(t => t.id === id);
    if (!task || !task.archived) return;
    task.archived = false;
    task.archivedAt = undefined;
    this.logActivity(id, 'archived', 'restored this card from archive');
    this.save();
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

  // ── Ops tasks ────────────────────────────────────────────────────────
  //
  // Same shape as the Task mutators above, against `data.opsTasks`. Now
  // emits activity entries through the same `logActivity` helper —
  // FlizowCardModal renders the Ops card Activity tab off the shared
  // `data.taskActivity` pile, filtered by task id. Comments are still
  // client-only (no ops comment stream yet).

  addOpsTask(task: OpsTask) {
    this.data.opsTasks = [...this.data.opsTasks, task];
    this.logActivity(task.id, 'created', 'created this card');
    this.save();
  }

  updateOpsTask(id: string, patch: Partial<OpsTask>) {
    const idx = this.data.opsTasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const original = this.data.opsTasks[idx];
    // Snapshot the same field set `updateTask` diffs for client cards,
    // minus the ones ops tasks don't carry. Feeds the `logActivity`
    // calls after the patch lands so the Activity tab tells the same
    // story whether the card lives on a client service or the Ops board.
    const before = {
      columnId: original.columnId,
      priority: original.priority,
      title: original.title,
      description: original.description,
      dueDate: original.dueDate,
      startDate: original.startDate,
      assigneeIds: Array.isArray(original.assigneeIds)
        ? [...original.assigneeIds]
        : (original.assigneeId ? [original.assigneeId] : []),
      labels: [...(original.labels ?? [])],
    };
    // Replace-in-array (not mutate-in-place) so `data.opsTasks` gets a
    // fresh reference. Without this, OpsPage's `useMemo([tasks])`
    // caches the pre-move bucketing — a card dragged to a new column
    // only surfaces after a hard refresh. Same reasoning as updateTask().
    const updated: OpsTask = { ...original, ...patch };
    this.data.opsTasks = [
      ...this.data.opsTasks.slice(0, idx),
      updated,
      ...this.data.opsTasks.slice(idx + 1),
    ];
    const after = {
      columnId: updated.columnId,
      priority: updated.priority,
      title: updated.title,
      description: updated.description,
      dueDate: updated.dueDate,
      startDate: updated.startDate,
      assigneeIds: Array.isArray(updated.assigneeIds)
        ? [...updated.assigneeIds]
        : (updated.assigneeId ? [updated.assigneeId] : []),
      labels: [...(updated.labels ?? [])],
    };

    if (before.columnId !== after.columnId) {
      this.logActivity(id, 'moved', `moved this card to ${columnLabel(after.columnId)}`);
    }
    if (before.priority !== after.priority && after.priority) {
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
    if ((before.dueDate ?? '') !== (after.dueDate ?? '')) {
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
    const beforeA = new Set(before.assigneeIds);
    const afterA = new Set(after.assigneeIds);
    for (const mid of afterA) {
      if (!beforeA.has(mid)) {
        this.logActivity(id, 'assignee', `added ${this.memberDisplay(mid)}`);
      }
    }
    for (const mid of beforeA) {
      if (!afterA.has(mid)) {
        this.logActivity(id, 'assignee', `removed ${this.memberDisplay(mid)}`);
      }
    }
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

  moveOpsTask(id: string, columnId: ColumnId) {
    this.updateOpsTask(id, { columnId });
  }

  setOpsTaskPriority(id: string, priority: Priority) {
    this.updateOpsTask(id, { priority });
  }

  /**
   * Clone an ops task. Same shape as duplicateTask(): copy drops into
   * To Do with a "(copy)" suffix, clears progress counters, resets
   * timestamps. No activity log — ops cards don't log activity yet.
   *
   * Returns the new id so callers can open it in the modal.
   */
  duplicateOpsTask(id: string): string | null {
    const src = this.data.opsTasks.find(t => t.id === id);
    if (!src) return null;
    const now = new Date().toISOString();
    const newId = `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const copy: OpsTask = {
      id: newId,
      title: `${src.title} (copy)`,
      // Always land in To Do. A duplicate of a Done card has no business
      // claiming to be already-done — same rule as client tasks.
      columnId: 'todo',
      priority: src.priority,
      assigneeId: src.assigneeId,
      assigneeIds: src.assigneeIds ? [...src.assigneeIds] : undefined,
      labels: [...src.labels],
      // Fresh dates — the copy is a new card even if the text is old.
      dueDate: undefined,
      startDate: undefined,
      createdAt: now,
      // Ops-specific overrides reset: a freshly-created card can't claim
      // it's been blocked for 3 days.
      enteredDaysAgo: undefined,
      overrideMod: undefined,
      overrideLabel: undefined,
      // Counters reset. Checklist items carry over with new ids but
      // every box gets un-checked — progress doesn't duplicate.
      comments: undefined,
      attachments: undefined,
      description: src.description,
      checklist: src.checklist
        ? src.checklist.map(item => ({
            id: `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            text: item.text,
            done: false,
            assigneeId: item.assigneeId,
          }))
        : undefined,
      archived: false,
    };
    this.data.opsTasks = [...this.data.opsTasks, copy];
    this.logActivity(newId, 'created', `duplicated from "${src.title}"`);
    this.save();
    return newId;
  }

  deleteOpsTask(id: string) {
    const before = this.data.opsTasks.length;
    this.data.opsTasks = this.data.opsTasks.filter(t => t.id !== id);
    if (this.data.opsTasks.length === before) return;
    // Matches deleteTask's cascade — comments and activity have nowhere
    // to live without the card.
    this.data.taskComments = this.data.taskComments.filter(c => c.taskId !== id);
    this.data.taskActivity = this.data.taskActivity.filter(a => a.taskId !== id);
    this.save();
  }

  archiveOpsTask(id: string) {
    const idx = this.data.opsTasks.findIndex(t => t.id === id);
    if (idx === -1 || this.data.opsTasks[idx].archived) return;
    const updated: OpsTask = {
      ...this.data.opsTasks[idx],
      archived: true,
      archivedAt: new Date().toISOString(),
    };
    this.data.opsTasks = [
      ...this.data.opsTasks.slice(0, idx),
      updated,
      ...this.data.opsTasks.slice(idx + 1),
    ];
    this.logActivity(id, 'archived', 'archived this card');
    this.save();
  }

  unarchiveOpsTask(id: string) {
    const idx = this.data.opsTasks.findIndex(t => t.id === id);
    if (idx === -1 || !this.data.opsTasks[idx].archived) return;
    const updated: OpsTask = {
      ...this.data.opsTasks[idx],
      archived: false,
      archivedAt: undefined,
    };
    this.data.opsTasks = [
      ...this.data.opsTasks.slice(0, idx),
      updated,
      ...this.data.opsTasks.slice(idx + 1),
    ];
    this.logActivity(id, 'archived', 'restored this card from archive');
    this.save();
  }

  // ── Ops task checklist ──────────────────────────────────────────────
  //
  // Mirrors the Task checklist helpers but against opsTasks. Same lazy
  // init pattern — first write creates the array. We factor out the
  // checklist CRUD so the modal can use a single code path regardless
  // of which kind of card is open.

  addOpsChecklistItem(taskId: string, text: string): string | null {
    const t = this.data.opsTasks.find(t => t.id === taskId);
    if (!t) return null;
    if (!t.checklist) t.checklist = [];
    const id = `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    t.checklist.push({ id, text: text.trim(), done: false, assigneeId: null });
    this.save();
    return id;
  }

  toggleOpsChecklistItem(taskId: string, itemId: string) {
    const t = this.data.opsTasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    const item = t.checklist.find(i => i.id === itemId);
    if (!item) return;
    item.done = !item.done;
    this.save();
  }

  updateOpsChecklistItemText(taskId: string, itemId: string, text: string) {
    const t = this.data.opsTasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    const item = t.checklist.find(i => i.id === itemId);
    if (!item) return;
    const trimmed = text.trim();
    if (!trimmed || trimmed === item.text) return;
    item.text = trimmed;
    this.save();
  }

  deleteOpsChecklistItem(taskId: string, itemId: string) {
    const t = this.data.opsTasks.find(t => t.id === taskId);
    if (!t || !t.checklist) return;
    t.checklist = t.checklist.filter(i => i.id !== itemId);
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
    // Comments live in a shared pool keyed by taskId, so either kind of
    // task can own one. We only need the id to exist somewhere.
    const task =
      this.data.tasks.find(t => t.id === taskId) ||
      this.data.opsTasks.find(t => t.id === taskId);
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

  /** Theme — light/dark. Migrated from the legacy BoardStore as part
   *  of D3 (BoardStore retirement). App.tsx subscribes via useFlizow
   *  and syncs to <html> on every change. */
  setTheme(theme: 'light' | 'dark') {
    if (this.data.theme === theme) return;
    this.data.theme = theme;
    this.save();
  }

  /** Dev helper: seed the workspace with the 50 demo clients from the
   *  mockup. Dynamic import so the demo bundle only loads when the user
   *  actually clicks "Load demo data" — keeps the main chunk lean. */
  async loadDemoData() {
    const { generateDemoData } = await import('../data/demoData');
    this.replaceAll(generateDemoData());
  }

  /** Revoke every active session for the current user across all
   *  devices. Pure client-side implementation — Firebase's actual
   *  `revokeRefreshTokens` is admin-only and would need a Cloud
   *  Function. Instead:
   *    1. Write `revokedAt: <now>` to the user's lookup doc
   *       (`users/{uid}`). Visible to every device subscribed to
   *       that doc.
   *    2. Other devices' AuthContext compares `revokedAt` against
   *       their own `lastSignInTime`; older sessions sign out.
   *    3. Caller signs out the current device explicitly via
   *       AuthContext (separate code path — this method just
   *       writes the timestamp).
   *
   *  Caveat acknowledged in the UI tooltip: other devices sign out
   *  on next Firestore snapshot, not instantly. In practice that's
   *  within seconds for an active browser tab. */
  async writeRevokeAllTimestamp(): Promise<void> {
    if (!this.userId) return;
    const userDocRef = doc(db, USERS_COLLECTION, this.userId);
    await setDoc(
      userDocRef,
      { revokedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  /** Build a serializable snapshot of the entire workspace for export.
   *  Insurance policy: a user about to put real client data in should
   *  be able to download a full backup. The shape is versioned so a
   *  future Import feature can detect what schema it's reading.
   *
   *  What's included:
   *    - All workspace data (clients, services, tasks, comments, etc.)
   *    - Workspace identity (name, initials, color, ownerUid, createdAt)
   *    - Member list with display fields + roles
   *
   *  What's excluded:
   *    - Pending invite tokens. These are time-sensitive secrets;
   *      if the export file leaks, tokens could be replayed by anyone
   *      who finds it. Backups carry data, not credentials.
   *    - The `users/{uid}` lookup docs. Those are routing metadata,
   *      not workspace content.
   *
   *  Returns null in dev-bypass / pre-auth where there's no active
   *  workspace. Caller should handle that gracefully. */
  exportWorkspace(): {
    exportedAt: string;
    exportVersion: 1;
    workspace: {
      ownerUid: string;
      name: string;
      initials: string;
      color: string;
      createdAt: string;
      members: WorkspaceMembership[];
    };
    data: FlizowData;
  } | null {
    if (!this.workspaceMeta) return null;
    return {
      exportedAt: new Date().toISOString(),
      exportVersion: 1,
      workspace: {
        ownerUid: this.workspaceMeta.ownerUid,
        name: this.workspaceMeta.name,
        initials: this.workspaceMeta.initials,
        color: this.workspaceMeta.color,
        createdAt: this.workspaceMeta.createdAt,
        members: this.workspaceMeta.members,
      },
      data: this.data,
    };
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
