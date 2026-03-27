import { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';
import type { Column, UserRole } from '../types';
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
      className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
      <button {...listeners} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none">
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
  const [tab, setTab] = useState<'columns' | 'swimlanes' | 'labels' | 'members'>('columns');
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
    { id: 'columns' as const, label: 'Columns' },
    { id: 'swimlanes' as const, label: 'Swimlanes' },
    { id: 'labels' as const, label: 'Labels' },
    { id: 'members' as const, label: 'Team' },
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Board Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-slate-100">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 text-sm py-2.5 font-medium transition ${
                tab === t.id ? 'text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
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
                          className="w-full text-sm bg-transparent outline-none font-medium rounded px-1.5 py-0.5 -ml-1.5 border border-transparent hover:border-slate-200 focus:border-primary focus:bg-amber-50 transition" />
                        <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 opacity-0 group-hover/colname:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">WIP:</span>
                        <input type="number" min="0" value={col.wipLimit}
                          onChange={e => store.updateColumn(col.id, { wipLimit: parseInt(e.target.value) || 0 })}
                          className="w-12 text-xs text-center border border-slate-200 rounded px-1 py-0.5 outline-none" />
                      </div>
                      <button onClick={() => store.deleteColumn(col.id)}
                        className="text-slate-300 hover:text-red-500 transition">
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
                <div key={s.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                  <div className="relative flex-1 group/swimname">
                    <input value={s.title}
                      onChange={e => store.updateSwimlane(s.id, { title: e.target.value })}
                      className="w-full text-sm bg-transparent outline-none font-medium rounded px-1.5 py-0.5 -ml-1.5 border border-transparent hover:border-slate-200 focus:border-primary focus:bg-amber-50 transition" />
                    <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 opacity-0 group-hover/swimname:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <button onClick={() => store.deleteSwimlane(s.id)}
                    className="text-slate-300 hover:text-red-500 transition text-xs">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'labels' && (
            <div className="space-y-2">
              {state.labels.map(l => (
                <div key={l.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 text-sm font-medium">{l.name}</span>
                  <button onClick={() => store.deleteLabel(l.id)}
                    className="text-slate-300 hover:text-red-500 transition text-xs">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'members' && (
            <div className="space-y-2">
              {state.members.map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-[10px] text-slate-400">{m.email}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-medium">{m.role}</span>
                  {m.id !== 'user-1' && (
                    <button onClick={() => store.deleteMember(m.id)}
                      className="text-slate-300 hover:text-red-500 transition text-xs">Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder={tab === 'members' ? 'Name' : `New ${tab.slice(0, -1)} name`}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary" />
            {tab === 'labels' && (
              <ColorPicker value={newColor} onChange={setNewColor} size="md" />
            )}
            {tab === 'members' && (
              <>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="Email"
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary" />
                <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}
                  className="text-xs border border-slate-200 rounded-lg px-2 outline-none">
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </>
            )}
            <button onClick={handleAdd}
              className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary-dark transition">
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
