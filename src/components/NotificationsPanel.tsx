import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';

export function NotificationsPanel({ onClose: _onClose }: { onClose: () => void }) {
  void _onClose;
  const { state } = useBoard();
  const notifications = state.notifications;

  return (
    <div className="absolute right-0 top-12 w-80 bg-white dark:bg-[#2c2c2e] rounded-2xl shadow-xl shadow-black/10 border border-[#d2d2d7] dark:border-[#424245] z-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8e8ed] dark:border-[#38383a] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#e5e5ea]">Notifications</h3>
        <div className="flex gap-2">
          <button onClick={() => store.markAllNotificationsRead()}
            className="text-[10px] text-primary hover:underline">Mark all read</button>
          <button onClick={() => store.clearNotifications()}
            className="text-[10px] text-[#86868b] hover:text-[#ff3b30]">Clear</button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 && (
          <p className="text-sm text-[#86868b] text-center py-8">No notifications</p>
        )}
        {notifications.map(n => (
          <div key={n.id}
            onClick={() => store.markNotificationRead(n.id)}
            className={`px-4 py-3 border-b border-[#e8e8ed] dark:border-[#38383a] cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/10 transition ${
              !n.read ? 'bg-[#0071e3]/5' : ''
            }`}>
            <div className="flex items-start gap-2">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                n.type === 'success' ? 'bg-[#34c759]' :
                n.type === 'warning' ? 'bg-[#ff9f0a]' :
                n.type === 'error' ? 'bg-[#ff3b30]' : 'bg-[#0071e3]'
              }`} />
              <div>
                <p className="text-xs text-[#6e6e73] dark:text-[#aeaeb2]">{n.message}</p>
                <p className="text-[10px] text-[#86868b] dark:text-[#6e6e73] mt-0.5">
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
