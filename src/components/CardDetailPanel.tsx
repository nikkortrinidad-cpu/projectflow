import { useState } from 'react';
import type { Card, Priority } from '../types';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';
import { ColorPicker } from './ColorPicker';
import { MarkdownEditor } from './MarkdownEditor';

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
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#6366f1');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState('');

  const toggleLabel = (labelId: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelId) ? prev.filter(l => l !== labelId) : [...prev, labelId]
    );
  };

  const handleCreateLabel = () => {
    if (newLabelName.trim()) {
      const label = store.addLabel(newLabelName.trim(), newLabelColor);
      setSelectedLabels(prev => [...prev, label.id]);
      setNewLabelName('');
      setNewLabelColor('#6366f1');
    }
  };

  const handleEditLabel = (id: string) => {
    if (editLabelName.trim()) {
      const label = state.labels.find(l => l.id === id);
      if (label) {
        store.deleteLabel(id);
        const updated = store.addLabel(editLabelName.trim(), editLabelColor);
        setSelectedLabels(prev => prev.map(l => l === id ? updated.id : l));
      }
      setEditingLabelId(null);
    }
  };

  const handleDeleteLabel = (id: string) => {
    const label = state.labels.find(l => l.id === id);
    if (confirm(`Are you sure you want to delete the label "${label?.name}"? This will remove it from all cards.`)) {
      store.deleteLabel(id);
      setSelectedLabels(prev => prev.filter(l => l !== id));
    }
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

  const hasUnsavedChanges =
    title !== card.title ||
    description !== card.description ||
    priority !== card.priority ||
    (dueDate || '') !== (card.dueDate || '') ||
    (assigneeId || '') !== (card.assigneeId || '') ||
    JSON.stringify(selectedLabels) !== JSON.stringify(card.labels);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-800 shadow-2xl overflow-y-auto animate-slide-in">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: column?.color }} />
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{column?.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition">
              Delete
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="relative group/title">
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full text-xl font-semibold text-slate-800 dark:text-slate-100 border border-transparent outline-none bg-transparent rounded-lg px-2 py-1 -ml-2 hover:border-slate-200 dark:hover:border-slate-600 focus:border-primary focus:bg-amber-50 dark:focus:bg-slate-700 transition" />
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover/title:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>

          <div className={`flex items-center justify-end gap-1.5 text-[11px] font-medium px-1 py-1 rounded-md transition-all ${
            hasUnsavedChanges
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-green-600 dark:text-green-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              hasUnsavedChanges ? 'bg-amber-500' : 'bg-green-500'
            }`} />
            {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
          </div>

          <MarkdownEditor
            value={description}
            onChange={setDescription}
            maxLength={2000}
            placeholder="Add a description... (supports markdown)"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg p-2 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg p-2 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Assignee</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg p-2 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200">
              <option value="">Unassigned</option>
              {state.members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Labels</label>
              <button onClick={() => setShowLabelManager(!showLabelManager)}
                className="text-[10px] text-primary hover:text-primary-dark font-medium transition">
                {showLabelManager ? 'Done' : 'Manage'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.labels.map(l => (
                <button key={l.id}
                  onClick={() => toggleLabel(l.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                    selectedLabels.includes(l.id)
                      ? 'text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                  style={selectedLabels.includes(l.id) ? { backgroundColor: l.color } : {}}>
                  {l.name}
                </button>
              ))}
            </div>

            {showLabelManager && (
              <div className="mt-3 border border-slate-200 dark:border-slate-600 rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-700">
                {state.labels.map(l => (
                  <div key={l.id} className="flex items-center gap-2">
                    {editingLabelId === l.id ? (
                      <>
                        <ColorPicker value={editLabelColor} onChange={setEditLabelColor} />
                        <input value={editLabelName} onChange={e => setEditLabelName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleEditLabel(l.id); if (e.key === 'Escape') setEditingLabelId(null); }}
                          className="flex-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 outline-none focus:border-primary dark:text-slate-200" />
                        <button onClick={() => handleEditLabel(l.id)}
                          className="text-[10px] text-primary hover:text-primary-dark font-medium">Save</button>
                        <button onClick={() => setEditingLabelId(null)}
                          className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Cancel</button>
                      </>
                    ) : (
                      <>
                        <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                        <span className="flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">{l.name}</span>
                        <button onClick={() => { setEditingLabelId(l.id); setEditLabelName(l.name); setEditLabelColor(l.color); }}
                          className="text-[10px] text-slate-400 hover:text-primary transition">Edit</button>
                        <button onClick={() => handleDeleteLabel(l.id)}
                          className="text-[10px] text-slate-400 hover:text-red-500 transition">Remove</button>
                      </>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                  <ColorPicker value={newLabelColor} onChange={setNewLabelColor} />
                  <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateLabel(); }}
                    placeholder="New label name..."
                    className="flex-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 outline-none focus:border-primary dark:text-slate-200" />
                  <button onClick={handleCreateLabel}
                    className="text-[10px] bg-primary text-white px-2 py-1 rounded font-medium hover:bg-primary-dark transition">
                    Create
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Move to Column</label>
            <div className="flex gap-1.5 flex-wrap">
              {state.columns.map(c => (
                <button key={c.id}
                  onClick={() => { store.moveCard(card.id, c.id, card.swimlaneId, 0); }}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                    card.columnId === c.id ? 'text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                  style={card.columnId === c.id ? { backgroundColor: c.color } : {}}>
                  {c.title}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-700" />

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Comments</label>
            <div className="space-y-2 mb-3">
              {card.comments.map(c => {
                const author = state.members.find(m => m.id === c.authorId);
                return (
                  <div key={c.id} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                        {(author?.name || '?').charAt(0)}
                      </div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{author?.name || 'Unknown'}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{c.text}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
                placeholder="Write a comment..."
                className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200" />
              <button onClick={handleAddComment}
                className="text-sm bg-primary text-white px-3 py-2 rounded-lg hover:bg-primary-dark transition">
                Send
              </button>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-700" />

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Activity Log</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {activities.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
              {activities.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-xs">
                  <span className="text-slate-300 dark:text-slate-600 shrink-0">
                    {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">{a.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave}
              className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition">
              Save
            </button>
            <button onClick={onClose}
              className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
