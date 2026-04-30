import { useEffect, useRef, useState } from 'react';
import { ChevronRightIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { useRoute } from '../router';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
import FlizowNotificationsPanel from './FlizowNotificationsPanel';
import type { AccessRole } from '../types/flizow';
import { can, ACCESS_ROLE_LABEL, type Action } from '../utils/access';

// Which nav item should be visually active for each route.
// Sub-routes (e.g. `client-detail`, `board`) inherit their parent's active state.
const ACTIVE_NAV_BY_ROUTE: Record<string, string> = {
  overview: 'overview',
  clients: 'clients',
  'client-detail': 'clients',
  board: 'clients',
  ops: 'ops',
  analytics: 'analytics',
  wip: 'wip',
  // Templates is now a first-class nav slot (was a right-toolbar
  // icon only). Audit: top-nav MED — Templates was the only major
  // surface without a peer nav entry. The detail route inherits.
  templates: 'templates',
  'template-detail': 'templates',
};

interface TopNavProps {
  /** Fires when the "Account settings" menu item is picked; parent renders
   *  the modal. The avatar itself no longer opens the modal directly — it
   *  opens a small popover that then routes to settings or sign-out. */
  onOpenAccount?: () => void;
  /** Notifications panel is owned by TopNav (needs `.notif-wrap` as the
   *  positioning anchor), but state is lifted to the parent so other
   *  screens could drive it later (e.g. toast → "View in panel"). */
  notifOpen?: boolean;
  onToggleNotifications?: () => void;
  onCloseNotifications?: () => void;
  /** Reserved for the ⌘K command palette (wires in the next pass). */
  onOpenCmdk?: () => void;
}

export function TopNav({
  onOpenAccount,
  notifOpen = false,
  onToggleNotifications,
  onCloseNotifications,
  onOpenCmdk,
}: TopNavProps = {}) {
  const route = useRoute();
  const active = ACTIVE_NAV_BY_ROUTE[route.name] ?? '';
  const { user, logout } = useAuth();
  const { data } = useFlizow();
  // Pull the signed-in user's Member record once. Every chrome
  // detail that personalises (display name, initials, avatar color,
  // access pill) reads from here so they stay in sync — when the
  // user edits their name in Profile, the top-nav reacts the same
  // moment the popover does.
  const ownMember = user?.uid ? data.members.find((m) => m.id === user.uid) : undefined;
  // Prefer the persisted Member.name (user-edited) over Firebase's
  // displayName (read-only Google value). Falls back to the email
  // local-part when neither is set, then to "Signed in" for the
  // dev-bypass path.
  const displayName =
    ownMember?.name || user?.displayName || user?.email?.split('@')[0] || 'Signed in';
  const email = user?.email || '';
  // Initials follow the same precedence: persisted Member.initials
  // (refreshed on name save), then derived from displayName.
  const initials = ownMember?.initials || deriveInitials(displayName);
  // Avatar color picker in Profile writes to Member.color. Top-nav
  // avatar + popover avatar both read here so they reflect the
  // user's choice. Falls back to the brand indigo for the dev-bypass
  // path where there's no Member record.
  const avatarColor = ownMember?.color || '#5e5ce6';
  const ownAccessLevel: AccessRole | undefined = ownMember?.accessLevel;
  // Drive nav-link visibility off the role. Each entry is rendered
  // only when `can(role, action)` says yes — so Member sees Home /
  // Clients / Analytics by default and the rest stay hidden until
  // they're promoted. The label-and-action pairing keeps the gate
  // co-located with the link rather than scattered through JSX.
  const NAV_ITEMS: ReadonlyArray<{
    href: string;
    label: string;
    activeKey: string;
    action: Action;
  }> = [
    { href: '#overview',    label: 'Home',       activeKey: 'overview',  action: 'view:home' },
    { href: '#clients',     label: 'Clients',    activeKey: 'clients',   action: 'view:clients' },
    { href: '#ops',         label: 'Ops',        activeKey: 'ops',       action: 'view:ops' },
    { href: '#analytics',   label: 'Analytics',  activeKey: 'analytics', action: 'view:analytics' },
    { href: '#wip/agenda',  label: 'Weekly WIP', activeKey: 'wip',       action: 'view:wip' },
    { href: '#templates',   label: 'Templates',  activeKey: 'templates', action: 'view:templates' },
  ];
  const visibleNav = NAV_ITEMS.filter((item) => can(ownAccessLevel, item.action));
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Avatar popover menu. Local state — nobody else needs to drive it.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape. Mousedown (not click) so the handler
  // fires before any inner button's click, which keeps the toggle snappy.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuWrapRef.current) return;
      if (!menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleAccountSettings = () => {
    setMenuOpen(false);
    onOpenAccount?.();
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    try {
      await logout();
    } catch {
      // Firebase surfaces its own toast on failure; swallow here so the
      // menu stays closed either way.
    }
  };

  // Theme toggle in the avatar menu — quick-action for switching
  // light/dark without opening Account → Preferences. Reads from
  // data.theme so the icon reflects the live state and toggles
  // optimistically through store.setTheme. Doesn't close the menu
  // (people often toggle and want to see the result inline).
  const isDark = data.theme === 'dark';
  const handleToggleTheme = () => {
    flizowStore.setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <div className="header">
      <div className="header-left">
        {/* Brand mark + wordmark. The PNG ships from public/ and gets
            prefixed with Vite's base path so the same JSX works in dev
            (/) and prod (/flizow/). The "Flizow" text is HTML so it
            inherits the app's Inter font + the brand orange via CSS. */}
        <a href="#overview" className="header-logo" aria-label="Flizow home">
          <img
            className="header-mark"
            src={`${import.meta.env.BASE_URL}Flizow_Mark_v1.png`}
            alt=""
            aria-hidden="true"
          />
          <span className="header-wordmark">Flizow</span>
        </a>
        <nav className="header-nav">
          {visibleNav.map((item) => (
            <a
              key={item.activeKey}
              href={item.href}
              className={active === item.activeKey ? 'on' : ''}
              aria-current={active === item.activeKey ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="header-right">
        <button
          className="cmdk-trigger"
          type="button"
          aria-label="Search (⌘K)"
          onClick={onOpenCmdk}
          disabled={!onOpenCmdk}
          title={onOpenCmdk ? 'Search (⌘K)' : 'Command palette coming soon'}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.656a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
          </svg>
          <span className="cmdk-label">Search clients, tasks, people…</span>
          <span className="cmdk-kbd">⌘K</span>
        </button>
        {/* Templates icon used to live here as a right-toolbar
            shortcut. Promoted to a first-class nav slot in the
            header-nav above (peer with Home / Clients / etc.) so
            users find it the same way they find every other major
            surface. Audit: top-nav MED. */}
        <div className="notif-wrap">
          <button
            ref={notifBtnRef}
            className="header-icon notif-btn"
            type="button"
            aria-label={unreadNotifs > 0 ? `Notifications (${unreadNotifs} unread)` : 'Notifications'}
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
            aria-controls="notifPanel"
            data-unread={unreadNotifs > 0 ? 'true' : undefined}
            onClick={onToggleNotifications}
            disabled={!onToggleNotifications}
            title={onToggleNotifications ? 'Notifications' : 'Notifications coming soon'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span className="notif-dot" aria-hidden="true" />
          </button>
          {onCloseNotifications && (
            <FlizowNotificationsPanel
              open={notifOpen}
              onClose={onCloseNotifications}
              triggerRef={notifBtnRef}
              onUnreadChange={setUnreadNotifs}
            />
          )}
        </div>
        <div className="account-menu-wrap" ref={menuWrapRef}>
          <button
            className="avatar"
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            title="Account menu"
            // Inline override of the default --avatar-bg/--avatar-fg
            // tokens. All 7 swatches in the Profile picker are
            // saturated enough that white text reads with good
            // contrast — including the lightest cyan #64d2ff which
            // still hits ~3.4:1 on white text. Acceptable for a
            // 14px-bold short label.
            style={{ background: avatarColor, color: '#fff' }}
          >{initials}</button>
          <div
            className="account-menu"
            role="menu"
            data-open={menuOpen ? 'true' : 'false'}
            aria-hidden={!menuOpen}
          >
            <div className="account-menu-identity">
              <div
                className="account-menu-identity-avatar"
                aria-hidden="true"
                style={{ background: avatarColor, color: '#fff' }}
              >
                {initials}
              </div>
              <div className="account-menu-identity-text">
                <div className="account-menu-identity-name">
                  <span>{displayName}</span>
                  {ownAccessLevel && (
                    <span
                      className={`access-pill access-pill--${ownAccessLevel}`}
                      title={`${ACCESS_ROLE_LABEL[ownAccessLevel]} access`}
                    >
                      {ACCESS_ROLE_LABEL[ownAccessLevel]}
                    </span>
                  )}
                </div>
                {email && <div className="account-menu-identity-email">{email}</div>}
              </div>
            </div>
            <div className="account-menu-divider" role="separator" />
            <button
              className="account-menu-item"
              type="button"
              role="menuitem"
              onClick={handleAccountSettings}
              disabled={!onOpenAccount}
            >
              <span className="account-menu-item-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>Account settings</span>
              </span>
              <ChevronRightIcon className="account-menu-item-chev" aria-hidden="true" />
            </button>
            {/* Theme — quick toggle for light/dark. Stays in the
                avatar menu (not Account → Preferences) because it's
                the single most-flipped preference and a one-click
                surface earns its space. Icon swaps to reflect the
                state you'd switch TO, not the current state. */}
            <button
              className="account-menu-item account-menu-item--theme"
              type="button"
              role="menuitem"
              onClick={handleToggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <span className="account-menu-item-label">
                {/* Icon shows what you'd switch TO, not the current
                    state — the sun appears when you're in dark mode
                    (click to "go to light"), moon when in light. */}
                {isDark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
                <span>{isDark ? 'Light theme' : 'Dark theme'}</span>
              </span>
            </button>
            <button
              className="account-menu-item"
              type="button"
              role="menuitem"
              onClick={handleSignOut}
            >
              <span className="account-menu-item-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>Sign out</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pull two-letter initials out of a display name or email. Used by the
 *  avatar button so signed-in users see their own initials instead of a
 *  placeholder dot. */
function deriveInitials(nameOrEmail: string): string {
  const src = nameOrEmail.split('@')[0];
  const parts = src.replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
