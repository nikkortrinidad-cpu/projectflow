import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useRoute, navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
import type { ColumnId, Priority, Task, Client, Service, Member, TaskComment } from '../types/flizow';
import { daysBetween, formatMonthDay } from '../utils/dateFormat';
import FlizowCardModal from '../components/FlizowCardModal';
import { BoardFilters, applyFilters, EMPTY_FILTERS, type BoardFilterState } from '../components/BoardFilters';
import { EditServiceModal } from '../components/EditServiceModal';

/**
 * Service Kanban board — per-client workspace for a single service. Shows
 * the service's tasks grouped into five columns (To Do, In Progress,
 * Blocked, Needs Review, Done). Drag-and-drop moves cards between columns
 * via the flizowStore; visual language matches the mockup's `.board` +
 * `.column` + `.card` classes.
 *
 * First-pass scope:
 *   ✓ Breadcrumb + action buttons
 *   ✓ Filters bar (search functional; chips visual only)
 *   ✓ 5 columns — Blocked hides when empty
 *   ✓ Cards with labels, due pill, priority accent, assignee avatar
 *   ✓ Drag-drop between columns
 *   ✓ Add-card inline in To Do
 *   ○ Card Detail modal (separate TODO)
 *   ○ Sort / Group-by / Priority / Assignee filters (separate TODO)
 *   ○ WIP limits / column settings (separate TODO)
 */

// ── Column definitions ───────────────────────────────────────────────

const COLUMNS: Array<{ id: ColumnId; title: string; dot: string; emptyHide?: boolean }> = [
  { id: 'todo',       title: 'To Do',        dot: 'todo' },
  { id: 'inprogress', title: 'In Progress',  dot: 'progress' },
  { id: 'blocked',    title: 'Blocked',      dot: 'blocked', emptyHide: true },
  { id: 'review',     title: 'Needs Review', dot: 'review' },
  { id: 'done',       title: 'Done',         dot: 'done' },
];

// ── Page ─────────────────────────────────────────────────────────────

export function BoardPage() {
  const route = useRoute();
  const { data } = useFlizow();

  const serviceId = route.params.id;
  const service = useMemo(
    () => data.services.find(s => s.id === serviceId),
    [data.services, serviceId],
  );
  const client = useMemo(
    () => service ? data.clients.find(c => c.id === service.clientId) : undefined,
    [data.clients, service],
  );

  if (!service || !client) {
    return (
      <div className="view view-board active" data-view="board">
        <EmptyState serviceId={serviceId} />
      </div>
    );
  }

  return (
    <div className="view view-board active" data-view="board">
      <BoardBody
        client={client}
        service={service}
        tasks={data.tasks.filter(t => t.serviceId === service.id)}
        members={data.members}
        taskComments={data.taskComments}
        todayISO={data.today}
      />
    </div>
  );
}

function EmptyState({ serviceId }: { serviceId?: string }) {
  return (
    <main style={{ padding: '64px 32px', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ fontSize: 12, color: 'var(--text-soft)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        No service selected
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 12px', color: 'var(--text)' }}>
        {serviceId ? `Service "${serviceId}" not found` : 'Pick a service to open its board'}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
        Boards are scoped to a service. Open a client and click a service card to land here.
      </p>
      <a
        href="#clients"
        onClick={(e) => { e.preventDefault(); navigate('#clients'); }}
        className="btn-sm"
        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        ← Back to clients
      </a>
    </main>
  );
}

// ── Board body (interactive shell) ───────────────────────────────────

function BoardBody({
  client,
  service,
  tasks,
  members,
  taskComments,
  todayISO,
}: {
  client: Client;
  service: Service;
  tasks: Task[];
  members: Member[];
  taskComments: TaskComment[];
  todayISO: string;
}) {
  const { store } = useFlizow();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<BoardFilterState>(EMPTY_FILTERS);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Selected card in the detail modal. null = modal closed. Reset any
  // time the user navigates away from this page (unmount handles it).
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Auto-open a card if another surface (touchpoints "On board ↗",
  // command palette, etc.) dropped its id in sessionStorage. One-shot —
  // we clear the key immediately so a refresh doesn't re-open it.
  useEffect(() => {
    const pending = sessionStorage.getItem('flizow-open-card');
    if (!pending) return;
    sessionStorage.removeItem('flizow-open-card');
    if (tasks.some(t => t.id === pending)) {
      setSelectedTaskId(pending);
    }
    // We only need to fire once per board mount — the service id is the
    // mount boundary so we key off it. Re-navigations to the same board
    // with a new pending card will land via the service-id change below.
  }, [service.id, tasks]);

  // Per-task comment count. Built once per comment-array change so card
  // tiles don't each scan the whole list — O(n+m) instead of O(n*m).
  const commentCountByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of taskComments) {
      map.set(c.taskId, (map.get(c.taskId) ?? 0) + 1);
    }
    return map;
  }, [taskComments]);

  const sensors = useSensors(
    // Small activation distance so clicks on cards still open them while
    // drags need a real gesture. 5px is enough to feel deliberate without
    // requiring a full hold.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const filteredTasks = useMemo(
    () => applyFilters(tasks, filters, todayISO, search),
    [tasks, filters, search, todayISO],
  );

  // Bucket tasks into columns (skip Blocked column in rendering if empty
  // and there's no explicit need to show the dropzone).
  const tasksByColumn = useMemo(() => {
    const byCol = new Map<ColumnId, Task[]>();
    COLUMNS.forEach(c => byCol.set(c.id, []));
    filteredTasks.forEach(t => {
      const bucket = byCol.get(t.columnId);
      if (bucket) bucket.push(t);
    });
    return byCol;
  }, [filteredTasks]);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    // Droppable ids are `col:<columnId>`; cards are the task id directly.
    // Accept drop onto either — dropping onto a card means "put it in that
    // card's column".
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
    store.moveTask(taskId, targetCol);
  }

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : undefined;
  const assigneeOf = (t: Task) => members.find(m => m.id === t.assigneeId);

  return (
    <>
      <Breadcrumb client={client} service={service} />
      <FiltersBar
        search={search}
        onSearch={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
        members={members}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {COLUMNS.map((col) => {
            const colTasks = tasksByColumn.get(col.id) ?? [];
            if (col.emptyHide && colTasks.length === 0) return null;
            return (
              <Column
                key={col.id}
                columnId={col.id}
                title={col.title}
                dot={col.dot}
                tasks={colTasks}
                todayISO={todayISO}
                assigneeOf={assigneeOf}
                commentCountByTask={commentCountByTask}
                serviceId={service.id}
                clientId={client.id}
                onOpenCard={setSelectedTaskId}
                limit={service.columnLimits?.[col.id]}
                onSetLimit={(next) => flizowStore.setColumnLimit(service.id, col.id, next)}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <CardTile
              task={activeTask}
              assignee={assigneeOf(activeTask)}
              todayISO={todayISO}
              commentCount={commentCountByTask.get(activeTask.id) ?? 0}
              dragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedTaskId && (
        <FlizowCardModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </>
  );
}

// ── Breadcrumb ───────────────────────────────────────────────────────

function Breadcrumb({ client, service }: { client: Client; service: Service }) {
  // Inline rename on the current-page crumb. Same pattern as the client
  // hero rename: cursor:text + hover tint + ring on focus, no pencil icon.
  // This is where users land right after the Add Service modal closes, so
  // rename-in-place here beats a separate "Edit service" modal for the
  // name field. The "⋯" menu next to it handles the rest of the metadata
  // (type, template, progress, next deliverable) via EditServiceModal.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(service.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  // Sync draft when the service id changes (user navigated to a different
  // board mid-edit, unlikely but cheap to guard).
  useEffect(() => {
    setDraft(service.name);
    setEditing(false);
    setMenuOpen(false);
  }, [service.id, service.name]);

  useEffect(() => {
    if (!editing) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(t);
  }, [editing]);

  // Close the overflow menu on outside click or Esc.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: PointerEvent) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function commit() {
    const next = draft.trim();
    if (!next) {
      setDraft(service.name);
      setEditing(false);
      return;
    }
    if (next !== service.name) {
      flizowStore.updateService(service.id, { name: next });
    }
    setEditing(false);
  }

  return (
    <div className="breadcrumb-bar">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li>
            <a
              href="#clients"
              onClick={(e) => { e.preventDefault(); navigate('#clients'); }}
            >
              Clients
            </a>
          </li>
          <li>
            <a
              href={`#clients/${client.id}`}
              onClick={(e) => { e.preventDefault(); navigate(`#clients/${client.id}`); }}
            >
              {client.name}
            </a>
          </li>
          <li>
            {editing ? (
              <input
                ref={inputRef}
                className="breadcrumb-rename-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setDraft(service.name);
                    setEditing(false);
                  }
                }}
                aria-label="Service name"
              />
            ) : (
              <span
                className="breadcrumb-rename"
                aria-current="page"
                role="button"
                tabIndex={0}
                title="Click to rename"
                onClick={() => setEditing(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEditing(true);
                  }
                }}
              >
                {service.name}
              </span>
            )}
            {/* Overflow menu for the service metadata the inline rename
                can't cover: type, template, progress, next deliverable.
                Visually quiet — a 22px dot button that only reveals its
                tint on hover, so the rename stays the primary affordance. */}
            {!editing && (
              <div ref={menuWrapRef} className="breadcrumb-menu-wrap">
                <button
                  type="button"
                  className="breadcrumb-menu-btn"
                  aria-label="Service actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(v => !v)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="14" height="14">
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
                <div className={`tb-menu${menuOpen ? ' open' : ''}`} role="menu">
                  <div
                    role="menuitem"
                    tabIndex={0}
                    className="tb-menu-item"
                    onClick={() => { setMenuOpen(false); setShowEditModal(true); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setMenuOpen(false);
                        setShowEditModal(true);
                      }
                    }}
                  >
                    Edit service details…
                  </div>
                </div>
              </div>
            )}
          </li>
        </ol>
      </nav>
      <div className="board-actions">
        <button type="button" className="btn-sm" disabled title="Board settings (coming soon)">
          <SettingsIcon />
          Board Settings
        </button>
        <button type="button" className="btn-sm" disabled title="Members (coming soon)">
          <PeopleIcon />
          Members
        </button>
        <button type="button" className="btn-sm" disabled title="Analytics (coming soon)">
          <BarsIcon />
          Analytics
        </button>
      </div>

      {showEditModal && (
        <EditServiceModal
          service={service}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}

// ── Filters bar (first-pass: search only, chips visual) ──────────────

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
    <div className="filters-bar" role="search" aria-label="Board filters">
      <label className="filter-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder="Search cards…"
          aria-label="Search cards on this board"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <kbd>⌘F</kbd>
      </label>
      <BoardFilters
        state={filters}
        onChange={onFiltersChange}
        members={members}
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
  todayISO,
  assigneeOf,
  commentCountByTask,
  serviceId,
  clientId,
  onOpenCard,
  limit,
  onSetLimit,
}: {
  columnId: ColumnId;
  title: string;
  dot: string;
  tasks: Task[];
  todayISO: string;
  assigneeOf: (t: Task) => Member | undefined;
  commentCountByTask: Map<string, number>;
  serviceId: string;
  clientId: string;
  onOpenCard: (taskId: string) => void;
  limit: number | undefined;
  onSetLimit: (next: number | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${columnId}` });
  const [limitEditorOpen, setLimitEditorOpen] = useState(false);
  const isOverLimit = limit !== undefined && tasks.length > limit;
  return (
    <div className="column" data-dot={dot} ref={setNodeRef} style={isOver ? { borderColor: 'var(--hover-blue)' } : undefined}>
      <div className="column-header">
        <div className="column-title-group">
          <span className="column-dot" />
          <div className="column-title">{title}</div>
          <div className={`column-count${isOverLimit ? ' is-over-limit' : ''}`}>
            {limit !== undefined ? `${tasks.length} / ${limit}` : tasks.length}
          </div>
        </div>
        <div className="column-menu-wrap">
          <button
            className={`column-menu${limitEditorOpen ? ' open' : ''}`}
            aria-label="Column options"
            aria-expanded={limitEditorOpen ? 'true' : 'false'}
            onClick={() => setLimitEditorOpen((v) => !v)}
          >⋯</button>
          {limitEditorOpen && (
            <WipLimitEditor
              columnTitle={title}
              currentLimit={limit}
              onSave={(next) => { onSetLimit(next); setLimitEditorOpen(false); }}
              onClose={() => setLimitEditorOpen(false)}
            />
          )}
        </div>
      </div>
      <div className="column-cards">
        {tasks.map(task => (
          <DraggableCard
            key={task.id}
            task={task}
            assignee={assigneeOf(task)}
            commentCount={commentCountByTask.get(task.id) ?? 0}
            todayISO={todayISO}
            onOpen={onOpenCard}
          />
        ))}
        {columnId === 'todo' && (
          <AddCardInline serviceId={serviceId} clientId={clientId} />
        )}
      </div>
    </div>
  );
}

// ── WIP Limit editor (column ⋯ popover) ─────────────────────────────

/**
 * Tiny inline popover for setting/clearing a column's WIP cap. Lives
 * under the column header's ⋯ button, dismisses on outside-click or
 * Esc, saves on Enter or explicit Save. Empty input = clear the cap.
 *
 * We keep the UX direct — no modal, no settings page — because setting
 * a cap is a two-field action (a number + a decision) and stacking a
 * modal on top of the board for that would break flow.
 */
function WipLimitEditor({
  columnTitle,
  currentLimit,
  onSave,
  onClose,
}: {
  columnTitle: string;
  currentLimit: number | undefined;
  onSave: (next: number | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<string>(currentLimit !== undefined ? String(currentLimit) : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 60ms delay so the button's click-outside doesn't immediately
    // close us before we've rendered our own listeners.
    const t = setTimeout(() => inputRef.current?.select(), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    const onPointer = (e: PointerEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      onSave(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 1) {
      // Bad input = treat as clear, matching the empty case. Better
      // than silently dropping the user's submit.
      onSave(null);
      return;
    }
    onSave(n);
  };

  return (
    <div
      ref={popRef}
      className="wip-limit-pop"
      role="dialog"
      aria-label={`Set WIP limit for ${columnTitle}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="wip-limit-label">WIP limit · {columnTitle}</div>
      <div className="wip-limit-row">
        <input
          ref={inputRef}
          type="number"
          min={1}
          max={99}
          step={1}
          inputMode="numeric"
          className="wip-limit-input"
          placeholder="No limit"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
          }}
        />
        <button
          type="button"
          className="wip-limit-save"
          onClick={commit}
        >
          Save
        </button>
      </div>
      {currentLimit !== undefined && (
        <button
          type="button"
          className="wip-limit-clear"
          onClick={() => { onSave(null); }}
        >
          Clear limit
        </button>
      )}
      <div className="wip-limit-hint">
        Leave blank for no cap. Exceeding the cap tints the count amber —
        nothing's blocked.
      </div>
    </div>
  );
}

// ── Draggable Card ───────────────────────────────────────────────────

function DraggableCard({
  task,
  assignee,
  commentCount,
  todayISO,
  onOpen,
}: {
  task: Task;
  assignee: Member | undefined;
  commentCount: number;
  todayISO: string;
  onOpen: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0 : 1 }}
    >
      <CardTile task={task} assignee={assignee} commentCount={commentCount} todayISO={todayISO} onOpen={onOpen} />
    </div>
  );
}

function CardTile({
  task,
  assignee,
  commentCount,
  todayISO,
  dragging,
  onOpen,
}: {
  task: Task;
  assignee: Member | undefined;
  commentCount: number;
  todayISO: string;
  dragging?: boolean;
  onOpen?: (taskId: string) => void;
}) {
  const due = dueDescriptor(task, todayISO);
  const isDone = task.columnId === 'done';
  return (
    <div
      className={`card${isDone ? ' is-done' : ''}`}
      data-priority={task.priority}
      data-assignees={assignee?.initials?.toLowerCase() ?? ''}
      style={dragging ? { boxShadow: '0 10px 30px rgba(10,132,255,0.25)', transform: 'rotate(-1deg)' } : undefined}
      onClick={(e) => {
        // Disable navigation while a drag is in motion.
        if (dragging) return;
        e.stopPropagation();
        // Open the card detail modal. The DragOverlay instance passes no
        // onOpen, so this is a no-op there.
        if (onOpen) onOpen(task.id);
      }}
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
          {/* Hide the comment chip entirely when zero — a "0" next to an
              icon reads like a dead stat. Show it once there's something
              to show. */}
          {commentCount > 0 && (
            <span title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}>
              <CommentIcon />
              {commentCount}
            </span>
          )}
        </div>
        {assignee ? (
          <div className="card-assignee" title={assignee.name}>{assignee.initials}</div>
        ) : (
          <div className="card-assignee empty" title="Unassigned">·</div>
        )}
      </div>
    </div>
  );
}

// ── Add Card inline form ────────────────────────────────────────────

function AddCardInline({ serviceId, clientId }: { serviceId: string; clientId: string }) {
  const { store } = useFlizow();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    const id = `task-${Math.random().toString(36).slice(2, 10)}`;
    store.addTask({
      id,
      serviceId,
      clientId,
      title: trimmed,
      columnId: 'todo',
      priority: 'medium',
      assigneeId: null,
      labels: [],
      dueDate: iso,
      createdAt: now.toISOString(),
    });
    setTitle('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="add-card-btn" onClick={() => setOpen(true)}>
        ＋ Add Card
      </button>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--hairline)',
        borderRadius: 12,
        background: 'var(--bg-elev)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <textarea
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { setOpen(false); setTitle(''); }
        }}
        placeholder="What needs to get done?"
        rows={2}
        style={{
          resize: 'none',
          border: '1px solid var(--hairline-soft)',
          borderRadius: 8,
          padding: '8px 10px',
          fontFamily: 'inherit',
          fontSize: 'var(--fs-base)',
          color: 'var(--text)',
          background: 'var(--bg)',
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          className="btn-sm"
          onClick={() => { setOpen(false); setTitle(''); }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-sm"
          onClick={submit}
          disabled={!title.trim()}
          style={{
            background: title.trim() ? 'var(--highlight)' : 'var(--bg-soft)',
            color: title.trim() ? '#fff' : 'var(--text-faint)',
            borderColor: title.trim() ? 'var(--highlight)' : 'var(--hairline)',
          }}
        >
          Add card
        </button>
      </div>
    </div>
  );
}

// ── Due-date descriptor ──────────────────────────────────────────────

type DueDescriptor = { label: string; mod: '' | 'due-overdue' | 'due-soon' | 'due-waiting' | 'due-blocked'; icon: ReactElement };

function dueDescriptor(task: Task, todayISO: string): DueDescriptor | null {
  if (task.columnId === 'done') {
    return { label: formatMonthDay(task.dueDate), mod: '', icon: <CheckIcon /> };
  }
  if (task.columnId === 'blocked') {
    const days = Math.max(0, -daysBetween(todayISO, task.createdAt.slice(0, 10)));
    const label = days > 0 ? `Blocked · ${days}d` : 'Blocked';
    return { label, mod: 'due-blocked', icon: <BlockedIcon /> };
  }
  if (!task.dueDate) return null;
  const diff = daysBetween(todayISO, task.dueDate);
  if (diff < 0) {
    const days = Math.abs(diff);
    return { label: `Overdue ${days}d`, mod: 'due-overdue', icon: <ClockIcon /> };
  }
  if (diff === 0) return { label: 'Today', mod: 'due-soon', icon: <CalIcon /> };
  if (diff <= 3) return { label: formatMonthDay(task.dueDate), mod: 'due-soon', icon: <CalIcon /> };
  if (task.columnId === 'review') {
    return { label: `Waiting · ${diff}d`, mod: 'due-waiting', icon: <ClockIcon /> };
  }
  return { label: formatMonthDay(task.dueDate), mod: '', icon: <CalIcon /> };
}

// ── Icons ────────────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
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
function BarsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
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
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
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

// Unused underscore marker so Priority isn't an unused import.
// (Keeps types.ts changes cheap if the field gets consumed later.)
export type _BoardPriorityMarker = Priority;
