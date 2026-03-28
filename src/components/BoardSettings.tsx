import { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';
import type { Card, Column, UserRole } from '../types';
import { ColorPicker } from './ColorPicker';

function SortableColumnRow({ col, children }: { col: Column; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}
      className="flex items-center gap-3 bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-xl p-3">
      <button {...listeners} className="cursor-grab active:cursor-grabbing text-[#86868b] hover:text-[#6e6e73] touch-none">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
        </svg>
      </button>
      {children}
    </div>
  );
}

export function BoardSettings({ onClose }: { onClose: () => void }) {
  const { state } = useBoard();
  const [tab, setTab] = useState<'general' | 'columns' | 'swimlanes' | 'labels' | 'members' | 'trash' | 'archive'>('general');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('member');

  const settingsSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const sortedColumns = [...state.columns].sort((a, b) => a.order - b.order);

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = sortedColumns.findIndex(c => c.id === active.id);
    const toIndex = sortedColumns.findIndex(c => c.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      store.reorderColumns(fromIndex, toIndex);
    }
  };

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'columns' as const, label: 'Lists' },
    { id: 'swimlanes' as const, label: 'Swimlanes' },
    { id: 'labels' as const, label: 'Labels' },
    { id: 'members' as const, label: 'Team' },
    { id: 'archive' as const, label: 'Archive' },
    { id: 'trash' as const, label: 'Trash' },
  ];

  const handleAdd = () => {
    if (!newName.trim()) return;
    switch (tab) {
      case 'columns': store.addColumn(newName.trim()); break;
      case 'swimlanes': store.addSwimlane(newName.trim()); break;
      case 'labels': store.addLabel(newName.trim(), newColor); break;
      case 'members': store.addMember(newName.trim(), newEmail.trim(), newRole); break;
    }
    setNewName('');
    setNewEmail('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl shadow-black/20 w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e8e8ed] dark:border-[#38383a] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Board Settings</h2>
          <button onClick={onClose} className="text-[#86868b] hover:text-[#6e6e73] dark:hover:text-[#aeaeb2] p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex">
          <div className="w-40 shrink-0 border-r border-[#e8e8ed] dark:border-[#38383a] py-3 px-2">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full text-left text-sm px-3 py-2 rounded-full font-medium transition mb-0.5 ${
                  tab === t.id
                    ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-black'
                    : 'text-[#86868b] dark:text-[#86868b] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1d1d1f] dark:hover:text-[#e5e5ea]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 overflow-y-auto max-h-[65vh]">
          {tab === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#e5e5ea] mb-3">Appearance</h3>
                <div className="flex items-center justify-between bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-2xl p-4">
                  <div>
                    <p className="text-sm font-medium dark:text-[#e5e5ea]">Theme</p>
                    <p className="text-xs text-[#86868b] dark:text-[#86868b] mt-0.5">Choose light or dark mode</p>
                  </div>
                  <div className="flex items-center bg-[#e8e8ed] dark:bg-[#3a3a3c] rounded-full p-0.5">
                    <button
                      onClick={() => store.setTheme('light')}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition ${
                        state.theme === 'light'
                          ? 'bg-white text-[#1d1d1f] shadow-sm'
                          : 'text-[#86868b] dark:text-[#aeaeb2] hover:text-[#1d1d1f]'
                      }`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      Light
                    </button>
                    <button
                      onClick={() => store.setTheme('dark')}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition ${
                        state.theme === 'dark'
                          ? 'bg-[#1c1c1e] text-white shadow-sm'
                          : 'text-[#86868b] dark:text-[#aeaeb2] hover:text-[#1d1d1f]'
                      }`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      Dark
                    </button>
                  </div>
                </div>
              </div>

              {/* Hidden Danger Zone — resetBoard() available in store if needed */}
            </div>
          )}

          {tab === 'columns' && (
            <DndContext sensors={settingsSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
              <SortableContext items={sortedColumns.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {sortedColumns.map(col => (
                    <SortableColumnRow key={col.id} col={col}>
                      <ColorPicker value={col.color}
                        onChange={color => store.updateColumn(col.id, { color })} />
                      <div className="relative flex-1 group/colname">
                        <input value={col.title}
                          onChange={e => store.updateColumn(col.id, { title: e.target.value })}
                          className="w-full text-sm bg-transparent outline-none font-medium rounded px-1.5 py-0.5 -ml-1.5 border border-transparent hover:border-[#d2d2d7] focus:border-primary focus:bg-amber-50 transition" />
                        <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-[#aeaeb2] opacity-0 group-hover/colname:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[#86868b]">WIP:</span>
                        <input type="number" min="0" value={col.wipLimit}
                          onChange={e => store.updateColumn(col.id, { wipLimit: parseInt(e.target.value) || 0 })}
                          className="w-12 text-xs text-center border border-[#d2d2d7] dark:border-[#424245] rounded-lg px-1 py-0.5 outline-none focus:border-[#0071e3]" />
                      </div>
                      <button onClick={() => store.archiveColumn(col.id)}
                        className="text-[#86868b] hover:text-[#ff9f0a] transition"
                        title="Archive list">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </button>
                      <button onClick={() => store.deleteColumn(col.id)}
                        className="text-[#86868b] hover:text-[#ff3b30] transition"
                        title="Delete list">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </SortableColumnRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {tab === 'swimlanes' && (
            <div className="space-y-2">
              {state.swimlanes.sort((a, b) => a.order - b.order).map(s => (
                <div key={s.id} className="flex items-center gap-3 bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-xl p-3">
                  <div className="relative flex-1 group/swimname">
                    <input value={s.title}
                      onChange={e => store.updateSwimlane(s.id, { title: e.target.value })}
                      className="w-full text-sm bg-transparent outline-none font-medium rounded px-1.5 py-0.5 -ml-1.5 border border-transparent hover:border-[#d2d2d7] focus:border-primary focus:bg-amber-50 transition" />
                    <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-[#aeaeb2] opacity-0 group-hover/swimname:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <button onClick={() => store.deleteSwimlane(s.id)}
                    className="text-[#86868b] hover:text-[#ff3b30] transition text-xs">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'labels' && (
            <div className="space-y-2">
              {state.labels.map(l => (
                <div key={l.id} className="flex items-center gap-3 bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-xl p-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 text-sm font-medium">{l.name}</span>
                  <button onClick={() => store.deleteLabel(l.id)}
                    className="text-[#86868b] hover:text-[#ff3b30] transition text-xs">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'members' && (
            <div className="space-y-2">
              {state.members.map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-xl p-3">
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.name}{m.id === store.getCurrentMemberId() && <span className="text-xs text-[#86868b] font-normal ml-1">(You)</span>}</p>
                    <p className="text-[10px] text-[#86868b]">{m.email}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#e8e8ed] dark:bg-[#3a3a3c] text-[#6e6e73] dark:text-[#aeaeb2] font-medium">{m.role}</span>
                  {m.id !== 'user-1' && (
                    <button onClick={() => store.deleteMember(m.id)}
                      className="text-[#86868b] hover:text-[#ff3b30] transition text-xs">Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'trash' && (() => {
            const trashItems = store.getTrash();
            const getDaysLeft = (deletedAt: string) => {
              const deleted = new Date(deletedAt);
              const expiry = new Date(deleted);
              expiry.setDate(expiry.getDate() + 30);
              const now = new Date();
              return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            };
            return (
              <div>
                {trashItems.length > 0 && (
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-[#86868b] dark:text-[#6e6e73]">
                      {trashItems.length} item{trashItems.length > 1 ? 's' : ''} in trash
                    </p>
                    <button
                      onClick={() => { if (window.confirm('Permanently delete all items in trash? This cannot be undone.')) store.emptyTrash(); }}
                      className="text-[11px] text-[#ff3b30] hover:text-[#ff3b30] font-medium px-2 py-1 rounded-lg hover:bg-[#ff3b30]/5 dark:hover:bg-[#ff3b30]/10 transition"
                    >
                      Empty trash
                    </button>
                  </div>
                )}

                {trashItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[#86868b] dark:text-[#6e6e73]">
                    <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <p className="text-sm font-medium">Trash is empty</p>
                    <p className="text-xs mt-1">Deleted items will appear here for 30 days</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {trashItems.map(item => {
                      const daysLeft = getDaysLeft(item.deletedAt);
                      const isCard = item.type === 'card';
                      const name = isCard ? (item.data as Card).title : (item.data as Column).title;
                      const deletedDate = new Date(item.deletedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                      return (
                        <div key={item.id} className="flex items-center gap-3 bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-xl p-3">
                          {/* Icon */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCard ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' : 'bg-purple-50 dark:bg-purple-900/30 text-purple-500'}`}>
                            {isCard ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#1d1d1f] dark:text-[#e5e5ea] truncate">{name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isCard ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400'}`}>
                                {isCard ? 'Card' : 'List'}
                                {!isCard && item.associatedCards && item.associatedCards.length > 0 && ` + ${item.associatedCards.length} card${item.associatedCards.length > 1 ? 's' : ''}`}
                              </span>
                              <span className="text-[10px] text-[#86868b]">Deleted {deletedDate}</span>
                              <span className={`text-[10px] font-medium ${daysLeft <= 3 ? 'text-[#ff3b30]' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
                                {daysLeft}d left
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => store.restoreFromTrash(item.id)}
                              className="text-[11px] text-primary hover:text-primary-dark font-medium px-2 py-1 rounded hover:bg-primary/5 transition"
                              title="Restore"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => { if (window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) store.permanentDeleteFromTrash(item.id); }}
                              className="text-[#86868b] hover:text-[#ff3b30] transition p-1 rounded hover:bg-[#ff3b30]/5 dark:hover:bg-red-900/20"
                              title="Delete permanently"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">Items are automatically deleted after 30 days in the trash.</p>
                </div>
              </div>
            );
          })()}

          {tab === 'archive' && (() => {
            const archiveItems = store.getArchive();
            return (
              <div>
                {archiveItems.length > 0 && (
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-[#86868b] dark:text-[#6e6e73]">
                      {archiveItems.length} item{archiveItems.length > 1 ? 's' : ''} archived
                    </p>
                  </div>
                )}

                {archiveItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[#86868b] dark:text-[#6e6e73]">
                    <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    <p className="text-sm font-medium">Archive is empty</p>
                    <p className="text-xs mt-1">Archived lists and cards will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {archiveItems.map(item => {
                      const isCard = item.type === 'card';
                      const name = isCard ? (item.data as Card).title : (item.data as Column).title;
                      const archivedDate = new Date(item.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                      return (
                        <div key={item.id} className="flex items-center gap-3 bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-xl p-3">
                          {/* Icon */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCard ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' : 'bg-purple-50 dark:bg-purple-900/30 text-purple-500'}`}>
                            {isCard ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#1d1d1f] dark:text-[#e5e5ea] truncate">{name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isCard ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400'}`}>
                                {isCard ? 'Card' : 'List'}
                                {!isCard && item.associatedCards && item.associatedCards.length > 0 && ` + ${item.associatedCards.length} card${item.associatedCards.length > 1 ? 's' : ''}`}
                              </span>
                              <span className="text-[10px] text-[#86868b]">Archived {archivedDate}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => store.restoreFromArchive(item.id)}
                              className="text-[11px] text-primary hover:text-primary-dark font-medium px-2 py-1 rounded hover:bg-primary/5 transition"
                              title="Restore"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => { if (window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) store.deleteFromArchive(item.id); }}
                              className="text-[#86868b] hover:text-[#ff3b30] transition p-1 rounded hover:bg-[#ff3b30]/5 dark:hover:bg-red-900/20"
                              title="Delete permanently"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-400 font-medium">Archived items are kept permanently until you restore or delete them.</p>
                </div>
              </div>
            );
          })()}

          {tab !== 'general' && tab !== 'trash' && tab !== 'archive' && (
            <div className="mt-4 flex gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                placeholder={tab === 'members' ? 'Name' : tab === 'columns' ? 'New list name' : `New ${tab.slice(0, -1)} name`}
                className="flex-1 text-sm border border-[#d2d2d7] dark:border-[#424245] dark:bg-[#2c2c2e] dark:text-[#f5f5f7] rounded-xl px-3 py-2 outline-none focus:border-[#0071e3]" />
              {tab === 'labels' && (
                <ColorPicker value={newColor} onChange={setNewColor} size="md" />
              )}
              {tab === 'members' && (
                <>
                  <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder="Email"
                    className="flex-1 text-sm border border-[#d2d2d7] dark:border-[#424245] dark:bg-[#2c2c2e] dark:text-[#f5f5f7] rounded-xl px-3 py-2 outline-none focus:border-[#0071e3]" />
                  <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}
                    className="text-xs border border-[#d2d2d7] dark:border-[#424245] dark:bg-[#2c2c2e] dark:text-[#f5f5f7] rounded-xl px-2 outline-none">
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </>
              )}
              <button onClick={handleAdd}
                className="bg-[#0071e3] text-white text-sm px-4 py-2 rounded-full hover:bg-[#0077ED] transition">
                Add
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
