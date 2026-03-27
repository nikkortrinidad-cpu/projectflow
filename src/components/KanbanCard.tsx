import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card } from '../types';
import { useBoard } from '../store/useStore';

const priorityColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const priorityDots: Record<string, string> = {
  low: 'bg-blue-400',
  medium: 'bg-yellow-400',
  high: 'bg-orange-400',
  urgent: 'bg-red-500',
};

export function KanbanCard({ card, onClick }: { card: Card; onClick: () => void }) {
  const { state } = useBoard();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const assignee = state.members.find(m => m.id === card.assigneeId);
  const cardLabels = state.labels.filter(l => card.labels.includes(l.id));
  const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white rounded-lg border border-slate-200 p-3 cursor-grab active:cursor-grabbing
        hover:border-primary/40 hover:shadow-md transition-all group"
    >
      {cardLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {cardLabels.map(l => (
            <span key={l.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: l.color }}>{l.name}</span>
          ))}
        </div>
      )}

      <h4 className="text-sm font-medium text-slate-800 mb-1.5 leading-snug">{card.title}</h4>

      {card.description && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-2">{card.description}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityColors[card.priority]}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${priorityDots[card.priority]}`}></span>
            {card.priority}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {card.dueDate && (
            <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
              {new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {card.comments.length > 0 && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {card.comments.length}
            </span>
          )}
          {assignee && (
            <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center"
              title={assignee.name}>
              {assignee.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
