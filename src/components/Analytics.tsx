import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';

const PRIORITY_COLORS = ['#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

export function Analytics({ onClose }: { onClose: () => void }) {
  const { state } = useBoard();
  const columnData = store.getCardsPerColumn();
  const priorityData = store.getCardsByPriority();
  const throughput = store.getThroughput(30);
  const totalCards = state.cards.length;
  const overdueCards = state.cards.filter(c => c.dueDate && new Date(c.dueDate) < new Date()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-slate-800">Analytics & Reports</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Cards', value: totalCards, color: 'bg-blue-50 text-blue-600' },
              { label: '30-Day Throughput', value: throughput, color: 'bg-green-50 text-green-600' },
              { label: 'Overdue', value: overdueCards, color: 'bg-red-50 text-red-600' },
              { label: 'Team Members', value: state.members.length, color: 'bg-purple-50 text-purple-600' },
            ].map(stat => (
              <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs font-medium opacity-70 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Cards by Column</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={columnData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {columnData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Cards by Priority</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={priorityData} dataKey="count" nameKey="name" cx="50%" cy="50%"
                    outerRadius={70} innerRadius={40} paddingAngle={2} label={({ name, value }) => (value as number) > 0 ? `${name}: ${value}` : ''}>
                    {priorityData.map((_, i) => (
                      <Cell key={i} fill={PRIORITY_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent Activity</h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {state.activityLog.slice(0, 30).map(a => (
                <div key={a.id} className="flex items-start gap-3 text-xs py-1">
                  <span className="text-slate-300 shrink-0 w-32">
                    {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    a.action === 'created' ? 'bg-green-100 text-green-600' :
                    a.action === 'moved' ? 'bg-blue-100 text-blue-600' :
                    a.action === 'deleted' ? 'bg-red-100 text-red-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>{a.action}</span>
                  <span className="text-slate-500">{a.detail}</span>
                </div>
              ))}
              {state.activityLog.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
