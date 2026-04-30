import type { AccessRole } from '../types/flizow';

/**
 * Centralised permission checks for the four-tier access model
 * (owner / admin / member / viewer).
 *
 * Why a single `can(role, action)` instead of a kitchen-sink hook:
 *  - Pure function ⇒ trivial to unit test (no renderer, no store).
 *  - One source of truth. Components don't reinvent permission logic
 *    inline ("isAdmin = role === 'admin'") and drift apart over time.
 *  - Future-proofing — when we add a Phase-2 designated-approvers
 *    list or per-resource overrides, the surface stays `can(...)`.
 *
 * Convention: actions are namespaced strings ("verb:resource"). Adding
 * a new action means: add it to the union, add its row to PERMISSIONS,
 * write a test. Nothing else.
 */

/** All actions the app currently knows how to gate. Grows as later
 *  phases need more granularity; we only add what we use. */
export type Action =
  // Page visibility (top-nav routing)
  | 'view:home'
  | 'view:clients'
  | 'view:analytics'
  | 'view:ops'
  | 'view:wip'
  | 'view:templates'
  // Workspace settings (Account modal → Workspace group)
  | 'manage:workspace'
  | 'manage:members'
  | 'manage:billing'
  | 'transfer:ownership'
  // Member-record edits (the Profile panel)
  | 'edit:any-profile'
  | 'edit:member-caps'
  | 'edit:member-role'
  // Time off
  | 'submit:time-off'
  | 'approve:time-off';

/**
 * Permission matrix. Each row maps an action to the set of roles
 * that can perform it. A missing role means denied.
 *
 * Notes:
 *  - 'owner' is implied by 'admin' for nearly everything; we list both
 *    explicitly for clarity rather than chaining role hierarchy.
 *    Promotion math should never be a guessing game when reading the
 *    matrix at a glance.
 *  - `submit:time-off` is granted to viewer too — read-only on the app
 *    doesn't mean "can't take a holiday." If a workspace really wants
 *    to lock viewers out of time-off requests later, we add a v2 toggle.
 */
const PERMISSIONS: Record<Action, ReadonlyArray<AccessRole>> = {
  // Page visibility — Member's three default surfaces from the role spec
  'view:home':       ['owner', 'admin', 'member', 'viewer'],
  'view:clients':    ['owner', 'admin', 'member', 'viewer'],
  'view:analytics':  ['owner', 'admin', 'member'],
  'view:ops':        ['owner', 'admin'],
  'view:wip':        ['owner', 'admin', 'member'],
  'view:templates':  ['owner', 'admin'],

  // Workspace settings
  'manage:workspace':   ['owner', 'admin'],
  'manage:members':     ['owner', 'admin'],
  'manage:billing':     ['owner'],
  'transfer:ownership': ['owner'],

  // Member-record edits
  'edit:any-profile':  ['owner', 'admin'],
  'edit:member-caps':  ['owner', 'admin'],
  'edit:member-role':  ['owner', 'admin'],

  // Time off
  'submit:time-off':  ['owner', 'admin', 'member', 'viewer'],
  'approve:time-off': ['owner', 'admin'],
};

/**
 * Returns true when `role` is allowed to perform `action`.
 * Defensive: undefined / unknown roles always return false (deny by
 * default). This matters because legacy demo members have
 * accessLevel=undefined — the safer default is "no extra rights"
 * rather than "treat as admin."
 */
export function can(role: AccessRole | undefined, action: Action): boolean {
  if (!role) return false;
  return PERMISSIONS[action].includes(role);
}

// ── Migration ──────────────────────────────────────────────────────────

/**
 * Map a legacy AccessLevel value ('admin' | 'editor' | 'viewer') to
 * the new four-tier AccessRole. The `isOwnerUid` flag is set true
 * when the membership belongs to the workspace owner — that one
 * always upgrades to 'owner', regardless of what their old level was.
 *
 * Mapping table:
 *   workspace owner uid              → 'owner'
 *   'editor' (legacy)                → 'member'
 *   'admin' / 'member' / 'viewer'    → preserved
 *   anything else / undefined        → undefined (caller decides default)
 */
export function migrateAccessRole(
  current: string | undefined,
  isOwnerUid: boolean,
): AccessRole | undefined {
  if (isOwnerUid) return 'owner';
  if (current === 'editor') return 'member';
  if (current === 'admin' || current === 'member' || current === 'viewer' || current === 'owner') {
    return current;
  }
  return undefined;
}

// ── Display ────────────────────────────────────────────────────────────

/** Human-readable role labels. Used in the avatar pill and the
 *  Members tab dropdown. Kept here so the canonical strings live
 *  alongside the role definitions. */
export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  owner:  'Owner',
  admin:  'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

/** Subline shown next to each option in role pickers — keeps the
 *  consequence of choosing the role visible at the moment of choice. */
export const ACCESS_ROLE_DESCRIPTION: Record<AccessRole, string> = {
  owner:  'Full access including billing and ownership transfer.',
  admin:  'Manages members, approves time off, edits workspace settings.',
  member: 'Edits assigned work and submits own time off.',
  viewer: 'Read-only across granted surfaces.',
};
