import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowUturnLeftIcon,
  BellAlertIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  LinkIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  RectangleStackIcon,
  TrashIcon,
  UserIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
import type { AccessRole, JobTitle, JobTitleKind, Member, TimeOffRequest, TrashEntry, TrashKind, WorkspaceMembership } from '../types/flizow';
import { initialsOf } from '../utils/avatar';
import { ConfirmDangerDialog } from './ConfirmDangerDialog';
import { useMemberProfile } from '../contexts/MemberProfileContext';
import { currentVacationPeriod } from '../utils/memberProfile';
import {
  ACCESS_ROLE_LABEL,
  ACCESS_ROLE_DESCRIPTION,
  can,
} from '../utils/access';

/**
 * FlizowAccountModal — the Account Settings overlay reachable from the
 * avatar in the top nav. Mirrors the mockup's `.acct-modal` structure
 * so the CSS in flizow.css styles it without component-level work.
 *
 * Tabs:
 *   • Profile         — name, preferred name, email (Google), role, tz
 *   • Preferences     — appearance (light/dark/system), week start, time fmt
 *   • Notifications   — 5 delivery toggles
 *   • Sign-in         — connected Google identity + Sign out
 *
 * Scope for this pass:
 *   ✓ Tab switching (no persistence for inline form fields; they're
 *     demo inputs until we add a user-prefs slice to the store)
 *   ✓ Appearance wired to the legacy BoardStore's theme (the only slot
 *     currently backing the app's light/dark — App.tsx reads it there)
 *   ✓ Sign out via useAuth().logout()
 *   ✓ "Load demo data" + "Reset workspace" danger-zone buttons in the
 *     Profile footer (quality-of-life for testers clearing state)
 *
 * Out of scope (noted in MEMORY):
 *   • Form field persistence to Firestore — needs a UserPreferences slice
 *   • Notification channel persistence — shape already in types, wiring later
 *   • Timezone-driven date formatting — future pass
 */

type Section =
  | 'profile' | 'preferences' | 'notifications' | 'timeoff'        // My account
  | 'workspace' | 'members' | 'jobtitles' | 'trash'                // Workspace
  | 'signin';                                                       // Account-level

/** Visual + structural grouping for the sidebar. The first group
 *  is "My account" — personal stuff that every signed-in user sees.
 *  The second is "Workspace" — admin-only catalogs and lists; only
 *  rendered when `can(role, 'manage:workspace')`. The third bucket
 *  ("Account-level") holds anything that doesn't fit either group
 *  (today: just sign-in / sessions). Section ids are flat — the
 *  group headings are presentational. */
const SIDEBAR_GROUPS = {
  myAccount: ['profile', 'preferences', 'notifications', 'timeoff'] as const,
  workspace: ['workspace', 'members', 'jobtitles', 'trash'] as const,
  account:   ['signin'] as const,
};

const AVATAR_COLORS = [
  { id: 'indigo', hex: '#5e5ce6', label: 'Indigo' },
  { id: 'blue',   hex: '#0a84ff', label: 'Blue'   },
  { id: 'green',  hex: '#30d158', label: 'Green'  },
  { id: 'orange', hex: '#ff9f0a', label: 'Orange' },
  { id: 'red',    hex: '#ff375f', label: 'Red'    },
  { id: 'purple', hex: '#bf5af2', label: 'Purple' },
  { id: 'cyan',   hex: '#64d2ff', label: 'Cyan'   },
];

interface Props {
  onClose: () => void;
}

export default function FlizowAccountModal({ onClose }: Props) {
  const { user, logout } = useAuth();
  const { data, store } = useFlizow();
  // The Light/Dark segment buttons read `data.theme` directly and
  // commit instantly via setAppearance — no draft, no Save round-trip.
  // See setAppearance + the dirty-detection block below for the full
  // policy. (System mode resolves to the OS preference at click time.)

  // Read the signed-in user's access role from the agency-roster
  // mirror so the sidebar can hide the Workspace group from members
  // who can't open any of those screens. Falls back to undefined for
  // the dev-bypass / pre-auth case — `can()` denies undefined.
  const ownAccessRole = user?.uid
    ? data.members.find((m) => m.id === user.uid)?.accessLevel
    : undefined;
  const canManageWorkspace = can(ownAccessRole, 'manage:workspace');

  const [section, setSection] = useState<Section>('profile');
  // If a non-admin somehow lands on a Workspace section (stale local
  // state, deep link from before they were demoted), bounce them to
  // Profile. Cheap, idempotent, and the alternative — silently
  // showing an empty panel — is worse UX. Runs once on mount AND any
  // time the role changes (admin loses rights mid-session).
  useEffect(() => {
    const isWorkspaceSection = (SIDEBAR_GROUPS.workspace as ReadonlyArray<string>).includes(section);
    if (isWorkspaceSection && !canManageWorkspace) {
      setSection('profile');
    }
  }, [canManageWorkspace, section]);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // closeRef holds the latest handleClose. The Esc-handling useEffect
  // below reads through this ref instead of binding to handleClose
  // directly — that keeps the keydown listener attached for the
  // modal's lifetime instead of re-attaching on every render. The
  // ref itself updates each render via the assignment below.
  const closeRef = useRef<() => void>(() => { onClose(); });

  // Esc closes + initial focus on the safe dismissal target +
  // focus trap so Tab cycles within the modal instead of escaping
  // to the background page. Audit: account HIGH (no focus trap).
  useEffect(() => {
    closeBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      // Focus trap. Collect every focusable inside the modal, then
      // wrap Tab/Shift+Tab around the ends. Skip if no modal yet
      // mounted or no focusables (defensive).
      const root = modalRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Identity. Email comes from Firebase (Google-managed). Display
  // name + preferred name + role + timezone + avatar color all
  // live on the agency-side Member record (data.members) and persist
  // through store.updateMember. Falls back to Firebase displayName
  // when the Member record's name field hasn't been overridden yet.
  const ownUid = user?.uid ?? null;
  const myMember = ownUid ? data.members.find((m) => m.id === ownUid) : undefined;
  const displayName = myMember?.name || user?.displayName || 'You';
  const email = user?.email || '—';
  const initials = (displayName || 'U').trim().split(/\s+/)
    .map(p => p[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'U';

  // Local drafts mirror the persisted Member record. Edits commit on
  // blur (text/select) or click (color picker) via store.updateMember.
  // The drafts re-sync whenever the Member record changes from
  // outside (another teammate's edit or Firebase Auth refresh).
  const [nameDraft, setNameDraft] = useState(displayName);
  const [preferredDraft, setPreferredDraft] = useState(myMember?.preferredName ?? displayName.split(' ')[0]);
  const [roleDraft, setRoleDraft] = useState(myMember?.role ?? '');
  const [tzDraft, setTzDraft] = useState(myMember?.timezone ?? 'pst');
  const [avatarHex, setAvatarHex] = useState(myMember?.color ?? '#5e5ce6');

  // Drafts initialise lazily from the source values on first render
  // (above) and stay component-local from there. The previous resync
  // effect would have clobbered typed-but-not-yet-saved drafts under
  // the new transactional Save/Cancel model — under that contract,
  // the user's draft is the source of truth until they Save or Cancel.
  // Concurrent edits to one's own member record are rare in practice,
  // and the modal session is short, so accepting "stale UI vs. cloud
  // mid-edit" is the right tradeoff.

  // Workspace drafts — lifted up from WorkspaceSection so the modal-
  // level Save handler can commit them alongside the Profile fields.
  // Initialised lazily from workspaceMeta on first render; modal-
  // local from then on (the modal session is short — no re-sync logic
  // needed). Workspace tab below is fed these as props.
  const wsMeta = useSyncExternalStore(store.subscribeWorkspace, store.getWorkspaceMeta);
  const [draftWsName, setDraftWsName] = useState(() => wsMeta?.name ?? '');
  const [draftWsInitials, setDraftWsInitials] = useState(() => wsMeta?.initials ?? '');
  const [draftWsColor, setDraftWsColor] = useState(() => wsMeta?.color ?? '#5e5ce6');

  // Time format — local-only today (no persistence path exists). Keeps
  // its draft for symmetry with the rest; Save no-ops when the field
  // hasn't moved off the default.
  const [timeFmt, setTimeFmt] = useState<'12h' | '24h'>('12h');

  // Notification preference drafts. Default-true semantics: undefined
  // on the Member record means "show me everything," matching the
  // pre-prefs bell behaviour. Lazy init from current Member state.
  const [draftNotifDigest, setDraftNotifDigest] = useState(
    () => myMember?.notifPrefs?.digest !== false,
  );
  const [draftNotifUrgent, setDraftNotifUrgent] = useState(
    () => myMember?.notifPrefs?.urgent !== false,
  );

  // Theme is the one setting that doesn't go through Save/Cancel —
  // it's instant-apply by design (2026-04-28). Picking Light / Dark /
  // System in the segmented control immediately writes to the store
  // and updates the DOM, so the user can see the mode flip behind the
  // modal. Cancel doesn't revert it, Save doesn't commit it. The
  // trade-off: choosing the "wrong" mode is reversible in one click;
  // making the user click Save to preview the visual change felt
  // backwards for a setting whose whole purpose is the preview.

  // Danger-zone state — the Reset confirmation needs a typed confirmation.
  const [resetPhase, setResetPhase] = useState<'idle' | 'confirm'>('idle');
  const [resetInput, setResetInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function handleLoadDemo() {
    await store.loadDemoData();
    showToast('Demo workspace loaded');
  }

  function handleReset() {
    if (resetInput.trim().toLowerCase() !== 'reset') return;
    store.reset();
    setResetPhase('idle');
    setResetInput('');
    showToast('Workspace reset');
  }

  async function handleSignOut() {
    await logout();
    // The AuthContext listener flips `user` to null; App.tsx renders LoginPage.
    onClose();
  }

  /** Sign out everywhere — writes a revocation timestamp to the
   *  user's lookup doc, then signs out the current device. Other
   *  devices subscribed via AuthContext detect the timestamp on
   *  their next Firestore snapshot and force their own sign-outs. */
  async function handleSignOutEverywhere() {
    if (!window.confirm(
      "This signs you out on every device, including this one. Continue?"
    )) {
      return;
    }
    try {
      await store.writeRevokeAllTimestamp();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[FlizowAccountModal] revoke timestamp write failed:', err);
      // Even if the cloud write fails, sign out the current device —
      // the user's intent was security; failing to propagate isn't a
      // reason to leave their current session active. The syncError
      // banner will surface the failure if any.
    }
    await logout();
    onClose();
  }

  /** Apply a theme change immediately. No draft, no Save — the click
   *  itself commits. "System" resolves to the current OS preference
   *  at click-time and stores the resolved value (light or dark);
   *  the picker doesn't keep "follow system" as a sticky mode. */
  function setAppearance(mode: 'light' | 'dark' | 'system') {
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      store.setTheme(prefersDark ? 'dark' : 'light');
    } else {
      store.setTheme(mode);
    }
  }

  // ── Dirty detection ───────────────────────────────────────────────
  // Compare every draft against its source-of-truth value. If any
  // diverges, the modal is dirty: Save becomes enabled, and Close /
  // Cancel / Esc / backdrop-click prompts a "discard?" confirm.
  const sourceWsName = wsMeta?.name ?? '';
  const sourceWsInitials = wsMeta?.initials ?? '';
  const sourceWsColor = wsMeta?.color ?? '#5e5ce6';
  const sourceNotifDigest = myMember?.notifPrefs?.digest !== false;
  const sourceNotifUrgent = myMember?.notifPrefs?.urgent !== false;
  const dirtyProfile =
    nameDraft.trim() !== (myMember?.name ?? '').trim() ||
    preferredDraft.trim() !== (myMember?.preferredName ?? '').trim() ||
    roleDraft.trim() !== (myMember?.role ?? '').trim() ||
    tzDraft !== (myMember?.timezone ?? 'pst') ||
    avatarHex !== (myMember?.color ?? '#5e5ce6');
  const dirtyWorkspace =
    draftWsName.trim() !== sourceWsName ||
    draftWsInitials.trim().toUpperCase() !== sourceWsInitials ||
    draftWsColor !== sourceWsColor;
  const dirtyNotif =
    draftNotifDigest !== sourceNotifDigest ||
    draftNotifUrgent !== sourceNotifUrgent;
  // Theme is excluded from isDirty — instant-apply, doesn't ride the
  // Save/Cancel contract. See setAppearance comment above.
  const isDirty = dirtyProfile || dirtyWorkspace || dirtyNotif;

  /** Walk every draft and commit the diffs to the store. Called on
   *  Save click. Members tab actions (invite/revoke/remove) sit
   *  outside this path — they execute directly. Same for Sign Out
   *  and Reset Workspace.
   *
   *  Workspace identity goes through its own dedicated method
   *  (updateWorkspaceIdentity) because it lives on the workspace
   *  doc, not on the agency-side Member record. Theme uses
   *  store.setTheme; everything else funnels through one
   *  store.updateMember call. */
  async function handleSave() {
    // Profile + notifications patch (one Member.update call).
    if (ownUid && (dirtyProfile || dirtyNotif)) {
      const patch: Partial<Member> = {};
      if (dirtyProfile) {
        const trimmedName = nameDraft.trim();
        if (trimmedName && trimmedName !== myMember?.name) {
          patch.name = trimmedName;
          patch.initials = initialsOf(trimmedName);
        }
        if (preferredDraft.trim() !== (myMember?.preferredName ?? '').trim()) {
          patch.preferredName = preferredDraft.trim() || undefined;
        }
        if (roleDraft.trim() !== (myMember?.role ?? '').trim()) {
          patch.role = roleDraft.trim() || undefined;
        }
        if (tzDraft !== myMember?.timezone) {
          patch.timezone = tzDraft;
        }
        if (avatarHex !== myMember?.color) {
          patch.color = avatarHex;
        }
      }
      if (dirtyNotif) {
        patch.notifPrefs = {
          digest: draftNotifDigest,
          urgent: draftNotifUrgent,
        };
      }
      if (Object.keys(patch).length > 0) {
        store.updateMember(ownUid, patch);
      }
    }

    // Workspace identity patch.
    if (dirtyWorkspace && wsMeta) {
      const wsPatch: { name?: string; initials?: string; color?: string } = {};
      const trimmedWsName = draftWsName.trim();
      if (trimmedWsName && trimmedWsName !== wsMeta.name) {
        wsPatch.name = trimmedWsName;
      }
      const trimmedWsInitials = draftWsInitials.trim().toUpperCase().slice(0, 2);
      if (trimmedWsInitials && trimmedWsInitials !== wsMeta.initials) {
        wsPatch.initials = trimmedWsInitials;
      }
      if (draftWsColor !== wsMeta.color) {
        wsPatch.color = draftWsColor;
      }
      if (Object.keys(wsPatch).length > 0) {
        try {
          await store.updateWorkspaceIdentity(wsPatch);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[FlizowAccountModal] workspace save failed:', err);
          // The store's syncError banner will surface this to the user;
          // we still close the modal because the rest of the changes
          // already landed via the Member.update call above.
        }
      }
    }

    // Theme is instant-apply — it was already saved when the user
    // clicked the Light/Dark/System button. Nothing to commit here.

    // Save no longer closes the modal — the user often wants to make
    // a few changes, see them save, then keep tweaking. The drafts
    // now equal the source values (we just committed), so isDirty
    // flips to false and the Save button greys out — that's the
    // primary visual confirmation. The toast below is the verbal one.
    showToast('Changes saved');
  }

  /** Cancel — revert every draft back to its source-of-truth value
   *  WITHOUT closing the modal. Symmetric with Save (which persists
   *  + stays open). User wants to keep the modal open to keep
   *  tweaking; they'll close via X / Esc / backdrop. The Cancel
   *  button itself is disabled when nothing is dirty (no work to
   *  undo), mirroring Save's disabled state. */
  function handleCancel() {
    setNameDraft(myMember?.name ?? user?.displayName ?? '');
    setPreferredDraft(myMember?.preferredName ?? '');
    setRoleDraft(myMember?.role ?? '');
    setTzDraft(myMember?.timezone ?? 'pst');
    setAvatarHex(myMember?.color ?? '#5e5ce6');
    setDraftWsName(wsMeta?.name ?? '');
    setDraftWsInitials(wsMeta?.initials ?? '');
    setDraftWsColor(wsMeta?.color ?? '#5e5ce6');
    // Theme isn't in the draft set — instant-apply, no revert path.
    setDraftNotifDigest(myMember?.notifPrefs?.digest !== false);
    setDraftNotifUrgent(myMember?.notifPrefs?.urgent !== false);
    showToast('Changes reverted');
  }

  /** Close-with-dirty-check used by the X button, Esc handler, and
   *  the backdrop click. Distinct from Cancel — these are the
   *  IMPLICIT close gestures where the user might dismiss accidentally,
   *  so we still prompt when there are unsaved changes. */
  function handleClose() {
    if (isDirty && !window.confirm('Discard your unsaved changes?')) {
      return;
    }
    onClose();
  }

  // Keep the ref in sync each render so the long-lived keydown
  // listener always calls the freshest version (which sees the
  // current isDirty value).
  closeRef.current = handleClose;

  return (
    <div
      className="acct-overlay"
      // `data-open` is the trigger the flizow.css rule uses to unhide
      // the overlay (display + opacity) and scale the inner modal to 1.
      // Previously we forced `display: flex` inline, which won the
      // visibility battle but left opacity at 0 and the modal at 0.97x —
      // the modal rendered, but invisibly.
      data-open="true"
      aria-hidden={false}
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        className="acct-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settingsTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="acct-header">
          <h2 className="acct-title" id="settingsTitle">Account settings</h2>
          <button
            ref={closeBtnRef}
            className="acct-close"
            type="button"
            aria-label="Close settings (Esc)"
            onClick={handleClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div className="acct-body">
          <nav className="acct-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
            {/* MY ACCOUNT — personal, every signed-in user sees these. */}
            <div className="acct-nav-group-label" aria-hidden="true">My account</div>
            <NavItem section="profile" label="Profile" active={section === 'profile'} onClick={() => setSection('profile')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
            </NavItem>
            <NavItem section="preferences" label="Preferences" active={section === 'preferences'} onClick={() => setSection('preferences')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/></svg>
            </NavItem>
            <NavItem section="notifications" label="Notifications" active={section === 'notifications'} onClick={() => setSection('notifications')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </NavItem>
            {/* Time off — personal vacation config. Phase 4 will rework
                this into a request-flow with status. */}
            <NavItem section="timeoff" label="Time off" active={section === 'timeoff'} onClick={() => setSection('timeoff')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 22a8 8 0 0 1 16 0" />
                <path d="M5 12c5-3 11-3 16 0" />
                <path d="M2 12c1.5-4.5 5.5-7 10-7" />
                <circle cx="12" cy="5" r="2" />
              </svg>
            </NavItem>

            {/* WORKSPACE — admin-only. Hidden entirely for Member/Viewer
                so the sidebar doesn't show entries they can't open. */}
            {canManageWorkspace && (
              <>
                <div className="acct-nav-group-label" aria-hidden="true">Workspace</div>
                <NavItem section="workspace" label="Workspace" active={section === 'workspace'} onClick={() => setSection('workspace')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" />
                    <path d="M5 21V7l8-4v18" />
                    <path d="M19 21V11l-6-4" />
                    <line x1="9" y1="9" x2="9" y2="9.01" />
                    <line x1="9" y1="13" x2="9" y2="13.01" />
                    <line x1="9" y1="17" x2="9" y2="17.01" />
                  </svg>
                </NavItem>
                <NavItem section="members" label="Members" active={section === 'members'} onClick={() => setSection('members')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </NavItem>
                {/* Job titles — workspace-curated catalog of role labels
                    for member profiles + (later) coverage rule targeting.
                    Five defaults seed automatically; admin curates the
                    rest. Sits next to Members because both manage
                    "the people working here." */}
                <NavItem section="jobtitles" label="Job titles" active={section === 'jobtitles'} onClick={() => setSection('jobtitles')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="6" width="18" height="14" rx="2" />
                    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                    <line x1="3" y1="13" x2="21" y2="13" />
                  </svg>
                </NavItem>
                <NavItem section="trash" label="Trash" active={section === 'trash'} onClick={() => setSection('trash')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </NavItem>
              </>
            )}

            {/* ACCOUNT — sign-in, sessions. Bottom of the list because
                it's an account-level operation rather than personal
                config or workspace administration. */}
            <div className="acct-nav-group-label" aria-hidden="true">Account</div>
            <NavItem section="signin" label="Sign-in" active={section === 'signin'} onClick={() => setSection('signin')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </NavItem>
          </nav>

          <div className="acct-content">

            {/* ── Profile ────────────────────────────────────────── */}
            {section === 'profile' && (
              <section
                className="acct-section"
                role="tabpanel"
                id="acct-panel-profile"
                aria-labelledby="acct-tab-profile"
                tabIndex={0}
                data-active="true"
              >
                <div className="acct-section-header">
                  <h3 className="acct-section-title">Profile</h3>
                  <p className="acct-section-sub">How you appear across Flizow — visible to your team and clients you share work with.</p>
                </div>

                <div className="acct-avatar-block">
                  <div className="acct-avatar-large" style={{ background: avatarHex }}>{initials}</div>
                  <div>
                    <div className="acct-eyebrow">Avatar color</div>
                    <div className="acct-avatar-colors" role="group" aria-label="Avatar color">
                      {AVATAR_COLORS.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="acct-avatar-color"
                          style={{ background: c.hex }}
                          aria-label={c.label}
                          title={c.label}
                          aria-pressed={avatarHex === c.hex}
                          onClick={() => setAvatarHex(c.hex)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* All Profile inputs are now controlled drafts. They
                    don't auto-commit anymore — the modal-level Save
                    button walks every draft and persists the diffs.
                    Cancel just closes (drafts are local React state,
                    they evaporate on unmount). */}
                <div className="acct-form-grid">
                  <Field label="Full name" htmlFor="acct-name">
                    <input
                      id="acct-name"
                      type="text"
                      className="acct-input"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Preferred name" htmlFor="acct-preferred">
                    <input
                      id="acct-preferred"
                      type="text"
                      className="acct-input"
                      value={preferredDraft}
                      onChange={(e) => setPreferredDraft(e.target.value)}
                      autoComplete="nickname"
                    />
                  </Field>
                  <Field label="Email" full htmlFor="acct-email">
                    <input
                      id="acct-email"
                      type="email"
                      className="acct-input"
                      value={email}
                      readOnly
                      autoComplete="email"
                    />
                    <div className="acct-field-hint">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Managed by Google. Change it from your Google account.
                    </div>
                  </Field>
                  <Field label="Role / title" htmlFor="acct-role">
                    <input
                      id="acct-role"
                      type="text"
                      className="acct-input"
                      value={roleDraft}
                      onChange={(e) => setRoleDraft(e.target.value)}
                      autoComplete="organization-title"
                    />
                  </Field>
                  <Field label="Time zone" htmlFor="acct-tz">
                    <select
                      id="acct-tz"
                      className="acct-input"
                      value={tzDraft}
                      onChange={(e) => setTzDraft(e.target.value)}
                    >
                      <option value="pst">Pacific · Los Angeles</option>
                      <option value="mst">Mountain · Denver</option>
                      <option value="cst">Central · Chicago</option>
                      <option value="est">Eastern · New York</option>
                      <option value="utc">UTC</option>
                      <option value="gmt">London</option>
                      <option value="cet">Berlin</option>
                      <option value="sgt">Singapore</option>
                      <option value="jst">Tokyo</option>
                      <option value="aest">Sydney</option>
                    </select>
                  </Field>
                </div>

                <div className="acct-section-divider">
                  <div className="acct-eyebrow">Workspace data</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)', alignItems: 'center' }}>
                    <button type="button" className="acct-btn-text" onClick={handleLoadDemo}>
                      Load demo data
                    </button>
                    <span style={{ color: 'var(--text-faint)', fontSize: 'var(--fs-sm)' }}>· Seeds the mockup's 50 demo clients</span>
                  </div>

                  {/* Two-step destructive flow:
                        1. .acct-btn-outline--danger trigger pops the
                           confirm UI (typed-confirmation gate)
                        2. .acct-btn-solid--danger fires the wipe once
                           the user types "reset"
                      Previously each button carried its own inline
                      style block re-implementing the destructive
                      colours. Switched to the shared button classes
                      so this section speaks the same visual vocabulary
                      as the rest of the Account modal and the wider
                      app's destructive-action convention.
                      Audit: account MED. */}
                  <div className="acct-reset-row">
                    {resetPhase === 'idle' ? (
                      <button
                        type="button"
                        className="acct-btn-outline acct-btn-outline--danger"
                        onClick={() => setResetPhase('confirm')}
                      >Reset workspace…</button>
                    ) : (
                      <div className="acct-reset-confirm">
                        <div className="acct-reset-confirm-prompt">
                          This deletes every client, service, and task in your workspace. Type <strong>reset</strong> to confirm.
                        </div>
                        <div className="acct-reset-confirm-actions">
                          <input
                            type="text"
                            className="acct-input acct-reset-input"
                            value={resetInput}
                            onChange={(e) => setResetInput(e.target.value)}
                            placeholder="Type reset to confirm"
                            autoFocus
                          />
                          <button
                            type="button"
                            className="acct-btn-solid acct-btn-solid--danger"
                            onClick={handleReset}
                            disabled={resetInput.trim().toLowerCase() !== 'reset'}
                          >Reset</button>
                          <button
                            type="button"
                            onClick={() => { setResetPhase('idle'); setResetInput(''); }}
                            className="acct-btn-text"
                          >Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ── Workspace ──────────────────────────────────────── */}
            {section === 'workspace' && (
              <WorkspaceSection
                nameDraft={draftWsName}
                setNameDraft={setDraftWsName}
                initialsDraft={draftWsInitials}
                setInitialsDraft={setDraftWsInitials}
                colorDraft={draftWsColor}
                setColorDraft={setDraftWsColor}
              />
            )}

            {/* ── Preferences ────────────────────────────────────── */}
            {section === 'preferences' && (
              <section
                className="acct-section"
                role="tabpanel"
                id="acct-panel-preferences"
                aria-labelledby="acct-tab-preferences"
                tabIndex={0}
                data-active="true"
              >
                <div className="acct-section-header">
                  <h3 className="acct-section-title">Preferences</h3>
                  <p className="acct-section-sub">Changes save instantly.</p>
                </div>

                <Row
                  title="Appearance"
                  sub="Match your device or pick a fixed theme."
                >
                  <Segment>
                    <SegBtn pressed={data.theme === 'light'} onClick={() => setAppearance('light')}>Light</SegBtn>
                    <SegBtn pressed={data.theme === 'dark'} onClick={() => setAppearance('dark')}>Dark</SegBtn>
                    {/* "System" is a one-shot resolver, not a sticky
                        mode — it picks the OS preference at click and
                        commits as light/dark. Pressed stays false so
                        the visible state always reflects the actually
                        applied theme. */}
                    <SegBtn pressed={false} onClick={() => setAppearance('system')}>System</SegBtn>
                  </Segment>
                </Row>

                {/* "Start week on" Sun/Mon segment used to live here.
                    Removed 2026-04-26 — the Schedule grid on Overview
                    only ever shows Mon–Fri (weekends are skipped by
                    design), so picking a starting day was a meaningless
                    setting. If a real Sat/Sun-aware view ships later,
                    bring it back as part of that view's preferences. */}

                <Row
                  title="Time format"
                  sub="How due dates and meetings display."
                >
                  <Segment>
                    <SegBtn pressed={timeFmt === '12h'} onClick={() => setTimeFmt('12h')}>12-hour</SegBtn>
                    <SegBtn pressed={timeFmt === '24h'} onClick={() => setTimeFmt('24h')}>24-hour</SegBtn>
                  </Segment>
                </Row>
              </section>
            )}

            {/* ── Notifications ──────────────────────────────────── */}
            {section === 'notifications' && (
              <section
                className="acct-section"
                role="tabpanel"
                id="acct-panel-notifications"
                aria-labelledby="acct-tab-notifications"
                tabIndex={0}
                data-active="true"
              >
                <div className="acct-section-header">
                  <h3 className="acct-section-title">Notifications</h3>
                  <p className="acct-section-sub">
                    Controls what shows up in the bell at the top of the page.
                  </p>
                </div>

                <Row
                  title="Urgent items in the bell"
                  sub="Overdue tasks, due-today work, and on-fire client alerts."
                >
                  <Toggle
                    checked={draftNotifUrgent}
                    onChange={setDraftNotifUrgent}
                    label="Urgent items in the bell"
                  />
                </Row>
                <Row
                  title="Daily digest"
                  sub="Top-of-bell summary line when you have urgent items."
                >
                  <Toggle
                    checked={draftNotifDigest}
                    onChange={setDraftNotifDigest}
                    label="Daily digest"
                  />
                </Row>

                {/* Honest note about what's NOT here yet. The previous
                    revision shipped 5 toggles describing email-based
                    behaviours that don't actually work — no email
                    infra exists. Removed the 3 email-only ones; the
                    other 2 got repurposed as bell-only controls. */}
                <p className="acct-section-sub" style={{ marginTop: 'var(--sp-lg)', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                  Email digests, mention alerts, and per-channel controls land when email delivery wires up.
                </p>
              </section>
            )}

            {/* ── Time off ────────────────────────────────────────── */}
            {section === 'timeoff' && (
              <TimeOffSection />
            )}

            {/* ── Members ────────────────────────────────────────── */}
            {section === 'members' && (
              <MembersSection />
            )}

            {/* ── Job titles ─────────────────────────────────────── */}
            {section === 'jobtitles' && (
              <JobTitlesSection />
            )}

            {/* ── Trash ──────────────────────────────────────────── */}
            {section === 'trash' && (
              <TrashSection />
            )}

            {/* ── Sign-in ────────────────────────────────────────── */}
            {section === 'signin' && (
              <section
                className="acct-section"
                role="tabpanel"
                id="acct-panel-signin"
                aria-labelledby="acct-tab-signin"
                tabIndex={0}
                data-active="true"
              >
                <div className="acct-section-header">
                  <h3 className="acct-section-title">Sign-in</h3>
                  <p className="acct-section-sub">Flizow uses Google to sign you in. Your password lives with Google.</p>
                </div>
                <div className="acct-connected">
                  <div className="acct-connected-logo" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.3-1.67 3.8-5.5 3.8A5.9 5.9 0 0 1 6.1 12 5.9 5.9 0 0 1 12 6.1c1.9 0 3.2.8 4 1.5l2.7-2.6A9.3 9.3 0 0 0 12 2.5a9.5 9.5 0 1 0 0 19c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"/>
                      <path fill="#FBBC05" d="M6.1 12c0-.4 0-.8.1-1.2L3.5 8.8A9.5 9.5 0 0 0 2.5 12c0 1.5.4 2.9 1 4.2l2.7-2c-.1-.7-.1-1.4-.1-2.2z"/>
                      <path fill="#34A853" d="M12 21.5c2.6 0 4.7-.8 6.3-2.3l-2.7-2.1c-.8.5-1.9 1-3.6 1-2.8 0-5.2-1.9-6-4.4l-2.7 2c1.5 3 4.6 5.8 8.7 5.8z"/>
                      <path fill="#4285F4" d="M21.1 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5a4.7 4.7 0 0 1-2 3.1l2.7 2.1c1.6-1.5 2.9-3.7 2.9-7.5z"/>
                    </svg>
                  </div>
                  <div className="acct-connected-text">
                    <div className="acct-connected-label">Google</div>
                    <div className="acct-connected-email">{email}</div>
                  </div>
                  <a
                    className="acct-external-link"
                    href="https://myaccount.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
                  </a>
                </div>

                <div className="acct-section-divider">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="acct-btn-outline"
                    >Sign out of Flizow</button>
                    <button
                      type="button"
                      onClick={handleSignOutEverywhere}
                      title="Other devices sign out within seconds, when their browser tab next reaches Firestore."
                      className="acct-btn-outline acct-btn-outline--danger"
                    >Sign out everywhere</button>
                  </div>
                  <p className="acct-section-hint">
                    "Sign out of Flizow" signs out this device only. "Sign out everywhere" revokes
                    every active session — other devices sign out within seconds.
                  </p>
                </div>
              </section>
            )}

          </div>
        </div>

        <footer className="acct-footer">
          {/* Footer status — currently only renders the toast text
              ("Changes saved", "Demo workspace loaded", etc). The
              checkmark icon paints in the success tint when there's
              a message; otherwise the span collapses to empty so the
              footer reads cleanly. role="status" + aria-live="polite"
              announces saves to screen readers without stealing focus. */}
          <span className="acct-footer-status" role="status" aria-live="polite">
            {toast && (
              <>
                <CheckIcon
                  className="acct-footer-status-icon"
                  width={14}
                  height={14}
                  aria-hidden="true"
                />
                {toast}
              </>
            )}
          </span>
          <button
            type="button"
            className="acct-btn-text"
            onClick={handleCancel}
            disabled={!isDirty}
            aria-label={isDirty ? 'Discard changes' : 'No changes to discard'}
          >
            Cancel
          </button>
          <button
            type="button"
            className="acct-btn-save"
            onClick={handleSave}
            disabled={!isDirty}
            aria-label={isDirty ? 'Save changes' : 'No changes to save'}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Internal helpers ─────────────────────────────────────────────────

function NavItem({
  section, label, active, onClick, children,
}: {
  section: Section;
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // tabId / panelId pair so the section panels below can claim
  // aria-labelledby={tabId} and we can claim aria-controls={panelId}.
  // Closes the WAI-ARIA tabs pattern that was previously orphaned.
  // Audit: account HIGH (broken tab/tabpanel pairing).
  return (
    <button
      role="tab"
      type="button"
      className="acct-nav-item"
      id={`acct-tab-${section}`}
      aria-selected={active}
      aria-controls={`acct-panel-${section}`}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
    >
      {children}
      {label}
    </button>
  );
}

function Field({
  label, full, htmlFor, children,
}: {
  label: string;
  full?: boolean;
  /** id of the input the label should target. When provided, click on
   *  the label focuses the input and screen readers announce the
   *  pairing. Audit: account MED (orphaned labels). */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`acct-form-field${full ? ' acct-field-full' : ''}`}>
      <label className="acct-field-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function Row({
  title, sub, children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="acct-row">
      <div className="acct-row-text">
        <div className="acct-row-title">{title}</div>
        <div className="acct-row-sub">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function Segment({ children }: { children: React.ReactNode }) {
  return <div className="acct-segment" role="group">{children}</div>;
}

function SegBtn({
  pressed, onClick, children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="acct-segment-btn"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="acct-toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

// ── Members tab ─────────────────────────────────────────────────────────

/** Members tab — workspace-level membership management. Lists every
 *  signed-in member, their access level, and lets the owner remove or
 *  re-role them. "Invite teammate" generates a one-time link the owner
 *  shares manually (Slack/text/email — not auto-emailed in MVP). */
function MembersSection() {
  const { data, store } = useFlizow();
  // Subscribe to workspace metadata only (not the full data slice) so
  // a card edit elsewhere doesn't re-render this list.
  const meta = useSyncExternalStore(store.subscribeWorkspace, store.getWorkspaceMeta);
  const ownUid = store.getCurrentMemberId();
  // Profile-panel hook — clicking a member avatar opens their profile
  // sheet (the Account modal stays open behind, so the user can hop
  // between profiles without losing their place in settings).
  const profile = useMemberProfile();

  const [inviting, setInviting] = useState(false);
  const [inviteRole, setInviteRole] = useState<AccessRole>('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingMemberOp, setPendingMemberOp] = useState<string | null>(null);

  // List controls — search / sort / group-by / role filter. Defaults
  // mirror what a fresh workspace expects to see: alphabetical by
  // name, no grouping, no filter applied. Persisting these across
  // sessions is overkill for now; if power users ask for it later
  // we lift to localStorage.
  type SortKey = 'name' | 'jobTitle' | 'role' | 'joined';
  type GroupKey = 'none' | 'jobTitle' | 'role';
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [groupBy, setGroupBy] = useState<GroupKey>('none');
  const [roleFilter, setRoleFilter] = useState<Set<AccessRole>>(new Set());

  if (!meta) {
    return (
      <section
        className="acct-section"
        role="tabpanel"
        id="acct-panel-members"
        aria-labelledby="acct-tab-members"
        tabIndex={0}
        data-active="true"
      >
        <div className="acct-section-header">
          <h3 className="acct-section-title">Members</h3>
          <p className="acct-section-sub">Loading workspace…</p>
        </div>
      </section>
    );
  }

  const isOwner = ownUid === meta.ownerUid;

  async function handleGenerateInvite() {
    setActionError(null);
    setInviting(true);
    setLinkCopied(false);
    try {
      const url = await store.createInvite(inviteRole);
      setInviteLink(url);
      // Try to copy automatically — saves a click in the common case.
      // Fail-soft if clipboard is blocked (older browsers, http dev).
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
      } catch { /* user can click the copy button */ }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Could not create invite link.',
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleCopy() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setActionError('Copy failed — select the link and copy manually.');
    }
  }

  async function handleRevoke(token: string) {
    setActionError(null);
    try {
      await store.revokeInvite(token);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Revoke failed.');
    }
  }

  async function handleRemove(uid: string, name: string) {
    if (!window.confirm(`Remove ${name} from the workspace? They'll lose access immediately.`)) {
      return;
    }
    setActionError(null);
    setPendingMemberOp(uid);
    try {
      await store.removeWorkspaceMember(uid);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove member.');
    } finally {
      setPendingMemberOp(null);
    }
  }

  async function handleRoleChange(uid: string, role: AccessRole) {
    setActionError(null);
    setPendingMemberOp(uid);
    try {
      await store.changeMemberRole(uid, role);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not change role.');
    } finally {
      setPendingMemberOp(null);
    }
  }

  // Has-link view = Generated link card replaces the invite Row's
  // helper text. Generated card is denser; the action's already done.
  const memberCount = meta.members.length;
  const pendingCount = meta.pendingInvites.length;

  return (
    <section
      className="acct-section"
      role="tabpanel"
      id="acct-panel-members"
      aria-labelledby="acct-tab-members"
      tabIndex={0}
      data-active="true"
    >
      <div className="acct-section-header">
        <h3 className="acct-section-title">Members</h3>
        <p className="acct-section-sub">
          {isOwner
            ? `People with access to ${meta.name}.`
            : 'Only the workspace owner can invite or remove members.'}
        </p>
      </div>

      {actionError && (
        <div className="mbrs-error" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{actionError}</span>
        </div>
      )}

      {/* Invite Row — owner-only. Follows the same .acct-row pattern
          the Preferences tab uses (title + sub left, control right) so
          the whole modal reads as one design language, not two. */}
      {isOwner && (
        <div className="acct-row mbrs-invite-row">
          <div className="acct-row-text">
            <div className="acct-row-title">Invite teammate</div>
            <div className="acct-row-sub">
              Generates a one-time link. They join after signing in with Google.
            </div>
          </div>
          <div className="mbrs-invite-controls">
            <select
              className="acct-input mbrs-role-select"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as AccessRole)}
              aria-label="Role for the invited teammate"
              disabled={inviting}
              title={ACCESS_ROLE_DESCRIPTION[inviteRole]}
            >
              {/* Order goes most-restrictive → most-permissive so the
                  default ('member') is mid-list and Admin is the
                  conscious upgrade. Owner intentionally absent —
                  promoting to Owner runs through the ownership-
                  transfer flow, not the invite picker. */}
              <option value="viewer">{ACCESS_ROLE_LABEL.viewer}</option>
              <option value="member">{ACCESS_ROLE_LABEL.member}</option>
              <option value="admin">{ACCESS_ROLE_LABEL.admin}</option>
            </select>
            <button
              type="button"
              className="mbrs-invite-btn"
              onClick={handleGenerateInvite}
              disabled={inviting}
            >
              {inviting ? 'Generating…' : 'Generate link'}
            </button>
          </div>
        </div>
      )}

      {/* Generated link block — separate row, only when an invite has
          just been created. Sits visually under the Invite Row to read
          as the result of that action. */}
      {isOwner && inviteLink && (
        <div className="mbrs-link-card">
          <div className="mbrs-link-row">
            <input
              type="text"
              readOnly
              value={inviteLink}
              onClick={(e) => e.currentTarget.select()}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
              className="mbrs-link-input"
            />
            <button
              type="button"
              className="mbrs-link-copy"
              data-copied={linkCopied ? 'true' : undefined}
              onClick={handleCopy}
            >
              {linkCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mbrs-link-hint">
            Share via Slack, email, or text. Single-use — generate a new link for each teammate.
          </p>
        </div>
      )}

      {/* Pending invites — eyebrow + list. Eyebrow is paired tightly
          with its list (no extra margin between them) so the heading
          reads as belonging to the rows below. */}
      {isOwner && pendingCount > 0 && (
        <div className="mbrs-group">
          <div className="mbrs-eyebrow">Pending · {pendingCount}</div>
          <div className="mbrs-list">
            {meta.pendingInvites.map((inv) => (
              <div key={inv.token} className="mbrs-row mbrs-row--pending">
                <div className="mbrs-avatar mbrs-avatar--pending" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="mbrs-identity">
                  <div className="mbrs-name">Invite link</div>
                  <div className="mbrs-sub">
                    Joins as {inv.role} · created {formatRelativeShort(inv.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(inv.token)}
                  className="mbrs-action-btn mbrs-action-btn--danger"
                  aria-label="Revoke invite"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active members list. */}
      <div className="mbrs-group">
        <MembersListControls
          search={search}
          setSearch={setSearch}
          sortBy={sortBy}
          setSortBy={setSortBy}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          memberCount={memberCount}
          jobTitles={data.jobTitles}
        />

        {/* Filter / sort / group pipeline runs over the workspace
            members. Each row also pulls its data.members[] mirror
            for caps + jobTitleId lookup. We compute the projection
            inline so the dependency on jobTitles + filter state is
            visible in one read instead of split across hooks. */}
        {(() => {
          const groups = projectMembers(
            meta.members,
            data.members,
            data.jobTitles,
            { search, sortBy, groupBy, roleFilter },
          );

          if (groups.length === 0 || groups.every((g) => g.rows.length === 0)) {
            return (
              <div className="mbrs-empty" role="status">
                No members match the current filters.
              </div>
            );
          }

          return groups.map((group) => (
            <div key={group.key} className="mbrs-list-group">
              {group.label && (
                <div className="mbrs-group-label">{group.label}</div>
              )}
              <div className="mbrs-list">
                {group.rows.map(({ membership: m, member: dataMember }) => {
                  const isThisOwner = m.uid === meta.ownerUid;
                  const isMe = m.uid === ownUid;
                  const initials = (m.displayName || m.email || 'U')
                    .split(/\s+|@/)[0]
                    .slice(0, 2)
                    .toUpperCase();
                  const showSelect = isOwner && !isThisOwner;
                  const showRemove = isOwner && !isThisOwner;
                  const canOpenProfile = !!dataMember;
                  // Resolve the displayed job title once per row.
                  // Falls back to a quiet em-dash so the row stays
                  // visually balanced when a member hasn't been
                  // tagged yet.
                  const jt = dataMember?.jobTitleId
                    ? data.jobTitles.find((t) => t.id === dataMember.jobTitleId)
                    : undefined;
                  return (
                    <div key={m.uid} className="mbrs-row">
                      {canOpenProfile ? (
                        <button
                          type="button"
                          className="mbrs-avatar mbrs-avatar--clickable"
                          onClick={() => profile.open(m.uid)}
                          aria-label={`Open profile for ${m.displayName || m.email || 'this member'}`}
                        >
                          {initials}
                        </button>
                      ) : (
                        <div className="mbrs-avatar" aria-hidden="true">{initials}</div>
                      )}
                      <div className="mbrs-identity">
                        <div className="mbrs-name">
                          <span className="mbrs-name-text">{m.displayName || m.email || 'Unnamed'}</span>
                          {isMe && <span className="mbrs-tag">You</span>}
                          {isThisOwner && <span className="mbrs-tag mbrs-tag--owner">Owner</span>}
                          {jt && (
                            <span
                              className="mbrs-tag mbrs-tag--jt"
                              style={{ background: jt.color || 'var(--bg-soft)', color: '#fff' }}
                              title={`Job title: ${jt.label}`}
                            >
                              {jt.label}
                            </span>
                          )}
                        </div>
                        <div className="mbrs-sub">
                          {m.email || '—'} · joined {formatRelativeShort(m.joinedAt)}
                        </div>
                      </div>
                      {showSelect ? (
                        <select
                          className="acct-input mbrs-role-select mbrs-role-select--inline"
                          value={m.role}
                          disabled={pendingMemberOp === m.uid}
                          onChange={(e) => handleRoleChange(m.uid, e.target.value as AccessRole)}
                          aria-label={`${m.displayName || m.email}'s access role`}
                          title={ACCESS_ROLE_DESCRIPTION[m.role]}
                        >
                          {/* Owner intentionally not an option here — promoting
                              to Owner is the ownership-transfer flow, distinct
                              from "change this member's role." Renders as a
                              read-only pill below for the owner row. */}
                          <option value="viewer">{ACCESS_ROLE_LABEL.viewer}</option>
                          <option value="member">{ACCESS_ROLE_LABEL.member}</option>
                          <option value="admin">{ACCESS_ROLE_LABEL.admin}</option>
                        </select>
                      ) : (
                        <span
                          className={`access-pill access-pill--${m.role}`}
                          title={ACCESS_ROLE_DESCRIPTION[m.role]}
                        >
                          {ACCESS_ROLE_LABEL[m.role]}
                        </span>
                      )}
                      {showRemove && (
                        <button
                          type="button"
                          onClick={() => handleRemove(m.uid, m.displayName || m.email || 'this member')}
                          disabled={pendingMemberOp === m.uid}
                          className="mbrs-action-btn mbrs-action-btn--danger"
                          aria-label={`Remove ${m.displayName || m.email}`}
                          title="Remove member"
                        >
                          Remove
                        </button>
                      )}
                      {isOwner && dataMember && (
                        <CapInputs
                          member={dataMember}
                          onChange={(patch) => store.updateMember(m.uid, patch)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Members list controls — search + sort + group-by + filter chips.
//
// Lifted out of MembersSection so the section's primary path (render
// the list) reads top-to-bottom without 60 lines of toolbar JSX.
// ──────────────────────────────────────────────────────────────────

function MembersListControls({
  search, setSearch,
  sortBy, setSortBy,
  groupBy, setGroupBy,
  roleFilter, setRoleFilter,
  memberCount,
  jobTitles,
}: {
  search: string;
  setSearch: (v: string) => void;
  sortBy: 'name' | 'jobTitle' | 'role' | 'joined';
  setSortBy: (v: 'name' | 'jobTitle' | 'role' | 'joined') => void;
  groupBy: 'none' | 'jobTitle' | 'role';
  setGroupBy: (v: 'none' | 'jobTitle' | 'role') => void;
  roleFilter: Set<AccessRole>;
  setRoleFilter: (v: Set<AccessRole>) => void;
  memberCount: number;
  jobTitles: ReadonlyArray<JobTitle>;
}) {
  const ROLES: AccessRole[] = ['owner', 'admin', 'member', 'viewer'];

  function toggleRole(r: AccessRole) {
    const next = new Set(roleFilter);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    setRoleFilter(next);
  }

  return (
    <div className="mbrs-controls">
      <div className="mbrs-controls-row">
        <div className="mbrs-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="acct-input mbrs-search-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${memberCount} member${memberCount === 1 ? '' : 's'}…`}
            aria-label="Search members"
          />
        </div>
        <select
          className="acct-input mbrs-control-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Sort members by"
        >
          <option value="name">Sort: Name</option>
          <option value="jobTitle">Sort: Job title</option>
          <option value="role">Sort: Access role</option>
          <option value="joined">Sort: Joined date</option>
        </select>
        <select
          className="acct-input mbrs-control-select"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
          aria-label="Group members by"
        >
          <option value="none">Group: None</option>
          <option value="jobTitle">Group: Job title</option>
          <option value="role">Group: Access role</option>
        </select>
      </div>
      {/* Role filter chips — toggleable. None pressed = show all
          (the common case); pressing one or more narrows. The
          "x match" count below the chips is implicit in the list
          itself, so we don't render a count here. */}
      <div className="mbrs-controls-row mbrs-chip-row" role="group" aria-label="Filter by access role">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            className={`mbrs-chip ${roleFilter.has(r) ? 'mbrs-chip--on' : ''}`}
            onClick={() => toggleRole(r)}
            aria-pressed={roleFilter.has(r)}
          >
            {ACCESS_ROLE_LABEL[r]}
          </button>
        ))}
        {roleFilter.size > 0 && (
          <button
            type="button"
            className="mbrs-chip mbrs-chip--clear"
            onClick={() => setRoleFilter(new Set())}
            title="Clear all filters"
          >
            Clear
          </button>
        )}
        {/* Hint chip when any filter is active so the count of
            shown members is contextually clear without a second
            label row. */}
        {jobTitles.length > 0 && groupBy === 'jobTitle' && (
          <span className="mbrs-chip mbrs-chip--hint" aria-hidden="true">
            Grouped by {jobTitles.filter((t) => t.active).length} active titles
          </span>
        )}
      </div>
    </div>
  );
}

/** Pure projection: filter → sort → group. Returns an array of
 *  groups so the renderer can iterate without knowing how the
 *  shaping was decided. */
type ListRow = { membership: WorkspaceMembership; member: Member | undefined };

function projectMembers(
  memberships: ReadonlyArray<WorkspaceMembership>,
  members: ReadonlyArray<Member>,
  jobTitles: ReadonlyArray<JobTitle>,
  opts: {
    search: string;
    sortBy: 'name' | 'jobTitle' | 'role' | 'joined';
    groupBy: 'none' | 'jobTitle' | 'role';
    roleFilter: Set<AccessRole>;
  },
): Array<{ key: string; label: string; rows: ListRow[] }> {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const titleById = new Map(jobTitles.map((t) => [t.id, t]));

  // 1. Pair memberships with their data.member mirror.
  const paired: ListRow[] = memberships.map((mm) => ({
    membership: mm,
    member: memberById.get(mm.uid),
  }));

  // 2. Filter — search + role chips.
  const q = opts.search.trim().toLowerCase();
  const filtered = paired.filter(({ membership: mm, member: dm }) => {
    if (opts.roleFilter.size > 0 && !opts.roleFilter.has(mm.role)) {
      return false;
    }
    if (!q) return true;
    const titleLabel = dm?.jobTitleId
      ? titleById.get(dm.jobTitleId)?.label ?? ''
      : (dm?.role ?? '');
    return (
      (mm.displayName ?? '').toLowerCase().includes(q) ||
      (mm.email ?? '').toLowerCase().includes(q) ||
      titleLabel.toLowerCase().includes(q)
    );
  });

  // 3. Sort — pure compare functions per key.
  const ROLE_ORDER: Record<AccessRole, number> = {
    owner: 0, admin: 1, member: 2, viewer: 3,
  };
  filtered.sort((a, b) => {
    switch (opts.sortBy) {
      case 'role':
        return ROLE_ORDER[a.membership.role] - ROLE_ORDER[b.membership.role];
      case 'joined':
        return (a.membership.joinedAt ?? '').localeCompare(b.membership.joinedAt ?? '');
      case 'jobTitle': {
        const ta = a.member?.jobTitleId ? titleById.get(a.member.jobTitleId)?.label ?? '' : '';
        const tb = b.member?.jobTitleId ? titleById.get(b.member.jobTitleId)?.label ?? '' : '';
        if (ta && tb) return ta.localeCompare(tb);
        if (ta) return -1;
        if (tb) return 1;
        return (a.membership.displayName ?? '').localeCompare(b.membership.displayName ?? '');
      }
      case 'name':
      default:
        return (a.membership.displayName ?? a.membership.email ?? '')
          .localeCompare(b.membership.displayName ?? b.membership.email ?? '');
    }
  });

  // 4. Group.
  if (opts.groupBy === 'none') {
    return [{ key: 'all', label: '', rows: filtered }];
  }
  if (opts.groupBy === 'role') {
    const groups: Record<AccessRole, ListRow[]> = {
      owner: [], admin: [], member: [], viewer: [],
    };
    for (const row of filtered) groups[row.membership.role].push(row);
    return (['owner', 'admin', 'member', 'viewer'] as AccessRole[])
      .filter((r) => groups[r].length > 0)
      .map((r) => ({
        key: `role-${r}`,
        label: `${ACCESS_ROLE_LABEL[r]} · ${groups[r].length}`,
        rows: groups[r],
      }));
  }
  // groupBy === 'jobTitle'
  const byTitle = new Map<string, { label: string; rows: ListRow[] }>();
  const untagged: ListRow[] = [];
  for (const row of filtered) {
    const id = row.member?.jobTitleId;
    const t = id ? titleById.get(id) : undefined;
    if (!t) {
      untagged.push(row);
      continue;
    }
    const bucket = byTitle.get(t.id) ?? { label: t.label, rows: [] };
    bucket.rows.push(row);
    byTitle.set(t.id, bucket);
  }
  const out: Array<{ key: string; label: string; rows: ListRow[] }> = [];
  for (const [id, b] of byTitle.entries()) {
    out.push({ key: `jt-${id}`, label: `${b.label} · ${b.rows.length}`, rows: b.rows });
  }
  if (untagged.length > 0) {
    out.push({ key: 'jt-none', label: `No job title · ${untagged.length}`, rows: untagged });
  }
  return out;
}

// ── Workspace tab ──────────────────────────────────────────────────────

/** Workspace tab — name + initials + color tile + read-only stats.
 *  Now a fully controlled component: drafts are owned by the parent
 *  modal so the modal-level Save button can commit them alongside
 *  the Profile fields. Owner-only edits; non-owners see the same
 *  fields as read-only. Image-upload logo deferred (needs Firebase
 *  Storage + uploader); initials + color tile carries 90% of the
 *  value for now. */

// ── Time off section ────────────────────────────────────────────────────
//
// Self-service-only configuration of the signed-in user's vacation
// periods. Reads + writes data.members[me].timeOff. The toggle reflects
// whether ANY currently-active period covers today; clicking it pops a
// date-picker modal to schedule a new period (when off) or asks to end
// the current one (when on).
//
// The list below the toggle shows every period — current/upcoming first,
// then past — with Edit + Remove actions per row.
//
// Profile panel (MemberProfilePanel) reads each member's timeOff to
// render the "🌴 On vacation" pill; this surface is the only place
// you edit your own.

function TimeOffSection() {
  const { data, store } = useFlizow();
  const currentId = store.getCurrentMemberId();
  const me = currentId ? data.members.find(m => m.id === currentId) ?? null : null;

  // Modal state — null when closed; an `editIndex` of -1 means "adding
  // a new period," any other index means "editing the existing one."
  // Drafts live on the modal itself, not here, so cancel doesn't need
  // a manual reset.
  const [modalOpen, setModalOpen] = useState<{ editIndex: number } | null>(null);

  if (!currentId || !me) {
    return (
      <section
        className="acct-section"
        role="tabpanel"
        id="acct-panel-timeoff"
        aria-labelledby="acct-tab-timeoff"
        tabIndex={0}
        data-active="true"
      >
        <div className="acct-section-header">
          <h3 className="acct-section-title">Time off</h3>
          <p className="acct-section-sub">Sign in to manage your time off.</p>
        </div>
      </section>
    );
  }

  // Stash the narrowed reference once so closures + nested handlers
  // below don't lose the non-null narrowing through React's hook
  // boundaries. Cheaper than annotating every callback's `me!`.
  const meId = me.id;
  const today = data.today;
  // Phase-3 read: pull THIS member's requests from the workspace
  // ledger and treat the approved ones as "vacation periods" (the
  // current UX). Pending/denied/cancelled don't show on this self-
  // serve list yet — Phase 4 reworks the surface to expose status.
  const myRequests = useMemo(
    () =>
      data.timeOffRequests
        .filter((r) => r.memberId === meId && r.status === 'approved')
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start)),
    [data.timeOffRequests, meId],
  );

  // Bucket periods into past vs current/upcoming. A period counts as
  // past when its end date is strictly before today; the active one
  // (today inside) groups with upcoming so the user sees current +
  // future together.
  const upcoming: TimeOffRequest[] = [];
  const past: TimeOffRequest[] = [];
  for (const r of myRequests) {
    if (r.end < today) past.push(r);
    else upcoming.push(r);
  }
  upcoming.sort((a, b) => a.start.localeCompare(b.start));
  past.sort((a, b) => b.end.localeCompare(a.end));

  // Active = today inside any approved period. Drives the toggle's
  // checked state + the "End time off" path.
  const activePeriod = useMemo(
    () => currentVacationPeriod(me, today, data.timeOffRequests),
    [me, today, data.timeOffRequests],
  );
  const activeRequest = activePeriod
    ? myRequests.find((r) => r.start === activePeriod.start && r.end === activePeriod.end)
    : undefined;
  const isCurrentlyAway = !!activePeriod;

  function handleToggle(checked: boolean) {
    if (checked) {
      // OFF → ON: open the modal for a new period. Default range
      // starts today and ends tomorrow — most users want a quick
      // "I'm out today + tomorrow" entry, with the option to extend.
      setModalOpen({ editIndex: -1 });
    } else {
      // ON → OFF: end the active period now by clipping its end
      // date to yesterday. This preserves the period's history (the
      // approval queue + audit trail still see "Sarah was out May
      // 13–14") rather than deleting the row.
      if (!activeRequest) return;
      const yesterday = isoOffsetDays(today, -1);
      const safeEnd = yesterday < activeRequest.start ? activeRequest.start : yesterday;
      store.updateTimeOffRequest(activeRequest.id, { end: safeEnd });
    }
  }

  function handleAdd() {
    setModalOpen({ editIndex: -1 });
  }
  function handleEdit(index: number) {
    setModalOpen({ editIndex: index });
  }
  function handleRemove(index: number) {
    const r = myRequests[index];
    if (!r) return;
    // Hard-delete to keep parity with the pre-Phase-3 "Remove"
    // behaviour. A future pass may swap this for cancel + audit
    // trail once we surface status to the user.
    store.deleteTimeOffRequest(r.id);
  }
  function handleSave(period: { start: string; end: string }) {
    if (!modalOpen) return;
    if (modalOpen.editIndex === -1) {
      // Self-serve add lands as 'approved' to preserve the legacy
      // behaviour ("I added a vacation, it's now active"). Phase 4
      // flips this to 'pending' once the approval flow ships.
      store.submitTimeOffRequest({
        memberId: meId,
        start: period.start,
        end: period.end,
        status: 'approved',
        decidedBy: meId,
      });
    } else {
      const r = myRequests[modalOpen.editIndex];
      if (r) {
        store.updateTimeOffRequest(r.id, {
          start: period.start,
          end: period.end,
        });
      }
    }
    setModalOpen(null);
  }

  return (
    <section
      className="acct-section"
      role="tabpanel"
      id="acct-panel-timeoff"
      aria-labelledby="acct-tab-timeoff"
      tabIndex={0}
      data-active="true"
    >
      <div className="acct-section-header">
        <h3 className="acct-section-title">Time off</h3>
        <p className="acct-section-sub">
          Tell your team you'll be away. Active time off shows a "🌴 On vacation" pill
          on your profile and dims your row in the capacity heatmap.
        </p>
      </div>

      <Row
        title="Currently away"
        sub={
          isCurrentlyAway
            ? `Active through ${formatDateLong(activePeriod!.end)}`
            : 'Toggle on to schedule time off — pick a from + to date.'
        }
      >
        <Toggle
          checked={isCurrentlyAway}
          onChange={handleToggle}
          label="Currently away"
        />
      </Row>

      <div className="acct-section-divider">
        <div className="acct-eyebrow">Scheduled time off</div>
        {upcoming.length === 0 ? (
          <div className="timeoff-empty">No upcoming time off.</div>
        ) : (
          <ul className="timeoff-list">
            {upcoming.map((r) => {
              const idx = myRequests.findIndex((x) => x.id === r.id);
              return (
                <TimeOffRow
                  key={r.id}
                  period={{ start: r.start, end: r.end }}
                  isActive={!!activePeriod && r.start === activePeriod.start && r.end === activePeriod.end}
                  onEdit={() => handleEdit(idx)}
                  onRemove={() => handleRemove(idx)}
                />
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="acct-btn-text"
          onClick={handleAdd}
          style={{ marginTop: 'var(--sp-base)' }}
        >
          + Schedule time off
        </button>
      </div>

      {past.length > 0 && (
        <div className="acct-section-divider">
          <div className="acct-eyebrow">Past time off</div>
          <ul className="timeoff-list">
            {past.map((r) => {
              const idx = myRequests.findIndex((x) => x.id === r.id);
              return (
                <TimeOffRow
                  key={r.id}
                  period={{ start: r.start, end: r.end }}
                  isActive={false}
                  onEdit={() => handleEdit(idx)}
                  onRemove={() => handleRemove(idx)}
                  muted
                />
              );
            })}
          </ul>
        </div>
      )}

      {modalOpen && (
        <TimeOffPeriodModal
          initialStart={
            modalOpen.editIndex >= 0
              ? myRequests[modalOpen.editIndex]?.start ?? today
              : today
          }
          initialEnd={
            modalOpen.editIndex >= 0
              ? myRequests[modalOpen.editIndex]?.end ?? isoOffsetDays(today, 1)
              : isoOffsetDays(today, 1)
          }
          isEditing={modalOpen.editIndex >= 0}
          onSave={handleSave}
          onClose={() => setModalOpen(null)}
        />
      )}
    </section>
  );
}

function TimeOffRow({
  period,
  isActive,
  onEdit,
  onRemove,
  muted,
}: {
  period: { start: string; end: string };
  isActive: boolean;
  onEdit: () => void;
  onRemove: () => void;
  muted?: boolean;
}) {
  return (
    <li className={`timeoff-row${muted ? ' timeoff-row--muted' : ''}`}>
      <div className="timeoff-row-main">
        <span className="timeoff-row-dates">
          {formatPeriodLabel(period.start, period.end)}
        </span>
        {isActive && (
          <span className="timeoff-row-active-pill">Currently away</span>
        )}
      </div>
      <div className="timeoff-row-actions">
        <button
          type="button"
          className="acct-btn-text"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="acct-btn-text timeoff-row-remove"
          onClick={onRemove}
          aria-label={`Remove ${formatPeriodLabel(period.start, period.end)}`}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

/** Modal for adding or editing a single time-off period. Uses native
 *  `<input type="date">` for the calendar pickers — every modern
 *  browser pops a date grid on click without us shipping a third-
 *  party library. */
function TimeOffPeriodModal({
  initialStart,
  initialEnd,
  isEditing,
  onSave,
  onClose,
}: {
  initialStart: string;
  initialEnd: string;
  isEditing: boolean;
  onSave: (period: { start: string; end: string }) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc closes; same convention as the other modals in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valid = start && end && start <= end;

  function handleSave() {
    if (!valid) return;
    onSave({ start, end });
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeoff-modal-title"
      onClick={handleBackdropClick}
    >
      <div ref={dialogRef} className="wip-modal" role="document" style={{ maxWidth: 480 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="timeoff-modal-title">
            {isEditing ? 'Edit time off' : 'Schedule time off'}
          </h2>
          <button
            type="button"
            className="wip-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        <div className="wip-modal-body">
          <p className="acct-section-sub" style={{ marginBottom: 'var(--sp-base)' }}>
            Pick the first and last day you'll be away. Both dates are inclusive —
            "May 13 to May 15" means you're out all three days.
          </p>
          <div className="timeoff-modal-grid">
            <label className="member-profile-field">
              <span className="member-profile-field-label">From</span>
              <input
                type="date"
                className="acct-input"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  // Auto-bump end if the user picks a start date that's
                  // after the current end. Keeps the form consistent
                  // without needing a separate validation toast.
                  if (end < e.target.value) setEnd(e.target.value);
                }}
              />
            </label>
            <label className="member-profile-field">
              <span className="member-profile-field-label">To</span>
              <input
                type="date"
                className="acct-input"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          {!valid && (
            <p className="acct-section-sub" style={{
              color: 'var(--accent)',
              marginTop: 'var(--sp-md)',
              fontSize: 'var(--fs-sm)',
            }}>
              The "to" date must be the same as or after the "from" date.
            </p>
          )}
        </div>
        <footer className="wip-modal-foot">
          <button
            type="button"
            className="wip-btn wip-btn-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="wip-btn wip-btn-primary"
            onClick={handleSave}
            disabled={!valid}
          >
            {isEditing ? 'Save changes' : 'Schedule'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** ISO date "2026-05-15" → "Wed, May 15". Used for the toggle's
 *  "Active through Wed, May 15" sub line. */
function formatDateLong(iso: string): string {
  const d = parseLocalISO(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

/** Format a from/to pair for the row label.
 *    Same day → "May 15"
 *    Same month → "May 13 – 15"
 *    Different month → "May 30 – Jun 2"
 *    Different year → falls back to the long form for clarity. */
function formatPeriodLabel(start: string, end: string): string {
  const a = parseLocalISO(start);
  const b = parseLocalISO(end);
  if (!a || !b) return `${start} – ${end}`;
  if (start === end) {
    return a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  if (sameMonth) {
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.getDate()}`;
  }
  if (sameYear) {
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** Parse a YYYY-MM-DD ISO date as a local-time Date so toLocaleDateString
 *  doesn't slip a day under UTC. Returns null on bad input. */
function parseLocalISO(iso: string): Date | null {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Add (or subtract) days from a YYYY-MM-DD ISO date, returning a new
 *  ISO string in the same format. Used for "tomorrow" / "yesterday"
 *  defaulting in the toggle + modal flows. */
function isoOffsetDays(iso: string, deltaDays: number): string {
  const base = parseLocalISO(iso);
  if (!base) return iso;
  base.setDate(base.getDate() + deltaDays);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ──────────────────────────────────────────────────────────────────
// Job titles section
//
// Workspace-curated list of role labels that members can be tagged
// with. Phase-2 additions: CRUD on the catalog, color picker per
// title, AM-vs-operator kind toggle, archive/restore.
//
// Why this lives in its own section (not folded into Members):
//   - The list grows independently of the member roster (workspace
//     might have 4 titles but 40 members)
//   - The kind toggle decides who's eligible for the AM column on a
//     client — that's a workspace-level decision, not a per-member
//     one
//   - Phase-6 coverage rules will target by title; the title catalog
//     deserves its own surface so those rules have something stable
//     to point at
// ──────────────────────────────────────────────────────────────────

function JobTitlesSection() {
  const { data, store } = useFlizow();
  const titles = data.jobTitles;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftKind, setDraftKind] = useState<JobTitleKind>('operator');
  const [draftColor, setDraftColor] = useState<string>('#5e5ce6');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Member counts per title — drives the "delete safety" check and
  // shows "5 members" alongside each row so the admin knows what
  // they're touching. Small N; recomputed inline.
  const countsByTitle = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of data.members) {
      if (m.jobTitleId) map[m.jobTitleId] = (map[m.jobTitleId] ?? 0) + 1;
    }
    return map;
  }, [data.members]);

  function startEdit(jt: JobTitle) {
    setEditingId(jt.id);
    setDraftLabel(jt.label);
    setDraftKind(jt.kind);
    setDraftColor(jt.color || '#5e5ce6');
    setAdding(false);
    setError(null);
  }

  function startAdd() {
    setEditingId(null);
    setAdding(true);
    setDraftLabel('');
    setDraftKind('operator');
    setDraftColor('#5e5ce6');
    setError(null);
  }

  function cancelDraft() {
    setEditingId(null);
    setAdding(false);
    setError(null);
  }

  function commitDraft() {
    const label = draftLabel.trim();
    if (!label) {
      setError('Title label is required.');
      return;
    }
    // Block duplicates by label (case-insensitive). Avoids two
    // "Designer" entries that look identical and confuse filters.
    const dup = titles.find(
      (t) =>
        t.id !== editingId &&
        t.label.toLowerCase() === label.toLowerCase(),
    );
    if (dup) {
      setError('That label already exists.');
      return;
    }
    if (editingId) {
      store.updateJobTitle(editingId, {
        label,
        kind: draftKind,
        color: draftColor,
      });
    } else {
      const id = `jt-${Math.random().toString(36).slice(2, 10)}`;
      store.addJobTitle({
        id,
        label,
        kind: draftKind,
        color: draftColor,
        active: true,
      });
    }
    cancelDraft();
  }

  function handleArchive(id: string) {
    store.archiveJobTitle(id);
  }
  function handleRestore(id: string) {
    store.updateJobTitle(id, { active: true });
  }
  function handleDelete(id: string, label: string) {
    const count = countsByTitle[id] ?? 0;
    const msg = count > 0
      ? `Delete "${label}"? ${count} member${count === 1 ? '' : 's'} will lose this title and fall back to plain text.`
      : `Delete "${label}"? This can't be undone.`;
    if (!window.confirm(msg)) return;
    store.deleteJobTitle(id);
  }

  return (
    <section
      className="acct-section"
      role="tabpanel"
      id="acct-panel-jobtitles"
      aria-labelledby="acct-tab-jobtitles"
      tabIndex={0}
      data-active="true"
    >
      <div className="acct-section-header">
        <h3 className="acct-section-title">Job titles</h3>
        <p className="acct-section-sub">
          Labels you tag members with. Drives the profile pill, AM filtering, and (later) coverage rules.
        </p>
      </div>

      {error && (
        <div className="mbrs-error" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{error}</span>
        </div>
      )}

      <div className="jt-list">
        {titles.map((jt) => {
          const isEditing = editingId === jt.id;
          const count = countsByTitle[jt.id] ?? 0;
          if (isEditing) {
            return (
              <JobTitleEditorRow
                key={jt.id}
                draftLabel={draftLabel}
                setDraftLabel={setDraftLabel}
                draftKind={draftKind}
                setDraftKind={setDraftKind}
                draftColor={draftColor}
                setDraftColor={setDraftColor}
                onCancel={cancelDraft}
                onSave={commitDraft}
              />
            );
          }
          return (
            <div
              key={jt.id}
              className={`jt-row ${jt.active ? '' : 'jt-row--archived'}`}
            >
              <span
                className="jt-swatch"
                style={{ background: jt.color || 'var(--bg-soft)' }}
                aria-hidden="true"
              />
              <div className="jt-row-text">
                <div className="jt-row-label">{jt.label}</div>
                <div className="jt-row-meta">
                  {jt.kind === 'account-manager' ? 'Account manager' : 'Operator'}
                  {' · '}
                  {count} {count === 1 ? 'member' : 'members'}
                  {!jt.active && ' · Archived'}
                </div>
              </div>
              <button
                type="button"
                className="mbrs-action-btn"
                onClick={() => startEdit(jt)}
                aria-label={`Edit ${jt.label}`}
              >
                Edit
              </button>
              {jt.active ? (
                <button
                  type="button"
                  className="mbrs-action-btn"
                  onClick={() => handleArchive(jt.id)}
                  aria-label={`Archive ${jt.label}`}
                  title="Archive — hides from new pickers but existing members keep the title"
                >
                  Archive
                </button>
              ) : (
                <button
                  type="button"
                  className="mbrs-action-btn"
                  onClick={() => handleRestore(jt.id)}
                  aria-label={`Restore ${jt.label}`}
                >
                  Restore
                </button>
              )}
              <button
                type="button"
                className="mbrs-action-btn mbrs-action-btn--danger"
                onClick={() => handleDelete(jt.id, jt.label)}
                aria-label={`Delete ${jt.label}`}
              >
                Delete
              </button>
            </div>
          );
        })}

        {adding && (
          <JobTitleEditorRow
            draftLabel={draftLabel}
            setDraftLabel={setDraftLabel}
            draftKind={draftKind}
            setDraftKind={setDraftKind}
            draftColor={draftColor}
            setDraftColor={setDraftColor}
            onCancel={cancelDraft}
            onSave={commitDraft}
          />
        )}
      </div>

      {!adding && !editingId && (
        <button
          type="button"
          className="acct-btn acct-btn--primary"
          onClick={startAdd}
          style={{ marginTop: 'var(--sp-md)' }}
        >
          Add job title
        </button>
      )}
    </section>
  );
}

/** Inline form row shared by add + edit. Lives next to the
 *  JobTitlesSection so reading either end is one scroll. */
function JobTitleEditorRow({
  draftLabel, setDraftLabel,
  draftKind, setDraftKind,
  draftColor, setDraftColor,
  onCancel, onSave,
}: {
  draftLabel: string;
  setDraftLabel: (v: string) => void;
  draftKind: JobTitleKind;
  setDraftKind: (v: JobTitleKind) => void;
  draftColor: string;
  setDraftColor: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="jt-row jt-row--editing">
      <span
        className="jt-swatch"
        style={{ background: draftColor }}
        aria-hidden="true"
      />
      <div className="jt-row-text">
        <input
          className="acct-input"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder="e.g. Senior Designer"
          aria-label="Job title label"
          autoFocus
        />
        <div className="jt-edit-controls">
          <select
            className="acct-input"
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as JobTitleKind)}
            aria-label="Job title kind"
          >
            <option value="account-manager">Account manager</option>
            <option value="operator">Operator</option>
          </select>
          <div className="jt-color-picker" role="radiogroup" aria-label="Color">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={draftColor === c.hex}
                aria-label={c.label}
                className="jt-color-dot"
                onClick={() => setDraftColor(c.hex)}
                style={{
                  background: c.hex,
                  boxShadow: draftColor === c.hex ? '0 0 0 2px var(--bg-elev), 0 0 0 4px var(--highlight)' : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="mbrs-action-btn"
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        className="acct-btn acct-btn--primary"
        onClick={onSave}
      >
        Save
      </button>
    </div>
  );
}

function WorkspaceSection({
  nameDraft,
  setNameDraft,
  initialsDraft,
  setInitialsDraft,
  colorDraft,
  setColorDraft,
}: {
  nameDraft: string;
  setNameDraft: (v: string) => void;
  initialsDraft: string;
  setInitialsDraft: (v: string) => void;
  colorDraft: string;
  setColorDraft: (v: string) => void;
}) {
  const { data, store } = useFlizow();
  const meta = useSyncExternalStore(store.subscribeWorkspace, store.getWorkspaceMeta);
  const ownUid = store.getCurrentMemberId();

  if (!meta) {
    return (
      <section
        className="acct-section"
        role="tabpanel"
        id="acct-panel-workspace"
        aria-labelledby="acct-tab-workspace"
        tabIndex={0}
        data-active="true"
      >
        <div className="acct-section-header">
          <h3 className="acct-section-title">Workspace</h3>
          <p className="acct-section-sub">Loading workspace…</p>
        </div>
      </section>
    );
  }

  const isOwner = ownUid === meta.ownerUid;
  const ownerMember = meta.members.find((m) => m.uid === meta.ownerUid);
  const ownerLabel = ownerMember?.displayName || ownerMember?.email || 'Unknown';

  // Stats sourced from the data slice — counts only, not rendered as
  // links. The "About" block is informational; navigation lives in
  // the regular nav.
  const clientCount = data.clients.length;
  const serviceCount = data.services.length;
  const memberCount = meta.members.length;

  return (
    <section
      className="acct-section"
      role="tabpanel"
      id="acct-panel-workspace"
      aria-labelledby="acct-tab-workspace"
      tabIndex={0}
      data-active="true"
    >
      <div className="acct-section-header">
        <h3 className="acct-section-title">Workspace</h3>
        <p className="acct-section-sub">
          {isOwner
            ? 'How your workspace appears to teammates and on invite links.'
            : 'Workspace identity. Only the owner can edit these.'}
        </p>
      </div>

      {/* Workspace mark + name block — same shape as the Profile tab's
          avatar block so the two sections feel like family. The tile
          previews the DRAFT identity (live as the user edits) so the
          Save click feels predictable: what you see is what gets
          committed. When a logo image is uploaded, the tile renders
          that instead of initials+color. */}
      <div className="acct-avatar-block">
        {meta.logoUrl ? (
          <img
            src={meta.logoUrl}
            alt={`${meta.name} logo`}
            className="acct-avatar-large acct-avatar-large--image"
            style={{ background: colorDraft }}
          />
        ) : (
          <div
            className="acct-avatar-large"
            style={{ background: colorDraft, color: '#fff', fontSize: 17 }}
            aria-hidden="true"
          >
            {initialsDraft || meta.initials}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="Workspace name" htmlFor="acct-ws-name">
            <input
              id="acct-ws-name"
              type="text"
              className="acct-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              disabled={!isOwner}
              maxLength={60}
              placeholder="e.g. Acme Marketing"
            />
          </Field>
        </div>
      </div>

      {isOwner && (
        <>
          <div className="acct-form-grid">
            <Field label="Initials" htmlFor="acct-ws-initials">
              <input
                id="acct-ws-initials"
                type="text"
                className="acct-input"
                value={initialsDraft}
                onChange={(e) => setInitialsDraft(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                style={{ textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', width: 80 }}
                aria-label="Workspace initials (2 characters max)"
              />
            </Field>
            <Field label="Logo color">
              <div className="acct-avatar-colors" role="group" aria-label="Workspace color">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="acct-avatar-color"
                    style={{ background: c.hex }}
                    aria-label={c.label}
                    title={c.label}
                    aria-pressed={colorDraft === c.hex}
                    onClick={() => setColorDraft(c.hex)}
                  />
                ))}
              </div>
            </Field>
          </div>

          {/* Logo image uploader — separate from initials/color
              because uploading is an immediate action (not buffered
              by the modal-wide Save) and writes through to Firebase
              Storage + the workspace doc. When set, the upload
              overrides the initials+color tile rendering. Remove
              falls back to initials+color. */}
          <div style={{ marginTop: 14 }}>
            <div className="acct-eyebrow">Logo image</div>
            <WorkspaceLogoUploader hasLogo={!!meta.logoUrl} />
            <p className="acct-field-hint" style={{ marginTop: 8 }}>
              PNG, JPG, or WebP up to 5 MB. Replaces the {initialsDraft || meta.initials} tile when uploaded; remove to fall back to initials.
            </p>
          </div>
        </>
      )}

      {/* About this workspace — read-only stats. */}
      <div className="acct-section-divider">
        <div className="acct-eyebrow" style={{ marginBottom: 'var(--sp-md)' }}>
          About this workspace
        </div>
        <dl className="ws-about-grid">
          <div className="ws-about-row">
            <dt>Created</dt>
            <dd>{formatFullDateOrFallback(meta.createdAt)}</dd>
          </div>
          <div className="ws-about-row">
            <dt>Owner</dt>
            <dd>{ownerLabel}</dd>
          </div>
          <div className="ws-about-row">
            <dt>Members</dt>
            <dd>{memberCount}</dd>
          </div>
          <div className="ws-about-row">
            <dt>Clients</dt>
            <dd>{clientCount}</dd>
          </div>
          <div className="ws-about-row">
            <dt>Services</dt>
            <dd>{serviceCount}</dd>
          </div>
        </dl>
      </div>

      {/* Workspace data block — Export.
          Insurance policy. The user's about to put real client data
          in; downloads should be one click away. Members AND owners
          can both export — they already see the data in the UI, so
          gating the download adds friction without protecting
          anything new. */}
      <div className="acct-section-divider">
        <div className="acct-eyebrow" style={{ marginBottom: 'var(--sp-md)' }}>
          Workspace data
        </div>
        <ExportWorkspaceButton workspaceName={meta.name} />
      </div>

      {/* Danger zone — owner only. Currently hosts the "Clear workspace"
          action; future destructive workspace-wide actions (transfer
          ownership, delete workspace) would land here too. Hidden from
          non-owner members because the action affects every member's
          data, not just the clicker's. */}
      {isOwner && <DangerZone />}
    </section>
  );
}

/**
 * Danger-zone footer of the Workspace tab. Owner-only. Currently a
 * single action — "Clear workspace data" — that wipes clients /
 * services / tasks / contacts / notes / activity etc. Workspace
 * identity (name, logo, members, templates) survives.
 *
 * Confirms via ConfirmDangerDialog with red destructive button. The
 * confirm copy spells out the cascade and the survival list so the
 * owner knows exactly what's about to disappear.
 */
function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <div style={{ marginTop: 'var(--sp-18)', paddingTop: 'var(--sp-lg)', borderTop: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--status-fire)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Danger zone
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            border: '1px solid var(--status-fire)',
            borderRadius: 980,
            background: 'transparent',
            color: 'var(--status-fire)',
            fontSize: 'var(--fs-md)',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '-0.005em',
          }}
        >
          Clear workspace data
        </button>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', marginTop: 'var(--sp-sm)', lineHeight: 1.5 }}>
          Wipes every client, service, task, contact, note, and activity entry.
          Members, templates, and your workspace identity (name, logo) stay.
        </div>
      </div>

      {confirming && (
        <ConfirmDangerDialog
          title="Clear all workspace data?"
          body={
            <>
              Removes every client, service, kanban card, contact, quick link,
              note, touchpoint, and activity entry across the whole workspace.
              Demo-seeded teammates (the synthetic AMs + operators that come
              with "Load demo data") are also cleared.
              <br /><br />
              <strong>Survives:</strong> real workspace members + their roles,
              templates, workspace name + logo, your sign-in. This is the reset
              you'd run before walking through a fresh add-client → add-service
              flow.
              <br /><br />
              This can't be undone.
            </>
          }
          confirmLabel="Clear all data"
          onConfirm={() => {
            flizowStore.clearWorkspace();
            setConfirming(false);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}

/** One-click JSON download. Builds the export object via the store,
 *  serializes, triggers a Blob download with a sensible filename. */
/** Logo uploader block. Hidden file input + visible Upload / Replace
 *  / Remove buttons. State is local — the upload itself fires
 *  immediately on file selection, NOT through the modal-wide Save
 *  button. (Storage operations are explicit actions, like the
 *  Members tab's invite/revoke; the Save flow only buffers field
 *  edits.) */
function WorkspaceLogoUploader({ hasLogo }: { hasLogo: boolean }) {
  const { store } = useFlizow();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 5MB hard cap, matching the Storage rule. We check client-side
  // for a friendlier error than "Storage permission denied."
  const MAX_BYTES = 5 * 1024 * 1024;

  function pickFile() {
    setError(null);
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input value so picking the same file twice still
    // fires onChange (browsers skip otherwise).
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file (PNG, JPG, or WebP).');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max is 5 MB.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await store.uploadWorkspaceLogo(file);
    } catch (err) {
      // Translate Firebase Storage error codes into plain copy.
      const code = (err as { code?: string } | null)?.code ?? '';
      if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
        setError("Couldn't upload — you may not have permission, or you're signed out. Reload and try again.");
      } else if (code === 'storage/quota-exceeded') {
        setError('Storage quota exceeded. Contact support.');
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed.');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm('Remove the workspace logo? The tile will fall back to initials.')) {
      return;
    }
    setError(null);
    try {
      await store.removeWorkspaceLogo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)', alignItems: 'center' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label="Choose workspace logo image"
      />
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        style={{
          padding: '7px 14px',
          borderRadius: 8,
          border: '1px solid var(--hairline)',
          background: 'var(--bg-elev)',
          color: 'var(--text)',
          fontSize: 'var(--fs-md)',
          fontWeight: 500,
          cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          opacity: uploading ? 0.6 : 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {uploading ? 'Uploading…' : hasLogo ? 'Replace logo' : 'Upload logo'}
      </button>
      {hasLogo && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255, 59, 48, 0.4)',
            background: 'transparent',
            color: 'var(--accent)',
            fontSize: 'var(--fs-md)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Remove
        </button>
      )}
      {error && (
        <p
          role="alert"
          style={{
            flexBasis: '100%',
            margin: 0,
            fontSize: 'var(--fs-sm)',
            color: 'var(--accent)',
            lineHeight: 1.4,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function ExportWorkspaceButton({ workspaceName }: { workspaceName: string }) {
  const { store } = useFlizow();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    setExporting(true);
    try {
      const payload = store.exportWorkspace();
      if (!payload) {
        setError('No workspace loaded — nothing to export.');
        setExporting(false);
        return;
      }
      // Format the filename with a slugged workspace name + today's
      // date so multiple exports don't collide in the user's
      // Downloads folder.
      const slug = (workspaceName || 'workspace')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 40) || 'workspace';
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `flizow-${slug}-${dateStr}.json`;

      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Clean up after a tick so the download actually fires before
      // the URL becomes invalid.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="acct-btn-text"
        style={{
          padding: '7px 14px',
          borderRadius: 8,
          border: '1px solid var(--hairline)',
          background: 'var(--bg-elev)',
          color: 'var(--text)',
          fontSize: 'var(--fs-md)',
          fontWeight: 500,
          cursor: exporting ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {exporting ? 'Preparing…' : 'Export workspace as JSON'}
      </button>
      <p style={{ marginTop: 'var(--sp-sm)', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Downloads everything in this workspace — clients, services, tasks, notes, members. Excludes pending invite tokens. Use it as a backup or to migrate to a new workspace later.
      </p>
      {error && (
        <p style={{ marginTop: 'var(--sp-xs)', fontSize: 'var(--fs-sm)', color: 'var(--accent)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Inline cap editor for a Members row. Two number fields rendered
 *  side-by-side (soft / max), each commits its diff on change.
 *
 *  Empty fields commit as `undefined` — the capacity helpers fall back
 *  to DEFAULT_CAP_SOFT (6) / DEFAULT_CAP_MAX (8) when the value is
 *  missing, so leaving a field blank is the correct way to say "use
 *  the workspace default." Number values are parsed and clamped to
 *  non-negative integers (a negative cap doesn't make sense; fractional
 *  caps complicate the load-zone math without a clear use case).
 *
 *  Owner-only render — gated at the call site (the `isOwner && dataMember`
 *  check above), so this component itself doesn't repeat the
 *  authorization logic.
 */
function CapInputs({
  member,
  onChange,
}: {
  member: Member;
  onChange: (patch: Partial<Member>) => void;
}) {
  function commitCap(key: 'capSoft' | 'capMax', raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange({ [key]: undefined });
      return;
    }
    const n = Math.max(0, Math.floor(Number(trimmed)));
    if (Number.isNaN(n)) return;
    onChange({ [key]: n });
  }
  return (
    <div
      className="mbrs-caps"
      title="Daily slot caps — soft (target, badge tints amber over) / max (warn, soft warning fires over)"
    >
      <input
        type="number"
        min={0}
        className="mbrs-cap-input"
        placeholder="6"
        value={member.capSoft ?? ''}
        onChange={(e) => commitCap('capSoft', e.target.value)}
        aria-label={`${member.name} daily soft cap`}
      />
      <span className="mbrs-cap-sep" aria-hidden="true">/</span>
      <input
        type="number"
        min={0}
        className="mbrs-cap-input"
        placeholder="8"
        value={member.capMax ?? ''}
        onChange={(e) => commitCap('capMax', e.target.value)}
        aria-label={`${member.name} daily max cap`}
      />
    </div>
  );
}

/** Format an ISO timestamp into "Apr 27, 2026". Falls back to a dash
 *  on bad input so the About block never shows "Invalid Date." */
function formatFullDateOrFallback(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Tiny relative-time helper local to the Members tab — keeps the
 *  full date out of the row but still gives a sense of when. */
function formatRelativeShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Trash section ────────────────────────────────────────────────────────
//
// The recovery surface for every soft-deleted item in the workspace.
// Lives behind the "Trash" sidebar entry in the Account modal so it
// stays out of the daily nav (recovery is rare; promoting it to the
// top would over-promote it).
//
// Reads from data.trash directly. The store's restoreFromTrash() and
// purgeFromTrash() methods own the data round-trip; this component is
// pure UI.
//
// Phase 2 ships the surface against an empty data.trash. Once Phase 4
// flips every existing hard-delete to route through sendToTrash(),
// this view will start showing real entries.

/** Per-kind config for the Trash row. Drives the icon and the
 *  "Note" / "Comment" / "Client" label that sits next to the
 *  preview, plus a sort priority for breaking ties when two entries
 *  share a deletedAt (group bigger things higher so a deleted
 *  client lands above a deleted note from the same moment). */
const TRASH_KIND_META: Record<TrashKind, {
  Icon: typeof DocumentTextIcon;
  label: string;
  weight: number;
}> = {
  client:           { Icon: BuildingOffice2Icon,     label: 'Client',             weight: 1 },
  service:          { Icon: ViewColumnsIcon,         label: 'Service',            weight: 2 },
  task:             { Icon: RectangleStackIcon,      label: 'Card',               weight: 3 },
  opsTask:          { Icon: BriefcaseIcon,           label: 'Ops card',           weight: 4 },
  template:         { Icon: ClipboardDocumentIcon,   label: 'Template',           weight: 5 },
  note:             { Icon: DocumentTextIcon,        label: 'Note',               weight: 6 },
  contact:          { Icon: UserIcon,                label: 'Contact',            weight: 7 },
  touchpoint:       { Icon: CalendarDaysIcon,        label: 'Touchpoint',         weight: 8 },
  actionItem:       { Icon: CheckCircleIcon,         label: 'Action item',        weight: 9 },
  comment:          { Icon: ChatBubbleLeftIcon,      label: 'Comment',            weight: 10 },
  quickLink:        { Icon: LinkIcon,                label: 'Quick link',         weight: 11 },
  onboardingItem:   { Icon: ListBulletIcon,          label: 'Onboarding item',    weight: 12 },
  manualAgendaItem: { Icon: BellAlertIcon,           label: 'Agenda item',        weight: 13 },
};

/** Days within auto-empty when the row gets an "Expires soon" warning. */
const EXPIRY_WARNING_DAYS = 7;

/** 90-day retention mirrored from the store. Used here to compute the
 *  expiry warning + countdown. Kept as a local constant rather than
 *  imported because the store's TRASH_RETENTION_MS is private to that
 *  module — duplicating one number is cheaper than re-architecting. */
const TRASH_RETENTION_DAYS = 90;

function TrashSection() {
  const { data } = useFlizow();
  const trash = data.trash;

  const [query, setQuery] = useState('');
  // Single-row "Are you sure" gate. Tracks the entry id of the row
  // whose Delete-forever button was just clicked. The button label
  // flips to "Click again to confirm" on first press; second press
  // fires purge. Click anywhere else (or a different row's button)
  // resets it. Inline rather than a stacked dialog because the
  // action is per-row, not page-level — the typed-confirm shape is
  // saved for "Empty Trash" which IS page-level. */
  const [purgeArming, setPurgeArming] = useState<string | null>(null);
  // Empty Trash typed-confirm — same pattern as "Reset workspace".
  const [emptyPhase, setEmptyPhase] = useState<'idle' | 'confirm'>('idle');
  const [emptyInput, setEmptyInput] = useState('');

  // Filter + sort. Newest first; client/service deletes float to the
  // top of a same-day group via `weight`. Search matches on preview
  // and parent label, case-insensitive.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = trash.slice();
    if (q) {
      rows = rows.filter(e =>
        e.preview.toLowerCase().includes(q) ||
        (e.parentLabel ?? '').toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      const tDiff = b.deletedAt.localeCompare(a.deletedAt);
      if (tDiff !== 0) return tDiff;
      return TRASH_KIND_META[a.kind].weight - TRASH_KIND_META[b.kind].weight;
    });
    return rows;
  }, [trash, query]);

  // Group by date bucket so the list reads like Apple Notes /
  // Recently Deleted. Buckets in order: Today / Yesterday / This week
  // / This month / Older. Matches user mental model — "I deleted that
  // a couple days ago" lands on Yesterday or This week, not lost in a
  // flat newest-first list.
  const groups = useMemo(() => {
    const buckets: Array<{ key: string; label: string; rows: TrashEntry[] }> = [
      { key: 'today',   label: 'Today',           rows: [] },
      { key: 'yest',    label: 'Yesterday',       rows: [] },
      { key: 'week',    label: 'Earlier this week', rows: [] },
      { key: 'month',   label: 'Earlier this month', rows: [] },
      { key: 'older',   label: 'Older',           rows: [] },
    ];
    const now = Date.now();
    for (const e of filtered) {
      const t = new Date(e.deletedAt).getTime();
      const days = Math.floor((now - t) / 86_400_000);
      if (days < 1) buckets[0].rows.push(e);
      else if (days < 2) buckets[1].rows.push(e);
      else if (days < 7) buckets[2].rows.push(e);
      else if (days < 30) buckets[3].rows.push(e);
      else buckets[4].rows.push(e);
    }
    return buckets.filter(b => b.rows.length > 0);
  }, [filtered]);

  function handleRestore(entryId: string) {
    flizowStore.restoreFromTrash(entryId);
    // No toast/alert on success — the row visibly disappears, which
    // is feedback enough. If the entry was already gone we silently
    // no-op (concurrent purge from another tab).
  }

  function handlePurgeArm(entryId: string) {
    setPurgeArming(entryId);
  }

  function handlePurgeConfirm(entryId: string) {
    flizowStore.purgeFromTrash(entryId);
    setPurgeArming(null);
  }

  function handleEmptyTrash() {
    flizowStore.emptyTrash();
    setEmptyPhase('idle');
    setEmptyInput('');
  }

  // Click-anywhere-else cancels an armed purge so the "Click again"
  // state doesn't linger past intent. Effects-driven so the listener
  // is added/removed in lockstep with armed state.
  useEffect(() => {
    if (!purgeArming) return;
    function clear(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Don't cancel when clicking the same row's purge button —
      // that's the second-click path that actually fires the purge.
      if (target.closest('[data-trash-purge-armed="true"]')) return;
      setPurgeArming(null);
    }
    // Capture phase so we always run before the row's onClick.
    document.addEventListener('mousedown', clear, true);
    return () => document.removeEventListener('mousedown', clear, true);
  }, [purgeArming]);

  return (
    <section
      className="acct-section"
      role="tabpanel"
      id="acct-panel-trash"
      aria-labelledby="acct-tab-trash"
      tabIndex={0}
      data-active="true"
    >
      <div className="acct-section-header">
        <h3 className="acct-section-title">Trash</h3>
        <p className="acct-section-sub">
          Items deleted in the last {TRASH_RETENTION_DAYS} days. After that they're permanently removed.
        </p>
      </div>

      <div className="trash-toolbar">
        <label className="trash-search">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            type="search"
            placeholder="Search trash"
            aria-label="Search trash"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={trash.length === 0}
          />
        </label>
        {trash.length > 0 && emptyPhase === 'idle' && (
          <button
            type="button"
            className="acct-btn-outline acct-btn-outline--danger"
            onClick={() => setEmptyPhase('confirm')}
          >
            Empty Trash
          </button>
        )}
      </div>

      {emptyPhase === 'confirm' && (
        <div className="trash-empty-confirm">
          <div className="trash-empty-confirm-prompt">
            This permanently deletes all {trash.length} item{trash.length === 1 ? '' : 's'} in your Trash. Type <strong>empty</strong> to confirm.
          </div>
          <div className="trash-empty-confirm-actions">
            <input
              type="text"
              className="acct-input acct-reset-input"
              value={emptyInput}
              onChange={(e) => setEmptyInput(e.target.value)}
              placeholder="Type empty to confirm"
              autoFocus
            />
            <button
              type="button"
              className="acct-btn-solid acct-btn-solid--danger"
              onClick={handleEmptyTrash}
              disabled={emptyInput.trim().toLowerCase() !== 'empty'}
            >
              Empty Trash
            </button>
            <button
              type="button"
              className="acct-btn-text"
              onClick={() => { setEmptyPhase('idle'); setEmptyInput(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {trash.length === 0 ? (
        <div className="trash-empty" role="status">
          <TrashIcon aria-hidden="true" className="trash-empty-icon" />
          <div className="trash-empty-title">Your Trash is empty</div>
          <div className="trash-empty-sub">
            Deleted items show up here for {TRASH_RETENTION_DAYS} days before they're permanently removed.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="trash-empty" role="status">
          <div className="trash-empty-title">No matches</div>
          <div className="trash-empty-sub">No trashed items match "{query}".</div>
        </div>
      ) : (
        <div className="trash-list">
          {groups.map(group => (
            <div key={group.key} className="trash-group">
              <div className="trash-group-label">
                {group.label}
                <span className="trash-group-count">{group.rows.length}</span>
              </div>
              {group.rows.map(entry => (
                <TrashRow
                  key={entry.id}
                  entry={entry}
                  purgeArmed={purgeArming === entry.id}
                  onRestore={() => handleRestore(entry.id)}
                  onPurgeArm={() => handlePurgeArm(entry.id)}
                  onPurgeConfirm={() => handlePurgeConfirm(entry.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TrashRow({
  entry,
  purgeArmed,
  onRestore,
  onPurgeArm,
  onPurgeConfirm,
}: {
  entry: TrashEntry;
  purgeArmed: boolean;
  onRestore: () => void;
  onPurgeArm: () => void;
  onPurgeConfirm: () => void;
}) {
  const { Icon, label } = TRASH_KIND_META[entry.kind];
  const deletedAgo = formatRelativeShort(entry.deletedAt);

  // Days remaining until auto-empty. When ≤ EXPIRY_WARNING_DAYS the row
  // shows a warning badge so the user notices before it's gone.
  const daysRemaining = (() => {
    const t = new Date(entry.deletedAt).getTime();
    if (isNaN(t)) return null;
    const ageDays = (Date.now() - t) / 86_400_000;
    return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - ageDays));
  })();
  const expiringSoon = daysRemaining !== null && daysRemaining <= EXPIRY_WARNING_DAYS;

  // Cascade size hint for client/service deletes — surfaces "8 cards,
  // 12 notes" so the user sees what they'd be restoring before they
  // click. Pulled from the payload's child arrays.
  const cascadeHint = (() => {
    if (entry.payload.kind === 'client') {
      const c = entry.payload.cascade;
      const parts: string[] = [];
      if (c.services.length) parts.push(`${c.services.length} ${c.services.length === 1 ? 'service' : 'services'}`);
      if (c.tasks.length) parts.push(`${c.tasks.length} ${c.tasks.length === 1 ? 'card' : 'cards'}`);
      if (c.notes.length) parts.push(`${c.notes.length} ${c.notes.length === 1 ? 'note' : 'notes'}`);
      if (c.contacts.length) parts.push(`${c.contacts.length} ${c.contacts.length === 1 ? 'contact' : 'contacts'}`);
      return parts.length > 0 ? parts.join(', ') : null;
    }
    if (entry.payload.kind === 'service') {
      const tasks = entry.payload.tasks.length;
      if (tasks) return `${tasks} ${tasks === 1 ? 'card' : 'cards'}`;
    }
    return null;
  })();

  return (
    <div className="trash-row">
      <div className="trash-row-icon">
        <Icon aria-hidden="true" />
      </div>
      <div className="trash-row-body">
        <div className="trash-row-title">
          <span className="trash-row-preview">{entry.preview || '(untitled)'}</span>
          {entry.parentLabel && (
            <span className="trash-row-parent">— {entry.parentLabel}</span>
          )}
        </div>
        <div className="trash-row-meta">
          <span className="trash-row-kind">{label}</span>
          <span className="trash-row-sep">·</span>
          <span>deleted {deletedAgo}</span>
          {cascadeHint && (
            <>
              <span className="trash-row-sep">·</span>
              <span>{cascadeHint}</span>
            </>
          )}
          {expiringSoon && daysRemaining !== null && (
            <>
              <span className="trash-row-sep">·</span>
              <span className="trash-row-expiring">
                Expires in {daysRemaining}d
              </span>
            </>
          )}
        </div>
      </div>
      <div className="trash-row-actions">
        <button
          type="button"
          className="trash-row-action"
          onClick={onRestore}
          aria-label={`Restore ${entry.preview || label}`}
          title={`Restore ${entry.preview || label}`}
        >
          <ArrowUturnLeftIcon aria-hidden="true" />
          Restore
        </button>
        <button
          type="button"
          className={`trash-row-action trash-row-action--danger${purgeArmed ? ' is-armed' : ''}`}
          onClick={purgeArmed ? onPurgeConfirm : onPurgeArm}
          data-trash-purge-armed={purgeArmed ? 'true' : undefined}
          aria-label={purgeArmed ? `Confirm permanent delete of ${entry.preview || label}` : `Delete ${entry.preview || label} forever`}
          title={purgeArmed ? 'Click again to confirm permanent delete' : 'Delete forever'}
        >
          <TrashIcon aria-hidden="true" />
          {purgeArmed ? 'Click again' : 'Delete forever'}
        </button>
      </div>
    </div>
  );
}
