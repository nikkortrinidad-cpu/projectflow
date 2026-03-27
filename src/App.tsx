import { useState } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { Filters } from './components/Filters';
import { NotificationsPanel } from './components/NotificationsPanel';
import { Analytics } from './components/Analytics';
import { BoardSettings } from './components/BoardSettings';
import { useBoard } from './store/useStore';

function App() {
  const { state } = useBoard();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const unreadCount = state.notifications.filter(n => !n.read).length;

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">Kanban Board</h1>
            <p className="text-[10px] text-slate-400">Project Management</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowAnalytics(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Analytics
          </button>
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
          <div className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} />}
          </div>
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center ml-1">
            Y
          </div>
        </div>
      </header>

      {/* Filters bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 shrink-0">
        <Filters />
      </div>

      {/* Board */}
      <KanbanBoard />

      {/* Modals */}
      {showAnalytics && <Analytics onClose={() => setShowAnalytics(false)} />}
      {showSettings && <BoardSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
