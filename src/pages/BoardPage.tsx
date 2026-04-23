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
import { ConfirmDangerDialog } from '../components/ConfirmDangerDialog';

/**
 * Service Kanban board — per-client workspace for a single service. Shows
 * the service's tasks grouped into five columns (To Do, In Progress,
 * Blocked, Needs Review, Done). Drag-and-drop moves cards between columns
 * via the flizowStore; visual language matches the mockup's `.board` +
 * `.column` + `.card` classes.
 *
 * What's live today:
 *   - Breadcrumb with Board Settings menu (edit service, archived cards,
 *     analytics jump, delete service)
 *   - Filters bar: search + priority + due + sort (assignees + labels
 *     from the shared BoardFilters component)
 *   - 5 columns — Blocked hides when empty
 *   - Cards with labels, due pill, priority accent, assignee avatars
 *   - Drag-drop between columns (via flizowStore.moveTask)
 *   - Add-card inline in To Do only (per product rule)
 *   - Full card detail modal (FlizowCardModal) — open on click or
 *     on mount via sessionStorage / route deep-link
 *   - Archive / unarchive flow with triage modal from Board Settings
 *   - Per-column WIP limits via the column ⋯ popover
 *
 * Not yet:
 *   - Column color / reorder editing
 *   - Swimlanes (group-by assignee / priority)
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
  // URL-level deep-link: `#board/{svcId}/card/{cardId}` sets this and
  // we pass it through to BoardBody so the auto-open effect can open
  // the card on mount. Works for pasted links — sessionStorage alone
  // wouldn't survive a new-tab open.
  const cardIdFromRoute = route.params.cardId;
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

  // Split the service's task list into live vs archived up front so
  // BoardBody (columns, filters, WIP counts) only ever sees live work.
  // Archived cards surface exclusively through the Archived-cards modal
  // opened from the Board Settings menu.
  const serviceTasks = data.tasks.filter(t => t.serviceId === service.id);
  const liveTasks = serviceTasks.filter(t => !t.archived);
  const archivedTasks = serviceTasks.filter(t => !!t.archived);

  return (
    <div className="view view-board active" data-view="board">
      <BoardBody
        client={client}
        service={service}
        tasks={liveTasks}
        archivedTasks={archivedTasks}
        members={data.members}
        taskComments={data.taskComments}
        todayISO={data.today}
        isFavorite={data.favoriteServiceIds.includes(service.id)}
        taskCount={liveTasks.length}
        initialCardId={cardIdFromRoute}
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
  archivedTasks,
  members,
  taskComments,
  todayISO,
  isFavorite,
  taskCount,
  initialCardId,
}: {
  client: Client;
  service: Service;
  tasks: Task[];
  /** Archived tasks for this service — rendered only in the Archived-
   *  cards modal, never in the columns. */
  archivedTasks: Task[];
  members: Member[];
  taskComments: TaskComment[];
  todayISO: string;
  isFavorite: boolean;
  taskCount: number;
  initialCardId?: string;
}) {
  const { store } = useFlizow();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<BoardFilterState>(EMPTY_FILTERS);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Selected card in the detail modal. null = modal closed. Reset any
  // time the user navigates away from this page (unmount handles it).
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Auto-open a card if either (a) another surface (touchpoints
  // "On board ↗", command palette, etc.) dropped its id in
  // sessionStorage, or (b) the route is a deep link of the form
  // `#board/{svcId}/card/{cardId}` (shared via "Copy link"). Route
  // params survive a new-tab open; sessionStorage doesn't. One-shot
  // per mount — we clear the key immediately so a refresh doesn't
  // spuriously re-open.
  useEffect(() => {
    const fromStorage = sessionStorage.getItem('flizow-open-card');
    if (fromStorage) sessionStorage.removeItem('flizow-open-card');
    const pending = fromStorage ?? initialCardId;
    if (!pending) return;
    if (tasks.some(t => t.id === pending)) {
      setSelectedTaskId(pending);
    }
    // We only need to fire once per board mount — the service id is the
    // mount boundary so we key off it. Re-navigations to the same board
    // with a new pending card will land via the service-id change below.
  }, [service.id, tasks, initialCardId]);

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
      <Breadcrumb
        client={client}
        service={service}
        members={members}
        isFavorite={isFavorite}
        taskCount={taskCount}
        archivedTasks={archivedTasks}
        onOpenCardFromArchive={setSelectedTaskId}
      />
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

function Breadcrumb({
  client,
  service,
  members,
  isFavorite,
  taskCount,
  archivedTasks,
  onOpenCardFromArchive,
}: {
  client: Client;
  service: Service;
  members: Member[];
  isFavorite: boolean;
  taskCount: number;
  /** Archived cards for this service, forwarded from BoardBody so the
   *  "Archived cards" menu item can show the count and feed the modal. */
  archivedTasks: Task[];
  /** Opens a card in BoardBody's detail modal. Used when the user
   *  clicks an archived card row in the archived-cards modal. */
  onOpenCardFromArchive: (taskId: string) => void;
}) {
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
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Archived-cards modal: opened from Board Settings → "Archived cards…".
  // The list is a direct render of `archivedTasks` (passed in from the
  // page), so Restore / open-card / permanent-delete flows work without
  // lifting state higher than the modal itself.
  const [archivedOpen, setArchivedOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const membersWrapRef = useRef<HTMLDivElement>(null);
  const settingsWrapRef = useRef<HTMLDivElement>(null);

  // Resolve the client's team roster: AM on top, operators below. We
  // read from client.amId + client.teamIds (the "Project team" on the
  // client About tab) so the same source of truth powers both views.
  const am = useMemo(
    () => client.amId ? members.find(m => m.id === client.amId) ?? null : null,
    [client.amId, members],
  );
  const team = useMemo(
    () => client.teamIds.map(id => members.find(m => m.id === id)).filter((m): m is Member => !!m),
    [client.teamIds, members],
  );

  // Sync draft when the service id changes (user navigated to a different
  // board mid-edit, unlikely but cheap to guard).
  useEffect(() => {
    setDraft(service.name);
    setEditing(false);
    setMenuOpen(false);
    setMembersOpen(false);
    setSettingsOpen(false);
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

  // Same outside-click + Esc pattern for the Members popover.
  useEffect(() => {
    if (!membersOpen) return;
    function onPointer(e: PointerEvent) {
      if (membersWrapRef.current && !membersWrapRef.current.contains(e.target as Node)) {
        setMembersOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMembersOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [membersOpen]);

  // Same outside-click + Esc pattern for the Board Settings menu. We
  // don't close it while the confirm-delete dialog is open, because the
  // dialog lives outside the settings wrap and clicking inside it would
  // otherwise dismiss the (already closed) menu unnecessarily.
  useEffect(() => {
    if (!settingsOpen) return;
    function onPointer(e: PointerEvent) {
      if (settingsWrapRef.current && !settingsWrapRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

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
        <div ref={settingsWrapRef} className="board-settings-wrap">
          <button
            type="button"
            className="btn-sm"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(v => !v)}
          >
            <SettingsIcon />
            Board Settings
          </button>
          <div className={`tb-menu${settingsOpen ? ' open' : ''}`} role="menu" style={{ minWidth: 220 }}>
            <div
              role="menuitem"
              tabIndex={0}
              className="tb-menu-item"
              onClick={() => {
                flizowStore.toggleServiceFavorite(service.id);
                setSettingsOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  flizowStore.toggleServiceFavorite(service.id);
                  setSettingsOpen(false);
                }
              }}
            >
              <StarIcon filled={isFavorite} />
              {isFavorite ? 'Unpin from My Boards' : 'Pin to My Boards'}
            </div>
            <div
              role="menuitem"
              tabIndex={0}
              className="tb-menu-item"
              onClick={() => { setSettingsOpen(false); setShowEditModal(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSettingsOpen(false);
                  setShowEditModal(true);
                }
              }}
            >
              <EditPenIcon />
              Edit service details…
            </div>
            <div
              role="menuitem"
              tabIndex={0}
              className="tb-menu-item"
              onClick={() => { setSettingsOpen(false); setArchivedOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSettingsOpen(false);
                  setArchivedOpen(true);
                }
              }}
            >
              <ArchiveIcon />
              Archived cards
              {archivedTasks.length > 0 && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 11,
                    color: 'var(--text-faint)',
                    background: 'var(--bg-faint)',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontWeight: 600,
                  }}
                >
                  {archivedTasks.length}
                </span>
              )}
            </div>
            <div className="tb-menu-divider" />
            <div
              role="menuitem"
              tabIndex={0}
              className="tb-menu-item danger"
              onClick={() => { setSettingsOpen(false); setConfirmDelete(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSettingsOpen(false);
                  setConfirmDelete(true);
                }
              }}
            >
              <TrashIcon />
              Delete service…
            </div>
          </div>
        </div>
        <div ref={membersWrapRef} className="board-members-wrap">
          <button
            type="button"
            className="btn-sm"
            aria-haspopup="dialog"
            aria-expanded={membersOpen}
            title={`${(am ? 1 : 0) + team.length} on this client's team`}
            onClick={() => setMembersOpen(v => !v)}
          >
            <PeopleIcon />
            Members
            {(am || team.length > 0) && (
              <span className="members-count-pill" aria-hidden="true">
                {(am ? 1 : 0) + team.length}
              </span>
            )}
          </button>
          {membersOpen && (
            <BoardMembersPopover
              am={am}
              team={team}
              clientName={client.name}
              onManage={() => {
                setMembersOpen(false);
                navigate(`#clients/${client.id}`);
              }}
            />
          )}
        </div>
        <button
          type="button"
          className="btn-sm"
          title={`Analytics filtered to ${service.name}`}
          onClick={() => {
            // Hand off the service id to the Analytics page via
            // sessionStorage — same one-shot pattern board uses for
            // auto-opening cards. The query-string alternative would
            // need router support; this is simpler and scoped.
            sessionStorage.setItem('flizow-analytics-service', service.id);
            navigate('#analytics');
          }}
        >
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

      {confirmDelete && (
        <ConfirmDangerDialog
          title={`Delete "${service.name}"?`}
          body={
            <>
              This removes the service board and cascades{' '}
              <strong>{taskCount}</strong> card{taskCount === 1 ? '' : 's'}.
              This can't be undone.
            </>
          }
          confirmLabel="Delete service"
          onConfirm={() => {
            const clientId = client.id;
            flizowStore.deleteService(service.id);
            setConfirmDelete(false);
            // After the service is gone, the current board URL is a dead
            // link — route back to the client so the user lands somewhere
            // meaningful instead of the empty state.
            navigate(`#clients/${clientId}`);
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}

      {archivedOpen && (
        <ArchivedCardsModal
          serviceName={service.name}
          archivedTasks={archivedTasks}
          members={members}
          onClose={() => setArchivedOpen(false)}
          onOpenCard={(taskId) => {
            // Closing the archived modal first ensures the card modal
            // paints on top of a clean overlay; opening an archived card
            // in the detail view still works because the modal reads
            // from the store directly (archived field is not a render
            // gate on the card modal itself).
            setArchivedOpen(false);
            onOpenCardFromArchive(taskId);
          }}
        />
      )}
    </div>
  );
}

// ── Members popover (board toolbar) ──────────────────────────────────

/**
 * Shows who's on the client's team, scoped to this board. The AM lives
 * on top as a solid-fill avatar (the one person we always escalate to);
 * operators below in a compact grid. The footer punts to the client's
 * About tab for actual team management — this popover is read-only,
 * because the board toolbar isn't the right place to hire/fire.
 */
function BoardMembersPopover({ am, team, clientName, onManage }: {
  am: Member | null;
  team: Member[];
  clientName: string;
  onManage: () => void;
}) {
  const empty = !am && team.length === 0;
  return (
    <div
      className="board-members-pop"
      role="dialog"
      aria-label={`Team on ${clientName}`}
    >
      <div className="board-members-head">
        <div className="board-members-title">Team on {clientName}</div>
        <div className="board-members-sub">
          {empty
            ? 'No one assigned yet'
            : `${(am ? 1 : 0) + team.length} ${(am ? 1 : 0) + team.length === 1 ? 'person' : 'people'}`}
        </div>
      </div>
      {empty ? (
        <div className="board-members-empty">
          Nobody's on this client yet. Assign an AM or add operators from the client profile.
        </div>
      ) : (
        <>
          <div className="board-members-group">
            <div className="board-members-label">Account manager</div>
            {am ? (
              <MembersRow member={am} solid />
            ) : (
              <div className="board-members-muted">No AM assigned</div>
            )}
          </div>
          {team.length > 0 && (
            <div className="board-members-group">
              <div className="board-members-label">
                Project team <span className="board-members-count">{team.length}</span>
              </div>
              <div className="board-members-list">
                {team.map(m => <MembersRow key={m.id} member={m} />)}
              </div>
            </div>
          )}
        </>
      )}
      <button
        type="button"
        className="board-members-manage"
        onClick={onManage}
      >
        Manage team in client profile →
      </button>
    </div>
  );
}

function MembersRow({ member, solid = false }: { member: Member; solid?: boolean }) {
  const avatarStyle = solid
    ? { background: member.color, color: '#fff' }
    : { background: member.bg ?? 'var(--bg-soft)', color: member.color };
  return (
    <div className="board-members-row">
      <span className="board-members-avatar" style={avatarStyle} aria-hidden="true">
        {member.initials}
      </span>
      <div className="board-members-body">
        <div className="board-members-name">{member.name}</div>
        {member.role && <div className="board-members-role">{member.role}</div>}
      </div>
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
function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: filled ? '#f59e0b' : 'currentColor' }}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function EditPenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}

// ── Archived cards modal ─────────────────────────────────────────────
//
// Surfaces every archived card on the current service board in one
// place, with three actions per row: open the card detail modal
// (for context), restore to the active board (single click, idempotent),
// or permanently delete (confirmed). Sorted newest-first on archived
// timestamp so the most recently hidden cards are easiest to find.
//
// The modal reads directly off the archivedTasks prop passed in from
// BoardPage — no internal state, so restoring a card causes the parent
// to re-render with a shorter list and the row animates out naturally.
//
// Shell shared with EditServiceModal (wip-modal-*). The list itself
// uses flat rows rather than kanban-style tiles; this is a triage view,
// not a second board.

function ArchivedCardsModal({
  serviceName,
  archivedTasks,
  members,
  onClose,
  onOpenCard,
}: {
  serviceName: string;
  archivedTasks: Task[];
  members: Member[];
  onClose: () => void;
  onOpenCard: (taskId: string) => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Esc always closes. We attach at mount so the modal keyboard pattern
  // matches EditServiceModal and FlizowCardModal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        // If a confirm dialog is open, let its own Esc handler close it
        // first — don't skip two layers at once.
        if (confirmDeleteId) return;
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmDeleteId]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Sort newest-first on archivedAt. Guard against legacy rows that lack
  // the timestamp — treat them as oldest so they sink below everything
  // else (rare, but we don't want NaN comparisons in the sort).
  const sorted = useMemo(
    () =>
      [...archivedTasks].sort((a, b) =>
        (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''),
      ),
    [archivedTasks],
  );

  const pendingDelete = confirmDeleteId
    ? archivedTasks.find(t => t.id === confirmDeleteId) ?? null
    : null;

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archived-cards-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 640 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="archived-cards-title">
            Archived cards
          </h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div
          className="wip-modal-body"
          style={{ paddingTop: 12, paddingBottom: 12, maxHeight: '60vh', overflow: 'auto' }}
        >
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 13,
              color: 'var(--text-soft)',
              lineHeight: 1.5,
            }}
          >
            Cards archived from <strong style={{ color: 'var(--text)' }}>{serviceName}</strong>.
            Archived cards keep all their comments, checklist, and activity —
            restore one to put it back in its column, or delete it for good.
          </p>

          {sorted.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-faint)',
                fontSize: 14,
                lineHeight: 1.6,
                background: 'var(--bg-faint)',
                borderRadius: 10,
                border: '1px dashed var(--hairline-soft)',
              }}
            >
              No archived cards on this board.
              <br />
              Archive a card from its detail modal's kebab menu.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sorted.map(t => (
                <ArchivedCardRow
                  key={t.id}
                  task={t}
                  members={members}
                  onOpen={() => onOpenCard(t.id)}
                  onRestore={() => flizowStore.unarchiveTask(t.id)}
                  onRequestDelete={() => setConfirmDeleteId(t.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>

      {pendingDelete && (
        <ConfirmDangerDialog
          title={`Delete "${pendingDelete.title}" permanently?`}
          body={
            <>
              This removes the card and everything attached to it — comments,
              checklist, activity history. Restore from archive instead if you
              just want to hide it for now.
            </>
          }
          confirmLabel="Delete card"
          onConfirm={() => {
            flizowStore.deleteTask(pendingDelete.id);
            setConfirmDeleteId(null);
          }}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

/** One row in the Archived-cards modal. Keeps row-local hover / focus
 *  behaviour out of the parent so the list can grow without prop-drilling. */
function ArchivedCardRow({
  task,
  members,
  onOpen,
  onRestore,
  onRequestDelete,
}: {
  task: Task;
  members: Member[];
  onOpen: () => void;
  onRestore: () => void;
  onRequestDelete: () => void;
}) {
  const primary = task.assigneeId
    ? members.find(m => m.id === task.assigneeId) ?? null
    : null;
  const columnLabel = (id: ColumnId): string => {
    switch (id) {
      case 'todo': return 'To Do';
      case 'inprogress': return 'In Progress';
      case 'blocked': return 'Blocked';
      case 'review': return 'Needs Review';
      case 'done': return 'Done';
    }
  };
  const archivedLabel = task.archivedAt
    ? formatArchivedTime(task.archivedAt)
    : 'recently';

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--hairline-soft)',
        background: 'var(--bg-elev)',
      }}
    >
      {/* Primary assignee avatar — same pattern as board tiles. Falls
          back to a neutral glyph when the card has no owner. */}
      {primary ? (
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: primary.type === 'operator' ? primary.bg : primary.color,
            color: primary.type === 'operator' ? primary.color : '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 26px',
          }}
          title={primary.name}
        >
          {primary.initials}
        </span>
      ) : (
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--bg-faint)',
            color: 'var(--text-faint)',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 26px',
          }}
        >
          ?
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={onOpen}
          style={{
            display: 'block',
            width: '100%',
            background: 'transparent',
            border: 0,
            padding: 0,
            margin: 0,
            textAlign: 'left',
            font: 'inherit',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
          aria-label={`Open ${task.title}`}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {task.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-faint)',
              marginTop: 2,
            }}
          >
            {columnLabel(task.columnId)} · archived {archivedLabel}
          </div>
        </button>
      </div>

      <button
        type="button"
        className="btn-sm"
        onClick={onRestore}
        aria-label={`Restore ${task.title} to the board`}
        style={{ whiteSpace: 'nowrap' }}
      >
        <UndoIcon />
        Restore
      </button>

      <button
        type="button"
        onClick={onRequestDelete}
        aria-label={`Delete ${task.title} permanently`}
        title="Delete permanently"
        style={{
          width: 32,
          height: 32,
          border: '1px solid var(--hairline-soft)',
          background: 'var(--bg-elev)',
          color: 'var(--status-fire)',
          cursor: 'pointer',
          borderRadius: 8,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 32px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </li>
  );
}

/** Friendly relative label for archivedAt. Matches the card-modal
 *  comment timestamp style so the dates read uniformly across the app. */
function formatArchivedTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'recently';
  const diffSec = Math.round((Date.now() - t) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.round(diffSec / 86_400);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Unused underscore marker so Priority isn't an unused import.
// (Keeps types.ts changes cheap if the field gets consumed later.)
export type _BoardPriorityMarker = Priority;
