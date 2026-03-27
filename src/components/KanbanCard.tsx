import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card } from '../types';
import { useBoard } from '../store/useStore';

const priorityColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
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
      className="relative bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 p-3 cursor-grab active:cursor-grabbing
        hover:border-primary/40 hover:shadow-md transition-all group"
    >
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-3.5 h-3.5 text-slate-300 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>
      {cardLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {cardLabels.map(l => (
            <span key={l.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: l.color }}>{l.name}</span>
          ))}
        </div>
      )}

      <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1.5 leading-snug">{card.title}</h4>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityColors[card.priority]}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${priorityDots[card.priority]}`}></span>
            {card.priority}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {card.dueDate && (
            <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
              {new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {card.comments.length > 0 && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
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
