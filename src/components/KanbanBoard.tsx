import { useState, useCallback, useRef } from 'react';
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { CardDetailPanel } from './CardDetailPanel';
import type { Card, Column } from '../types';

function SortableColumn({ column, children }: { column: Column; children: (dragHandleProps: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sortable-col-${column.id}`,
    data: { type: 'sortable-column', columnId: column.id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(listeners ?? {})}
    </div>
  );
}

export function KanbanBoard() {
  const { state } = useBoard();
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const newColumnInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const filteredCards = store.getFilteredCards();
  const columns = [...state.columns].sort((a, b) => a.order - b.order);
  const swimlanes = [...state.swimlanes].sort((a, b) => a.order - b.order);

  const getColumnCards = useCallback((columnId: string, swimlaneId: string) => {
    return filteredCards
      .filter(c => c.columnId === columnId && c.swimlaneId === swimlaneId)
      .sort((a, b) => a.order - b.order);
  }, [filteredCards]);

  const handleDragStart = (event: DragStartEvent) => {
    const card = event.active.data.current?.card as Card | undefined;
    if (card) setActiveCard(card);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'card' && overData?.type === 'column') {
      const card = activeData.card as Card;
      const targetColumnId = overData.columnId as string;
      const targetSwimlaneId = overData.swimlaneId as string;
      if (card.columnId !== targetColumnId || card.swimlaneId !== targetSwimlaneId) {
        store.moveCard(card.id, targetColumnId, targetSwimlaneId, 0);
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Handle column reordering
    if (activeData?.type === 'sortable-column' && overData?.type === 'sortable-column') {
      const activeColId = activeData.columnId as string;
      const overColId = overData.columnId as string;
      if (activeColId !== overColId) {
        const fromIndex = columns.findIndex(c => c.id === activeColId);
        const toIndex = columns.findIndex(c => c.id === overColId);
        if (fromIndex !== -1 && toIndex !== -1) {
          store.reorderColumns(fromIndex, toIndex);
        }
      }
      return;
    }

    if (activeData?.type === 'card') {
      const card = activeData.card as Card;

      if (overData?.type === 'card') {
        const overCard = overData.card as Card;
        if (card.id !== overCard.id) {
          store.moveCard(card.id, overCard.columnId, overCard.swimlaneId, overCard.order);
        }
      } else if (overData?.type === 'column') {
        const targetColumnId = overData.columnId as string;
        const targetSwimlaneId = overData.swimlaneId as string;
        store.moveCard(card.id, targetColumnId, targetSwimlaneId, 0);
      }
    }
  };

  const handleCardClick = (card: Card) => {
    // Refresh the card from state in case it changed
    const fresh = state.cards.find(c => c.id === card.id);
    setSelectedCard(fresh || card);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-auto p-6 bg-[#f5f5f7] dark:bg-[#1c1c1e]">
          {swimlanes.map(swimlane => (
            <div key={swimlane.id} className="mb-6">
              {swimlanes.length > 1 && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => store.updateSwimlane(swimlane.id, { collapsed: !swimlane.collapsed })}
                    className="text-[#86868b] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:text-[#f5f5f7] transition"
                  >
                    <svg className={`w-4 h-4 transition-transform ${swimlane.collapsed ? '' : 'rotate-90'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <h3 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">{swimlane.title}</h3>
                  <span className="text-[10px] text-[#86868b]">
                    ({filteredCards.filter(c => c.swimlaneId === swimlane.id).length} cards)
                  </span>
                </div>
              )}
              {!swimlane.collapsed && (
                <SortableContext items={columns.map(c => `sortable-col-${c.id}`)} strategy={horizontalListSortingStrategy}>
                  <div className="flex gap-3">
                    {columns.map(col => (
                      <SortableColumn key={`${col.id}-${swimlane.id}`} column={col}>
                        {(dragHandleProps) => (
                          <KanbanColumn
                            column={col}
                            cards={getColumnCards(col.id, swimlane.id)}
                            swimlaneId={swimlane.id}
                            onCardClick={handleCardClick}
                            dragHandleProps={dragHandleProps}
                          />
                        )}
                      </SortableColumn>
                    ))}

                    {/* Add another list */}
                    {swimlane.id === swimlanes[0]?.id && (
                      <div className="shrink-0 w-64">
                        {showAddColumn ? (
                          <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-sm border border-[#d2d2d7] dark:border-[#424245] p-3">
                            <input
                              ref={newColumnInputRef}
                              value={newColumnTitle}
                              onChange={e => setNewColumnTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && newColumnTitle.trim()) {
                                  store.addColumn(newColumnTitle.trim());
                                  setNewColumnTitle('');
                                  setShowAddColumn(false);
                                } else if (e.key === 'Escape') {
                                  setNewColumnTitle('');
                                  setShowAddColumn(false);
                                }
                              }}
                              placeholder="Enter list title..."
                              className="w-full text-sm font-medium border border-[#d2d2d7] dark:border-[#424245] rounded-xl px-3 py-2 outline-none focus:border-[#0071e3] bg-white dark:bg-[#2c2c2e] dark:text-[#f5f5f7] mb-2"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  if (newColumnTitle.trim()) {
                                    store.addColumn(newColumnTitle.trim());
                                    setNewColumnTitle('');
                                    setShowAddColumn(false);
                                  }
                                }}
                                className="text-xs bg-[#0071e3] text-white px-3 py-1.5 rounded-full hover:bg-[#0077ed] transition font-medium"
                              >
                                Add list
                              </button>
                              <button
                                onClick={() => { setNewColumnTitle(''); setShowAddColumn(false); }}
                                className="text-xs text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] px-2 py-1.5 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setShowAddColumn(true); setTimeout(() => newColumnInputRef.current?.focus(), 50); }}
                            className="w-full flex items-center justify-start gap-2 py-3 px-4 rounded-full bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] text-sm font-medium text-[#86868b] hover:border-[#0071e3] hover:text-[#0071e3] hover:bg-white/80 dark:hover:bg-[#2c2c2e] transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add another list
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </SortableContext>
              )}
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeCard && (
            <div className="rotate-3 opacity-90">
              <KanbanCard card={activeCard} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {selectedCard && (
        <CardDetailPanel
          key={selectedCard.id}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </>
  );
}
