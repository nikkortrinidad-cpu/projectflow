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
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          {dragHandleProps && (
            <button {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none -ml-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
              </svg>
            </button>
          )}
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
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
              className="text-sm font-semibold text-slate-700 uppercase tracking-wide bg-white border border-primary rounded px-1.5 py-0.5 outline-none w-28"
            />
          ) : (
            <h3
              onDoubleClick={() => { setEditTitle(column.title); setIsEditing(true); }}
              className="text-sm font-semibold text-slate-700 uppercase tracking-wide cursor-pointer hover:text-primary transition"
              title="Double-click to rename"
            >{column.title}</h3>
          )}
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
            wipExceeded ? 'bg-red-100 text-red-600' :
            wipAtLimit ? 'bg-yellow-100 text-yellow-600' :
            'bg-slate-100 text-slate-500'
          }`}>
            {cards.length}{column.wipLimit > 0 ? `/${column.wipLimit}` : ''}
          </span>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-[60px] rounded-xl p-2 space-y-2 transition-colors ${
          isOver ? 'bg-primary/5 ring-2 ring-primary/20' : 'bg-slate-50'
        } ${wipExceeded ? 'ring-2 ring-red-200 bg-red-50/50' : ''}`}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <KanbanCard key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </SortableContext>

        {showAdd && (
          <div className="bg-white rounded-lg border border-slate-200 p-2">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCard(); if (e.key === 'Escape') setShowAdd(false); }}
              placeholder="Card title..."
              className="w-full text-sm border-none outline-none placeholder:text-slate-300 mb-2"
            />
            <div className="flex gap-1">
              <button onClick={handleAddCard}
                className="text-xs bg-primary text-white px-3 py-1 rounded-md hover:bg-primary-dark transition">
                Add
              </button>
              <button onClick={() => setShowAdd(false)}
                className="text-xs text-slate-400 px-2 py-1 hover:text-slate-600 transition">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
