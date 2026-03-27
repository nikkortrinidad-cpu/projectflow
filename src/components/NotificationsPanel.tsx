import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';

export function NotificationsPanel({ onClose: _onClose }: { onClose: () => void }) {
  void _onClose;
  const { state } = useBoard();
  const notifications = state.notifications;

  return (
    <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Notifications</h3>
        <div className="flex gap-2">
          <button onClick={() => store.markAllNotificationsRead()}
            className="text-[10px] text-primary hover:underline">Mark all read</button>
          <button onClick={() => store.clearNotifications()}
            className="text-[10px] text-slate-400 hover:text-red-500">Clear</button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No notifications</p>
        )}
        {notifications.map(n => (
          <div key={n.id}
            onClick={() => store.markNotificationRead(n.id)}
            className={`px-4 py-2.5 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${
              !n.read ? 'bg-primary/5' : ''
            }`}>
            <div className="flex items-start gap-2">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                n.type === 'success' ? 'bg-green-400' :
                n.type === 'warning' ? 'bg-yellow-400' :
                n.type === 'error' ? 'bg-red-400' : 'bg-blue-400'
              }`} />
              <div>
                <p className="text-xs text-slate-600">{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(n.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
