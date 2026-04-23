import { useEffect, useState } from 'react';
import { LoginPage } from './components/LoginPage';
import { TopNav } from './components/TopNav';
import { PageShell } from './components/PageShell';
import FlizowAccountModal from './components/FlizowAccountModal';
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

  if (!user) {
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

  return (
    <>
      <TopNav
        onOpenAccount={() => setAccountOpen(true)}
        notifOpen={notifOpen}
        onToggleNotifications={() => setNotifOpen((v) => !v)}
        onCloseNotifications={() => setNotifOpen(false)}
      />
      <PageShell />
      {accountOpen && (
        <FlizowAccountModal onClose={() => setAccountOpen(false)} />
      )}
    </>
  );
}

export default App;
