import { useMemo, useState, type ReactElement } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { daysBetween, formatMonthDay } from '../utils/dateFormat';

/**
 * Ops board — internal-team kanban for the work the agency does for
 * *itself*: hiring, finance, brand, legal, tooling, process. Client
 * deliverables live on per-service boards; this is where the partners
 * track the business's own to-dos.
 *
 * Data for the first pass is local state seeded from the mockup. Each
 * column-move updates component state — no persistence yet. When the
 * ops data structure lands in the store (probably as a sibling of
 * Task under the Flizow data model) this view lights up automatically.
 */

// ── Types ────────────────────────────────────────────────────────────

type ColumnId = 'todo' | 'inprogress' | 'blocked' | 'review' | 'done';
type Priority = 'high' | 'medium' | 'low';
type DueMod = '' | 'due-overdue' | 'due-soon' | 'due-waiting' | 'due-blocked';

interface OpsTask {
  id: string;
  title: string;
  columnId: ColumnId;
  labels: string[];
  priority?: Priority;
  assignee: string; // initials
  dueDate?: string; // ISO YYYY-MM-DD — if blank, no date shown
  /** Authored date override so "Blocked · Xd" / "Waiting · Xd" render
   *  without needing a real timestamp on the card. Expressed as days ago. */
  enteredDaysAgo?: number;
  /** Override the computed due-mod when the mockup has a specific state
   *  (e.g. "Waiting · 3d" regardless of the actual due date). */
  overrideMod?: DueMod;
  overrideLabel?: string;
  comments?: number;
  attachments?: number;
}

// ── Seed (mirrors the mockup's 12 ops tasks) ─────────────────────────

const INITIAL_TASKS: OpsTask[] = [
  { id: 'ops-1',  columnId: 'todo',       priority: 'high',   labels: ['Hiring'],  assignee: 'KL', dueDate: '2026-04-24', title: 'Post Social Media Manager listing on LinkedIn and WeWorkRemotely', comments: 2 },
  { id: 'ops-2',  columnId: 'todo',       priority: 'medium', labels: ['Legal'],   assignee: 'RC', dueDate: '2026-04-28', title: 'Review Q2 retainer contracts — Acme, Summit, Cascade', comments: 1, attachments: 3 },
  { id: 'ops-3',  columnId: 'todo',       priority: 'medium', labels: ['Process'], assignee: 'RC', title: 'Draft team offsite agenda — June in Tahoe', comments: 4 },

  { id: 'ops-4',  columnId: 'inprogress', priority: 'high',   labels: ['Hiring'],  assignee: 'KL', dueDate: '2026-04-26', title: 'Build internal hiring pipeline in Ashby ATS', comments: 6, attachments: 2 },
  { id: 'ops-5',  columnId: 'inprogress', priority: 'high',   labels: ['Finance'], assignee: 'RC', dueDate: '2026-05-01', title: 'Migrate invoicing from Wave to QuickBooks Online', comments: 4, attachments: 1 },
  { id: 'ops-6',  columnId: 'inprogress', priority: 'medium', labels: ['Brand'],   assignee: 'CC', title: 'Refresh agency pricing sheet for 2026 retainers', comments: 2 },

  { id: 'ops-7',  columnId: 'blocked',    priority: 'high',   labels: ['Legal'],   assignee: 'RC', enteredDaysAgo: 2, overrideMod: 'due-blocked', overrideLabel: 'Blocked · 2d', title: 'Sign new office lease — waiting on landlord redlines', comments: 3, attachments: 2 },

  { id: 'ops-8',  columnId: 'review',     priority: 'medium', labels: ['Process'], assignee: 'KL', enteredDaysAgo: 3, overrideMod: 'due-waiting', overrideLabel: 'Waiting · 3d', title: 'Employee handbook v2 — final draft for legal review', comments: 8, attachments: 1 },
  { id: 'ops-9',  columnId: 'review',     priority: 'medium', labels: ['Brand'],   assignee: 'HS', enteredDaysAgo: 1, overrideMod: 'due-waiting', overrideLabel: 'Waiting · 1d', title: 'Portfolio case studies — 3 new drafts for site relaunch', comments: 5, attachments: 3 },

  { id: 'ops-10', columnId: 'done',       priority: 'medium', labels: ['Hiring'],  assignee: 'RC', title: 'Onboard Michael Potts — Paid Social Manager', comments: 9 },
  { id: 'ops-11', columnId: 'done',       priority: 'low',    labels: ['Tools'],   assignee: 'CC', title: 'Upgrade Notion workspace to Business plan', comments: 1 },
  { id: 'ops-12', columnId: 'done',       priority: 'medium', labels: ['Process'], assignee: 'RC', title: 'Q1 retro slide deck and action items', comments: 6, attachments: 2 },
];

const COLUMNS: Array<{ id: ColumnId; title: string; dot: string; emptyHide?: boolean }> = [
  { id: 'todo',       title: 'To Do',        dot: 'todo' },
  { id: 'inprogress', title: 'In Progress',  dot: 'progress' },
  { id: 'blocked',    title: 'Blocked',      dot: 'blocked', emptyHide: true },
  { id: 'review',     title: 'Needs Review', dot: 'review' },
  { id: 'done',       title: 'Done',         dot: 'done' },
];

// ── Page ─────────────────────────────────────────────────────────────

export function OpsPage() {
  const [tasks, setTasks] = useState<OpsTask[]>(INITIAL_TASKS);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.labels.some(l => l.toLowerCase().includes(q)) ||
      t.assignee.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const tasksByColumn = useMemo(() => {
    const byCol = new Map<ColumnId, OpsTask[]>();
    COLUMNS.forEach(c => byCol.set(c.id, []));
    filteredTasks.forEach(t => {
      const bucket = byCol.get(t.columnId);
      if (bucket) bucket.push(t);
    });
    return byCol;
  }, [filteredTasks]);

  // Stats update as tasks move between columns — the header isn't just
  // decoration, it's the quick-glance summary the partners use to size
  // up the week.
  const stats = useMemo(() => {
    const total = tasks.length;
    const inProgress = tasks.filter(t => t.columnId === 'inprogress').length;
    const blocked = tasks.filter(t => t.columnId === 'blocked').length;
    return { total, inProgress, blocked };
  }, [tasks]);

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
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, columnId: targetCol as ColumnId } : t));
  }

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : undefined;

  return (
    <div className="view view-ops active" data-view="ops">
      <Header stats={stats} />
      <FiltersBar search={search} onSearch={setSearch} />

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
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? <CardTile task={activeTask} dragging /> : null}
        </DragOverlay>
      </DndContext>
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

// ── Filters bar (search functional; chips visual until wiring pass) ──

function FiltersBar({ search, onSearch }: { search: string; onSearch: (v: string) => void }) {
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
      <button className="filter-chip" type="button" disabled title="Filter by assignee (coming soon)">
        <PeopleIcon /> Assignee <ChevronDown />
      </button>
      <button className="filter-chip" type="button" disabled title="Filter by label (coming soon)">
        <LabelIcon /> Labels <ChevronDown />
      </button>
      <button className="filter-chip" type="button" disabled title="Filter by priority (coming soon)">
        <FlagIcon /> Priority <ChevronDown />
      </button>
      <div className="filter-spacer" />
      <button className="filter-chip" type="button" disabled title="Sort (coming soon)">
        <SortIcon /> Sort: <strong style={{ fontWeight: 600, color: 'var(--text)' }}>Manual</strong> <ChevronDown />
      </button>
    </div>
  );
}

// ── Column ───────────────────────────────────────────────────────────

function Column({
  columnId,
  title,
  dot,
  tasks,
}: {
  columnId: ColumnId;
  title: string;
  dot: string;
  tasks: OpsTask[];
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
          <DraggableCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

// ── Draggable Card ───────────────────────────────────────────────────

function DraggableCard({ task }: { task: OpsTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0 : 1 }}
    >
      <CardTile task={task} />
    </div>
  );
}

function CardTile({ task, dragging }: { task: OpsTask; dragging?: boolean }) {
  const isDone = task.columnId === 'done';
  const due = dueDescriptor(task);
  return (
    <div
      className={`card${isDone ? ' is-done' : ''}`}
      data-priority={task.priority ?? ''}
      data-assignees={task.assignee.toLowerCase()}
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
        <div className="card-assignee" title={task.assignee}>{task.assignee}</div>
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

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function LabelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
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
function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M6 12h12" />
      <path d="M10 18h4" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
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
