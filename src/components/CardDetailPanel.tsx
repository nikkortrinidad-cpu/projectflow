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
  const [showLabelsDropdown, setShowLabelsDropdown] = useState(false);
  const [showDatesDropdown, setShowDatesDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Section visibility toggles
  const [showChecklistSection, setShowChecklistSection] = useState((card.checklist || []).length > 0);
  /* Hidden Attachment state — available if needed */

  // Refs for scrolling
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
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          {/* Close button */}
          <button onClick={onClose} className="absolute top-3 right-3 z-10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

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
              {/* Status dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: column?.color }} />
                  <span className="text-slate-700 dark:text-slate-200">{column?.title || 'Status'}</span>
                  <svg className="w-2.5 h-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showStatusDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-20 w-48 overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status</span>
                      </div>
                      <div className="p-1.5 space-y-0.5">
                        {[...state.columns].sort((a, b) => a.order - b.order).map(c => (
                          <button key={c.id}
                            onClick={() => { store.moveCard(card.id, c.id, card.swimlaneId, 0); setShowStatusDropdown(false); }}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition hover:bg-slate-50 dark:hover:bg-slate-700 ${
                              card.columnId === c.id
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}>
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                            {c.title}
                            {card.columnId === c.id && (
                              <svg className="w-3.5 h-3.5 ml-auto text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

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
                        { label: 'Labels', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z', action: () => { setShowLabelsDropdown(true); setShowAddMenu(false); } },
                        { label: 'Due Date', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', action: () => { setShowDatesDropdown(true); setShowAddMenu(false); } },
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

              {/* Labels dropdown with manage */}
              <div className="relative">
                <button
                  onClick={() => setShowLabelsDropdown(!showLabelsDropdown)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                    selectedLabels.length > 0 || showLabelsDropdown
                      ? 'border-primary/30 bg-primary/5 text-primary dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Labels
                </button>
                {showLabelsDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setShowLabelsDropdown(false); setShowLabelManager(false); }} />
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-20 w-64 overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Labels</span>
                        <button onClick={() => setShowLabelManager(!showLabelManager)}
                          className="text-[10px] text-primary hover:text-primary-dark font-medium transition">
                          {showLabelManager ? 'Done' : 'Manage'}
                        </button>
                      </div>
                      <div className="p-2 max-h-60 overflow-y-auto space-y-1">
                        {!showLabelManager ? (
                          /* Label selection */
                          state.labels.map(l => (
                            <button key={l.id}
                              onClick={() => toggleLabel(l.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                              <div className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition ${
                                selectedLabels.includes(l.id)
                                  ? 'bg-primary border-primary text-white'
                                  : 'border-slate-300 dark:border-slate-500'
                              }`}>
                                {selectedLabels.includes(l.id) && (
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                              <span className="text-slate-600 dark:text-slate-300 font-medium">{l.name}</span>
                            </button>
                          ))
                        ) : (
                          /* Label manager */
                          <>
                            {state.labels.map(l => (
                              <div key={l.id} className="flex items-center gap-2 py-1">
                                {editingLabelId === l.id ? (
                                  <>
                                    <ColorPicker value={editLabelColor} onChange={setEditLabelColor} />
                                    <input value={editLabelName} onChange={e => setEditLabelName(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleEditLabel(l.id); if (e.key === 'Escape') setEditingLabelId(null); }}
                                      className="flex-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 outline-none focus:border-primary dark:text-slate-200" />
                                    <button onClick={() => handleEditLabel(l.id)}
                                      className="text-[10px] text-primary hover:text-primary-dark font-medium">Save</button>
                                    <button onClick={() => setEditingLabelId(null)}
                                      className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">✕</button>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                                    <span className="flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">{l.name}</span>
                                    <button onClick={() => { setEditingLabelId(l.id); setEditLabelName(l.name); setEditLabelColor(l.color); }}
                                      className="text-[10px] text-slate-400 hover:text-primary transition">Edit</button>
                                    <button onClick={() => handleDeleteLabel(l.id)}
                                      className="text-[10px] text-slate-400 hover:text-red-500 transition">✕</button>
                                  </>
                                )}
                              </div>
                            ))}
                            <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-600 mt-1">
                              <ColorPicker value={newLabelColor} onChange={setNewLabelColor} />
                              <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateLabel(); }}
                                placeholder="New label..."
                                className="flex-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 outline-none focus:border-primary dark:text-slate-200" />
                              <button onClick={handleCreateLabel}
                                className="text-[10px] bg-primary text-white px-2 py-1 rounded font-medium hover:bg-primary-dark transition">
                                Add
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Dates dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowDatesDropdown(!showDatesDropdown)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                    dueDate || showDatesDropdown
                      ? 'border-primary/30 bg-primary/5 text-primary dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Dates
                </button>
                {showDatesDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDatesDropdown(false)} />
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-20 w-64 overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Due Date</span>
                      </div>
                      <div className="p-3 space-y-3">
                        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                          className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg p-2 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200" />
                        {dueDate && (
                          <button onClick={() => { setDueDate(''); setShowDatesDropdown(false); }}
                            className="w-full text-xs text-red-500 hover:text-red-600 font-medium py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition">
                            Remove date
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Priority dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                    showPriorityDropdown
                      ? 'border-primary/30 bg-primary/5 text-primary dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  Priority
                </button>
                {showPriorityDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPriorityDropdown(false)} />
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-20 w-48 overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Priority</span>
                      </div>
                      <div className="p-1.5 space-y-0.5">
                        {([
                          { value: 'low', label: 'Low', dot: 'bg-blue-400', bg: 'hover:bg-blue-50 dark:hover:bg-blue-900/20' },
                          { value: 'medium', label: 'Medium', dot: 'bg-yellow-400', bg: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20' },
                          { value: 'high', label: 'High', dot: 'bg-orange-400', bg: 'hover:bg-orange-50 dark:hover:bg-orange-900/20' },
                          { value: 'urgent', label: 'Urgent', dot: 'bg-red-500', bg: 'hover:bg-red-50 dark:hover:bg-red-900/20' },
                        ] as const).map(p => (
                          <button key={p.value}
                            onClick={() => { setPriority(p.value); setShowPriorityDropdown(false); }}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition ${p.bg} ${
                              priority === p.value
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}>
                            <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                            {p.label}
                            {priority === p.value && (
                              <svg className="w-3.5 h-3.5 ml-auto text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

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

            {/* Labels display */}
            {selectedLabels.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Labels</label>
                <div className="flex flex-wrap gap-1.5">
                  {state.labels.filter(l => selectedLabels.includes(l.id)).map(l => (
                    <span key={l.id} className="text-xs px-2.5 py-1 rounded-full font-medium text-white shadow-sm"
                      style={{ backgroundColor: l.color }}>
                      {l.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Due Date display */}
            {dueDate && (
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Due Date</label>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className={`text-sm font-medium ${
                    new Date(dueDate) < new Date() ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    {new Date(dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  {new Date(dueDate) < new Date() && (
                    <span className="text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">Overdue</span>
                  )}
                </div>
              </div>
            )}

            {/* Priority display */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Priority</label>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  priority === 'low' ? 'bg-blue-400' :
                  priority === 'medium' ? 'bg-yellow-400' :
                  priority === 'high' ? 'bg-orange-400' : 'bg-red-500'
                }`} />
                <span className={`text-sm font-medium capitalize ${
                  priority === 'urgent' ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'
                }`}>
                  {priority}
                </span>
              </div>
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


            <div className="flex items-center gap-2">
              <button onClick={handleSave}
                className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition">
                Save
              </button>
              <button onClick={onClose}
                className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="ml-auto text-xs text-red-400 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Right: Unified Activity sidebar */}
        <div className="w-80 shrink-0 border-l border-slate-100 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-800/50">
          <div className="shrink-0 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Activity</label>
          </div>

          {/* Unified timeline */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-3">
              {(() => {
                // Merge comments and activities into a single chronological feed
                const feed: { type: 'comment' | 'activity'; timestamp: string; data: any }[] = [
                  ...card.comments.map(c => ({ type: 'comment' as const, timestamp: c.createdAt, data: c })),
                  ...activities.map(a => ({ type: 'activity' as const, timestamp: a.timestamp, data: a })),
                ];
                feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                if (feed.length === 0) {
                  return <p className="text-xs text-slate-400 dark:text-slate-500 italic">No activity yet.</p>;
                }

                return feed.map((item, i) => {
                  if (item.type === 'comment') {
                    const c = item.data;
                    const author = state.members.find(m => m.id === c.authorId);
                    return (
                      <div key={`comment-${c.id}`} className="relative pl-6">
                        {/* Timeline line */}
                        {i < feed.length - 1 && (
                          <div className="absolute left-[9px] top-6 bottom-[-12px] w-px bg-slate-200 dark:bg-slate-600" />
                        )}
                        {/* Avatar dot */}
                        <div className="absolute left-0 top-0.5 w-[18px] h-[18px] rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center">
                          {(author?.name || '?').charAt(0)}
                        </div>
                        <div className="bg-white dark:bg-slate-700 rounded-lg p-2.5 shadow-sm">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{author?.name || 'Unknown'}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">commented</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{c.text}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                            {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    const a = item.data;
                    return (
                      <div key={`activity-${a.id}`} className="relative pl-6">
                        {/* Timeline line */}
                        {i < feed.length - 1 && (
                          <div className="absolute left-[9px] top-4 bottom-[-12px] w-px bg-slate-200 dark:bg-slate-600" />
                        )}
                        {/* Activity dot */}
                        <div className="absolute left-[5px] top-1 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500 ring-2 ring-slate-50 dark:ring-slate-800" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">{a.detail}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    );
                  }
                });
              })()}
            </div>
          </div>

          {/* Comment input pinned at bottom */}
          <div className="shrink-0 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex gap-1.5">
              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
                placeholder="Write a comment..."
                className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-slate-50 dark:bg-slate-700 dark:text-slate-200" />
              <button onClick={handleAddComment}
                className="text-xs bg-primary text-white px-2.5 py-1.5 rounded-lg hover:bg-primary-dark transition font-medium shrink-0">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
