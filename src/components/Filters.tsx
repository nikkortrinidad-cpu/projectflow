import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';
import type { Priority } from '../types';

export function Filters() {
  const { state } = useBoard();
  const f = state.filters;
  const hasFilters = f.search || f.assigneeIds.length || f.labelIds.length || f.priorities.length;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={f.search}
          onChange={e => store.setFilters({ search: e.target.value })}
          placeholder="Search cards..."
          className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-primary w-52 bg-white dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </div>

      <select
        value=""
        onChange={e => {
          const v = e.target.value;
          if (v && !f.assigneeIds.includes(v)) {
            store.setFilters({ assigneeIds: [...f.assigneeIds, v] });
          }
        }}
        className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 outline-none bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300"
      >
        <option value="">Assignee</option>
        {state.members.map(m => (
          <option key={m.id} value={m.id}>{m.name}{m.id === store.getCurrentMemberId() ? ' (You)' : ''}</option>
        ))}
      </select>

      <select
        value=""
        onChange={e => {
          const v = e.target.value as Priority;
          if (v && !f.priorities.includes(v)) {
            store.setFilters({ priorities: [...f.priorities, v] });
          }
        }}
        className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 outline-none bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300"
      >
        <option value="">Priority</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      <select
        value=""
        onChange={e => {
          const v = e.target.value;
          if (v && !f.labelIds.includes(v)) {
            store.setFilters({ labelIds: [...f.labelIds, v] });
          }
        }}
        className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 outline-none bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300"
      >
        <option value="">Label</option>
        {state.labels.map(l => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>

      {hasFilters && (
        <div className="flex items-center gap-1.5">
          {f.assigneeIds.map(id => {
            const m = state.members.find(mem => mem.id === id);
            return (
              <span key={id}
                onClick={() => store.setFilters({ assigneeIds: f.assigneeIds.filter(a => a !== id) })}
                className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full cursor-pointer hover:bg-primary/20">
                {m?.name}{m?.id === store.getCurrentMemberId() ? ' (You)' : ''} &times;
              </span>
            );
          })}
          {f.priorities.map(p => (
            <span key={p}
              onClick={() => store.setFilters({ priorities: f.priorities.filter(pr => pr !== p) })}
              className="text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 px-2 py-0.5 rounded-full cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-900/60">
              {p} &times;
            </span>
          ))}
          {f.labelIds.map(id => {
            const l = state.labels.find(lb => lb.id === id);
            return (
              <span key={id}
                onClick={() => store.setFilters({ labelIds: f.labelIds.filter(lb => lb !== id) })}
                className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer text-white"
                style={{ backgroundColor: l?.color }}>
                {l?.name} &times;
              </span>
            );
          })}
          <button onClick={() => store.clearFilters()}
            className="text-[10px] text-slate-400 hover:text-red-500 ml-1 transition">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
