import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card, Column } from '../types';
import { KanbanCard } from './KanbanCard';
import { store } from '../store/boardStore';
import { useState } from 'react';

interface Props {
  column: Column;
  cards: Card[];
  swimlaneId: string;
  onCardClick: (card: Card) => void;
  dragHandleProps?: Record<string, unknown>;
}

export function KanbanColumn({ column, cards, swimlaneId, onCardClick, dragHandleProps }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(column.title);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showListSettings, setShowListSettings] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState(column.title);
  const [settingsWipLimit, setSettingsWipLimit] = useState(String(column.wipLimit));
  const [settingsColor, setSettingsColor] = useState(column.color);
  const droppableId = `${column.id}::${swimlaneId}`;

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: 'column', columnId: column.id, swimlaneId },
  });

  const wipExceeded = column.wipLimit > 0 && cards.length > column.wipLimit;
  const wipAtLimit = column.wipLimit > 0 && cards.length === column.wipLimit;

  const handleAddCard = () => {
    if (newTitle.trim()) {
      store.addCard({ title: newTitle.trim(), columnId: column.id, swimlaneId });
      setNewTitle('');
      setShowAdd(false);
    }
  };

  return (
    <div className="flex-shrink-0 w-72 rounded-xl overflow-hidden" style={{ backgroundColor: `${column.color}10` }}>
      <div className="h-1.5 w-full" style={{ backgroundColor: column.color }} />
      <div className="flex items-center justify-between py-2.5 px-3">
        <div className="flex items-center gap-2">
          {dragHandleProps && (
            <button {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 touch-none -ml-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
              </svg>
            </button>
          )}
          {isEditing ? (
            <input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={() => {
                if (editTitle.trim()) store.updateColumn(column.id, { title: editTitle.trim() });
                else setEditTitle(column.title);
                setIsEditing(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                if (e.key === 'Escape') { setEditTitle(column.title); setIsEditing(false); }
              }}
              className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide bg-amber-50 dark:bg-slate-700 border border-primary rounded px-1.5 py-0.5 outline-none w-28"
            />
          ) : (
            <h3
              onDoubleClick={() => { setEditTitle(column.title); setIsEditing(true); }}
              className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide cursor-pointer hover:text-primary transition group/rename flex items-center gap-1"
              title="Double-click to rename"
            >
              {column.title}
              <svg className="w-3 h-3 text-slate-300 dark:text-slate-500 opacity-0 group-hover/rename:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </h3>
          )}
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
            wipExceeded ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' :
            wipAtLimit ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400' :
            'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}>
            {cards.length}{column.wipLimit > 0 ? `/${column.wipLimit}` : ''}
          </span>
        </div>

        {/* 3-dot menu */}
        <div className="relative">
          <button
            onClick={() => setShowColumnMenu(!showColumnMenu)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {showColumnMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColumnMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-20 py-1 w-44">
                {/* List Settings */}
                <button
                  onClick={() => {
                    setSettingsTitle(column.title);
                    setSettingsWipLimit(String(column.wipLimit));
                    setSettingsColor(column.color);
                    setShowListSettings(true);
                    setShowColumnMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  List settings
                </button>

                {/* Archive List */}
                <button
                  onClick={() => {
                    store.deleteColumn(column.id);
                    setShowColumnMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  Archive list
                </button>

                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />

                {/* Delete List */}
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${column.title}" and all its cards? This cannot be undone.`)) {
                      store.deleteColumn(column.id);
                    }
                    setShowColumnMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete list
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* List Settings Modal */}
      {showListSettings && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setShowListSettings(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto w-full max-w-sm bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">List Settings</h3>
                <button onClick={() => setShowListSettings(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="px-5 py-3 space-y-3">
                {/* Title */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Title</label>
                  <input
                    value={settingsTitle}
                    onChange={e => setSettingsTitle(e.target.value)}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200"
                  />
                </div>

                {/* WIP Limit */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">WIP Limit <span className="normal-case">(0 = unlimited)</span></label>
                  <input
                    type="number"
                    min="0"
                    value={settingsWipLimit}
                    onChange={e => setSettingsWipLimit(e.target.value)}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 outline-none focus:border-primary bg-white dark:bg-slate-700 dark:text-slate-200"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#94a3b8','#6366f1','#f59e0b','#8b5cf6','#10b981','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316'].map(c => (
                      <button
                        key={c}
                        onClick={() => setSettingsColor(c)}
                        className={`w-7 h-7 rounded-full transition ring-offset-2 dark:ring-offset-slate-800 ${settingsColor === c ? 'ring-2 ring-primary scale-110' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
                <button onClick={() => setShowListSettings(false)}
                  className="text-xs text-slate-500 dark:text-slate-400 px-3 py-1.5 hover:text-slate-700 dark:hover:text-slate-200 transition">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    store.updateColumn(column.id, {
                      title: settingsTitle.trim() || column.title,
                      wipLimit: Math.max(0, parseInt(settingsWipLimit) || 0),
                      color: settingsColor,
                    });
                    setShowListSettings(false);
                  }}
                  className="text-xs bg-primary text-white px-4 py-1.5 rounded-lg hover:bg-primary-dark transition font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <div
        ref={setNodeRef}
        className={`min-h-[60px] rounded-b-xl p-2 space-y-2 transition-colors ${
          isOver ? 'ring-2 ring-primary/30' : ''
        } ${wipExceeded ? 'ring-2 ring-red-200' : ''}`}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <KanbanCard key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </SortableContext>

        {showAdd ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 p-2">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCard(); if (e.key === 'Escape') setShowAdd(false); }}
              placeholder="Card title..."
              className="w-full text-sm border-none outline-none placeholder:text-slate-300 dark:placeholder:text-slate-500 mb-2 bg-transparent dark:text-slate-100"
            />
            <div className="flex gap-1">
              <button onClick={handleAddCard}
                className="text-xs bg-primary text-white px-3 py-1 rounded-md hover:bg-primary-dark transition">
                Add
              </button>
              <button onClick={() => setShowAdd(false)}
                className="text-xs text-slate-400 px-2 py-1 hover:text-slate-600 dark:hover:text-slate-300 transition">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary py-2 px-2 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700/40 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add a card
          </button>
        )}
      </div>
    </div>
  );
}
