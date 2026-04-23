import { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRoute } from '../router';
import FlizowNotificationsPanel from './FlizowNotificationsPanel';

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
  templates: '',
  'template-detail': '',
};

interface TopNavProps {
  /** Fires when the avatar button is clicked; parent renders the modal. */
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
  const { user } = useAuth();
  const initials = deriveInitials(user?.displayName || user?.email || 'U');
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  return (
    <div className="header">
      <div className="header-left">
        <a href="#overview" className="header-logo" aria-label="Flizow home">Flizow</a>
        <nav className="header-nav">
          <a href="#overview" className={active === 'overview' ? 'on' : ''} aria-current={active === 'overview' ? 'page' : undefined}>Home</a>
          <a href="#clients" className={active === 'clients' ? 'on' : ''} aria-current={active === 'clients' ? 'page' : undefined}>Clients</a>
          <a href="#ops" className={active === 'ops' ? 'on' : ''} aria-current={active === 'ops' ? 'page' : undefined}>Ops</a>
          <a href="#analytics" className={active === 'analytics' ? 'on' : ''} aria-current={active === 'analytics' ? 'page' : undefined}>Analytics</a>
          <a href="#wip/agenda" className={active === 'wip' ? 'on' : ''} aria-current={active === 'wip' ? 'page' : undefined}>Weekly WIP</a>
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
        <a href="#templates" className="header-tool" aria-label="Service templates" title="Service templates">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="8" height="8" rx="1.5"/>
            <rect x="13" y="3" width="8" height="8" rx="1.5"/>
            <rect x="3" y="13" width="8" height="8" rx="1.5"/>
            <rect x="13" y="13" width="8" height="8" rx="1.5"/>
          </svg>
        </a>
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
        <button
          className="avatar"
          type="button"
          aria-label="Account settings"
          onClick={onOpenAccount}
          disabled={!onOpenAccount}
          title={onOpenAccount ? 'Account settings' : 'Account coming soon'}
        >{initials}</button>
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
