import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
// TrashIcon is renamed on import because BoardPage defines its own
// `TrashIcon` wrapper component (preserved at the bottom of this file
// for callsite-stability — many JSX uses still write <TrashIcon />).
// The wrapper now delegates to the Heroicons component.
import {
  ArchiveBoxIcon,
  CheckIcon as HeroCheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  TrashIcon as HeroTrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useRoute, navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
import type { ColumnId, Priority, Task, Client, Service, Member, TaskComment } from '../types/flizow';
import { daysBetween, formatMonthDay } from '../utils/dateFormat';
import FlizowCardModal from '../components/FlizowCardModal';
import { BoardFilters, applyFilters, EMPTY_FILTERS, type BoardFilterState, type GroupBy } from '../components/BoardFilters';
import { BriefModal } from '../components/BriefModal';
import { BriefStrip } from '../components/BriefStrip';
import { EditServiceModal } from '../components/EditServiceModal';
import { ConfirmDangerDialog } from '../components/ConfirmDangerDialog';
import { labelById } from '../constants/labels';
import { useDismissable } from '../hooks/useDismissable';
import { InlineCardComposer } from '../components/shared/InlineCardComposer';

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
 *   - Swimlanes: Group by priority / assignee / label. Setting lives on
 *     the service so each board remembers its own layout; dragging a
 *     card across a lane boundary patches the grouping field on the
 *     task (so lanes are direct-manipulation, not just a filter)
 *
 * Not yet:
 *   - Column color / reorder editing
 */

// ── Column definitions ───────────────────────────────────────────────
//
// All five columns ALWAYS render. Do not add an `emptyHide` flag —
// previously the Blocked column auto-hid when empty (saved ~1 column
// of horizontal real estate), but that quietly broke discoverability:
// a column you can't see is a state you don't know your work can
// reach, and you can't drag a card to a column that isn't on screen.
// The mockup ships all five columns unconditionally; the React port
// matches that. This rule has been re-broken once — keep it locked.

const COLUMNS: Array<{ id: ColumnId; title: string; dot: string }> = [
  { id: 'todo',       title: 'To Do',        dot: 'todo' },
  { id: 'inprogress', title: 'In Progress',  dot: 'progress' },
  { id: 'blocked',    title: 'Blocked',      dot: 'blocked' },
  { id: 'review',     title: 'Needs Review', dot: 'review' },
  { id: 'done',       title: 'Done',         dot: 'done' },
];

// ── Swimlane helpers ─────────────────────────────────────────────────
//
// Swimlanes = horizontal rows in the board, one per distinct value of
// a grouping field (priority / assignee / label). Dragging a card from
// one lane to another patches the grouping field on the task, so lanes
// read as direct manipulation — the card "becomes" whatever the target
// lane represents. The flat, groupBy='none' layout is preserved as the
// default because most single-operator boards don't need the extra
// vertical chrome.
//
// Lane keys are synthetic strings:
//   priority: 'urgent' | 'high' | 'medium' | 'low' | 'nopriority'
//   assignee: <memberId> | 'unassigned'
//   label:    <labelId>  | 'nolabel'
// Droppable ids in swimlane mode: `lane:<key>|col:<columnId>`.

type ActiveGroupBy = Exclude<GroupBy, 'none'>;

interface Lane {
  /** Stable lane id used for collapse state, droppable ids, React keys. */
  key: string;
  /** Human label shown in the header. */
  label: string;
  /** Optional React node rendered before the label — a priority dot,
   *  member avatar, or label pill. */
  accent: ReactNode | null;
  /** Whether to also render the plain label text after the accent.
   *  False for label lanes (the accent is a pill that already contains
   *  the name); true for priority / assignee lanes where the accent is
   *  a bare dot/avatar. */
  showLabelText: boolean;
  /** Count of tasks visible in this lane (across all columns). */
  totalCount: number;
  /** Tasks bucketed by column for this lane. */
  tasksByColumn: Map<ColumnId, Task[]>;
}

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low'];
const PRIORITY_LANE_TITLES: Record<Priority, string> = {
  urgent: 'Urgent',
  high:   'High',
  medium: 'Medium',
  low:    'Low',
};

/** Which lane a task belongs to under the given grouping mode. For
 *  labels we pick the first label as the task's "home" lane so each
 *  task appears in exactly one lane — multi-label rendering would
 *  duplicate cards and make drag semantics ambiguous. */
function laneKeyFor(t: Task, mode: ActiveGroupBy): string {
  if (mode === 'priority') return t.priority ?? 'nopriority';
  if (mode === 'assignee') return t.assigneeId ?? 'unassigned';
  // label
  return t.labels[0] ?? 'nolabel';
}

/** Build the lane list for the current data + mode. Priority always
 *  shows all four buckets even when empty so the user has a drop
 *  target to escalate into; assignee and label lanes surface only
 *  values actually present (plus the sentinel "Unassigned"/"No label"
 *  bucket when any such task exists). */
function computeLanes(
  tasks: Task[],
  mode: ActiveGroupBy,
  members: Member[],
): Lane[] {
  const bucket = (predicate: (t: Task) => boolean): Map<ColumnId, Task[]> => {
    const map = new Map<ColumnId, Task[]>();
    COLUMNS.forEach(c => map.set(c.id, []));
    tasks.forEach(t => {
      if (!predicate(t)) return;
      const arr = map.get(t.columnId);
      if (arr) arr.push(t);
    });
    return map;
  };
  const totalOf = (m: Map<ColumnId, Task[]>) => {
    let n = 0;
    m.forEach(arr => { n += arr.length; });
    return n;
  };

  if (mode === 'priority') {
    const lanes: Lane[] = PRIORITY_ORDER.map(p => {
      const byCol = bucket(t => (t.priority ?? 'nopriority') === p);
      return {
        key: p,
        label: PRIORITY_LANE_TITLES[p],
        accent: <span className={`status-dot dot-${p}`} aria-hidden />,
        showLabelText: true,
        totalCount: totalOf(byCol),
        tasksByColumn: byCol,
      };
    });
    // Rarely, a legacy task might have no priority at all; surface it
    // as its own lane so nothing goes missing from the board.
    const noPriorityCount = tasks.filter(t => !t.priority).length;
    if (noPriorityCount > 0) {
      const byCol = bucket(t => !t.priority);
      lanes.push({
        key: 'nopriority',
        label: 'No priority',
        accent: <span className="status-dot" style={{ background: 'var(--bg-soft)', border: '1px solid var(--hairline)' }} aria-hidden />,
        showLabelText: true,
        totalCount: noPriorityCount,
        tasksByColumn: byCol,
      });
    }
    return lanes;
  }

  if (mode === 'assignee') {
    // Distinct assignee ids that have at least one task on this board.
    // A roster-wide listing would light up lanes the user doesn't need.
    const ids = new Set<string>();
    tasks.forEach(t => { if (t.assigneeId) ids.add(t.assigneeId); });
    const lanes: Lane[] = Array.from(ids)
      .map(id => {
        const m = members.find(x => x.id === id);
        const byCol = bucket(t => t.assigneeId === id);
        return {
          key: id,
          label: m?.name ?? 'Unknown',
          showLabelText: true,
          accent: m ? (
            <span
              aria-hidden
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: m.type === 'operator' ? (m.bg ?? 'var(--bg-soft)') : m.color,
                color: m.type === 'operator' ? m.color : '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {m.initials}
            </span>
          ) : null,
          totalCount: totalOf(byCol),
          tasksByColumn: byCol,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    const hasUnassigned = tasks.some(t => !t.assigneeId);
    if (hasUnassigned) {
      const byCol = bucket(t => !t.assigneeId);
      lanes.push({
        key: 'unassigned',
        label: 'Unassigned',
        showLabelText: true,
        accent: (
          <span
            aria-hidden
            style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--bg-faint)', color: 'var(--text-faint)',
              fontSize: 12, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              border: '1px dashed var(--hairline)',
            }}
          >·</span>
        ),
        totalCount: totalOf(byCol),
        tasksByColumn: byCol,
      });
    }
    return lanes;
  }

  // label
  const labelIds = new Set<string>();
  tasks.forEach(t => { if (t.labels[0]) labelIds.add(t.labels[0]); });
  const labelLanes: Lane[] = Array.from(labelIds)
    .map(id => {
      const l = labelById(id);
      const byCol = bucket(t => t.labels[0] === id);
      return {
        key: id,
        // Render the name via the pill so color/text stay in sync with
        // the card tiles' label pills. Label text is suppressed beside
        // it so the reader hears the name once, not twice.
        label: l?.name ?? id,
        accent: <span className={`label-pill ${l?.cls ?? ''}`}>{l?.name ?? id}</span>,
        showLabelText: false,
        totalCount: totalOf(byCol),
        tasksByColumn: byCol,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  const hasNoLabel = tasks.some(t => t.labels.length === 0);
  if (hasNoLabel) {
    const byCol = bucket(t => t.labels.length === 0);
    labelLanes.push({
      key: 'nolabel',
      label: 'No label',
      accent: <span className="label-pill" style={{ background: 'var(--bg-faint)', color: 'var(--text-faint)' }}>No label</span>,
      showLabelText: false,
      totalCount: totalOf(byCol),
      tasksByColumn: byCol,
    });
  }
  return labelLanes;
}

/** Translate a lane drop into the field patch that writes the target
 *  lane's value onto the dragged task. For labels we do a symmetric
 *  replace — drop the source lane's label, bring the target lane's
 *  label to position 0 — so the card unambiguously lives in one lane
 *  while keeping any other labels the user put on it. */
function patchForLaneChange(
  source: Task,
  sourceLaneKey: string,
  targetLaneKey: string,
  mode: ActiveGroupBy,
): Partial<Task> | null {
  if (sourceLaneKey === targetLaneKey) return null;

  if (mode === 'priority') {
    if (targetLaneKey === 'nopriority') return null; // no sentinel write
    return { priority: targetLaneKey as Priority };
  }

  if (mode === 'assignee') {
    if (targetLaneKey === 'unassigned') {
      return { assigneeId: null, assigneeIds: [] };
    }
    // Keep assigneeIds in sync with the primary so the card tile +
    // filters see the update immediately.
    return { assigneeId: targetLaneKey, assigneeIds: [targetLaneKey] };
  }

  // label
  const existing = source.labels ?? [];
  const cleared = existing.filter(l => l !== sourceLaneKey && l !== targetLaneKey);
  if (targetLaneKey === 'nolabel') return { labels: cleared };
  return { labels: [targetLaneKey, ...cleared] };
}

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
      <div className="view view-board active">
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
    <div className="view view-board active">
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
    <main className="board-empty-state">
      <div className="board-empty-state-eyebrow">No service selected</div>
      <h1 className="board-empty-state-title">
        {serviceId ? `Service "${serviceId}" not found` : 'Pick a service to open its board'}
      </h1>
      <p className="board-empty-state-body">
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
  // Project brief modal. Toggle from the header strip above the
  // columns; closing happens through the modal's own dismiss paths
  // (Save / Cancel / Esc-with-discard-confirm).
  const [briefOpen, setBriefOpen] = useState(false);
  // Swimlane grouping mode for this board. Persisted on the service so
  // each board remembers its layout across sessions. Switching to
  // 'none' flips the board back to its flat-columns shape.
  const groupBy: GroupBy = service.groupBy ?? 'none';
  // Per-lane collapsed state. Not persisted — collapse is a read-time
  // convenience (hide a big backlog lane I'm not reviewing today), not
  // a board-wide setting. Reset when the grouping mode changes because
  // the lane keys belong to a different semantic space.
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(() => new Set());
  useEffect(() => { setCollapsedLanes(new Set()); }, [groupBy]);

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
    // Keyboard drag: Space picks up, arrow keys move, Space drops, Esc
    // cancels. Without this sensor a keyboard-only user cannot move
    // cards between columns at all. dnd-kit's default coordinate getter
    // works for the freeform Board layout (columns side-by-side, cards
    // top-to-bottom); no custom getter needed.
    useSensor(KeyboardSensor),
  );

  const filteredTasks = useMemo(
    () => applyFilters(tasks, filters, todayISO, search),
    [tasks, filters, search, todayISO],
  );

  // Bucket tasks into columns (skip Blocked column in rendering if empty
  // and there's no explicit need to show the dropzone). Used only in
  // flat mode; swimlane mode computes per-lane buckets below.
  const tasksByColumn = useMemo(() => {
    const byCol = new Map<ColumnId, Task[]>();
    COLUMNS.forEach(c => byCol.set(c.id, []));
    filteredTasks.forEach(t => {
      const bucket = byCol.get(t.columnId);
      if (bucket) bucket.push(t);
    });
    return byCol;
  }, [filteredTasks]);

  // Swimlanes — only computed when groupBy is active. The computation
  // is cheap (one pass per lane) but gated anyway so the flat-mode
  // path stays pure.
  const lanes = useMemo(
    () => groupBy === 'none' ? [] : computeLanes(filteredTasks, groupBy, members),
    [filteredTasks, groupBy, members],
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    // Droppable ids come in three shapes:
    //   `col:<columnId>`              — flat mode column drop
    //   `lane:<key>|col:<columnId>`   — swimlane mode column drop
    //   `<taskId>`                    — dropped onto another card (any mode)
    // Dropping onto a card means "put it in that card's column (and
    // lane, if swimlanes are active)" — minimal surprise.
    let targetCol: ColumnId | null = null;
    let targetLaneKey: string | null = null;
    if (overId.startsWith('lane:')) {
      const pipe = overId.indexOf('|col:');
      if (pipe > 0) {
        targetLaneKey = overId.slice(5, pipe);
        targetCol = overId.slice(pipe + 5) as ColumnId;
      }
    } else if (overId.startsWith('col:')) {
      targetCol = overId.slice(4) as ColumnId;
    } else {
      const target = tasks.find(t => t.id === overId);
      if (target) {
        targetCol = target.columnId;
        if (groupBy !== 'none') targetLaneKey = laneKeyFor(target, groupBy);
      }
    }
    if (!targetCol) return;
    const source = tasks.find(t => t.id === taskId);
    if (!source) return;

    const colChanged = source.columnId !== targetCol;
    let lanePatch: Partial<Task> | null = null;
    if (groupBy !== 'none' && targetLaneKey) {
      const sourceLaneKey = laneKeyFor(source, groupBy);
      lanePatch = patchForLaneChange(source, sourceLaneKey, targetLaneKey, groupBy);
    }

    // Merge column-change and lane-change into a single patch so the
    // store emits one activity event per dimension, not two separate
    // renders. moveTask delegates to updateTask which already diffs
    // every field and logs granularly.
    if (colChanged && lanePatch) {
      store.updateTask(taskId, { columnId: targetCol, ...lanePatch });
    } else if (colChanged) {
      store.moveTask(taskId, targetCol);
    } else if (lanePatch) {
      store.updateTask(taskId, lanePatch);
    }
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
        groupBy={groupBy}
        onGroupByChange={(next) => flizowStore.updateService(service.id, { groupBy: next })}
      />

      <BriefStrip
        label="Project Brief"
        brief={service.brief}
        briefUpdatedAt={service.briefUpdatedAt}
        todayISO={todayISO}
        onOpen={() => setBriefOpen(true)}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {groupBy === 'none' ? (
          <div className="board">
            {COLUMNS.map((col) => {
              const colTasks = tasksByColumn.get(col.id) ?? [];
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
        ) : (
          <div className="board has-swimlanes">
            {lanes.length === 0 ? (
              <SwimlaneEmptyState groupBy={groupBy} />
            ) : (
              lanes.map((lane) => {
                const isCollapsed = collapsedLanes.has(lane.key);
                return (
                  <Swimlane
                    key={lane.key}
                    lane={lane}
                    collapsed={isCollapsed}
                    onToggleCollapsed={() => {
                      setCollapsedLanes(prev => {
                        const next = new Set(prev);
                        if (next.has(lane.key)) next.delete(lane.key);
                        else next.add(lane.key);
                        return next;
                      });
                    }}
                  >
                    {COLUMNS.map((col) => {
                      const colTasks = lane.tasksByColumn.get(col.id) ?? [];
                      // All five columns render in every lane — same
                      // policy as the flat-mode loop above. See the
                      // COLUMNS comment for the "always show Blocked"
                      // rationale.
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
                          // In swimlane mode, WIP caps stay authoritative
                          // at the column level but we don't surface the
                          // editor here — switching to Group: None is the
                          // single place to edit limits so lanes don't
                          // race on per-lane ⋯ buttons.
                          limit={undefined}
                          onSetLimit={() => {}}
                          hideLimitMenu
                          laneKey={lane.key}
                          laneSeed={seedFromLane(lane, groupBy)}
                        />
                      );
                    })}
                  </Swimlane>
                );
              })
            )}
          </div>
        )}

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

      {briefOpen && (
        <BriefModal
          title="Project Brief"
          subtitle={service.name}
          initialBrief={service.brief}
          onSave={(html) => flizowStore.updateServiceBrief(service.id, html)}
          onClose={() => setBriefOpen(false)}
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
  // Reset local UI state only when the user navigates to a different
  // board. Depending on `service.name` used to clobber an in-progress
  // rename draft if a teammate renamed the same service mid-edit —
  // silent data loss, which trips the Forgiveness principle. Board
  // navigation (id change) is still a clean slate, which is what the
  // user expects. Audit: board L1.
  useEffect(() => {
    setDraft(service.name);
    setEditing(false);
    setMembersOpen(false);
    setSettingsOpen(false);
  }, [service.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editing) return;
    // rAF defers focus past the current render commit, so the input
    // exists in the DOM by the time we reach for it. Used to be a
    // raw setTimeout(20) — an undocumented guess. Audit: board L2.
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [editing]);

  // Outside-click + Esc for the two popovers in this subtree: the
  // Members popover and Board Settings. Shared dismissal semantics
  // via useDismissable. The breadcrumb ⋯ used to be a third popover,
  // but its only item ("Edit service details…") was already
  // duplicated in Board Settings — two paths to one modal. Merged
  // the crumb menu into Board Settings and removed the kebab. Audit:
  // board M1.
  useDismissable(membersWrapRef, membersOpen, () => setMembersOpen(false));
  useDismissable(settingsWrapRef, settingsOpen, () => setSettingsOpen(false));

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
            {/* The breadcrumb ⋯ menu used to sit here, holding a
                single "Edit service details…" item that was also
                present in Board Settings. Two paths to one modal —
                and a kebab with one item reads as a drawer with
                nothing inside. Removed; Board Settings is the sole
                entry point now. Audit: board M1. */}
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
                <span className="menu-count-pill">{archivedTasks.length}</span>
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
  groupBy,
  onGroupByChange,
}: {
  search: string;
  onSearch: (v: string) => void;
  filters: BoardFilterState;
  onFiltersChange: (next: BoardFilterState) => void;
  members: Member[];
  groupBy: GroupBy;
  onGroupByChange: (next: GroupBy) => void;
}) {
  return (
    <div className="filters-bar" role="search" aria-label="Board filters">
      <label className="filter-search">
        <MagnifyingGlassIcon aria-hidden="true" />
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
        groupBy={groupBy}
        onGroupByChange={onGroupByChange}
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
  hideLimitMenu = false,
  laneKey,
  laneSeed,
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
  /** Hide the WIP-limit ⋯ menu. Set from the swimlane renderer so we
   *  don't show N identical editors (one per lane) that all edit the
   *  same global limit. */
  hideLimitMenu?: boolean;
  /** Lane-prefix for the droppable id when the board is in swimlane
   *  mode. Undefined in flat mode. */
  laneKey?: string;
  /** Patch to apply to cards created inline from this column's lane —
   *  pre-sets priority/assignee/label so a card added under "High"
   *  lands there instead of requiring a follow-up edit. */
  laneSeed?: Partial<Task>;
}) {
  // Lane-prefixed droppable id keeps swimlane drops unambiguous; in
  // flat mode the original `col:<id>` shape is preserved.
  const droppableId = laneKey ? `lane:${laneKey}|col:${columnId}` : `col:${columnId}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  const [limitEditorOpen, setLimitEditorOpen] = useState(false);
  const isOverLimit = limit !== undefined && tasks.length > limit;
  return (
    <div className={`column${isOver ? ' is-over' : ''}`} data-dot={dot} ref={setNodeRef}>
      <div className="column-header">
        <div className="column-title-group">
          <span className="column-dot" />
          <div className="column-title">{title}</div>
          <div className={`column-count${isOverLimit ? ' is-over-limit' : ''}`}>
            {limit !== undefined ? `${tasks.length} / ${limit}` : tasks.length}
          </div>
        </div>
        {!hideLimitMenu && (
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
        )}
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
        {/* Empty placeholder for non-To-Do columns. Used to live as a
            CSS `content:` rule keyed off `:has()`, but a string baked
            into CSS is invisible to translation tooling and harder to
            edit copy on. React-side conditional means it shows up
            anywhere we ever want to translate the app. To-Do is
            excluded — its AddCardInline already serves as the empty
            cue. Audit: i18n LOW (CSS-baked string). */}
        {tasks.length === 0 && columnId !== 'todo' && (
          <div className="column-empty">No cards yet — drag one in from another list.</div>
        )}
        {columnId === 'todo' && (
          <AddCardInline serviceId={serviceId} clientId={clientId} seed={laneSeed} />
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
    // rAF defers the select past the commit so the input is in the
    // DOM by the time we reach for it. Replaces a magic
    // setTimeout(60) whose 60ms was never explained. Audit: board L2.
    const raf = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(raf);
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

function AddCardInline({ serviceId, clientId, seed }: { serviceId: string; clientId: string; seed?: Partial<Task> }) {
  const { store } = useFlizow();
  return (
    <InlineCardComposer
      onSubmit={(trimmed) => {
        const now = new Date();
        const iso = now.toISOString().slice(0, 10);
        const id = `task-${Math.random().toString(36).slice(2, 10)}`;
        // Seed wins over defaults — e.g. adding a card under the High
        // lane in swimlane mode pre-sets priority to 'high' so the new
        // card lands in that lane instead of defaulting to medium and
        // needing a follow-up drag to fix.
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
          ...(seed ?? {}),
        });
      }}
    />
  );
}

// ── Swimlane shell ───────────────────────────────────────────────────

/** A single horizontal lane rendering a subset of the board's tasks.
 *  Header click collapses the body — matches the "Group by" pattern
 *  users expect from Linear/Height. We keep the header a div with
 *  role="button" rather than a native <button> so the children can
 *  include the pill/avatar markup without inheriting button defaults. */
function Swimlane({
  lane,
  collapsed,
  onToggleCollapsed,
  children,
}: {
  lane: Lane;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`swimlane${collapsed ? ' collapsed' : ''}`}
      data-swimlane-id={lane.key}
    >
      <div
        className="swimlane-header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${lane.label} lane`}
        onClick={onToggleCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapsed();
          }
        }}
      >
        <ChevronDownIcon className="swimlane-chevron" aria-hidden="true" />
        <div className="swimlane-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {lane.accent}
          {/* Skip the plain text for label lanes (the accent is a pill
              that already contains the name). Priority + assignee
              accents are a bare dot/avatar, so we still render the
              readable text label next to them. */}
          {lane.showLabelText && <span>{lane.label}</span>}
        </div>
        <div className="swimlane-count">{lane.totalCount}</div>
      </div>
      <div className="swimlane-body">{children}</div>
    </div>
  );
}

/** Placeholder shown when the filter/search has emptied every lane.
 *  Keeps the board from reading as broken when everything is gone. */
function SwimlaneEmptyState({ groupBy }: { groupBy: ActiveGroupBy }) {
  const byLabel = groupBy === 'priority' ? 'priority' : groupBy === 'assignee' ? 'assignee' : 'label';
  return (
    <div className="swimlane-empty-state">
      No cards to group by {byLabel}. Clear the filters or add a card to bring lanes back.
    </div>
  );
}

/** Translate a lane into the field patch applied to cards added inline
 *  from that lane's To Do column. Mirrors `patchForLaneChange` but
 *  without a "source" — we're seeding a brand-new task, not moving
 *  one. Sentinel keys (unassigned / nolabel / nopriority) seed nothing
 *  because the defaults already match those meanings. */
function seedFromLane(lane: Lane, mode: ActiveGroupBy): Partial<Task> | undefined {
  if (mode === 'priority') {
    if (lane.key === 'nopriority') return undefined;
    return { priority: lane.key as Priority };
  }
  if (mode === 'assignee') {
    if (lane.key === 'unassigned') return undefined;
    return { assigneeId: lane.key, assigneeIds: [lane.key] };
  }
  // label
  if (lane.key === 'nolabel') return undefined;
  return { labels: [lane.key] };
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
// Wrapper kept for call-site stability — many JSX uses still write
// <CheckIcon />. Forwards SVG props through to the Heroicons component.
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return <HeroCheckIcon aria-hidden="true" {...props} />;
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
// Wrapper kept for call-site stability. Forwards SVG props to the
// Heroicons component so existing call sites that pass width/height
// or className continue to work without changes.
function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return <HeroTrashIcon aria-hidden="true" {...props} />;
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
            <ArchiveBoxIcon width={18} height={18} aria-hidden="true" />
            Archived cards
          </h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <XMarkIcon width={14} height={14} aria-hidden="true" />
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
    <li className="archived-card-row">
      {/* Primary assignee avatar — same pattern as board tiles. Falls
          back to a neutral glyph when the card has no owner. The
          per-member color still needs inline styling because it
          comes from data, but the shell is in CSS now. */}
      {primary ? (
        <span
          aria-hidden
          className="archived-card-avatar has-owner"
          style={{
            background: primary.type === 'operator' ? primary.bg : primary.color,
            color: primary.type === 'operator' ? primary.color : '#fff',
          }}
          title={primary.name}
        >
          {primary.initials}
        </span>
      ) : (
        <span aria-hidden className="archived-card-avatar no-owner">?</span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          className="archived-card-open"
          onClick={onOpen}
          aria-label={`Open ${task.title}`}
        >
          <div className="archived-card-title">{task.title}</div>
          <div className="archived-card-meta">
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
        className="archived-card-delete"
        onClick={onRequestDelete}
        aria-label={`Delete ${task.title} permanently`}
        title="Delete permanently"
      >
        <TrashIcon width={14} height={14} aria-hidden="true" />
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

