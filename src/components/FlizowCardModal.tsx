import { useEffect, useMemo, useRef, useState } from 'react';
import { useFlizow } from '../store/useFlizow';
import type { ColumnId, Priority, Member } from '../types/flizow';
import { BOARD_LABELS, labelById } from '../constants/labels';

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
}

export default function FlizowCardModal({ taskId, onClose }: Props) {
  const { data, store } = useFlizow();
  const task = data.tasks.find(t => t.id === taskId);

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
    store.updateTask(task.id, { title: next });
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
    store.updateTask(task.id, { description: descDraft.trim() });
    setEditingDesc(false);
  }
  function cancelDesc() {
    setDescDraft(task?.description ?? '');
    setEditingDesc(false);
  }

  // ── Status / Priority dropdown toggles ────────────────────────────
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);

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
  useEffect(() => { setMoreOpen(false); }, [taskId]);

  // ── New-checklist-item input state ────────────────────────────────
  const [newCheckText, setNewCheckText] = useState('');
  const [newCheckActive, setNewCheckActive] = useState(false);
  const newCheckInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (newCheckActive) newCheckInputRef.current?.focus();
  }, [newCheckActive]);

  // ── Derived ───────────────────────────────────────────────────────
  const client = task ? data.clients.find(c => c.id === task.clientId) : null;
  const service = task ? data.services.find(s => s.id === task.serviceId) : null;
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
    store.updateTask(task.id, {
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
    store.updateTask(task.id, { labels: next });
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
      aria-labelledby="cardModalTitle"
      onClick={onClose}
    >
      <div className="card-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Titlebar ───────────────────────────────────────────── */}
        <div className="card-titlebar">
          <div className="titlebar-actions">
            <button
              type="button"
              className="tb-btn"
              aria-label="Share (coming soon)"
              title="Share (coming soon)"
              disabled
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
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
                <div className="tb-menu-item" aria-disabled="true" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  Duplicate card
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>soon</span>
                </div>
                <div className="tb-menu-item" aria-disabled="true" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  Copy link
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>soon</span>
                </div>
                <div className="tb-menu-divider" />
                <div className="tb-menu-item" aria-disabled="true" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  Archive card
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>soon</span>
                </div>
                <div
                  className="tb-menu-item danger"
                  onClick={() => {
                    const ok = window.confirm(`Delete "${task.title}"?\n\nThis removes it from the board permanently.`);
                    if (!ok) return;
                    store.deleteTask(task.id);
                    onClose();
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

              {/* Context line (client · service). Gives the user a quick
                  anchor so they know which board they're editing. */}
              {(client || service) && (
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
                      tabIndex={0}
                      role="button"
                      aria-label="Change status"
                      onClick={() => { setStatusOpen(v => !v); setPriorityOpen(false); }}
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
                            onClick={() => { store.moveTask(task.id, opt.id); setStatusOpen(false); }}
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
                      tabIndex={0}
                      role="button"
                      aria-label="Change priority"
                      onClick={() => { setPriorityOpen(v => !v); setStatusOpen(false); }}
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
                            onClick={() => { store.setTaskPriority(task.id, opt.id); setPriorityOpen(false); }}
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
                        />
                      )}
                    </div>
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
                        return (
                          <span key={id} className="label-pill" data-label={id}>
                            {id}
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
                      onChange={(e) => store.updateTask(task.id, { startDate: e.target.value || undefined })}
                    />
                  </div>
                </div>

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
                      onChange={(e) => store.updateTask(task.id, { dueDate: e.target.value })}
                    />
                  </div>
                </div>

              </div>

              {/* ── Description ──────────────────────────────────── */}
              <div>
                <div className="section-label">
                  <span role="heading" aria-level={3}>Description</span>
                </div>
                {editingDesc ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      autoFocus
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { cancelDesc(); }
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { saveDesc(); }
                      }}
                      placeholder="Add more detail for the team…"
                      style={{
                        width: '100%',
                        minHeight: 120,
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid var(--hairline)',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        fontSize: 14,
                        lineHeight: 1.55,
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={cancelDesc}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
                      >Cancel</button>
                      <button
                        type="button"
                        onClick={saveDesc}
                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--highlight)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >Save</button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="description-box"
                    tabIndex={0}
                    role="button"
                    aria-label="Edit description"
                    onClick={() => setEditingDesc(true)}
                    style={!task.description ? { color: 'var(--text-faint)', fontStyle: 'italic' } : undefined}
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
                      onToggle={() => store.toggleChecklistItem(task.id, item.id)}
                      onRename={(next) => store.updateChecklistItemText(task.id, item.id, next)}
                      onDelete={() => store.deleteChecklistItem(task.id, item.id)}
                    />
                  ))}

                  {newCheckActive && (
                    <div className="checklist-row checklist-new-row" style={{ display: 'flex' }}>
                      <button className="checklist-checkbox" aria-label="New task" tabIndex={-1}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
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
                              store.addChecklistItem(task.id, text);
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
              <EmptyTab
                icon={(
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                )}
                title="No comments yet"
                body="Threaded comments and @mentions are coming in the next pass."
              />
            </div>

            <div
              className={`sidebar-content${tab === 'activity' ? ' active' : ''}`}
              role="tabpanel"
              hidden={tab !== 'activity'}
            >
              <EmptyTab
                icon={(
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                )}
                title="Activity will appear here"
                body="Status changes, assignments, and edits get logged once the activity stream ships."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
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
        aria-label="Delete task"
        onClick={onDelete}
        style={{
          marginLeft: 'auto',
          width: 24, height: 24,
          border: 'none', background: 'transparent',
          color: 'var(--text-faint)', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6,
        }}
        title="Delete task"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

function EmptyTab({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8, padding: '32px 24px', textAlign: 'center',
      color: 'var(--text-faint)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'var(--bg-faint)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 260 }}>{body}</div>
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

/** Searchable multi-select for task assignees. Mirrors the mockup's
 *  `.assignee-dropdown` — anchored under the + button, closes on outside
 *  click or Esc, autofocuses its search field so the user can type
 *  immediately after clicking. */
function AssigneePicker({
  members, selectedIds, query, onQueryChange, onToggle, onClose,
}: {
  members: Member[];
  selectedIds: string[];
  query: string;
  onQueryChange: (q: string) => void;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Autofocus on open so the user can start typing immediately.
    searchRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.initials.toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q),
      )
    : members;

  return (
    <div ref={ref} className="assignee-dropdown open" onClick={(e) => e.stopPropagation()}>
      <input
        ref={searchRef}
        type="text"
        className="assignee-search"
        placeholder="Search team members…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <div className="assignee-list">
        {filtered.length === 0 ? (
          <div className="assignee-empty">No matches</div>
        ) : (
          filtered.map(m => {
            const selected = selectedIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`assignee-option${selected ? ' is-selected' : ''}`}
                onClick={() => onToggle(m.id)}
                // Keep it a proper button rather than a div so it's
                // keyboard-activatable out of the box.
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 'var(--sp-xs) var(--sp-sm)', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
              >
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
                <svg className="assignee-option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Searchable multi-select for board labels. Same shell as the assignee
 *  picker — same classes, so the CSS file does all the styling work. */
function LabelPicker({
  selectedIds, query, onQueryChange, onToggle, onClose,
}: {
  selectedIds: string[];
  query: string;
  onQueryChange: (q: string) => void;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? BOARD_LABELS.filter(l => l.name.toLowerCase().includes(q))
    : BOARD_LABELS;

  return (
    <div ref={ref} className="label-dropdown open" onClick={(e) => e.stopPropagation()}>
      <input
        ref={searchRef}
        type="text"
        className="label-dropdown-search"
        placeholder="Search labels…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <div className="label-dropdown-list">
        {filtered.length === 0 ? (
          <div className="label-empty">No matches</div>
        ) : (
          filtered.map(l => {
            const selected = selectedIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className={`label-option${selected ? ' is-selected' : ''}`}
                onClick={() => onToggle(l.id)}
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 'var(--sp-xs) var(--sp-sm)', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <span className={`label-pill ${l.cls}`}>{l.name}</span>
                <svg className="label-option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
