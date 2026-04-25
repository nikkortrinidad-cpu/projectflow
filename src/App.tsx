import { useEffect, useState } from 'react';
import { LoginPage } from './components/LoginPage';
import { TopNav } from './components/TopNav';
import { PageShell } from './components/PageShell';
import FlizowAccountModal from './components/FlizowAccountModal';
import FlizowCommandPalette from './components/FlizowCommandPalette';
import { useAuth } from './contexts/AuthContext';
import { useBoard } from './store/useStore';
import { store } from './store/boardStore';
import { flizowStore } from './store/flizowStore';

function App() {
  const { user, loading } = useAuth();
  const { state } = useBoard();
  const isDark = state.theme === 'dark';

  // Sync theme with html element. We set both the `.dark` class (for existing
  // Tailwind/TipTap dark variants) and `data-theme` (for the mockup CSS which
  // keys off `:root[data-theme="dark"]`). Two selectors, one source of truth.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Hook up both stores to the signed-in user. The legacy BoardStore still
  // backs the old /board route until the Flizow kanban reaches parity; the
  // new FlizowStore backs Overview, Clients, Analytics, the new board, etc.
  // They write to different Firestore docs (`boards/{uid}` vs `flizow/{uid}`)
  // so they can't interfere with each other.
  useEffect(() => {
    const uid = user?.uid ?? null;
    const displayName = user?.displayName || undefined;
    const email = user?.email || undefined;
    const photoURL = user?.photoURL || undefined;
    store.setUser(uid, displayName, email, photoURL);
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
      <TopNav
        onOpenAccount={() => setAccountOpen(true)}
        notifOpen={notifOpen}
        onToggleNotifications={() => setNotifOpen((v) => !v)}
        onCloseNotifications={() => setNotifOpen(false)}
        onOpenCmdk={() => setCmdkOpen(true)}
      />
      <PageShell />
      {accountOpen && (
        <FlizowAccountModal onClose={() => setAccountOpen(false)} />
      )}
      <FlizowCommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
      />
    </>
  );
}

export default App;
