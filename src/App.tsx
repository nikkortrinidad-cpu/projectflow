import { useState, useEffect, useRef } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { Filters } from './components/Filters';
import { NotificationsPanel } from './components/NotificationsPanel';
import { Analytics } from './components/Analytics';
import { BoardSettings } from './components/BoardSettings';
import { AccountModal } from './components/AccountModal';
import { LoginPage } from './components/LoginPage';
import { useBoard } from './store/useStore';
import { useAuth } from './contexts/AuthContext';
import { store } from './store/boardStore';

function App() {
  const { user, loading, logout } = useAuth();
  const { state } = useBoard();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (showNotifications && notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (showUserMenu && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNotifications, showUserMenu]);

  const unreadCount = state.notifications.filter(n => !n.read).length;
  const isDark = state.theme === 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Connect store to Firebase when user logs in
  useEffect(() => {
    if (user) {
      store.setUser(user.uid, user.displayName || undefined, user.email || undefined, user.photoURL || undefined);
    } else {
      store.setUser(null);
    }
  }, [user]);

  // Show loading spinner while checking auth
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

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className={`h-screen flex flex-col ${isDark ? 'bg-black text-gray-100' : 'bg-[#f5f5f7] text-[#1d1d1f]'}`}>
      {/* Header */}
      <header className={`${isDark ? 'bg-[#1d1d1f]/80 backdrop-blur-xl border-[#424245]' : 'bg-white/80 backdrop-blur-xl border-[#d2d2d7]'} border-b px-6 py-3.5 flex items-center justify-between shrink-0 relative z-[200]`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1d1d1f] dark:bg-white rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white dark:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <div>
            <h1 className={`text-sm font-semibold leading-snug tracking-tight ${isDark ? 'text-gray-100' : 'text-[#1d1d1f]'}`}>Flizow</h1>
            <p className={`text-xs leading-normal ${isDark ? 'text-[#86868b]' : 'text-[#86868b]'}`}>Project Management</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowAnalytics(true)}
            title="Analytics"
            className="flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          <button onClick={() => setShowSettings(true)}
            title="Settings"
            className="flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <div ref={notifRef} className="relative">
            <button onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
              className="relative flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#ff3b30] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} />}
          </div>

          {/* User avatar with dropdown */}
          <div ref={userMenuRef} className="relative ml-1">
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1d1d1f]"
            >
              <span className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-black/5 dark:ring-white/10 block">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full bg-[#f5f5f7] dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-white text-xs font-semibold flex items-center justify-center">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
            </button>

            {showUserMenu && (
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 top-full mt-2 bg-white dark:bg-[#2c2c2e] border border-[#d2d2d7] dark:border-[#424245] rounded-2xl shadow-lg shadow-black/10 z-50 p-1.5 w-72"
              >
                {/* Identity card — read-only presence summary */}
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-black/5 dark:ring-white/10">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#0071e3]/10 text-[#0071e3] text-sm font-bold flex items-center justify-center">
                        {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white truncate">{user.displayName || 'You'}</p>
                    <p className="text-[11px] text-[#86868b] truncate">{user.email}</p>
                  </div>
                </div>

                {/* Account settings */}
                <button
                  role="menuitem"
                  onClick={() => { setShowAccount(true); setShowUserMenu(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[#1d1d1f] dark:text-[#e5e5ea] hover:bg-black/5 dark:hover:bg-white/10 transition"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Account settings
                  </span>
                  <svg className="w-3.5 h-3.5 text-[#c7c7cc]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Appearance — inline segmented (Tier 3 tint on active per Apple HIG) */}
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#86868b]">Appearance</span>
                  <div className="flex items-center bg-[#e8e8ed] dark:bg-[#3a3a3c] rounded-full p-0.5">
                    <button
                      onClick={() => store.setTheme('light')}
                      aria-pressed={state.theme === 'light'}
                      aria-label="Light theme"
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition ${
                        state.theme === 'light' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#e5e5ea]'
                      }`}
                    >
                      Light
                    </button>
                    <button
                      onClick={() => store.setTheme('dark')}
                      aria-pressed={state.theme === 'dark'}
                      aria-label="Dark theme"
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition ${
                        state.theme === 'dark' ? 'bg-[#1c1c1e] text-white shadow-sm' : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#e5e5ea]'
                      }`}
                    >
                      Dark
                    </button>
                  </div>
                </div>

                <div className="h-px bg-[#e8e8ed] dark:bg-[#38383a] my-1 mx-3" />

                {/* Sign out — NEUTRAL: signing out is not destructive, no data loss */}
                <button
                  role="menuitem"
                  onClick={() => { logout(); setShowUserMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#1d1d1f] dark:text-[#e5e5ea] hover:bg-black/5 dark:hover:bg-white/10 transition"
                >
                  <svg className="w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Filters bar */}
      <div className={`${isDark ? 'bg-[#1d1d1f]/60 backdrop-blur-xl border-[#424245]' : 'bg-white/60 backdrop-blur-xl border-[#d2d2d7]'} border-b px-6 py-2.5 shrink-0`}>
        <Filters />
      </div>

      {/* Board */}
      <KanbanBoard />

      {/* Modals */}
      {showAnalytics && <Analytics onClose={() => setShowAnalytics(false)} />}
      {showSettings && <BoardSettings onClose={() => setShowSettings(false)} />}
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
    </div>
  );
}

export default App;
