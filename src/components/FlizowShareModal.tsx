import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, PlusIcon, ShareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useFlizow } from '../store/useFlizow';
import { useAuth } from '../contexts/AuthContext';
import type { Member } from '../types/flizow';
import { useModalAutofocus } from '../hooks/useModalAutofocus';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { avatarStyle } from '../utils/avatar';

/**
 * FlizowShareModal — "Share card" dialog launched from the card detail
 * modal's title-bar share button. Lets the current user invite people by
 * email, tweak their permissions (view / comment / edit / remove), flip
 * the card's general access (restricted vs. anyone-with-link), and copy
 * a deep-link to this card.
 *
 * First-pass scope:
 *   • Email invite with role picker (default "Can edit")
 *   • Optional message field (hidden by default)
 *   • People list = Owner (current user) + existing task assignees + any
 *     invited people from this session. Roles are kept in local state —
 *     persistence to the store lands in the next pass when we formalise
 *     the sharing model.
 *   • General access row with floating "Restricted / Anyone with link"
 *     picker. Same local-state caveat.
 *   • Copy link with navigator.clipboard + textarea fallback. Reuses the
 *     same `#board/{svcId}/card/{cardId}` format the More menu already
 *     emits, so any link copied from either surface round-trips into the
 *     BoardPage auto-open effect.
 *
 * Out of scope for this pass:
 *   • Persisting per-card permissions to the store / Firestore
 *   • Sending the message (the textarea just collects text for now)
 *   • Actual email dispatch — we show "Invited <email>" feedback only
 *   • Audit trail of who shared with whom
 *
 * Styling: all `.share-*`, `.members-*`, `.avatar-color-N` classes are
 * already defined in src/styles/flizow.css (lines 4424+ and 5304+), so
 * this component writes no inline styles beyond the floating menu's
 * dynamic top/left.
 */

// ── Types ────────────────────────────────────────────────────────────────

type RoleId = 'view' | 'comment' | 'edit';
type AccessId = 'restricted' | 'link';
type MenuKind = { kind: 'invite' } | { kind: 'member'; id: string } | { kind: 'access' };

interface InvitedPerson {
  id: string;
  email: string;
  name: string;
  initials: string;
  /** 1..6 — which `.avatar-color-N` gradient to use */
  colorIdx: number;
  role: RoleId;
}

interface Role {
  id: RoleId;
  label: string;
  desc: string;
  /** SVG <path>/<circle> children as a fragment. */
  icon: React.ReactNode;
}

interface AccessMode {
  id: AccessId;
  title: string;
  sub: string;
  icon: React.ReactNode;
}

// ── Role + access definitions ────────────────────────────────────────────

const ROLES: Role[] = [
  {
    id: 'view',
    label: 'Can view',
    desc: 'Read only',
    icon: (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    id: 'comment',
    label: 'Can comment',
    desc: 'Read and add comments',
    icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  },
  {
    id: 'edit',
    label: 'Can edit',
    desc: 'Full editing access',
    icon: (
      <>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </>
    ),
  },
];

const ACCESS_MODES: AccessMode[] = [
  {
    id: 'restricted',
    title: 'Restricted',
    sub: 'Only invited people can access',
    icon: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
  },
  {
    id: 'link',
    title: 'Anyone with link',
    sub: 'Anyone with the link can access',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </>
    ),
  },
];

function roleById(id: RoleId): Role {
  return ROLES.find(r => r.id === id) ?? ROLES[2];
}

function accessById(id: AccessId): AccessMode {
  return ACCESS_MODES.find(a => a.id === id) ?? ACCESS_MODES[0];
}

// ── Helpers ──────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(v: string): boolean {
  return EMAIL_RE.test((v ?? '').trim());
}

/** Deterministic 1..6 mapping so the same email always gets the same
 *  gradient — users see a stable avatar colour even if the row rebuilds. */
function colorIndexFor(email: string): number {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash * 31) + email.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 6) + 1;
}

function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] || email;
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function initialsFrom(name: string): string {
  const matches = name.match(/\b\w/g) ?? ['?'];
  return matches.slice(0, 2).join('').toUpperCase();
}

// ── Component ────────────────────────────────────────────────────────────

interface Props {
  taskId: string;
  onClose: () => void;
}

export default function FlizowShareModal({ taskId, onClose }: Props) {
  const { data, store } = useFlizow();
  const { user: authUser } = useAuth();
  const task = data.tasks.find(t => t.id === taskId);
  const service = task ? data.services.find(s => s.id === task.serviceId) : null;
  const client = task ? data.clients.find(c => c.id === task.clientId) : null;

  const currentMemberId = store.getCurrentMemberId();
  const currentMember = currentMemberId
    ? data.members.find(m => m.id === currentMemberId) ?? null
    : null;

  // ── State ──────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleId>('edit');
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [access, setAccess] = useState<AccessId>('restricted');
  /** Invited-in-this-session people. First-pass ephemera — the store
   *  doesn't persist sharing yet. */
  const [invited, setInvited] = useState<InvitedPerson[]>([]);
  /** Roles for the pre-seeded board members (task assignees). Keyed by
   *  Member id. Defaults to 'edit' for every assignee. */
  const [memberRoles, setMemberRoles] = useState<Record<string, RoleId>>({});
  /** Which row / button currently has the floating role menu open. Null
   *  means nothing open. */
  const [activeMenu, setActiveMenu] = useState<MenuKind | null>(null);
  /** Pixel position of the floating menu's top-left corner. */
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  /** Momentary "Copied" confirmation on the link copy button. */
  const [copied, setCopied] = useState(false);

  // Anchor refs — we read bounding rects from these when opening a menu.
  const inviteRoleBtnRef = useRef<HTMLButtonElement | null>(null);
  const accessRowRef = useRef<HTMLDivElement | null>(null);
  /** Map of member row anchors, keyed by member id. Used when opening
   *  the per-row role menu. */
  const memberBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  /** Modal root — the focus trap reads from this. Audit: share HIGH
   *  (Tab could escape), MED (no focus return). useModalFocusTrap
   *  handles both: traps Tab while mounted, restores focus to the
   *  share button on unmount. */
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  useModalFocusTrap(modalRootRef);

  // Seed member roles: every task assignee starts at 'edit' (matches the
  // mockup's default). We keep the owner out of this map — they're
  // rendered as a non-editable "Owner" pill.
  useEffect(() => {
    if (!task) return;
    const assigneeIds = task.assigneeIds && task.assigneeIds.length
      ? task.assigneeIds
      : (task.assigneeId ? [task.assigneeId] : []);
    setMemberRoles(prev => {
      const next: Record<string, RoleId> = {};
      for (const id of assigneeIds) {
        if (id === currentMemberId) continue; // owner rendered separately
        next[id] = prev[id] ?? 'edit';
      }
      return next;
    });
  }, [task, currentMemberId]);

  // Autofocus the email input on mount. Shared hook handles the 80ms
  // wait-for-backdrop-paint delay; keydown stays hand-rolled below
  // because this modal's Escape semantics are nested (close menu first,
  // then close modal) and don't fit the plain useModalKeyboard shape.
  useModalAutofocus(emailInputRef);

  // Keyboard handling — capture phase so we run before FlizowCardModal's
  // listener. Escape closes the menu first if one's open, otherwise the
  // whole modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (activeMenu) {
          setActiveMenu(null);
          setMenuPos(null);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [activeMenu, onClose]);

  // Outside-click for the floating menu. The modal overlay handles its
  // own outside-click via onClick={onClose}; the menu needs its own
  // listener because it renders at the document root (position: fixed)
  // and clicks inside the .share-modal should close the menu without
  // closing the modal.
  useEffect(() => {
    if (!activeMenu) return;
    // Capture the narrowed value so the inner closure doesn't have to
    // re-check nullability on every click (and so the discriminated
    // union narrows cleanly inside `onDown`).
    const menu = activeMenu;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      // Clicking the trigger that opened this menu is fine — the button's
      // onClick handler will toggle it. We let that run naturally.
      if (menu.kind === 'invite' && inviteRoleBtnRef.current?.contains(t)) return;
      if (menu.kind === 'access' && accessRowRef.current?.contains(t)) return;
      if (menu.kind === 'member') {
        const btn = memberBtnRefs.current.get(menu.id);
        if (btn?.contains(t)) return;
      }
      setActiveMenu(null);
      setMenuPos(null);
    }
    // Defer one tick so the click that opened the menu doesn't close it.
    const h = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      window.clearTimeout(h);
      document.removeEventListener('mousedown', onDown);
    };
  }, [activeMenu]);

  // ── Derived ────────────────────────────────────────────────────────
  const shareLink = useMemo(() => {
    if (!task) return '';
    const base = window.location.href.split('#')[0];
    return `${base}#board/${task.serviceId}/card/${task.id}`;
  }, [task]);

  const statusLabel = useMemo(() => {
    if (!task) return '';
    // Quick column-id → label map that matches FlizowCardModal.
    switch (task.columnId) {
      case 'todo': return 'To Do';
      case 'inprogress': return 'In Progress';
      case 'blocked': return 'Blocked';
      case 'review': return 'Review';
      case 'done': return 'Done';
      default: return '';
    }
  }, [task]);

  const assigneeMembers: Member[] = useMemo(() => {
    if (!task) return [];
    const ids = task.assigneeIds && task.assigneeIds.length
      ? task.assigneeIds
      : (task.assigneeId ? [task.assigneeId] : []);
    return ids
      .filter(id => id !== currentMemberId)
      .map(id => data.members.find(m => m.id === id))
      .filter((m): m is Member => !!m);
  }, [task, data.members, currentMemberId]);

  // ── Menu positioning ──────────────────────────────────────────────
  // Anchor the floating menu after it paints so we can measure it. Same
  // pattern as Analytics filter pills.
  useLayoutEffect(() => {
    if (!activeMenu || !menuRef.current) {
      return;
    }
    let anchor: HTMLElement | null = null;
    if (activeMenu.kind === 'invite') anchor = inviteRoleBtnRef.current;
    else if (activeMenu.kind === 'access') anchor = accessRowRef.current;
    else if (activeMenu.kind === 'member') anchor = memberBtnRefs.current.get(activeMenu.id) ?? null;
    if (!anchor) return;

    const r = anchor.getBoundingClientRect();
    const mw = menuRef.current.offsetWidth || 220;
    const mh = menuRef.current.offsetHeight || 160;
    let top = r.bottom + 6;
    let left = r.right - mw;
    if (top + mh > window.innerHeight - 12) {
      top = Math.max(12, r.top - mh - 6);
    }
    if (left < 12) left = 12;
    if (left + mw > window.innerWidth - 12) left = window.innerWidth - 12 - mw;
    setMenuPos({ top, left });
  }, [activeMenu]);

  // Guard: task vanished (deleted from another surface mid-share).
  if (!task) {
    // Auto-close the next frame. Same pattern as FlizowCardModal.
    return <ShareMissingAutoClose onClose={onClose} />;
  }

  // ── Handlers ──────────────────────────────────────────────────────
  function handleInvite() {
    const v = email.trim();
    if (!isValidEmail(v)) return;
    // Skip duplicates (same email → update role instead of appending).
    const existingIdx = invited.findIndex(p => p.email.toLowerCase() === v.toLowerCase());
    if (existingIdx >= 0) {
      setInvited(prev => prev.map((p, i) => i === existingIdx ? { ...p, role: inviteRole } : p));
    } else {
      const name = deriveNameFromEmail(v);
      const person: InvitedPerson = {
        id: `invited-${Math.random().toString(36).slice(2, 9)}`,
        email: v,
        name,
        initials: initialsFrom(name),
        colorIdx: colorIndexFor(v),
        role: inviteRole,
      };
      setInvited(prev => [...prev, person]);
    }
    setEmail('');
    // Keep focus on the email input so the user can keep adding people.
    emailInputRef.current?.focus();
  }

  function toggleMessage() {
    setMessageOpen(v => !v);
  }

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        // Fallback for environments without the async clipboard API
        // (older Safari, non-HTTPS dev). Same textarea dance the mockup
        // uses — invisible element, select, execCommand, remove.
        const ta = document.createElement('textarea');
        ta.value = shareLink;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Silent — the button stays enabled so the user can retry.
    }
  }

  function openInviteRoleMenu(e: React.MouseEvent) {
    e.stopPropagation();
    setActiveMenu({ kind: 'invite' });
  }

  function openMemberRoleMenu(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setActiveMenu({ kind: 'member', id });
  }

  function openAccessMenu(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    setActiveMenu({ kind: 'access' });
  }

  function pickInviteRole(id: RoleId) {
    setInviteRole(id);
    setActiveMenu(null);
    setMenuPos(null);
  }

  function pickMemberRole(memberId: string, id: RoleId | 'remove') {
    if (id === 'remove') {
      // Two sources of members: task assignees (memberRoles map) and
      // invited people (invited array). An id hit on either one means
      // remove from that source.
      setMemberRoles(prev => {
        if (!(memberId in prev)) return prev;
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      setInvited(prev => prev.filter(p => p.id !== memberId));
    } else if (memberId.startsWith('invited-')) {
      setInvited(prev => prev.map(p => p.id === memberId ? { ...p, role: id } : p));
    } else {
      setMemberRoles(prev => ({ ...prev, [memberId]: id }));
    }
    setActiveMenu(null);
    setMenuPos(null);
  }

  function pickAccess(id: AccessId) {
    setAccess(id);
    setActiveMenu(null);
    setMenuPos(null);
  }

  // ── Render helpers ────────────────────────────────────────────────
  const validEmail = isValidEmail(email);
  const rowInvalid = email.length > 0 && !validEmail;
  const currentRole = roleById(inviteRole);
  const currentAccess = accessById(access);

  /** Owner row. The current user never changes roles and can't be
   *  removed — renders as a static "Owner" pill. Falls back to the
   *  task's first assignee if we don't have an auth user (e.g. signed
   *  out in a local-only dev build). */
  function renderOwnerRow() {
    const name = currentMember?.name ?? authUser?.displayName ?? 'You';
    const initials = currentMember?.initials ?? initialsFrom(name);
    const sub = authUser?.email ?? currentMember?.role ?? '';
    const ownerAvatarStyle = currentMember ? avatarStyle(currentMember) : undefined;
    return (
      <div className="members-row" data-owner="true">
        <div
          className="members-avatar"
          style={ownerAvatarStyle}
        >
          {initials}
        </div>
        <div className="members-identity">
          <div className="members-name">
            {name}
            <span className="members-you-tag">You</span>
          </div>
          {sub ? <div className="members-sub">{sub}</div> : null}
        </div>
        <span className="share-role-static">Owner</span>
      </div>
    );
  }

  function renderMemberRow(m: Member) {
    const role = memberRoles[m.id] ?? 'edit';
    return (
      <div key={m.id} className="members-row" data-member-id={m.id} data-role={role}>
        <div className="members-avatar" style={avatarStyle(m)}>{m.initials}</div>
        <div className="members-identity">
          <div className="members-name">{m.name}</div>
          {m.role ? <div className="members-sub">{m.role}</div> : null}
        </div>
        <button
          ref={(el) => {
            if (el) memberBtnRefs.current.set(m.id, el);
            else memberBtnRefs.current.delete(m.id);
          }}
          type="button"
          className="members-role-pill"
          onClick={(e) => openMemberRoleMenu(e, m.id)}
          aria-haspopup="menu"
          aria-expanded={activeMenu?.kind === 'member' && activeMenu.id === m.id}
        >
          <span className="role-label">{roleById(role).label}</span>
          <ChevronDownIcon aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderInvitedRow(p: InvitedPerson) {
    return (
      <div key={p.id} className="members-row" data-member-id={p.id} data-role={p.role}>
        <div className={`members-avatar avatar-color-${p.colorIdx}`}>{p.initials}</div>
        <div className="members-identity">
          <div className="members-name">{p.name}</div>
          <div className="members-sub">{p.email}</div>
        </div>
        <button
          ref={(el) => {
            if (el) memberBtnRefs.current.set(p.id, el);
            else memberBtnRefs.current.delete(p.id);
          }}
          type="button"
          className="members-role-pill"
          onClick={(e) => openMemberRoleMenu(e, p.id)}
          aria-haspopup="menu"
          aria-expanded={activeMenu?.kind === 'member' && activeMenu.id === p.id}
        >
          <span className="role-label">{roleById(p.role).label}</span>
          <ChevronDownIcon aria-hidden="true" />
        </button>
      </div>
    );
  }

  // ── Floating menu payload ──────────────────────────────────────────
  let menuContent: React.ReactNode = null;
  if (activeMenu) {
    if (activeMenu.kind === 'invite') {
      menuContent = (
        <RoleMenu
          current={inviteRole}
          includeRemove={false}
          onPick={(id) => pickInviteRole(id as RoleId)}
        />
      );
    } else if (activeMenu.kind === 'member') {
      // Resolve current role from either source (board member or invited).
      const existing = invited.find(p => p.id === activeMenu.id);
      const role = existing ? existing.role : (memberRoles[activeMenu.id] ?? 'edit');
      menuContent = (
        <RoleMenu
          current={role}
          includeRemove={true}
          onPick={(id) => pickMemberRole(activeMenu.id, id)}
        />
      );
    } else if (activeMenu.kind === 'access') {
      menuContent = (
        <AccessMenu
          current={access}
          onPick={(id) => pickAccess(id)}
        />
      );
    }
  }

  return (
    <div
      className="share-overlay open"
      role="dialog"
      aria-labelledby="shareTitle"
      aria-modal="true"
      onClick={onClose}
    >
      <div ref={modalRootRef} className="share-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="share-header">
          <div className="share-title" id="shareTitle">
            <ShareIcon width={18} height={18} aria-hidden="true" />
            Share card
          </div>
          <button
            type="button"
            className="share-close"
            onClick={onClose}
            aria-label="Close (Esc)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Honest-copy banner. The first-pass scope (see top of file)
            doesn't actually send invites or change permissions — it
            just shapes the local UI. Without telling the user that,
            clicking "Invite" looks like a real send and flipping
            "Anyone with link" looks like a real permission change.
            Both are lies of omission. Banner stays until we ship the
            real sharing wiring. Audit: share HIGH ×2 (invite-not-sent
            + access-toggle-fake). */}
        <div className="share-preview-banner" role="note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            Preview only — invites and link permissions don't send or
            persist yet. Real sharing wires up next.
          </span>
        </div>

        {/* ── Context chip ───────────────────────────────────────── */}
        <div className="share-context" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
          </svg>
          <span>
            <span className="share-context-title">{task.title || 'Untitled card'}</span>
            {(client || service || statusLabel) && <span className="share-context-sep"> · </span>}
            <span>
              {[client?.name, service?.name, statusLabel].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>

        {/* ── Invite people ──────────────────────────────────────── */}
        <div className="share-section">
          <div className="share-section-label">Invite people</div>
          <div className={`share-invite-row${rowInvalid ? ' invalid' : ''}`}>
            <input
              ref={emailInputRef}
              type="email"
              className="share-email-input"
              placeholder="Email address"
              aria-label="Email address"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (validEmail) handleInvite();
                }
              }}
            />
            <button
              ref={inviteRoleBtnRef}
              type="button"
              className="share-role-select"
              onClick={openInviteRoleMenu}
              aria-haspopup="menu"
              aria-expanded={activeMenu?.kind === 'invite'}
              aria-label="Choose invite role"
            >
              <span>{currentRole.label}</span>
              <ChevronDownIcon aria-hidden="true" />
            </button>
          </div>

          {messageOpen && (
            <textarea
              className="share-message"
              placeholder="Add a message (optional)"
              aria-label="Optional message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          )}

          <div className="share-invite-footer">
            <button
              type="button"
              className="share-message-toggle"
              onClick={toggleMessage}
              aria-expanded={messageOpen}
            >
              {messageOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              ) : (
                <PlusIcon aria-hidden="true" />
              )}
              <span>{messageOpen ? 'Hide message' : 'Add a message'}</span>
            </button>
            <button
              type="button"
              className="share-invite-btn"
              onClick={handleInvite}
              disabled={!validEmail}
            >
              Invite
            </button>
          </div>
        </div>

        {/* ── People with access ─────────────────────────────────── */}
        <div className="share-section">
          <div className="share-section-label">People with access</div>
          <div className="share-people-list">
            {renderOwnerRow()}
            {assigneeMembers
              .filter(m => m.id in memberRoles)
              .map(renderMemberRow)}
            {invited.map(renderInvitedRow)}
          </div>
        </div>

        {/* ── General access ─────────────────────────────────────── */}
        <div className="share-section">
          <div className="share-section-label">General access</div>
          <div
            ref={accessRowRef}
            className={`share-access-row${access === 'link' ? ' public' : ''}`}
            onClick={openAccessMenu}
            role="button"
            tabIndex={0}
            aria-haspopup="menu"
            aria-expanded={activeMenu?.kind === 'access'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openAccessMenu(e);
              }
            }}
          >
            <div className="share-access-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {currentAccess.icon}
              </svg>
            </div>
            <div className="share-access-text">
              <div className="share-access-title">{currentAccess.title}</div>
              <div className="share-access-sub">{currentAccess.sub}</div>
            </div>
            <div className="share-access-chevron" aria-hidden="true">
              <ChevronDownIcon aria-hidden="true" />
            </div>
          </div>

          <div className="share-link-bar">
            <input
              type="text"
              className="share-link-text"
              readOnly
              aria-label="Shareable link"
              value={shareLink}
              // Click/focus selects the whole URL so the user can ⌘C
              // immediately. The whole point of this field is to copy
              // — making them triple-click is friction.
              // Audit: share MED.
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className={`share-link-copy${copied ? ' copied' : ''}`}
              onClick={handleCopy}
              aria-label="Copy link"
            >
              {copied ? (
                <CheckIcon aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating role / access menu ───────────────────────────── */}
      {activeMenu && menuPos && (
        <div
          ref={menuRef}
          className="share-role-menu open"
          style={{ top: menuPos.top, left: menuPos.left }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {menuContent}
        </div>
      )}
      {/* Pre-mount the menu (without .open + without pos) so
          useLayoutEffect has a real DOM node to measure. We mount it
          invisibly on the first pass, then position + reveal on the
          second. This avoids the "can't measure an unmounted element"
          issue without resorting to portals. */}
      {activeMenu && !menuPos && (
        <div
          ref={menuRef}
          className="share-role-menu open"
          style={{ top: -9999, left: -9999, visibility: 'hidden' }}
          role="menu"
          aria-hidden="true"
        >
          {menuContent}
        </div>
      )}
    </div>
  );
}

// ── Role picker menu (view / comment / edit [+ Remove]) ─────────────────
function RoleMenu({
  current,
  includeRemove,
  onPick,
}: {
  current: RoleId;
  includeRemove: boolean;
  onPick: (id: RoleId | 'remove') => void;
}) {
  return (
    <>
      {ROLES.map(r => {
        const isActive = r.id === current;
        return (
          <div
            key={r.id}
            className="share-role-item"
            role="menuitem"
            tabIndex={0}
            onClick={() => onPick(r.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(r.id);
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {r.icon}
            </svg>
            <div className="share-role-item-body">
              <div className="share-role-item-title">
                {r.label}
                {isActive && (
                  <span className="share-role-item-check">
                    <CheckIcon aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="share-role-item-desc">{r.desc}</div>
            </div>
          </div>
        );
      })}
      {includeRemove && (
        <>
          <div className="share-role-item-divider" />
          <div
            className="share-role-item danger"
            role="menuitem"
            tabIndex={0}
            onClick={() => onPick('remove')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick('remove');
              }
            }}
          >
            <TrashIcon aria-hidden="true" />
            <div className="share-role-item-body">
              <div className="share-role-item-title">Remove access</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Access mode menu (restricted / link) ────────────────────────────────
function AccessMenu({
  current,
  onPick,
}: {
  current: AccessId;
  onPick: (id: AccessId) => void;
}) {
  return (
    <>
      {ACCESS_MODES.map(a => {
        const isActive = a.id === current;
        return (
          <div
            key={a.id}
            className="share-role-item"
            role="menuitem"
            tabIndex={0}
            onClick={() => onPick(a.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(a.id);
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {a.icon}
            </svg>
            <div className="share-role-item-body">
              <div className="share-role-item-title">
                {a.title}
                {isActive && (
                  <span className="share-role-item-check">
                    <CheckIcon aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="share-role-item-desc">{a.sub}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Missing-task auto close ─────────────────────────────────────────────
function ShareMissingAutoClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 0);
    return () => window.clearTimeout(t);
  }, [onClose]);
  return null;
}
