import { useMemo, useState, type ReactElement } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { daysBetween, formatMonthDay } from '../utils/dateFormat';
import { BoardFilters, applyFilters, EMPTY_FILTERS, type BoardFilterState } from '../components/BoardFilters';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
import type { OpsTask, Member, ColumnId } from '../types/flizow';
import FlizowCardModal from '../components/FlizowCardModal';

/**
 * Ops board — internal-team kanban for the work the agency does for
 * *itself*: hiring, finance, brand, legal, tooling, process. Client
 * deliverables live on per-service boards; this is where the partners
 * track the business's own to-dos.
 *
 * Data source lives in `flizowStore.data.opsTasks` with seed+backfill
 * handled in `migrate()`. Assignees resolve through `data.members` like
 * client cards do — the old raw-initials string was replaced with real
 * member ids so the modal's assignee picker and the filter bar's
 * assignee chip work off the same pool the rest of the app uses.
 *
 * Clicking a card opens `FlizowCardModal` with `kind="opsTask"`, which
 * hides the comments + activity tabs (not wired for ops yet) but shares
 * the same title, status, priority, date, label, and checklist UI.
 */

type DueMod = '' | 'due-overdue' | 'due-soon' | 'due-waiting' | 'due-blocked';

// ── Column layout ────────────────────────────────────────────────────

const COLUMNS: Array<{ id: ColumnId; title: string; dot: string; emptyHide?: boolean }> = [
  { id: 'todo',       title: 'To Do',        dot: 'todo' },
  { id: 'inprogress', title: 'In Progress',  dot: 'progress' },
  { id: 'blocked',    title: 'Blocked',      dot: 'blocked', emptyHide: true },
  { id: 'review',     title: 'Needs Review', dot: 'review' },
  { id: 'done',       title: 'Done',         dot: 'done' },
];

// ── Page ─────────────────────────────────────────────────────────────

export function OpsPage() {
  const { data } = useFlizow();
  const tasks = data.opsTasks;
  const members = data.members;

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<BoardFilterState>(EMPTY_FILTERS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Archived ops cards stay in the pile (same rule as client tasks) but
  // drop out of every render + count. Restore goes through the same
  // titlebar menu in FlizowCardModal.
  const liveTasks = useMemo(() => tasks.filter(t => !t.archived), [tasks]);

  const filteredTasks = useMemo(
    () => applyFilters(liveTasks, filters, todayISO(), search),
    [liveTasks, filters, search],
  );

  const tasksByColumn = useMemo(() => {
    const byCol = new Map<ColumnId, OpsTask[]>();
    COLUMNS.forEach(c => byCol.set(c.id, []));
    filteredTasks.forEach(t => {
      const bucket = byCol.get(t.columnId);
      if (bucket) bucket.push(t);
    });
    return byCol;
  }, [filteredTasks]);

  const stats = useMemo(() => {
    const total = liveTasks.length;
    const inProgress = liveTasks.filter(t => t.columnId === 'inprogress').length;
    const blocked = liveTasks.filter(t => t.columnId === 'blocked').length;
    return { total, inProgress, blocked };
  }, [liveTasks]);

  // Assignee filter pool — every member currently owning an ops card,
  // plus the seeded ops-team roster so the picker isn't empty when the
  // board happens to be filtered down to zero cards. This mirrors the
  // way BoardPage derives its member list from a single service.
  const opsAssigneeMembers = useMemo(() => {
    const byId = new Map<string, Member>();
    for (const m of members) {
      if (m.id.startsWith('ops-')) byId.set(m.id, m);
    }
    for (const t of tasks) {
      if (t.assigneeId) {
        const m = members.find(m => m.id === t.assigneeId);
        if (m) byId.set(m.id, m);
      }
      for (const aid of t.assigneeIds ?? []) {
        const m = members.find(m => m.id === aid);
        if (m) byId.set(m.id, m);
      }
    }
    return Array.from(byId.values());
  }, [members, tasks]);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    let targetCol: ColumnId | null = null;
    if (overId.startsWith('col:')) {
      targetCol = overId.slice(4) as ColumnId;
    } else {
      const target = tasks.find(t => t.id === overId);
      if (target) targetCol = target.columnId;
    }
    if (!targetCol) return;
    const source = tasks.find(t => t.id === taskId);
    if (!source || source.columnId === targetCol) return;
    flizowStore.moveOpsTask(taskId, targetCol);
  }

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : undefined;

  return (
    <div className="view view-ops active" data-view="ops">
      <Header stats={stats} />
      <FiltersBar
        search={search}
        onSearch={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
        members={opsAssigneeMembers}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="board" id="opsBoard">
          {COLUMNS.map(col => {
            const colTasks = tasksByColumn.get(col.id) ?? [];
            if (col.emptyHide && colTasks.length === 0) return null;
            return (
              <Column
                key={col.id}
                columnId={col.id}
                title={col.title}
                dot={col.dot}
                tasks={colTasks}
                members={members}
                onOpenTask={(id) => setSelectedId(id)}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? <CardTile task={activeTask} members={members} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {selectedId && (
        <FlizowCardModal
          taskId={selectedId}
          kind="opsTask"
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────

function Header({ stats }: { stats: { total: number; inProgress: number; blocked: number } }) {
  return (
    <div className="ops-header-bar">
      <div className="ops-header-text">
        <div className="ops-header-eyebrow">Internal work</div>
        <h1 className="ops-header-title">Ops board</h1>
        <p className="ops-header-sub">
          Work the team is doing for the business itself — hiring, finance, process, tooling.
          Client deliverables stay inside each client profile.
        </p>
      </div>
      <div className="ops-header-stats" role="group" aria-label="Board summary">
        <div className="ops-header-stat"><strong>{stats.total}</strong> tasks</div>
        <div className="ops-header-stat"><strong>{stats.inProgress}</strong> in progress</div>
        {stats.blocked > 0 && (
          <div className="ops-header-stat ops-header-stat--blocked">
            <strong>{stats.blocked}</strong> blocked
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filters bar ──────────────────────────────────────────────────────

function FiltersBar({
  search,
  onSearch,
  filters,
  onFiltersChange,
  members,
}: {
  search: string;
  onSearch: (v: string) => void;
  filters: BoardFilterState;
  onFiltersChange: (next: BoardFilterState) => void;
  members: Member[];
}) {
  return (
    <div className="filters-bar" role="search" aria-label="Ops board filters">
      <label className="filter-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder="Search ops cards…"
          aria-label="Search cards on the ops board"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      {/* Labels stay hidden — ops tasks use free-text labels ('Hiring',
          'Legal', 'Brand'…) instead of the BOARD_LABELS palette the
          shared picker renders. Priority, Due, Assignees, Sort all work
          against the real member pool. */}
      <BoardFilters
        state={filters}
        onChange={onFiltersChange}
        members={members}
        show={{ labels: false }}
      />
    </div>
  );
}

// ── Column ───────────────────────────────────────────────────────────

function Column({
  columnId,
  title,
  dot,
  tasks,
  members,
  onOpenTask,
}: {
  columnId: ColumnId;
  title: string;
  dot: string;
  tasks: OpsTask[];
  members: Member[];
  onOpenTask: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${columnId}` });
  return (
    <div
      className="column"
      data-dot={dot}
      ref={setNodeRef}
      style={isOver ? { borderColor: 'var(--hover-blue)' } : undefined}
    >
      <div className="column-header">
        <div className="column-title-group">
          <span className="column-dot" />
          <div className="column-title">{title}</div>
          <div className="column-count">{tasks.length}</div>
        </div>
        <div className="column-menu-wrap">
          <button className="column-menu" aria-label="List options" disabled>⋯</button>
        </div>
      </div>
      <div className="column-cards">
        {tasks.map(task => (
          <DraggableCard
            key={task.id}
            task={task}
            members={members}
            onOpen={() => onOpenTask(task.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Draggable Card ───────────────────────────────────────────────────

function DraggableCard({
  task,
  members,
  onOpen,
}: {
  task: OpsTask;
  members: Member[];
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0 : 1 }}
      // The click handler lives on the wrapper div (not the inner tile)
      // so we can intercept *before* dnd-kit would treat a drag-start as
      // a potential selection. Pointer sensor's 5px activation distance
      // means a clean click with no horizontal travel never becomes a
      // drag — those land here as `click`.
      onClick={(e) => {
        // Suppress the click if dnd-kit is mid-drag. We check via the
        // isDragging flag dnd-kit surfaces; when true we're in a drop
        // transition and the user didn't mean to open the modal.
        if (isDragging) return;
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open card: ${task.title}`}
    >
      <CardTile task={task} members={members} />
    </div>
  );
}

function CardTile({
  task,
  members,
  dragging,
}: {
  task: OpsTask;
  members: Member[];
  dragging?: boolean;
}) {
  const isDone = task.columnId === 'done';
  const due = dueDescriptor(task);
  const assignee = task.assigneeId ? members.find(m => m.id === task.assigneeId) : null;

  return (
    <div
      className={`card${isDone ? ' is-done' : ''}`}
      data-priority={task.priority ?? ''}
      data-assignees={assignee?.initials.toLowerCase() ?? ''}
      style={dragging ? { boxShadow: '0 10px 30px rgba(10,132,255,0.25)', transform: 'rotate(-1deg)' } : undefined}
    >
      <div className="card-top">
        <div className="card-labels">
          {task.labels.slice(0, 2).map(label => (
            <span key={label} className="card-label">{label}</span>
          ))}
          {task.labels.length > 2 && (
            <span className="card-label">+{task.labels.length - 2}</span>
          )}
        </div>
        {due && (
          <div className={`card-due${due.mod ? ` ${due.mod}` : ''}`}>
            {due.icon}
            {due.label}
          </div>
        )}
      </div>
      <div className="card-title">{task.title}</div>
      <div className="card-footer">
        <div className="card-meta">
          {task.comments !== undefined && (
            <span>
              <CommentIcon />
              {task.comments}
            </span>
          )}
          {task.attachments !== undefined && (
            <span>
              <AttachIcon />
              {task.attachments}
            </span>
          )}
        </div>
        {assignee ? (
          <div
            className="card-assignee"
            title={assignee.name}
            style={assignee.type === 'operator' && assignee.bg
              ? { background: assignee.bg, color: assignee.color }
              : { background: assignee.color, color: '#fff' }
            }
          >
            {assignee.initials}
          </div>
        ) : (
          <div className="card-assignee" title="Unassigned" style={{ background: 'var(--bg-faint)', color: 'var(--text-faint)' }}>
            —
          </div>
        )}
      </div>
    </div>
  );
}

// ── Due helpers ──────────────────────────────────────────────────────

type DueDescriptor = { label: string; mod: DueMod; icon: ReactElement };

function dueDescriptor(task: OpsTask): DueDescriptor | null {
  if (task.overrideMod || task.overrideLabel) {
    const icon = task.overrideMod === 'due-blocked' ? <BlockedIcon /> : <ClockIcon />;
    return { label: task.overrideLabel ?? '', mod: task.overrideMod ?? '', icon };
  }
  if (task.columnId === 'done') return null;
  if (!task.dueDate) return null;
  const today = todayISO();
  const diff = daysBetween(today, task.dueDate);
  if (diff < 0) {
    return { label: `Overdue ${Math.abs(diff)}d`, mod: 'due-overdue', icon: <ClockIcon /> };
  }
  if (diff <= 3) {
    return { label: formatMonthDay(task.dueDate), mod: 'due-soon', icon: <CalIcon /> };
  }
  return { label: formatMonthDay(task.dueDate), mod: '', icon: <CalIcon /> };
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Icons ────────────────────────────────────────────────────────────
// Only the icons used inside cards (due pill, comment/attachment meta)
// live here. Filter-chip icons moved to BoardFilters.tsx when we stopped
// rendering a local filter bar.

function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function BlockedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
