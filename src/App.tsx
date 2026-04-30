import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { LoginPage } from './components/LoginPage';
import { TopNav } from './components/TopNav';
import { PageShell } from './components/PageShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './contexts/AuthContext';
import { flizowStore, stashPendingJoin } from './store/flizowStore';
import { useFlizow } from './store/useFlizow';
import { useRoute, navigate } from './router';

// Lazy-load top-level modals. Account settings opens rarely (once a
// session at most) and the command palette opens on-demand via ⌘K —
// no reason to ship either with the initial bundle. Each is mounted
// only when its open flag flips on, so the lazy chunk doesn't even
// fetch until the user asks for it. Audit: D1.
const FlizowAccountModal    = lazy(() => import('./components/FlizowAccountModal'));
const FlizowCommandPalette  = lazy(() => import('./components/FlizowCommandPalette'));

function App() {
  const { user, loading } = useAuth();
  const { data } = useFlizow();
  const isDark = data.theme === 'dark';

  // Sync theme with html element. We set both the `.dark` class (for existing
  // Tailwind/TipTap dark variants) and `data-theme` (for the mockup CSS which
  // keys off `:root[data-theme="dark"]`). Two selectors, one source of truth.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Detect invite link on boot. `?join=<workspaceId>&token=<token>` in
  // the URL means a teammate clicked an invite. We stash the params in
  // sessionStorage so they survive the Google sign-in popup, then
  // remove them from the URL so a refresh after sign-in doesn't try
  // to consume the same invite twice. setUser picks them up inside
  // resolveWorkspaceId after the user authenticates.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const join = params.get('join');
    const token = params.get('token');
    const wsName = params.get('n') ?? undefined;
    if (join && token) {
      // Stash the workspace name alongside the wsId/token so the
      // LoginPage can show "You've been invited to join {name}"
      // before the user signs in. Pre-auth Firestore rules block
      // reading the workspace doc to fetch the name, so we ferry
      // it through the URL.
      stashPendingJoin(join, token, wsName);
      params.delete('join');
      params.delete('token');
      params.delete('n');
      const remaining = params.toString();
      const url =
        window.location.pathname +
        (remaining ? `?${remaining}` : '') +
        window.location.hash;
      window.history.replaceState({}, '', url);
    }
  }, []);

  // Hook the FlizowStore up to the signed-in user. We used to also
  // hook the legacy BoardStore here (theme was the only thing it
  // owned), but theme moved into FlizowStore in D3 — one store now,
  // one Firestore doc (`flizow/{uid}`).
  useEffect(() => {
    const uid = user?.uid ?? null;
    const displayName = user?.displayName || undefined;
    const email = user?.email || undefined;
    const photoURL = user?.photoURL || undefined;
    flizowStore.setUser(uid, displayName, email, photoURL);
  }, [user]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#d2d2d7] border-t-[#1d1d1f] rounded-full animate-spin" />
          <p className="text-sm text-[#86868b]">Loading...</p>
        </div>
      </div>
    );
  }

  // Dev bypass: append `?dev=1` to the URL during local development to
  // skip the Google sign-in step. Gated by `import.meta.env.DEV` so the
  // flag is dead code in production builds.
  const devBypass = import.meta.env.DEV && new URLSearchParams(window.location.search).has('dev');
  if (!user && !devBypass) {
    return <LoginPage />;
  }

  return (
    <AppShell />
  );
}

/** App chrome + top-level modal mounts. Kept as its own component so
 *  the modal-open state doesn't reset every time we re-enter the auth-
 *  gated branch of App. */
function AppShell() {
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  // Phase 7C — when the Account modal opens via deep-link
  // (notification click → `#account/timeoff`), these tell the
  // modal which section + which row id to land on. Reset on
  // close so the next manual open lands on the default section
  // (Profile).
  const [accountSection, setAccountSection] = useState<string | undefined>(undefined);
  const [accountFocusId, setAccountFocusId] = useState<string | undefined>(undefined);
  const route = useRoute();

  // Watch the route for the synthetic 'account' name. The Account
  // modal isn't a real page (it's a callback-driven overlay), so
  // we catch the route here, open the modal with the requested
  // section/focus, and navigate back to overview to clear the
  // hash. Without the navigate-back, the modal would re-open on
  // every render where the route still says 'account'.
  useEffect(() => {
    if (route.name !== 'account') return;
    setAccountSection(route.params.section);
    setAccountFocusId(route.params.focus);
    setAccountOpen(true);
    navigate('overview');
  }, [route.name, route.params.section, route.params.focus]);

  // ⌘K / Ctrl+K toggles the command palette from anywhere. We swallow
  // the keystroke so the browser's own "Search bookmarks" / Quick Find
  // binding doesn't also fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isToggle = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (!isToggle) return;
      e.preventDefault();
      setCmdkOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* Skip link — first focusable in the document. Visible only on
          focus (CSS keeps it offscreen otherwise). Lets keyboard users
          jump past the 6 nav items + search + notifications + avatar
          to land on page content in one Tab. Audit: overview re-audit
          MED (no skip link). */}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <SyncErrorBanner />
      <TopNav
        onOpenAccount={() => setAccountOpen(true)}
        notifOpen={notifOpen}
        onToggleNotifications={() => setNotifOpen((v) => !v)}
        onCloseNotifications={() => setNotifOpen(false)}
        onOpenCmdk={() => setCmdkOpen(true)}
      />
      <PageShell />
      {/* Suspense + ErrorBoundary for lazy modals. Modals portal to
          document.body, so they sit OUTSIDE PageShell's boundary —
          they need their own. Each modal gets its own boundary so a
          crash in one doesn't take down the other. fallback={null}
          on Suspense because the page underneath stays visible
          during the chunk fetch. Audit: error/offline HIGH. */}
      {accountOpen && (
        <ErrorBoundary scope="modal">
          <Suspense fallback={null}>
            <FlizowAccountModal
              onClose={() => {
                setAccountOpen(false);
                setAccountSection(undefined);
                setAccountFocusId(undefined);
              }}
              initialSection={accountSection}
              initialFocusId={accountFocusId}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {/* Command palette: conditionally mounted so the lazy chunk only
          fetches on first ⌘K press. */}
      {cmdkOpen && (
        <ErrorBoundary scope="modal">
          <Suspense fallback={null}>
            <FlizowCommandPalette
              open={cmdkOpen}
              onClose={() => setCmdkOpen(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}

/** Sync-error banner — surfaces silent localStorage / Firestore
 *  failures the user used to never know about. The store exposes
 *  syncError as a separate observable so a banner re-render doesn't
 *  cascade through every data consumer. Audit: error/offline HIGH. */
function SyncErrorBanner() {
  const error = useSyncExternalStore(
    flizowStore.subscribeSyncError,
    flizowStore.getSyncError,
  );
  if (!error) return null;
  return (
    <div className="sync-error-banner" role="status" aria-live="polite">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span className="sync-error-banner-text">{error}</span>
      <button
        type="button"
        className="sync-error-banner-dismiss"
        onClick={flizowStore.clearSyncError}
        aria-label="Dismiss sync warning"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default App;
