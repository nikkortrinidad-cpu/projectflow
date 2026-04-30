import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useRoute } from '../router';
import {
  ChartBarIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { daysBetween, formatMonthDay } from '../utils/dateFormat';
import { avatarStyle } from '../utils/avatar';
import { BoardFilters, applyFilters, EMPTY_FILTERS, type BoardFilterState } from '../components/BoardFilters';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
import type { OpsTask, Member, ColumnId } from '../types/flizow';
import FlizowCardModal from '../components/FlizowCardModal';
import { InlineCardComposer } from '../components/shared/InlineCardComposer';
import { TeamCapacityHeatmap } from '../components/TeamCapacityHeatmap';
import { NotesTab } from '../components/NotesTab';
import { OpsTimeOffTab } from '../components/OpsTimeOffTab';
import { useMemberProfile } from '../contexts/MemberProfileContext';
import { can } from '../utils/access';
import { useAuth } from '../contexts/AuthContext';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';

/**
 * Workspace-scope marker used as the `clientId` field on Ops notes.
 *
 * The Note type already requires a clientId (it was designed for client-
 * detail notes), and re-typing the field for one consumer would ripple
 * through the store, the demo seed, and every existing note. Using a
 * reserved string instead lets the same store methods serve both
 * surfaces without a schema change. Real client ids look like
 * 'cli-acme-rebrand' / random nanoid-style — '__ops__' won't ever
 * collide. ClientDetailPage's note filter (n.clientId === client.id)
 * silently excludes these from any client view, and the cascade-
 * delete on client removal compares by exact id so workspace notes
 * survive client deletions cleanly.
 */
const OPS_NOTES_CLIENT_ID = '__ops__';

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

// Fixed five-column board. We used to hide Blocked when empty, but the
// missing column read as a bug ("where's the Blocked column?") more
// often than it read as calm. Predictable layout wins over empty-state
// trimming on a board this small.
const COLUMNS: Array<{ id: ColumnId; title: string; dot: string }> = [
  { id: 'todo',       title: 'To Do',        dot: 'todo' },
  { id: 'inprogress', title: 'In Progress',  dot: 'progress' },
  { id: 'blocked',    title: 'Blocked',      dot: 'blocked' },
  { id: 'review',     title: 'Needs Review', dot: 'review' },
  { id: 'done',       title: 'Done',         dot: 'done' },
];

// ── Page ─────────────────────────────────────────────────────────────

type OpsTab = 'board' | 'brief' | 'capacity' | 'timeoff';

export function OpsPage() {
  const { data } = useFlizow();
  const tasks = data.opsTasks;
  const members = data.members;
  // Read the signed-in user's role so we can gate the Time off
  // Schedules tab to Owner/Admin. Member/Viewer skip the tab; the
  // page itself is already gated to view:ops by TopNav.
  const { user } = useAuth();
  const ownAccessRole = user?.uid
    ? data.members.find((m) => m.id === user.uid)?.accessLevel
    : undefined;
  const canManageSchedules = can(ownAccessRole, 'approve:time-off');

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<BoardFilterState>(EMPTY_FILTERS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which sub-view of the Ops page is showing. The Ops Board (kanban)
  // is the default — that's still where the day-to-day ops work
  // happens. Team Capacity (workspace-wide load heatmap) is a peer
  // planning surface, accessible via tab. Local state is fine — no
  // url routing yet; if direct linking matters later, lift to the
  // hash router and read params.tab.
  // Phase 7C — sync the active sub-tab with the URL hash so deep-
  // linked notifications can land on a specific tab. `#ops/timeoff`
  // → tab='timeoff' on mount. Local state still backs the picker
  // for in-page clicks; the route-watching effect reconciles when
  // the hash changes (incoming notification click). Unknown sub-
  // tabs fall back to 'board'.
  const route = useRoute();
  const initialTab: OpsTab = (() => {
    const raw = route.params.tab;
    if (raw === 'brief' || raw === 'capacity' || raw === 'timeoff' || raw === 'board') {
      return raw;
    }
    return 'board';
  })();
  const [tab, setTab] = useState<OpsTab>(initialTab);
  // Keep the tab in sync when the route changes (notification click
  // while already on the page). Re-validate the value too so a
  // typo in the hash doesn't leave us stranded.
  useEffect(() => {
    const raw = route.params.tab;
    const valid: OpsTab =
      raw === 'brief' || raw === 'capacity' || raw === 'timeoff' || raw === 'board'
        ? raw
        : 'board';
    setTab(valid);
  }, [route.params.tab]);
  // Focus id for the timeoff sub-tab (carries through to the
  // approval queue / popover). Read here so OpsTimeOffTab can
  // pull it via prop.
  const opsFocusId = route.params.focus;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Keyboard drag: Space picks up, arrow keys move, Space drops, Esc
    // cancels — matches BoardPage. Without it, keyboard-only users
    // cannot reorder Ops cards at all. DraggableCard's onKeyDown is a
    // separate layer (Enter/Space to open the modal); dnd-kit only
    // claims keys once a drag is active.
    useSensor(KeyboardSensor),
  );

  // Archived ops cards stay in the pile (same rule as client tasks) but
  // drop out of every render + count. Restore goes through the same
  // titlebar menu in FlizowCardModal.
  const liveTasks = useMemo(() => tasks.filter(t => !t.archived), [tasks]);

  // data.today is the demo-aware "today" — the store can override it
  // for time-travel demos. Reading from there instead of `new Date()`
  // means the same date flows to applyFilters, dueDescriptor, and
  // anywhere else on the page. Audit: ops L3.
  const filteredTasks = useMemo(
    () => applyFilters(liveTasks, filters, data.today, search),
    [liveTasks, filters, search, data.today],
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
    // .view + .active are the shared wrapper for per-route mounting
    // (see :root view/.active rules). .view-ops used to be a hook
    // for the legacy HTML mockup at public/projectflow-test.html
    // and has no CSS consumers in src/ — keeping the minimum shell
    // React needs. Audit: ops M2.
    <div className="view active">
      <Header stats={stats} showStats={tab === 'board'} />

      {/* Tabs — three peer surfaces.
            Board     = the kanban (day-to-day execution)
            Notes     = team-wide notes / weekly steer (rendered via
                        the Brief vocabulary internally — same
                        storage key data.opsBrief, same modal — but
                        labelled "Notes" in the UI for a softer,
                        more-general framing than "brief")
            Capacity  = workspace-wide load heatmap (planning)
          Board stays default — it's the most-used surface; surprising
          existing users with a different landing tab earns nothing.
          Notes sits between because it's the "why" between work
          (Board) and resourcing (Capacity). */}
      <div className="ops-tabs" role="tablist" aria-label="Ops views">
        <button
          type="button"
          id="ops-tab-board"
          role="tab"
          aria-selected={tab === 'board'}
          aria-controls="ops-panel-board"
          className={`ops-tab${tab === 'board' ? ' on' : ''}`}
          onClick={() => setTab('board')}
        >
          <ViewColumnsIcon width={14} height={14} aria-hidden="true" />
          Ops Board
        </button>
        <button
          type="button"
          id="ops-tab-brief"
          role="tab"
          aria-selected={tab === 'brief'}
          aria-controls="ops-panel-brief"
          className={`ops-tab${tab === 'brief' ? ' on' : ''}`}
          onClick={() => setTab('brief')}
        >
          <DocumentTextIcon width={14} height={14} aria-hidden="true" />
          Notes
        </button>
        <button
          type="button"
          id="ops-tab-capacity"
          role="tab"
          aria-selected={tab === 'capacity'}
          aria-controls="ops-panel-capacity"
          className={`ops-tab${tab === 'capacity' ? ' on' : ''}`}
          onClick={() => setTab('capacity')}
        >
          <ChartBarIcon width={14} height={14} aria-hidden="true" />
          Team Capacity
        </button>
        {/* Time off Schedules — Owner/Admin only. Phase 6 lands the
            calendar + approval queue + rules builder; Phase 6B will
            add holidays + transfer credits on top. */}
        {canManageSchedules && (
          <button
            type="button"
            id="ops-tab-timeoff"
            role="tab"
            aria-selected={tab === 'timeoff'}
            aria-controls="ops-panel-timeoff"
            className={`ops-tab${tab === 'timeoff' ? ' on' : ''}`}
            onClick={() => setTab('timeoff')}
          >
            <CalendarDaysIcon width={14} height={14} aria-hidden="true" />
            Time off Schedules
          </button>
        )}
      </div>

      {tab === 'board' && (
        <section
          id="ops-panel-board"
          role="tabpanel"
          aria-labelledby="ops-tab-board"
        >
          <FiltersBar
            search={search}
            onSearch={setSearch}
            filters={filters}
            onFiltersChange={setFilters}
            members={opsAssigneeMembers}
          />

          {/* BriefStrip used to live here as a passive reminder above
              the kanban. Removed when Brief became its own tab —
              having two routes to the same content was clutter, not
              clarity. The Brief tab is the canonical surface now. */}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* id="opsBoard" used to ride along here for the legacy static
                mockup to latch `document.getElementById` onto — no React
                consumer. Dropped. Audit: ops M2. */}
            <div className="board">
              {COLUMNS.map(col => {
                const colTasks = tasksByColumn.get(col.id) ?? [];
                return (
                  <Column
                    key={col.id}
                    columnId={col.id}
                    title={col.title}
                    dot={col.dot}
                    tasks={colTasks}
                    members={members}
                    today={data.today}
                    onOpenTask={(id) => setSelectedId(id)}
                  />
                );
              })}
            </div>

            <DragOverlay dropAnimation={null}>
              {activeTask ? <CardTile task={activeTask} members={members} today={data.today} dragging /> : null}
            </DragOverlay>
          </DndContext>
        </section>
      )}

      {tab === 'brief' && (
        <section
          id="ops-panel-brief"
          role="tabpanel"
          aria-labelledby="ops-tab-brief"
        >
          {/* Ops Notes — Apple-Notes-style two-pane surface (sidebar
              list + active editor) reusing the same NotesTab component
              the client detail page uses. Workspace-scope notes are
              tagged with the OPS_NOTES_CLIENT_ID marker so they don't
              show up under any actual client. We replaced the old
              single-blob "Ops Brief" modal with this so users can keep
              multiple running notes (week kickoff, sprint retro, hiring
              notes) instead of one ever-growing document. */}
          <div className="ops-notes-surface">
            <NotesTab
              clientId={OPS_NOTES_CLIENT_ID}
              notes={data.notes}
              store={flizowStore}
              // The Ops tab is already labeled "Notes" — a second
              // "Notes" title inside the section header reads as
              // redundant on this surface specifically (it's the
              // only thing on the tab). Client Detail leaves this
              // off so the title anchors the section in its longer
              // scrolling page.
              hideSectionTitle
            />
          </div>
        </section>
      )}

      {tab === 'capacity' && (
        <section
          id="ops-panel-capacity"
          role="tabpanel"
          aria-labelledby="ops-tab-capacity"
        >
          {/* Team Capacity heatmap — workspace-wide load view. Reads
              from both client tasks and ops tasks (a designer's
              internal work and their client work share the same
              finite attention) and uses the same green/amber/red
              zones the rest of the capacity model uses. */}
          <TeamCapacityHeatmap
            members={data.members}
            tasks={data.tasks}
            opsTasks={data.opsTasks}
            overrides={data.memberDayOverrides}
            todayISO={data.today}
            clients={data.clients}
            services={data.services}
          />
        </section>
      )}

      {tab === 'timeoff' && canManageSchedules && (
        <OpsTimeOffTab focusId={opsFocusId} />
      )}

      {selectedId && (
        <FlizowCardModal
          taskId={selectedId}
          kind="opsTask"
          onClose={() => setSelectedId(null)}
          // Duplicate swaps the open modal over to the new card so the
          // user can rename it without a close/reopen flicker.
          onDuplicated={(newId) => setSelectedId(newId)}
        />
      )}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────

function Header({
  stats,
  showStats,
}: {
  stats: { total: number; inProgress: number; blocked: number };
  /** Stats are board-specific (task counts by column). Hide them on
   *  the Capacity tab where they'd read as stale context — the
   *  heatmap is about people, not the kanban's column distribution. */
  showStats: boolean;
}) {
  return (
    <div className="ops-header-bar">
      <div className="ops-header-text">
        <div className="ops-header-eyebrow">Internal work</div>
        <h1 className="ops-header-title">Ops</h1>
        {/* Header sub used to run two lines explaining what goes
            here vs. on a client board. Useful on first visit, noise
            on the 300th. Trimmed to the essential-at-a-glance line;
            the rest was re-learnable by context. Audit: ops M5. */}
        <p className="ops-header-sub">
          The work the team does for itself.
        </p>
      </div>
      {showStats && (
      <div className="ops-header-stats" role="group" aria-label="Board summary">
        <div className="ops-header-stat"><strong>{stats.total}</strong> tasks</div>
        <div className="ops-header-stat"><strong>{stats.inProgress}</strong> in progress</div>
        {stats.blocked > 0 && (
          <div className="ops-header-stat ops-header-stat--blocked">
            <strong>{stats.blocked}</strong> blocked
          </div>
        )}
      </div>
      )}
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
        <MagnifyingGlassIcon aria-hidden="true" />
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
  today,
  onOpenTask,
}: {
  columnId: ColumnId;
  title: string;
  dot: string;
  tasks: OpsTask[];
  members: Member[];
  today: string;
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
        {/* No ⋯ menu on Ops columns — the button used to render
            permanently `disabled`, which broke cross-page consistency
            (Board's ⋯ does something; Ops's looked the same but
            didn't). Ops has no per-column WIP limits yet; if/when we
            add them, the menu can come back wired. Until then, the
            header reads cleaner without a dead control. Audit: ops M1. */}
      </div>
      <div className="column-cards">
        {tasks.map(task => (
          <DraggableCard
            key={task.id}
            task={task}
            members={members}
            today={today}
            onOpen={() => onOpenTask(task.id)}
          />
        ))}
        {/* House rule: + Add Card only lives in the To Do column. Cards
            move forward via drag or the status picker, not by being
            created mid-column. */}
        {columnId === 'todo' && <AddOpsCardInline />}
      </div>
    </div>
  );
}

// ── Add Ops Card inline form ─────────────────────────────────────────
// Thin wrapper over the shared InlineCardComposer. Ops cards have no
// serviceId/clientId coupling (unlike client tasks), so this one only
// needs to mint an id, stamp a createdAt, and call addOpsTask. The
// shared composer owns the open/close UX and keyboard wiring; see
// components/shared/InlineCardComposer.tsx.

function AddOpsCardInline() {
  return (
    <InlineCardComposer
      onSubmit={(trimmed) => {
        const id = `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        flizowStore.addOpsTask({
          id,
          title: trimmed,
          columnId: 'todo',
          priority: 'medium',
          assigneeId: null,
          labels: [],
          createdAt: new Date().toISOString(),
        });
      }}
    />
  );
}

// ── Draggable Card ───────────────────────────────────────────────────

function DraggableCard({
  task,
  members,
  today,
  onOpen,
}: {
  task: OpsTask;
  members: Member[];
  today: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  // Split dnd-kit's listener map so we can compose our own onKeyDown
  // without clobbering the keyboard sensor. Enter opens the modal;
  // Space/Arrow/Escape stay with dnd-kit so keyboard-only users can
  // still pick up, move, and drop cards.
  const { onKeyDown: dndKeyDown, ...dragListeners } = (listeners ?? {}) as {
    onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  } & Record<string, unknown>;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...dragListeners}
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
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
          return;
        }
        // Forward Space/Arrow/Escape to dnd-kit's KeyboardSensor so it
        // can drive drag-pickup/move/drop. Enter is the "open modal"
        // gesture; Space is the "pick up the card" gesture. Common
        // split for elements that are both activatable and draggable.
        dndKeyDown?.(e);
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open card: ${task.title}`}
    >
      <CardTile task={task} members={members} today={today} />
    </div>
  );
}

function CardTile({
  task,
  members,
  today,
  dragging,
}: {
  task: OpsTask;
  members: Member[];
  /** Demo-aware "today" sourced from data.today, not `new Date()`,
   *  so the per-card overdue / due-soon labels follow time-travel
   *  demos. Audit: ops L3. */
  today: string;
  dragging?: boolean;
}) {
  const profile = useMemberProfile();
  const isDone = task.columnId === 'done';
  const due = dueDescriptor(task, today);
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
          <button
            type="button"
            className="card-assignee card-assignee--clickable"
            title={`${assignee.name} — click to open profile`}
            style={avatarStyle(assignee)}
            onClick={(e) => {
              e.stopPropagation();
              profile.open(assignee.id);
            }}
            aria-label={`Open profile for ${assignee.name}`}
          >
            {assignee.initials}
          </button>
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

function dueDescriptor(task: OpsTask, today: string): DueDescriptor | null {
  if (task.overrideMod || task.overrideLabel) {
    const icon = task.overrideMod === 'due-blocked' ? <BlockedIcon /> : <ClockIcon />;
    return { label: task.overrideLabel ?? '', mod: task.overrideMod ?? '', icon };
  }
  if (task.columnId === 'done') return null;
  if (!task.dueDate) return null;
  const diff = daysBetween(today, task.dueDate);
  if (diff < 0) {
    return { label: `Overdue ${Math.abs(diff)}d`, mod: 'due-overdue', icon: <ClockIcon /> };
  }
  if (diff <= 3) {
    return { label: formatMonthDay(task.dueDate), mod: 'due-soon', icon: <CalIcon /> };
  }
  return { label: formatMonthDay(task.dueDate), mod: '', icon: <CalIcon /> };
}

// `todayISO()` lived here as a parallel "today" computation. Removed
// in favour of `data.today` from the store, which BoardPage already
// uses and which a future demo-mode date override can target.
// Audit: ops L3.

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

// Ops Notes is now driven by the shared NotesTab component (multi-note
// Apple-Notes layout, autosave, search, pin/lock). The previous single-
// blob OpsBriefPanel — which read from data.opsBrief and opened a modal
// for edits — was removed in favour of that pattern. The legacy data
// (data.opsBrief / updateOpsBrief) still exists on the store; it isn't
// surfaced anywhere now and can be cleaned up in a separate pass once
// we're sure no one needs to recover content from it.
