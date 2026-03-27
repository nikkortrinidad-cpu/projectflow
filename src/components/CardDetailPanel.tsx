import { useState } from 'react';
import type { Card, Priority } from '../types';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';

interface Props {
  card: Card;
  onClose: () => void;
}

export function CardDetailPanel({ card, onClose }: Props) {
  const { state } = useBoard();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [commentText, setCommentText] = useState('');
  const [priority, setPriority] = useState<Priority>(card.priority);
  const [dueDate, setDueDate] = useState(card.dueDate || '');
  const [assigneeId, setAssigneeId] = useState(card.assigneeId || '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>(card.labels);

  const toggleLabel = (labelId: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelId) ? prev.filter(l => l !== labelId) : [...prev, labelId]
    );
  };

  const handleSave = () => {
    store.updateCard(card.id, {
      title, description, priority, dueDate: dueDate || null,
      assigneeId: assigneeId || null, labels: selectedLabels,
    });
    onClose();
  };

  const handleAddComment = () => {
    if (commentText.trim()) {
      store.addComment(card.id, commentText.trim());
      setCommentText('');
    }
  };

  const handleDelete = () => {
    store.deleteCard(card.id);
    onClose();
  };

  const column = state.columns.find(c => c.id === card.columnId);
  const activities = state.activityLog.filter(a => a.cardId === card.id).slice(0, 20);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto animate-slide-in"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: column?.color }} />
            <span className="text-xs text-slate-400 font-medium">{column?.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition">
              Delete
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full text-xl font-semibold text-slate-800 border-none outline-none bg-transparent" />

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Add a description..."
              className="w-full min-h-[80px] text-sm text-slate-600 border border-slate-200 rounded-lg p-3 outline-none focus:border-primary resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 outline-none focus:border-primary">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Assignee</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg p-2 outline-none focus:border-primary">
              <option value="">Unassigned</option>
              {state.members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Labels</label>
            <div className="flex flex-wrap gap-1.5">
              {state.labels.map(l => (
                <button key={l.id}
                  onClick={() => toggleLabel(l.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                    selectedLabels.includes(l.id)
                      ? 'text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  style={selectedLabels.includes(l.id) ? { backgroundColor: l.color } : {}}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Move to Column</label>
            <div className="flex gap-1.5 flex-wrap">
              {state.columns.map(c => (
                <button key={c.id}
                  onClick={() => { store.moveCard(card.id, c.id, card.swimlaneId, 0); }}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                    card.columnId === c.id ? 'text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  style={card.columnId === c.id ? { backgroundColor: c.color } : {}}>
                  {c.title}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100" />

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Comments</label>
            <div className="space-y-2 mb-3">
              {card.comments.map(c => {
                const author = state.members.find(m => m.id === c.authorId);
                return (
                  <div key={c.id} className="bg-slate-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                        {(author?.name || '?').charAt(0)}
                      </div>
                      <span className="text-xs font-medium text-slate-600">{author?.name || 'Unknown'}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{c.text}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
                placeholder="Write a comment..."
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary" />
              <button onClick={handleAddComment}
                className="text-sm bg-primary text-white px-3 py-2 rounded-lg hover:bg-primary-dark transition">
                Send
              </button>
            </div>
          </div>

          <hr className="border-slate-100" />

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Activity Log</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {activities.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
              {activities.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-xs">
                  <span className="text-slate-300 shrink-0">
                    {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-slate-500">{a.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleSave}
            className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-dark transition">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
