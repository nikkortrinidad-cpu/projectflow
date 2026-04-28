import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronRightIcon, ScaleIcon } from '@heroicons/react/24/outline';
import {
  loadFor,
  effectiveCapFor,
  zoneFor,
  nextAvailableDate,
} from '../utils/capacity';
import { createPortal } from 'react-dom';
import { useFlizow } from '../store/useFlizow';
import type { ColumnId, Priority, Member, TaskComment, TaskActivity, Task, OpsTask } from '../types/flizow';
import { flizowStore } from '../store/flizowStore';
import { BOARD_LABELS, labelById } from '../constants/labels';
import { ConfirmDangerDialog } from './ConfirmDangerDialog';
import FlizowShareModal from './FlizowShareModal';
import { useActivatableRow } from '../hooks/useActivatableRow';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { navigateForceReparse } from '../router';
import { SearchablePicker } from './shared/SearchablePicker';

/** The modal supports two card "kinds": client tasks (the default) and
 *  internal Ops board tasks. Ops cards skip the client/service header,
 *  the Share action, the comments + activity tabs, and the Duplicate
 *  menu item — all of which rely on infrastructure we haven't wired up
 *  for the Ops board yet. Everything else (title, status, priority,
 *  assignees, labels, dates, description, checklist, archive) works
 *  identically against `data.opsTasks` via the matching store mutators. */
export type CardKind = 'task' | 'opsTask';

/** Union of the two shapes the modal can render. The render path is
 *  kind-neutral — every code path reads through one of these fields,
 *  and the adapter below routes writes to the right store mutator. */
type AnyCard = Task | OpsTask;

/**
 * FlizowCardModal — the per-card detail overlay on top of the service
 * kanban board. Matches the mockup's `.card-modal` shell so the CSS in
 * src/styles/flizow.css renders it without extra styling work.
 *
 * Current scope:
 *   • Inline-editable title (commit on blur/Enter)
 *   • Status / Priority dropdowns (mutate store via moveTask / setTaskPriority)
 *   • Start + Due date inputs
 *   • Assignee picker: search members, multi-select, remove via chip hover
 *   • Label picker: search BOARD_LABELS, multi-select, remove via chip
 *   • Click-to-edit description
 *   • Checklist: add / toggle / delete / rename
 *   • Sidebar tabs (Comments, Activity) — empty-state placeholders
 *   • Close via X button, overlay click, or Esc
 *
 * Out of scope for this pass (stubbed as "coming soon"):
 *   • Comment input + threading
 *   • Activity log entries
 *   • Share modal, Duplicate / Archive menu actions
 *
 * Mount point: BoardPage owns a single instance driven by local
 * `selectedTaskId` state. Opens on card click, closes on the overlay /
 * X / Esc. When we need multi-page open (WIP, Client Detail), lift the
 * selection into the store.
 */

const COLUMN_OPTIONS: { id: ColumnId; label: string; dot: string }[] = [
  { id: 'todo',       label: 'To Do',       dot: 'dot-todo' },
  { id: 'inprogress', label: 'In Progress', dot: 'dot-progress' },
  { id: 'blocked',    label: 'Blocked',     dot: 'dot-blocked' },
  { id: 'review',     label: 'Review',      dot: 'dot-review' },
  { id: 'done',       label: 'Done',        dot: 'dot-done' },
];

const PRIORITY_OPTIONS: { id: Priority; label: string; dot: string }[] = [
  { id: 'low',     label: 'Low',     dot: 'dot-low' },
  { id: 'medium',  label: 'Medium',  dot: 'dot-medium' },
  { id: 'high',    label: 'High',    dot: 'dot-high' },
  { id: 'urgent',  label: 'Urgent',  dot: 'dot-urgent' },
];

function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '—';
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

interface Props {
  taskId: string;
  onClose: () => void;
  /** Which pile the card lives in. Omit for client tasks (the default). */
  kind?: CardKind;
  /** Fired after a successful Duplicate action. Client tasks route
   *  through the BoardPage hash nav (so they can open on a different
   *  board), but ops duplicates stay on the same page — OpsPage passes
   *  this to swap the currently-open modal to the new card. */
  onDuplicated?: (newId: string) => void;
}

export default function FlizowCardModal({ taskId, onClose, kind = 'task', onDuplicated }: Props) {
  const { data, store } = useFlizow();
  const isOps = kind === 'opsTask';
  const task = isOps
    ? (data.opsTasks.find(t => t.id === taskId) as AnyCard | undefined)
    : (data.tasks.find(t => t.id === taskId) as AnyCard | undefined);

  // ── Kind adapter ──────────────────────────────────────────────────
  // Single indirection for every write so the render code below doesn't
  // sprout a ternary at each call site. The wrappers resolve to the
  // store's task / opsTask methods based on the active kind. Patch
  // shape is shared because Task and OpsTask overlap on every field the
  // modal edits.
  function patchCard(id: string, patch: Partial<AnyCard>) {
    if (isOps) store.updateOpsTask(id, patch as Partial<OpsTask>);
    else store.updateTask(id, patch as Partial<Task>);
  }
  function moveCard(id: string, columnId: ColumnId) {
    if (isOps) store.moveOpsTask(id, columnId);
    else store.moveTask(id, columnId);
  }
  function setCardPriority(id: string, priority: Priority) {
    if (isOps) store.setOpsTaskPriority(id, priority);
    else store.setTaskPriority(id, priority);
  }
  function addChecklist(id: string, text: string) {
    if (isOps) store.addOpsChecklistItem(id, text);
    else store.addChecklistItem(id, text);
  }
  function toggleChecklist(id: string, itemId: string) {
    if (isOps) store.toggleOpsChecklistItem(id, itemId);
    else store.toggleChecklistItem(id, itemId);
  }
  function renameChecklist(id: string, itemId: string, text: string) {
    if (isOps) store.updateOpsChecklistItemText(id, itemId, text);
    else store.updateChecklistItemText(id, itemId, text);
  }
  function deleteChecklist(id: string, itemId: string) {
    if (isOps) store.deleteOpsChecklistItem(id, itemId);
    else store.deleteChecklistItem(id, itemId);
  }
  function deleteCard(id: string) {
    if (isOps) store.deleteOpsTask(id);
    else store.deleteTask(id);
  }
  function archiveCard(id: string) {
    if (isOps) store.archiveOpsTask(id);
    else store.archiveTask(id);
  }
  function unarchiveCard(id: string) {
    if (isOps) store.unarchiveOpsTask(id);
    else store.unarchiveTask(id);
  }

  // ── Keyboard: Esc closes, regardless of focus target ──────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Title: committed on blur or Enter ─────────────────────────────
  const [titleDraft, setTitleDraft] = useState(task?.title ?? '');
  const lastTaskId = useRef<string | null>(null);
  useEffect(() => {
    // Reset the draft when the selected task changes — otherwise
    // opening card B keeps card A's draft text.
    if (lastTaskId.current !== taskId) {
      lastTaskId.current = taskId;
      setTitleDraft(task?.title ?? '');
    }
  }, [taskId, task?.title]);

  function commitTitle() {
    if (!task) return;
    const next = titleDraft.trim();
    if (!next || next === task.title) {
      setTitleDraft(task.title); // snap back on empty/unchanged
      return;
    }
    patchCard(task.id, { title: next });
  }

  // ── Description: click-to-edit with save/cancel ───────────────────
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task?.description ?? '');
  useEffect(() => {
    // Sync draft when task changes or description updates externally.
    setDescDraft(task?.description ?? '');
  }, [taskId, task?.description]);

  function saveDesc() {
    if (!task) return;
    patchCard(task.id, { description: descDraft.trim() });
    setEditingDesc(false);
  }
  function cancelDesc() {
    setDescDraft(task?.description ?? '');
    setEditingDesc(false);
  }

  // ── Status / Priority dropdown toggles ────────────────────────────
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);

  // Non-button rows (divs) need explicit Enter/Space handling to be
  // keyboard-activatable. useActivatableRow returns the role/tabIndex/
  // onKeyDown/aria-label bundle; we still wire onClick separately so
  // the mouse path stays obvious at the call site.
  const toggleStatus = () => { setStatusOpen(v => !v); setPriorityOpen(false); };
  const togglePriority = () => { setPriorityOpen(v => !v); setStatusOpen(false); };
  const statusRowProps = useActivatableRow(toggleStatus, { label: 'Change status' });
  const priorityRowProps = useActivatableRow(togglePriority, { label: 'Change priority' });
  const editDescRowProps = useActivatableRow(() => setEditingDesc(true), { label: 'Edit description' });

  // ── Assignee + Label pickers ──────────────────────────────────────
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelQuery, setLabelQuery] = useState('');

  useEffect(() => {
    // Close every inline picker when switching tasks.
    setStatusOpen(false);
    setPriorityOpen(false);
    setAssigneePickerOpen(false);
    setAssigneeQuery('');
    setLabelPickerOpen(false);
    setLabelQuery('');
  }, [taskId]);

  // ── Sidebar tabs ──────────────────────────────────────────────────
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');

  // ── More (titlebar kebab) menu ────────────────────────────────────
  const [moreOpen, setMoreOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Transient copy-confirmation state for the "Copy link" menu item.
  // Flips true for ~1.6s after a successful clipboard write so the
  // label reads "Link copied" instead of snapping back to "Copy link".
  const [copiedLink, setCopiedLink] = useState(false);
  // Share modal — opens from the title-bar share button. Kept as local
  // state rather than a store-global so two card modals (one per tab,
  // later) can share independently.
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => {
    setMoreOpen(false);
    setShowDeleteConfirm(false);
    setCopiedLink(false);
    setShareOpen(false);
  }, [taskId]);

  // ── New-checklist-item input state ────────────────────────────────
  const [newCheckText, setNewCheckText] = useState('');
  const [newCheckActive, setNewCheckActive] = useState(false);
  const newCheckInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (newCheckActive) newCheckInputRef.current?.focus();
  }, [newCheckActive]);

  // ── Focus trap ────────────────────────────────────────────────────
  // Trap Tab inside the card modal. Disabled while a stacked child
  // dialog is open (delete confirm or share modal) so Tab can enter
  // the child — the child owns the focus ring until it closes.
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(modalRef, !showDeleteConfirm && !shareOpen);

  // ── Derived ───────────────────────────────────────────────────────
  // Client + service lookups only apply to `Task` rows — OpsTask has no
  // clientId / serviceId. `in` narrows the union so TS lets us read the
  // fields without casting, and non-task cards fall through to null.
  const client = task && 'clientId' in task
    ? data.clients.find(c => c.id === task.clientId)
    : null;
  const service = task && 'serviceId' in task
    ? data.services.find(s => s.id === task.serviceId)
    : null;
  const assignees = useMemo(() => {
    if (!task) return [];
    const ids = task.assigneeIds && task.assigneeIds.length
      ? task.assigneeIds
      : (task.assigneeId ? [task.assigneeId] : []);
    return ids
      .map(id => data.members.find(m => m.id === id))
      .filter((m): m is NonNullable<typeof m> => !!m);
  }, [task, data.members]);

  const checklist = task?.checklist ?? [];
  const doneCount = checklist.filter(i => i.done).length;
  const pct = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

  // ── Capacity awareness ────────────────────────────────────────────
  // The full pile of slot-consuming work for any member: client tasks
  // PLUS ops tasks. A designer's internal ops work counts toward their
  // daily cap just like their client work. Memoised so the picker
  // renders don't re-stitch the array on every keystroke in search.
  const allSlotTasks = useMemo(
    () => [...data.tasks, ...data.opsTasks],
    [data.tasks, data.opsTasks],
  );

  // Per-member load info for the assignee picker, computed against the
  // task's CURRENT due date. Closes over the full task pile + override
  // list + member list so the picker stays dumb. Returns null when the
  // task has no due date — a date-less task can't have a "load on a
  // specific day."
  const getLoadInfo = useMemo(() => {
    return (memberId: string) => {
      if (!task?.dueDate) return null;
      const load = loadFor(memberId, task.dueDate, allSlotTasks);
      const caps = effectiveCapFor(
        memberId, task.dueDate, data.members, data.memberDayOverrides,
      );
      const zone = zoneFor(load, caps);
      return { load, soft: caps.soft, zone };
    };
  }, [task?.dueDate, allSlotTasks, data.members, data.memberDayOverrides]);

  // Derived warning state for the banner above the meta-table. Fires
  // only when the *primary* assignee is in the red zone on the task's
  // due date. Multi-owner tasks count only the primary (matches the
  // capacity-helper's contract — co-owners participate without
  // absorbing slots).
  const capacityWarning = useMemo(() => {
    if (!task?.dueDate) return null;
    const primaryId = task.assigneeId
      ?? (task.assigneeIds && task.assigneeIds[0])
      ?? null;
    if (!primaryId) return null;
    const member = data.members.find(m => m.id === primaryId);
    if (!member) return null;
    const load = loadFor(primaryId, task.dueDate, allSlotTasks);
    const caps = effectiveCapFor(
      primaryId, task.dueDate, data.members, data.memberDayOverrides,
    );
    const zone = zoneFor(load, caps);
    if (zone !== 'red') return null;
    // Find the next weekday where this task could land cleanly.
    const taskSlots = task.slots ?? 1;
    const suggestion = nextAvailableDate(
      primaryId, task.dueDate, taskSlots,
      data.members, data.memberDayOverrides, allSlotTasks,
      { excludeTaskId: task.id, searchDays: 14 },
    );
    return {
      memberName: member.name,
      load,
      max: caps.max,
      suggestion,
    };
  }, [task, allSlotTasks, data.members, data.memberDayOverrides]);

  function applyDateSuggestion(dateISO: string) {
    if (!task) return;
    patchCard(task.id, { dueDate: dateISO });
  }

  // ── Mutators for assignees + labels ───────────────────────────────
  // Both fields live on the Task as arrays and are flipped via
  // updateTask. We keep the legacy single-assignee fallback intact by
  // always writing the new list to `assigneeIds` — older seeds still
  // read through the `assigneeId || assigneeIds` guard above.
  function toggleAssignee(memberId: string) {
    if (!task) return;
    const current = task.assigneeIds && task.assigneeIds.length
      ? task.assigneeIds
      : (task.assigneeId ? [task.assigneeId] : []);
    const next = current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId];
    patchCard(task.id, {
      assigneeIds: next,
      // Keep the singleton field synced so older readers still work.
      assigneeId: next[0] ?? null,
    });
  }

  function toggleLabel(labelId: string) {
    if (!task) return;
    const next = task.labels.includes(labelId)
      ? task.labels.filter(l => l !== labelId)
      : [...task.labels, labelId];
    patchCard(task.id, { labels: next });
  }

  // ── Guard: task vanished (deleted elsewhere) ──────────────────────
  if (!task) {
    // Auto-close rather than render a broken shell.
    // useEffect guards against render-phase setState.
    return <TaskMissingAutoClose onClose={onClose} />;
  }

  const currentStatus = COLUMN_OPTIONS.find(c => c.id === task.columnId) ?? COLUMN_OPTIONS[0];
  const currentPriority = PRIORITY_OPTIONS.find(p => p.id === task.priority) ?? PRIORITY_OPTIONS[1];

  return (
    <div
      className="card-modal-overlay open"
      role="dialog"
      aria-modal="true"
      // Previously `aria-labelledby="cardModalTitle"` pointed at the
      // title <input>, which means the dialog's accessible name was
      // re-derived from the input's value on every keystroke. Screen
      // readers announced the name change on every character typed.
      // Using the committed `task.title` as a plain aria-label gives
      // the dialog a stable name that only changes when the user
      // commits a rename (blur / Enter), which is what we want.
      // Audit: card-modal M4.
      aria-label={task.title || 'Card details'}
      onClick={onClose}
    >
      <div ref={modalRef} className="card-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Titlebar ───────────────────────────────────────────── */}
        <div className="card-titlebar">
          <div className="titlebar-actions">
            {/* Share targets a `#board/{svcId}/card/{id}` deep link — ops
                cards have no service route yet, so hide the button until
                that lands. */}
            {!isOps && (
              <button
                type="button"
                className="tb-btn"
                aria-label="Share card"
                title="Share card"
                onClick={(e) => {
                  e.stopPropagation();
                  // Closing the More menu first keeps the titlebar state
                  // consistent — only one overlay pops at a time.
                  setMoreOpen(false);
                  setShareOpen(true);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </button>
            )}
            <button
              type="button"
              className="tb-btn"
              aria-label="More actions"
              onClick={(e) => { e.stopPropagation(); setMoreOpen(v => !v); }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {moreOpen && (
              <div className="tb-menu open" onClick={(e) => e.stopPropagation()}>
                {/* Duplicate works for both kinds now — ops uses a
                    callback (OpsPage swaps selectedId); client tasks
                    re-nav the hash so BoardPage's auto-open effect runs.
                    Copy link still depends on a deep-link URL we don't
                    have for ops yet, so it stays client-only below. */}
                <div
                  className="tb-menu-item"
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => {
                    // Duplicate lands in To Do with a "(copy)" suffix and
                    // reset progress. We close the current card and open
                    // the new one so the user can rename it immediately.
                    const newId = isOps
                      ? flizowStore.duplicateOpsTask(taskId)
                      : flizowStore.duplicateTask(taskId);
                    setMoreOpen(false);
                    if (!newId) return;
                    if (isOps) {
                      // Ops page owns the selected card state — hand the
                      // new id over and it swaps the modal without a
                      // close/reopen flicker.
                      onDuplicated?.(newId);
                      return;
                    }
                    onClose();
                    // Hand the new id to the board auto-open channel
                    // and re-navigate to the same board — the useEffect
                    // on BoardPage picks it up and opens the modal.
                    sessionStorage.setItem('flizow-open-card', newId);
                    if (task && 'serviceId' in task && task.serviceId) {
                      // BoardPage's auto-open effect listens on
                      // hashchange, so we need a fresh fire even if we
                      // were already on this board. The "set to ''
                      // then to target" trick lives in the router
                      // helper so callers don't duplicate it. Audit:
                      // card-modal M5.
                      navigateForceReparse(`#board/${task.serviceId}`);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).click();
                    }
                  }}
                >
                  Duplicate card
                </div>
                {!isOps && (
                <div
                  className="tb-menu-item"
                  role="menuitem"
                  tabIndex={0}
                  onClick={async () => {
                    // Deep-link URL points at the board and drops the
                    // card id as a path segment in the hash so the
                    // router can parse it: `#board/{svcId}/card/{cardId}`.
                    // Users paste this into Slack or email; when the
                    // owning user (or a teammate signed in later) opens
                    // it, BoardPage mounts with that card pre-opened via
                    // its initialCardId auto-open effect.
                    if (!task || !('serviceId' in task)) return;
                    const base = window.location.href.split('#')[0];
                    const url = `${base}#board/${task.serviceId}/card/${task.id}`;
                    try {
                      if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(url);
                      }
                      setCopiedLink(true);
                      window.setTimeout(() => setCopiedLink(false), 1600);
                    } catch {
                      // Silent fail — the menu stays open long enough
                      // for the user to retry or close manually.
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).click();
                    }
                  }}
                >
                  {copiedLink ? 'Link copied' : 'Copy link'}
                </div>
                )}
                {!isOps && <div className="tb-menu-divider" />}
                <div
                  className="tb-menu-item"
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => {
                    // Archive hides the card from the active board but
                    // keeps every field intact (comments, checklist,
                    // activity). Restoring from the Board Settings →
                    // Archived-cards modal puts it back in the same
                    // column. We close the detail modal on archive so
                    // the user doesn't see a ghost card they've just
                    // hidden from themselves; on unarchive we leave it
                    // open so the user can continue editing.
                    if (!task) return;
                    if (task.archived) {
                      unarchiveCard(task.id);
                      setMoreOpen(false);
                    } else {
                      archiveCard(task.id);
                      setMoreOpen(false);
                      onClose();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).click();
                    }
                  }}
                >
                  {task.archived ? 'Unarchive card' : 'Archive card'}
                </div>
                <div
                  className="tb-menu-item danger"
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => {
                    // Close the menu first so the confirm dialog paints on top
                    // of a clean toolbar, then open the in-app confirm. No more
                    // native window.confirm — design system owns this dialog.
                    setMoreOpen(false);
                    setShowDeleteConfirm(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setMoreOpen(false);
                      setShowDeleteConfirm(true);
                    }
                  }}
                >
                  Delete card
                </div>
              </div>
            )}
            <span className="tb-sep" aria-hidden="true" />
            <button
              type="button"
              className="tb-btn tb-close"
              aria-label="Close (Esc)"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="card-modal-body-row">

          {/* ── Main content ────────────────────────────────────── */}
          <div className="card-modal-main">
            <div className="card-modal-body">

              {/* Context line — client · service for client tasks,
                  "Ops board" for internal tasks. Either way it's a
                  quick anchor for which board the card lives on. */}
              {isOps ? (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', letterSpacing: '0.02em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Internal · Ops board
                </div>
              ) : (client || service) && (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', letterSpacing: '0.02em', textTransform: 'uppercase', fontWeight: 600 }}>
                  {client?.name}{service ? ` · ${service.name}` : ''}
                </div>
              )}

              <input
                type="text"
                className="card-modal-title"
                id="cardModalTitle"
                aria-label="Card title"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                  if (e.key === 'Escape') { setTitleDraft(task.title); (e.target as HTMLInputElement).blur(); }
                }}
              />

              {/* Capacity warning banner — appears only when the
                  primary assignee's load on the task's due date
                  exceeds their max cap (red zone). Suggests the next
                  weekday with room and lets the AM jump to it in one
                  click. Soft only — the banner doesn't block any
                  edits. Disappears the moment the assignee, due
                  date, or slot weight gets the load back under max. */}
              {capacityWarning && (
                <div className="capacity-warning" role="status" aria-live="polite">
                  <span className="capacity-warning-icon" aria-hidden="true">⚠</span>
                  <span className="capacity-warning-text">
                    <strong>{capacityWarning.memberName}</strong> will have{' '}
                    <strong>{capacityWarning.load}</strong> slots on this date —
                    over their max of <strong>{capacityWarning.max}</strong>.
                  </span>
                  {capacityWarning.suggestion && (
                    <button
                      type="button"
                      className="capacity-warning-action"
                      onClick={() => applyDateSuggestion(capacityWarning.suggestion!)}
                    >
                      Switch to {formatSuggestionDate(capacityWarning.suggestion)}
                    </button>
                  )}
                </div>
              )}

              {/* ── Meta table ──────────────────────────────────── */}
              <div className="meta-table">

                <div className="meta-row">
                  <div className="meta-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    Status
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div
                      className="meta-value meta-edit"
                      onClick={toggleStatus}
                      {...statusRowProps}
                    >
                      <span className={`status-dot ${currentStatus.dot}`} />
                      <span>{currentStatus.label}</span>
                    </div>
                    {statusOpen && (
                      <PickerMenu onClose={() => setStatusOpen(false)}>
                        {COLUMN_OPTIONS.map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            className="tb-menu-item"
                            onClick={() => { moveCard(task.id, opt.id); setStatusOpen(false); }}
                          >
                            <span className={`status-dot ${opt.dot}`} style={{ marginRight: 8 }} />
                            {opt.label}
                          </button>
                        ))}
                      </PickerMenu>
                    )}
                  </div>
                </div>

                <div className="meta-row">
                  <div className="meta-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                    Priority
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div
                      className="meta-value meta-edit"
                      onClick={togglePriority}
                      {...priorityRowProps}
                    >
                      <span className={`status-dot ${currentPriority.dot}`} />
                      <span>{currentPriority.label}</span>
                    </div>
                    {priorityOpen && (
                      <PickerMenu onClose={() => setPriorityOpen(false)}>
                        {PRIORITY_OPTIONS.map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            className="tb-menu-item"
                            onClick={() => { setCardPriority(task.id, opt.id); setPriorityOpen(false); }}
                          >
                            <span className={`status-dot ${opt.dot}`} style={{ marginRight: 8 }} />
                            {opt.label}
                          </button>
                        ))}
                      </PickerMenu>
                    )}
                  </div>
                </div>

                <div className="meta-row">
                  <div className="meta-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Assignees
                  </div>
                  <div className="meta-value">
                    <div className="assignee-container" style={{ position: 'relative' }}>
                      {assignees.map(m => (
                        <span
                          key={m.id}
                          className="assignee-chip"
                          style={m.type === 'operator'
                            ? { background: m.bg, color: m.color }
                            : { background: m.color, color: '#fff' }
                          }
                          title={m.name}
                        >
                          <span
                            className="assignee-chip-avatar"
                            style={m.type === 'operator'
                              ? { background: m.bg, color: m.color }
                              : { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                            }
                          >
                            {m.initials}
                          </span>
                          <span>{m.name}</span>
                          <button
                            type="button"
                            className="assignee-chip-remove"
                            aria-label={`Remove ${m.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAssignee(m.id);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        className="assignee-add"
                        aria-label="Add assignee"
                        aria-haspopup="listbox"
                        aria-expanded={assigneePickerOpen}
                        onClick={() => setAssigneePickerOpen(v => !v)}
                      >+</button>
                      {assigneePickerOpen && (
                        <AssigneePicker
                          members={data.members}
                          selectedIds={assignees.map(a => a.id)}
                          query={assigneeQuery}
                          onQueryChange={setAssigneeQuery}
                          onToggle={toggleAssignee}
                          onClose={() => { setAssigneePickerOpen(false); setAssigneeQuery(''); }}
                          getLoadInfo={getLoadInfo}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Effort — slot weight + estimated/confirmed status.
                    Sits below Assignees so the row reads "who's doing
                    it, then how much it costs them." Effort without an
                    assignee context is meaningless; reading order
                    matches that reality. */}
                <div className="meta-row">
                  <div className="meta-label">
                    <ScaleIcon width={16} height={16} aria-hidden="true" />
                    Effort
                  </div>
                  <div className="meta-value">
                    <SlotsEditor task={task} onPatch={patchCard} />
                  </div>
                </div>

                {/* Due date moved above Labels 2026-04-28 — when AMs
                    triage a card, scheduling it on the calendar comes
                    before classifying it. Start / Due / Labels reads
                    top-to-bottom in the order the AM actually fills
                    them in. */}
                <div className="meta-row">
                  <div className="meta-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Due date
                  </div>
                  <div className="meta-value">
                    <input
                      type="date"
                      className="meta-date"
                      aria-label="Due date"
                      value={task.dueDate ?? ''}
                      onChange={(e) => patchCard(task.id, { dueDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="meta-row">
                  <div className="meta-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Start date
                  </div>
                  <div className="meta-value">
                    <input
                      type="date"
                      className="meta-date"
                      aria-label="Start date"
                      value={task.startDate ?? ''}
                      onChange={(e) => patchCard(task.id, { startDate: e.target.value || undefined })}
                    />
                  </div>
                </div>

                <div className="meta-row">
                  <div className="meta-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    Labels
                  </div>
                  <div className="meta-value" style={{ position: 'relative', display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    {task.labels.length === 0 && (
                      <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>No labels</span>
                    )}
                    {task.labels.map(id => {
                      const lbl = labelById(id);
                      if (!lbl) {
                        // Orphaned label id — still show the raw token so
                        // the data stays visible, just without a colour.
                        // Remove × is wired so the user can clean up
                        // stale labels left over from a deleted custom
                        // label. Audit: card-modal L2.
                        return (
                          <span key={id} className="label-pill" data-label={id}>
                            {id}
                            <button
                              type="button"
                              className="label-pill-remove"
                              aria-label={`Remove ${id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLabel(id);
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </span>
                        );
                      }
                      return (
                        <span key={id} className={`label-pill ${lbl.cls}`} data-label={lbl.name}>
                          {lbl.name}
                          <button
                            type="button"
                            className="label-pill-remove"
                            aria-label={`Remove ${lbl.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLabel(id);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </span>
                      );
                    })}
                    <button
                      type="button"
                      className="assignee-add"
                      aria-label="Add label"
                      aria-haspopup="listbox"
                      aria-expanded={labelPickerOpen}
                      onClick={() => setLabelPickerOpen(v => !v)}
                      style={{ marginLeft: 6 }}
                    >+</button>
                    {labelPickerOpen && (
                      <LabelPicker
                        selectedIds={task.labels}
                        query={labelQuery}
                        onQueryChange={setLabelQuery}
                        onToggle={toggleLabel}
                        onClose={() => { setLabelPickerOpen(false); setLabelQuery(''); }}
                      />
                    )}
                  </div>
                </div>

              </div>

              {/* ── Description ──────────────────────────────────── */}
              <div>
                <div className="section-label">
                  <span role="heading" aria-level={3}>Description</span>
                </div>
                {editingDesc ? (
                  <div className="description-edit">
                    <textarea
                      autoFocus
                      className="description-edit-textarea"
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { cancelDesc(); }
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { saveDesc(); }
                      }}
                      placeholder="Add more detail for the team…"
                    />
                    <div className="description-edit-actions">
                      <button
                        type="button"
                        className="description-edit-btn is-cancel"
                        onClick={cancelDesc}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="description-edit-btn is-save"
                        onClick={saveDesc}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="description-box"
                    onClick={() => setEditingDesc(true)}
                    style={!task.description ? { color: 'var(--text-faint)', fontStyle: 'italic' } : undefined}
                    {...editDescRowProps}
                  >
                    {task.description || 'Click to add a description…'}
                  </div>
                )}
              </div>

              {/* ── Checklist ────────────────────────────────────── */}
              <div>
                <div className="section-label">
                  <span role="heading" aria-level={3}>Checklist</span>
                  {checklist.length > 0 && (
                    <span className="progress-pct">{doneCount} of {checklist.length} · {pct}%</span>
                  )}
                </div>
                {checklist.length > 0 && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="checklist">
                  {checklist.map(item => (
                    <ChecklistRow
                      key={item.id}
                      text={item.text}
                      done={item.done}
                      onToggle={() => toggleChecklist(task.id, item.id)}
                      onRename={(next) => renameChecklist(task.id, item.id, next)}
                      onDelete={() => deleteChecklist(task.id, item.id)}
                    />
                  ))}

                  {newCheckActive && (
                    <div className="checklist-row checklist-new-row" style={{ display: 'flex' }}>
                      <button className="checklist-checkbox" aria-label="New task" tabIndex={-1}>
                        <CheckIcon aria-hidden="true" />
                      </button>
                      <input
                        ref={newCheckInputRef}
                        type="text"
                        className="checklist-new-input"
                        placeholder="Task description — press Enter to add"
                        aria-label="New task description"
                        autoComplete="off"
                        value={newCheckText}
                        onChange={(e) => setNewCheckText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const text = newCheckText.trim();
                            if (text) {
                              addChecklist(task.id, text);
                              setNewCheckText('');
                              // keep input focused for fast multi-add
                              newCheckInputRef.current?.focus();
                            } else {
                              setNewCheckActive(false);
                            }
                          } else if (e.key === 'Escape') {
                            setNewCheckText('');
                            setNewCheckActive(false);
                          }
                        }}
                        onBlur={() => {
                          if (!newCheckText.trim()) setNewCheckActive(false);
                        }}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    className="checklist-add-row"
                    onClick={() => setNewCheckActive(true)}
                    aria-label="Add task"
                  >＋ Add Task</button>
                </div>
              </div>

              <div className="card-modal-footnote">
                Created {formatDateLong(task.createdAt)}
                {task.dueDate && ` · Due ${formatDateLong(task.dueDate)}`}
              </div>
            </div>
          </div>

          {/* ── Sidebar ──────────────────────────────────────────── */}
          {/* Comments + activity both live in shared pools
              (`data.taskComments` / `data.taskActivity`) keyed by
              taskId, so ops and client cards render the same two-tab
              layout. The store's comment + activity mutators accept
              either kind of task. */}
          <div className="card-modal-sidebar">
            <div className="sidebar-tabs" role="tablist" aria-label="Card sidebar">
              <button
                type="button"
                className={`sidebar-tab${tab === 'comments' ? ' active' : ''}`}
                role="tab"
                aria-selected={tab === 'comments'}
                onClick={() => setTab('comments')}
              >
                Comments
              </button>
              <button
                type="button"
                className={`sidebar-tab${tab === 'activity' ? ' active' : ''}`}
                role="tab"
                aria-selected={tab === 'activity'}
                onClick={() => setTab('activity')}
              >
                Activity Log
              </button>
            </div>

            <div
              className={`sidebar-content${tab === 'comments' ? ' active' : ''}`}
              role="tabpanel"
              hidden={tab !== 'comments'}
            >
              <CommentsPanel taskId={task.id} members={data.members} comments={data.taskComments} />
            </div>

            <div
              className={`sidebar-content${tab === 'activity' ? ' active' : ''}`}
              role="tabpanel"
              hidden={tab !== 'activity'}
            >
              <ActivityPanel taskId={task.id} members={data.members} activity={data.taskActivity} />
            </div>
          </div>
        </div>
      </div>

      {/* Stacked dialogs portal to <body> so they aren't subject to
          this modal's scroll position, transform, or z-index stack.
          A confirm dialog inside a tall comments thread used to
          inherit the parent's overflow:auto and end up rendered
          below the visible scroll viewport. Audit: card-modal L5. */}
      {showDeleteConfirm && task && createPortal(
        <ConfirmDangerDialog
          title={`Delete "${task.title}"?`}
          body="This removes the card from the board permanently. Any comments and activity on it go with it."
          confirmLabel="Delete card"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            deleteCard(task.id);
            onClose();
          }}
          onClose={() => setShowDeleteConfirm(false)}
        />,
        document.body,
      )}

      {shareOpen && task && !isOps && createPortal(
        <FlizowShareModal
          taskId={task.id}
          onClose={() => setShareOpen(false)}
        />,
        document.body,
      )}
    </div>
  );
}

/**
 * Slots editor — the inline number + status pill that lives in the
 * Effort meta-row. Two controls in one cell:
 *
 *   [ 2 ] slots · [Estimated]      ← italic, muted while estimated
 *   [ 2 ] slots · ✓ Confirmed       ← solid, green pill once confirmed
 *
 * Number input commits on change (the store is local; no debounce
 * needed). The status pill toggles between estimated and confirmed
 * with a single click — designers flip it to "Confirmed" once they've
 * sized the task themselves; AMs leave it as "Estimated" by default.
 *
 * The math doesn't care about status — capacity helpers always use
 * the current slots value. Status is a trust cue for humans, not a
 * math input. The italic/muted treatment when estimated tells AMs
 * "the load number you're seeing is a guess."
 *
 * Generic over Task / OpsTask via the shared `AnyCard` patcher; both
 * have `slots` + `weightStatus` on their type.
 */
function SlotsEditor({
  task,
  onPatch,
}: {
  task: Task | OpsTask;
  onPatch: (id: string, patch: Partial<AnyCard>) => void;
}) {
  const slots = task.slots ?? 1;
  const status = task.weightStatus ?? 'estimated';

  function commitSlots(raw: string) {
    const trimmed = raw.trim();
    // Empty input falls back to the default of 1 slot — same behavior
    // as a freshly-created task. Negative numbers clamped to 0;
    // non-numeric input is rejected silently rather than thrown.
    if (trimmed === '') {
      onPatch(task.id, { slots: 1 });
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return;
    onPatch(task.id, { slots: n });
  }

  function toggleStatus() {
    onPatch(task.id, {
      weightStatus: status === 'estimated' ? 'confirmed' : 'estimated',
    });
  }

  return (
    <div className={`slots-editor slots-editor--${status}`}>
      <input
        type="number"
        min={0}
        step={0.5}
        className="slots-input"
        value={slots}
        onChange={(e) => commitSlots(e.target.value)}
        aria-label="Slot weight"
      />
      <span className="slots-suffix">{slots === 1 ? 'slot' : 'slots'}</span>
      <button
        type="button"
        className={`slots-status-pill slots-status-pill--${status}`}
        onClick={toggleStatus}
        title={status === 'estimated'
          ? "Estimated by the AM. Click once you've sized it yourself to confirm."
          : 'Confirmed weight. Click to flip back to estimated.'}
      >
        {status === 'confirmed' && (
          <CheckIcon width={11} height={11} aria-hidden="true" style={{ marginRight: 3 }} />
        )}
        {status === 'estimated' ? 'Estimated' : 'Confirmed'}
      </button>
    </div>
  );
}

/** Format an ISO date string (YYYY-MM-DD) as "Mon Apr 30" — short
 *  enough to fit on the capacity warning banner's "Switch to" button
 *  without wrapping. Built locally rather than reused from the date
 *  utils because we want a specific weekday-prefix shape that no
 *  existing helper produces. */
function formatSuggestionDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  return `${weekday} ${month} ${date.getDate()}`;
}

/** Dropdown menu that closes on outside click. Renders its children
 *  inside a `.tb-menu.open` shell so it picks up the mockup styling. */
function PickerMenu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    // Use capture + timeout to avoid catching the click that opened us.
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => { window.clearTimeout(t); document.removeEventListener('mousedown', onDoc); };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="tb-menu open"
      onClick={(e) => e.stopPropagation()}
      style={{ top: 32, left: 0, minWidth: 180 }}
    >
      {children}
    </div>
  );
}

/** A single checklist row with toggle + inline rename + delete-on-hover. */
function ChecklistRow({
  text, done, onToggle, onRename, onDelete,
}: {
  text: string;
  done: boolean;
  onToggle: () => void;
  onRename: (next: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  useEffect(() => { setDraft(text); }, [text]);

  return (
    <div className="checklist-row">
      <button
        type="button"
        className={`checklist-checkbox${done ? ' checked' : ''}`}
        onClick={onToggle}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
      >
        <CheckIcon aria-hidden="true" />
      </button>
      {editing ? (
        <input
          autoFocus
          type="text"
          className="checklist-new-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim() && draft.trim() !== text) onRename(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { setDraft(text); setEditing(false); }
          }}
        />
      ) : (
        <span
          className={`checklist-text${done ? ' done' : ''}`}
          tabIndex={0}
          role="button"
          aria-label="Edit task"
          onClick={() => setEditing(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
        >
          {text}
        </span>
      )}
      <button
        type="button"
        className="checklist-delete-btn"
        aria-label="Delete task"
        onClick={onDelete}
        title="Delete task"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

/** Tiny helper: when the selected task disappears from the store (deleted
 *  elsewhere), fire onClose the next frame so the parent can unmount us. */
function TaskMissingAutoClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 0);
    return () => window.clearTimeout(t);
  }, [onClose]);
  return null;
}

/** Searchable multi-select for task assignees. A thin wrapper over
 *  the shared SearchablePicker — what used to be ~95 lines of
 *  autofocus/outside-click/Esc/filter boilerplate now lives once in
 *  components/shared. Audit: card-modal M1. */
function AssigneePicker({
  members, selectedIds, query, onQueryChange, onToggle, onClose, getLoadInfo,
}: {
  members: Member[];
  selectedIds: string[];
  query: string;
  onQueryChange: (q: string) => void;
  onToggle: (id: string) => void;
  onClose: () => void;
  /** Capacity-aware row metadata. Renders a green/amber/red load badge
   *  next to each member's name when present. The caller (FlizowCardModal)
   *  builds the function once with `(tasks, opsTasks, overrides, members,
   *  task.dueDate)` baked in; the picker just pulls per-member numbers
   *  from it. Optional — when omitted the rows render without badges,
   *  same as the pre-capacity surface. */
  getLoadInfo?: (memberId: string) => {
    load: number;
    soft: number;
    zone: 'green' | 'amber' | 'red';
  } | null;
}) {
  return (
    <SearchablePicker
      items={members}
      classes={{
        root: 'assignee-dropdown',
        search: 'assignee-search',
        list: 'assignee-list',
        option: 'assignee-option',
        empty: 'assignee-empty',
      }}
      placeholder="Search team members…"
      query={query}
      onQueryChange={onQueryChange}
      matches={(m, q) =>
        m.name.toLowerCase().includes(q) ||
        m.initials.toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q)
      }
      getKey={(m) => m.id}
      isSelected={(m) => selectedIds.includes(m.id)}
      onToggle={onToggle}
      renderItem={(m) => {
        const info = getLoadInfo?.(m.id);
        return (
          <>
            <span
              className="assignee-option-avatar"
              style={m.type === 'operator'
                ? { background: m.bg, color: m.color }
                : { background: m.color, color: '#fff' }}
            >
              {m.initials}
            </span>
            <span className="assignee-option-name">
              {m.name}
              {m.role && (
                <span style={{ color: 'var(--text-soft)', fontSize: 'var(--fs-xs)', marginLeft: 6 }}>
                  · {m.role}
                </span>
              )}
            </span>
            {info && (
              <span
                className={`load-badge load-badge--${info.zone}`}
                title={`${info.load} of ${info.soft} slots booked${info.zone === 'red' ? ' — over max' : info.zone === 'amber' ? ' — over target' : ''}`}
              >
                {info.load}/{info.soft}
              </span>
            )}
          </>
        );
      }}
      checkClassName="assignee-option-check"
      emptyLabel="No matches"
      onClose={onClose}
    />
  );
}

/** Searchable multi-select for board labels. Same wrapper pattern as
 *  AssigneePicker — the shared SearchablePicker carries the
 *  behaviour, this file owns the label-specific chip + CSS names. */
function LabelPicker({
  selectedIds, query, onQueryChange, onToggle, onClose,
}: {
  selectedIds: string[];
  query: string;
  onQueryChange: (q: string) => void;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <SearchablePicker
      items={BOARD_LABELS}
      classes={{
        root: 'label-dropdown',
        search: 'label-dropdown-search',
        list: 'label-dropdown-list',
        option: 'label-option',
        empty: 'label-empty',
      }}
      placeholder="Search labels…"
      query={query}
      onQueryChange={onQueryChange}
      matches={(l, q) => l.name.toLowerCase().includes(q)}
      getKey={(l) => l.id}
      isSelected={(l) => selectedIds.includes(l.id)}
      onToggle={onToggle}
      renderItem={(l) => <span className={`label-pill ${l.cls}`}>{l.name}</span>}
      checkClassName="label-option-check"
      emptyLabel="No matches"
      onClose={onClose}
    />
  );
}

/* ── Comments panel ──────────────────────────────────────────────────
 *
 * Right-sidebar tab content. Top-level comments render in chronological
 * order (oldest first, which reads like a conversation). Each comment
 * shows a collapsed "N replies" toggle; opening it reveals the thread +
 * an inline reply composer. The bottom of the panel hosts the top-level
 * composer — a plain <textarea> with ⌘/Ctrl+Enter to send.
 *
 * Not in this first pass:
 *   - @mentions (needs a picker + token rendering in the stored text)
 *   - Reactions (needs a picker + optimistic count render)
 *   - Editing own comments (toggle to textarea, save via updateComment)
 *   - Rich formatting (bold / italic / code)
 *   - Attachments
 * All of those are additive later; the shapes + mutators already support
 * them without a migration.
 */
function CommentsPanel({
  taskId,
  members,
  comments,
}: {
  taskId: string;
  members: Member[];
  comments: TaskComment[];
}) {
  const selfId = flizowStore.getCurrentMemberId();

  // Bucket into top-level + per-parent replies in one pass. We keep the
  // same chronological order the array already has so re-renders don't
  // jump things around.
  const { tops, repliesByParent } = useMemo(() => {
    const tops: TaskComment[] = [];
    const repliesByParent = new Map<string, TaskComment[]>();
    for (const c of comments) {
      if (c.taskId !== taskId) continue;
      if (c.parentId) {
        const bucket = repliesByParent.get(c.parentId);
        if (bucket) bucket.push(c);
        else repliesByParent.set(c.parentId, [c]);
      } else {
        tops.push(c);
      }
    }
    tops.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const list of repliesByParent.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return { tops, repliesByParent };
  }, [comments, taskId]);

  // Which top-level threads are expanded. We default to collapsed —
  // the mockup shows a "Show N replies" chevron until the user clicks.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Which top-level comment has the inline reply composer open. Only
  // one at a time; opening a second replaces the first so the panel
  // doesn't turn into a wall of textareas.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  // Comment slated for deletion — drives a single ConfirmDangerDialog
  // mounted at the panel root. Lifting the state up (rather than each
  // CommentItem owning its own dialog) means one mount point, one
  // focus trap, and the same "cascade warning" component we use for
  // every other destructive action in the app.
  const [deleteTarget, setDeleteTarget] = useState<TaskComment | null>(null);

  // Reset UI state whenever the modal switches to a different card.
  useEffect(() => {
    setExpanded(new Set());
    setReplyingTo(null);
    setDeleteTarget(null);
  }, [taskId]);

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function membersById(id: string): Member | null {
    return members.find(m => m.id === id) ?? null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
        {tops.length === 0 ? (
          <div style={{
            padding: '24px 8px',
            textAlign: 'center',
            color: 'var(--text-faint)',
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            No comments yet. Start the conversation below.
          </div>
        ) : (
          tops.map(c => {
            const replies = repliesByParent.get(c.id) ?? [];
            const isOpen = expanded.has(c.id);
            const isReplying = replyingTo === c.id;
            return (
              <CommentItem
                key={c.id}
                comment={c}
                author={membersById(c.authorId)}
                selfId={selfId}
                replies={replies}
                repliesOpen={isOpen}
                onToggleReplies={() => toggleExpanded(c.id)}
                isReplying={isReplying}
                onStartReply={() => {
                  // Opening a reply composer also expands the thread so the
                  // user can see siblings while typing.
                  setExpanded(prev => {
                    const next = new Set(prev);
                    next.add(c.id);
                    return next;
                  });
                  setReplyingTo(c.id);
                }}
                onCancelReply={() => setReplyingTo(null)}
                onSendReply={(text) => {
                  flizowStore.addComment(taskId, text, c.id);
                  setReplyingTo(null);
                }}
                onRequestDelete={(target) => setDeleteTarget(target)}
                membersById={membersById}
              />
            );
          })
        )}
      </div>
      <TopLevelComposer
        onSend={(text) => { flizowStore.addComment(taskId, text); }}
      />

      {deleteTarget && (() => {
        const isTopLevel = !deleteTarget.parentId;
        const replyCount = isTopLevel
          ? (repliesByParent.get(deleteTarget.id)?.length ?? 0)
          : 0;
        // A top-level comment with replies cascades them. Surfacing the
        // count up-front matches the Delete Client dialog's "Cascades
        // N cards, N notes…" pattern — never surprise a user with what
        // a destructive action took with it.
        const title = isTopLevel ? 'Delete comment?' : 'Delete reply?';
        const confirmLabel = isTopLevel && replyCount > 0
          ? `Delete comment + ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
          : isTopLevel
            ? 'Delete comment'
            : 'Delete reply';
        const body = isTopLevel && replyCount > 0
          ? `Removes this comment and the ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'} underneath it. This can't be undone.`
          : "This can't be undone.";
        // Portal alongside the card-modal's other stacked dialogs so
        // the confirm can't be hidden by the comments panel's
        // overflow:auto. Audit: card-modal L5.
        return createPortal(
          <ConfirmDangerDialog
            title={title}
            body={body}
            confirmLabel={confirmLabel}
            onConfirm={() => {
              flizowStore.deleteComment(deleteTarget.id);
              setDeleteTarget(null);
            }}
            onClose={() => setDeleteTarget(null)}
          />,
          document.body,
        );
      })()}
    </div>
  );
}

/** A single top-level comment + its optional reply thread. */
function CommentItem({
  comment,
  author,
  selfId,
  replies,
  repliesOpen,
  onToggleReplies,
  isReplying,
  onStartReply,
  onCancelReply,
  onSendReply,
  onRequestDelete,
  membersById,
}: {
  comment: TaskComment;
  author: Member | null;
  selfId: string | null;
  replies: TaskComment[];
  repliesOpen: boolean;
  onToggleReplies: () => void;
  isReplying: boolean;
  onStartReply: () => void;
  onCancelReply: () => void;
  onSendReply: (text: string) => void;
  onRequestDelete: (target: TaskComment) => void;
  membersById: (id: string) => Member | null;
}) {
  const isOwn = !!selfId && selfId === comment.authorId;
  const showRepliesToggle = replies.length > 0;

  return (
    <div className="comment">
      <Avatar member={author} />
      <div className="comment-body">
        {/* Bridge line — rendered when replies are open so the CSS vertical
            spine connects parent → child. The `:has(> .replies.open)`
            selector in flizow.css does the reveal; we always include the
            div so the selector has something to toggle. */}
        <div className="bridge-line" />
        <div className={`comment-bubble${isOwn ? ' you' : ''}`}>
          <div className="comment-author">
            {author?.name ?? 'Deleted user'}
            {isOwn && <span className="you-badge">You</span>}
          </div>
          <div className="comment-text">{comment.text}</div>
        </div>
        <div className="comment-meta">
          <span>{formatCommentTime(comment.createdAt)}</span>
          {comment.updatedAt && <span>· Edited</span>}
          <button type="button" className="comment-action-btn" onClick={onStartReply}>Reply</button>
          {isOwn && (
            <button type="button" className="comment-action-btn is-danger" onClick={() => onRequestDelete(comment)}>Delete</button>
          )}
        </div>

        {showRepliesToggle && (
          <button
            type="button"
            className={`replies-toggle${repliesOpen ? ' expanded' : ''}`}
            onClick={onToggleReplies}
            aria-expanded={repliesOpen}
          >
            <ChevronRightIcon className="chev" aria-hidden="true" />
            {repliesOpen ? `Hide ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : `Show ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
          </button>
        )}

        {(repliesOpen || isReplying) && (
          <div className={`replies${repliesOpen || isReplying ? ' open' : ''}`} data-reply-count={replies.length}>
            {repliesOpen && replies.map(r => (
              <ReplyItem
                key={r.id}
                comment={r}
                author={membersById(r.authorId)}
                selfId={selfId}
                onRequestDelete={onRequestDelete}
              />
            ))}
            {isReplying && (
              <ReplyComposer
                onCancel={onCancelReply}
                onSend={onSendReply}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A single reply row inside an expanded thread. No nested replies. */
function ReplyItem({
  comment,
  author,
  selfId,
  onRequestDelete,
}: {
  comment: TaskComment;
  author: Member | null;
  selfId: string | null;
  onRequestDelete: (target: TaskComment) => void;
}) {
  const isOwn = !!selfId && selfId === comment.authorId;
  return (
    <div className="comment">
      <Avatar member={author} />
      <div className="comment-body">
        <div className={`comment-bubble${isOwn ? ' you' : ''}`}>
          <div className="comment-author">
            {author?.name ?? 'Deleted user'}
            {isOwn && <span className="you-badge">You</span>}
          </div>
          <div className="comment-text">{comment.text}</div>
        </div>
        <div className="comment-meta">
          <span>{formatCommentTime(comment.createdAt)}</span>
          {comment.updatedAt && <span>· Edited</span>}
          {isOwn && (
            <button type="button" className="comment-action-btn is-danger" onClick={() => onRequestDelete(comment)}>Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The bottom-of-panel textarea for posting a new top-level comment.
 *  Uses a plain `<textarea>` (not contenteditable) for the first pass —
 *  we'll trade up to a rich editor once the surrounding flows are stable. */
function TopLevelComposer({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0;
  function send() {
    if (!canSend) return;
    onSend(value);
    setValue('');
  }
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter sends. Plain Enter still makes a newline so users
    // can write multi-paragraph comments without fighting the keybind.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  }
  return (
    <div className="comment-input-wrap" style={{ borderTop: '1px solid var(--hairline)' }}>
      <div className="comment-input-area">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder="Write a comment…  (⌘/Ctrl+Enter to send)"
          rows={3}
          aria-label="Write a comment"
        />
        <div className="comment-toolbar" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="reply-send"
            disabled={!canSend}
            onClick={send}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline reply composer — slimmer than the top-level one. Esc cancels,
 *  Enter sends (Shift+Enter inserts a newline) to match the mockup's hint. */
function ReplyComposer({
  onCancel,
  onSend,
}: {
  onCancel: () => void;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const canSend = value.trim().length > 0;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function send() {
    if (!canSend) return;
    onSend(value);
    setValue('');
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="reply-composer">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder="Write a reply…"
        rows={2}
        aria-label="Write a reply"
      />
      <div className="reply-composer-actions">
        <span className="reply-hint">Enter to send · Shift+Enter for newline</span>
        <button type="button" className="reply-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="reply-send" disabled={!canSend} onClick={send}>Send</button>
      </div>
    </div>
  );
}

/** Circular avatar matching the mockup's `.comment-avatar`. Shows member
 *  initials with the same colour scheme used on the card footer; falls
 *  back to a neutral "?" tile when the author has been removed. */
function Avatar({ member }: { member: Member | null }) {
  if (!member) {
    return (
      <div
        className="comment-avatar"
        style={{ background: 'var(--bg-faint)', color: 'var(--text-faint)' }}
        aria-hidden
      >
        ?
      </div>
    );
  }
  const isOperator = member.type === 'operator';
  return (
    <div
      className="comment-avatar"
      style={{
        background: isOperator ? (member.bg ?? 'var(--bg-faint)') : member.color,
        color: isOperator ? member.color : '#fff',
      }}
      title={member.name}
      aria-label={member.name}
    >
      {member.initials}
    </div>
  );
}

/** Short, human-friendly timestamp for comment meta rows.
 *    0–59 sec → "just now"
 *    1–59 min → "12m"
 *    1–23 hr  → "3h"
 *    <7 days  → "Mon 2:15pm"
 *    older    → "Mar 4, 2:15pm" */
function formatCommentTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const now = Date.now();
  const diffSec = Math.round((now - t) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const d = new Date(iso);
  const diffDays = Math.round((now - t) / 86_400_000);
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  if (diffDays < 7) {
    const day = d.toLocaleDateString(undefined, { weekday: 'short' });
    return `${day} ${timePart}`;
  }
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${datePart}, ${timePart}`;
}

/* ── Activity panel ──────────────────────────────────────────────────
 *
 * Read-only feed of every mutation on the card. Each row is a single
 * line: avatar + "{name} {text}" + timestamp. Rows render newest-first
 * because "what just happened?" is almost always the question driving a
 * user to open this tab.
 *
 * The store pre-formats the text at write time, so the renderer here is
 * intentionally dumb — no lookups, no conditionals per kind. The only
 * bit of dynamic work is resolving actorId → member for the avatar and
 * name, with a "Deleted user" fallback mirroring CommentItem. */
function ActivityPanel({
  taskId,
  members,
  activity,
}: {
  taskId: string;
  members: Member[];
  activity: TaskActivity[];
}) {
  const rows = useMemo(() => {
    return activity
      .filter(a => a.taskId === taskId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [activity, taskId]);

  const memberById = (id: string): Member | null =>
    members.find(m => m.id === id) ?? null;

  if (rows.length === 0) {
    return (
      <div style={{
        padding: '24px 8px',
        textAlign: 'center',
        color: 'var(--text-faint)',
        fontSize: 13,
        lineHeight: 1.5,
      }}>
        No activity yet. Changes to this card will show up here.
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map(row => {
        const actor = memberById(row.actorId);
        return (
          <div key={row.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Avatar member={actor} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                <strong style={{ fontWeight: 600 }}>{actor?.name ?? 'Deleted user'}</strong>
                {' '}
                <span style={{ color: 'var(--text-soft)' }}>{row.text}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
                {formatCommentTime(row.createdAt)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
