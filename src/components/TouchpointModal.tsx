import { useEffect, useMemo, useRef, useState } from 'react';
import type { Touchpoint, TouchpointKind, Member, Contact, Client } from '../types/flizow';
import { flizowStore } from '../store/flizowStore';

/**
 * Create / edit modal for Touchpoints. One component drives three
 * flows: log a past meeting, schedule an upcoming one, and edit an
 * existing one. Dual-mode is decided by the presence of `touchpoint` —
 * same pattern as AddContactModal / AddQuickLinkModal.
 *
 * Fields:
 *   - Topic           (required)
 *   - Kind            (meeting / call / email / inperson)
 *   - When            (datetime-local; scheduled inferred from vs. now)
 *   - Attendees       (chips + simple type-to-add picker over members+contacts)
 *
 * Deliberately skipped in this first pass:
 *   - durationMin, recordingUrl/Label, calendarUrl — recording tooling
 *     lives with a future Otter/Fellow integration; not worth surfacing
 *     four extra fields that 90% of users won't fill.
 *
 * Scheduled flag auto-flips: if the user picks a date in the future,
 * `scheduled: true`. Lets one modal cover both "log past" and "schedule
 * future" without a mode toggle cluttering the UI.
 */

interface Props {
  client: Client;
  /** When provided, flips to edit mode: pre-fill + updateTouchpoint on save. */
  touchpoint?: Touchpoint;
  /** Default for new meetings. true = schedule (future), false = log (past). */
  defaultScheduled?: boolean;
  members: Member[];
  contacts: Contact[];
  onClose: () => void;
}

const KIND_OPTIONS: { value: TouchpointKind; label: string }[] = [
  { value: 'meeting',  label: 'Meeting' },
  { value: 'call',     label: 'Call' },
  { value: 'email',    label: 'Email' },
  { value: 'inperson', label: 'In person' },
];

export function TouchpointModal({
  client, touchpoint, defaultScheduled = false, members, contacts, onClose,
}: Props) {
  const isEdit = !!touchpoint;

  const [topic, setTopic] = useState(touchpoint?.topic ?? '');
  const [kind, setKind] = useState<TouchpointKind>(touchpoint?.kind ?? 'meeting');
  const [occurredAt, setOccurredAt] = useState<string>(() => {
    if (touchpoint) return toDatetimeLocal(touchpoint.occurredAt);
    const d = new Date();
    if (defaultScheduled) {
      // Default to the next full hour for scheduling flow — avoids
      // the awkward "Tomorrow at 3:17pm" default most pickers give.
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() + 1);
    }
    return toDatetimeLocal(d.toISOString());
  });
  const [attendeeIds, setAttendeeIds] = useState<string[]>(() => {
    if (touchpoint) return touchpoint.attendeeIds.slice();
    // Default: the client's Account Manager. Matches the original
    // handleLog behaviour which seeded with `[client.amId]`.
    return client.amId ? [client.amId] : [];
  });
  const [topicError, setTopicError] = useState(false);
  const [attendeeQuery, setAttendeeQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const topicRef = useRef<HTMLInputElement>(null);
  const pickerWrapRef = useRef<HTMLDivElement>(null);

  // Autofocus + select on mount. In edit mode select-all because the
  // user is here to change something; in add mode the field is empty
  // so select-all is a no-op but still fine.
  useEffect(() => {
    const t = window.setTimeout(() => {
      topicRef.current?.focus();
      if (isEdit) topicRef.current?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [isEdit]);

  // Escape / Cmd+Enter. Esc closes, Cmd+Enter saves.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, kind, occurredAt, attendeeIds, onClose]);

  // Close the attendee picker on outside-click. The query input stays
  // part of the modal; clicking the input doesn't close it.
  useEffect(() => {
    if (!pickerOpen) return;
    function onPointer(e: PointerEvent) {
      if (pickerWrapRef.current && !pickerWrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [pickerOpen]);

  // Candidates for the attendee picker: every member + every contact of
  // this client, minus the ones already selected. Filtered by the
  // picker's search query (case-insensitive substring match on name).
  const candidates = useMemo(() => {
    const pool: Array<{ id: string; name: string; role?: string; initials: string; color: string; group: 'member' | 'contact' }> = [];
    for (const m of members) {
      if (attendeeIds.includes(m.id)) continue;
      pool.push({ id: m.id, name: m.name, role: m.role, initials: m.initials, color: m.color, group: 'member' });
    }
    for (const c of contacts) {
      if (c.clientId !== client.id) continue;
      if (attendeeIds.includes(c.id)) continue;
      pool.push({
        id: c.id,
        name: c.name,
        role: c.role,
        initials: initialsOf(c.name),
        color: avatarColor(c.id),
        group: 'contact',
      });
    }
    const q = attendeeQuery.trim().toLowerCase();
    return q
      ? pool.filter(p => p.name.toLowerCase().includes(q) || (p.role?.toLowerCase().includes(q) ?? false))
      : pool;
  }, [members, contacts, client.id, attendeeIds, attendeeQuery]);

  // Resolve attendee ids back to display data. Graceful on orphans —
  // a deleted contact won't crash the chip row.
  const attendeeDetails = useMemo(() => {
    return attendeeIds.map(id => {
      const m = members.find(x => x.id === id);
      if (m) return { id, name: m.name, initials: m.initials, color: m.color };
      const c = contacts.find(x => x.id === id);
      if (c) return { id, name: c.name, initials: initialsOf(c.name), color: avatarColor(c.id) };
      return { id, name: '(Unknown)', initials: '?', color: 'var(--bg-soft)' };
    });
  }, [attendeeIds, members, contacts]);

  function addAttendee(id: string) {
    setAttendeeIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    setAttendeeQuery('');
    // Keep the picker open so multi-add is a single gesture. Close it
    // only when the user clicks away or the list is exhausted.
    if (candidates.length <= 1) setPickerOpen(false);
  }

  function removeAttendee(id: string) {
    setAttendeeIds(prev => prev.filter(x => x !== id));
  }

  function handleSave() {
    const trimmed = topic.trim();
    if (!trimmed) {
      setTopicError(true);
      topicRef.current?.focus();
      window.setTimeout(() => setTopicError(false), 1400);
      return;
    }
    const iso = fromDatetimeLocal(occurredAt);
    // Anything in the future is "scheduled". Matches the original
    // flow's split into log vs. schedule without needing a toggle.
    const scheduled = new Date(iso).getTime() > Date.now();

    if (isEdit && touchpoint) {
      flizowStore.updateTouchpoint(touchpoint.id, {
        topic: trimmed,
        kind,
        occurredAt: iso,
        scheduled,
        attendeeIds: attendeeIds.slice(),
      });
    } else {
      const id = `${client.id}-tp-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      flizowStore.addTouchpoint({
        id,
        clientId: client.id,
        topic: trimmed,
        occurredAt: iso,
        kind,
        scheduled,
        attendeeIds: attendeeIds.slice(),
        tldr: '',
        tldrLocked: false,
        createdAt: now,
      });
    }
    onClose();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const willBeScheduled = useMemo(() => {
    return new Date(fromDatetimeLocal(occurredAt)).getTime() > Date.now();
  }, [occurredAt]);

  const title = isEdit
    ? 'Edit meeting'
    : willBeScheduled ? 'Schedule meeting' : 'Log meeting';
  const saveLabel = isEdit
    ? 'Save changes'
    : willBeScheduled ? 'Schedule meeting' : 'Log meeting';

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="touchpoint-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 540 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="touchpoint-modal-title">{title}</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body">
          <label className="wip-field">
            <span className="wip-field-label">Topic</span>
            <input
              ref={topicRef}
              type="text"
              className="wip-field-input"
              value={topic}
              onChange={(e) => { setTopic(e.target.value); if (topicError) setTopicError(false); }}
              placeholder="e.g. Weekly sync, Q2 roadmap review"
              style={topicError ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={topicError || undefined}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="wip-field">
              <span className="wip-field-label">Kind</span>
              <select
                className="wip-field-input"
                value={kind}
                onChange={(e) => setKind(e.target.value as TouchpointKind)}
              >
                {KIND_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="wip-field">
              <span className="wip-field-label">When</span>
              <input
                type="datetime-local"
                className="wip-field-input"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </label>
          </div>

          <div className="wip-field">
            <span className="wip-field-label">
              Attendees
              <span style={{ marginLeft: 8, color: 'var(--text-faint)', fontWeight: 400, fontSize: 'var(--fs-xs)' }}>
                {willBeScheduled ? 'who should be there' : 'who was there'}
              </span>
            </span>
            <div ref={pickerWrapRef} style={{ position: 'relative' }}>
              <div className="log-attendees" onClick={() => setPickerOpen(true)}>
                {attendeeDetails.map(a => (
                  <span key={a.id} className="log-attendee-chip">
                    <span className="log-attendee-chip-avatar" style={{ background: a.color }}>
                      {a.initials}
                    </span>
                    {a.name}
                    <button
                      type="button"
                      className="log-attendee-chip-remove"
                      onClick={(e) => { e.stopPropagation(); removeAttendee(a.id); }}
                      aria-label={`Remove ${a.name}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="10" height="10">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  className="log-attendees-input"
                  value={attendeeQuery}
                  onChange={(e) => { setAttendeeQuery(e.target.value); setPickerOpen(true); }}
                  onFocus={() => setPickerOpen(true)}
                  placeholder={attendeeDetails.length === 0 ? 'Add teammates or contacts…' : ''}
                  aria-label="Add attendee"
                />
              </div>
              {pickerOpen && candidates.length > 0 && (
                <div className="tb-menu open attendee-picker-menu" role="listbox" style={{ top: 46, left: 0, right: 0, minWidth: 0, maxHeight: 260, overflowY: 'auto' }}>
                  {candidates.slice(0, 30).map(c => (
                    <div
                      key={c.id}
                      className="tb-menu-item attendee-picker-item"
                      role="option"
                      tabIndex={0}
                      onClick={() => addAttendee(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          addAttendee(c.id);
                        }
                      }}
                    >
                      <span className="log-attendee-chip-avatar" style={{ background: c.color }}>
                        {c.initials}
                      </span>
                      <span className="attendee-picker-name">{c.name}</span>
                      {c.role && (
                        <span className="attendee-picker-role">{c.role}</span>
                      )}
                      <span className="attendee-picker-group">
                        {c.group === 'member' ? 'Team' : 'Client'}
                      </span>
                    </div>
                  ))}
                  {candidates.length > 30 && (
                    <div className="attendee-picker-more">
                      Keep typing to narrow {candidates.length - 30} more.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="wip-btn wip-btn-primary"
            onClick={handleSave}
          >
            {saveLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert an ISO string to `YYYY-MM-DDTHH:MM` for datetime-local. Uses
 *  local timezone because that's what the picker displays in. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a datetime-local value back to a full ISO timestamp. */
function fromDatetimeLocal(s: string): string {
  return new Date(s).toISOString();
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 55%)`;
}
