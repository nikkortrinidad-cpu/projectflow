import { useState, useRef } from 'react';
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
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Section visibility toggles
  const [showLabelsSection, setShowLabelsSection] = useState(card.labels.length > 0);
  const [showDatesSection, setShowDatesSection] = useState(!!card.dueDate);
  const [showChecklistSection, setShowChecklistSection] = useState((card.checklist || []).length > 0);
  /* Hidden Attachment state — available if needed */

  // Refs for scrolling
  const labelsRef = useRef<HTMLDivElement>(null);
  const datesRef = useRef<HTMLDivElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);

  const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-800 shadow-2xl rounded-2xl flex overflow-hidden">
        {/* Left: Card content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="shrink-0 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
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

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="relative group/title">
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full text-xl font-semibold text-slate-800 dark:text-slate-100 border border-transparent outline-none bg-transparent rounded-lg px-2 py-1 -ml-2 hover:border-slate-200 dark:hover:border-slate-600 focus:border-primary focus:bg-amber-50 dark:focus:bg-slate-700 transition" />
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover/title:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>

            {/* Action buttons row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* + Add dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
                {showAddMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-20 py-1 w-40">
                      {[
                        { label: 'Labels', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z', action: () => { setShowLabelsSection(true); setShowAddMenu(false); scrollToRef(labelsRef); } },
                        { label: 'Due Date', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', action: () => { setShowDatesSection(true); setShowAddMenu(false); scrollToRef(datesRef); } },
                        { label: 'Checklist', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', action: () => { setShowChecklistSection(true); setShowAddMenu(false); scrollToRef(checklistRef); } },
                        /* Hidden Attachment — available in store if needed */
                      ].map(item => (
                        <button key={item.label} onClick={item.action}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                          </svg>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Quick action buttons */}
              <button
                onClick={() => { setShowLabelsSection(true); scrollToRef(labelsRef); }}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  showLabelsSection
                    ? 'border-primary/30 bg-primary/5 text-primary dark:bg-primary/10'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Labels
              </button>

              <button
                onClick={() => { setShowDatesSection(true); scrollToRef(datesRef); }}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  showDatesSection
                    ? 'border-primary/30 bg-primary/5 text-primary dark:bg-primary/10'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Dates
              </button>

              <button
                onClick={() => { setShowChecklistSection(true); scrollToRef(checklistRef); }}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  showChecklistSection
                    ? 'border-primary/30 bg-primary/5 text-primary dark:bg-primary/10'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Checklist
              </button>

              {/* Hidden Attachment button — available in store if needed */}
            </div>

            {/* Members section */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Members</label>
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const assignee = state.members.find(m => m.id === assigneeId);
                  if (assignee) {
                    return (
                      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-full pl-1 pr-3 py-1">
                        <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                          {assignee.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{assignee.name}</span>
                        <button onClick={() => setAssigneeId('')}
                          className="text-slate-400 hover:text-red-500 transition ml-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="relative group/member">
                  <button
                    className="w-7 h-7 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-500 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:border-primary hover:text-primary transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {/* Dropdown on hover/focus */}
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-20 py-1 w-44 opacity-0 invisible group-hover/member:opacity-100 group-hover/member:visible transition-all">
                    {state.members.filter(m => m.id !== assigneeId).map(m => (
                      <button key={m.id} onClick={() => setAssigneeId(m.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                        <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        {m.name}
                      </button>
                    ))}
                    {state.members.filter(m => m.id !== assigneeId).length === 0 && (
                      <p className="px-3 py-2 text-[10px] text-slate-400 italic">No other members</p>
                    )}
                  </div>
                </div>
              </div>
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
              {showDatesSection && (
                <div ref={datesRef}>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Due Date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg p-2 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200" />
                </div>
              )}
            </div>

            {showLabelsSection && (
            <div ref={labelsRef}>
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
            )}

            {/* Checklist section */}
            {showChecklistSection && (
              <div ref={checklistRef}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Checklist</label>
                  {(card.checklist || []).length > 0 && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {(card.checklist || []).filter(i => i.checked).length}/{(card.checklist || []).length} done
                    </span>
                  )}
                </div>
                {/* Progress bar */}
                {(card.checklist || []).length > 0 && (
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full mb-2 overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${((card.checklist || []).filter(i => i.checked).length / (card.checklist || []).length) * 100}%` }}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  {(card.checklist || []).map(item => (
                    <div key={item.id} className="flex items-center gap-2 group/check">
                      <button
                        onClick={() => store.toggleChecklistItem(card.id, item.id)}
                        className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition ${
                          item.checked
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-slate-300 dark:border-slate-500 hover:border-green-400'
                        }`}
                      >
                        {item.checked && (
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={`flex-1 text-sm ${item.checked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                        {item.text}
                      </span>
                      <button
                        onClick={() => store.deleteChecklistItem(card.id, item.id)}
                        className="text-slate-300 dark:text-slate-600 hover:text-red-500 opacity-0 group-hover/check:opacity-100 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    value={newChecklistItem}
                    onChange={e => setNewChecklistItem(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newChecklistItem.trim()) {
                        store.addChecklistItem(card.id, newChecklistItem.trim());
                        setNewChecklistItem('');
                      }
                    }}
                    placeholder="Add an item..."
                    className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200"
                  />
                  <button
                    onClick={() => {
                      if (newChecklistItem.trim()) {
                        store.addChecklistItem(card.id, newChecklistItem.trim());
                        setNewChecklistItem('');
                      }
                    }}
                    className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-dark transition font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Hidden Attachment section — available in store if needed */}

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

        {/* Right: Activity Log sidebar */}
        <div className="w-72 shrink-0 border-l border-slate-100 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-800/50">
          <div className="shrink-0 px-4 py-4 border-b border-slate-100 dark:border-slate-700">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Activity Log</label>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {activities.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 italic">No activity yet.</p>}
            {activities.map(a => (
              <div key={a.id} className="text-xs">
                <p className="text-slate-500 dark:text-slate-400">{a.detail}</p>
                <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">
                  {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
