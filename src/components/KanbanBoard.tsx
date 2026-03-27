import { useState, useCallback } from 'react';
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { CardDetailPanel } from './CardDetailPanel';
import type { Card } from '../types';

export function KanbanBoard() {
  const { state } = useBoard();
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

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
        <div className="flex-1 overflow-x-auto overflow-y-auto p-6">
          {swimlanes.map(swimlane => (
            <div key={swimlane.id} className="mb-6">
              {swimlanes.length > 1 && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => store.updateSwimlane(swimlane.id, { collapsed: !swimlane.collapsed })}
                    className="text-slate-400 hover:text-slate-600 transition"
                  >
                    <svg className={`w-4 h-4 transition-transform ${swimlane.collapsed ? '' : 'rotate-90'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{swimlane.title}</h3>
                  <span className="text-[10px] text-slate-400">
                    ({filteredCards.filter(c => c.swimlaneId === swimlane.id).length} cards)
                  </span>
                </div>
              )}
              {!swimlane.collapsed && (
                <div className="flex gap-4">
                  {columns.map(col => (
                    <KanbanColumn
                      key={`${col.id}-${swimlane.id}`}
                      column={col}
                      cards={getColumnCards(col.id, swimlane.id)}
                      swimlaneId={swimlane.id}
                      onCardClick={handleCardClick}
                    />
                  ))}
                </div>
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
