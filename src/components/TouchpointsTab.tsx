import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Client, Touchpoint, ActionItem, Member, Contact, TouchpointKind,
} from '../types/flizow';
import type { FlizowStore } from '../store/flizowStore';
import { formatMonthDay, daysBetween } from '../utils/dateFormat';
import { ConfirmDangerDialog } from './ConfirmDangerDialog';

/**
 * Touchpoints tab — the meeting paper trail for a client.
 *
 * Two storylines coexist on the same list:
 *   - upcoming scheduled meetings (with calendar link + agenda)
 *   - past touchpoints (with TL;DR + action items)
 *
 * Both render as `.meeting-entry` cards; the header row and body
 * branch on `scheduled`. Lives in one file because the two shapes
 * share so much structure (attendees, date chip, topic) that splitting
 * them up would just mean threading the same props through two views.
 */

interface Props {
  client: Client;
  touchpoints: Touchpoint[];
  actionItems: ActionItem[];
  members: Member[];
  contacts: Contact[];
  store: FlizowStore;
  todayISO: string;
}

export function TouchpointsTab({
  client, touchpoints, actionItems, members, contacts, store, todayISO,
}: Props) {
  // Scheduled first (soonest first), then past (newest first). One
  // trip through sort so the list is stable across renders.
  const clientTps = useMemo(() => {
    return touchpoints
      .filter(t => t.clientId === client.id)
      .slice()
      .sort((a, b) => {
        if (a.scheduled !== b.scheduled) return a.scheduled ? -1 : 1;
        if (a.scheduled) return a.occurredAt.localeCompare(b.occurredAt);
        return b.occurredAt.localeCompare(a.occurredAt);
      });
  }, [touchpoints, client.id]);

  const clientActions = useMemo(
    () => actionItems.filter(a => a.clientId === client.id),
    [actionItems, client.id],
  );

  // Header math — total in the last 90 days + open action items. Keeps
  // the cadence pill meaningful rather than just "N meetings".
  const quarterCount = useMemo(() => {
    return clientTps.filter(t => {
      if (t.scheduled) return false;
      const days = daysBetween(t.occurredAt.slice(0, 10), todayISO);
      return days >= 0 && days <= 90;
    }).length;
  }, [clientTps, todayISO]);
  const openActions = clientActions.filter(a => !a.done).length;

  const handleLog = () => {
    const topic = window.prompt('What was the meeting about?');
    if (!topic?.trim()) return;
    const id = `${client.id}-tp-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    store.addTouchpoint({
      id,
      clientId: client.id,
      topic: topic.trim(),
      occurredAt: now,
      kind: 'meeting',
      scheduled: false,
      attendeeIds: client.amId ? [client.amId] : [],
      tldr: '',
      tldrLocked: false,
      createdAt: now,
    });
  };

  const handleSchedule = () => {
    const topic = window.prompt('Topic for the upcoming meeting?');
    if (!topic?.trim()) return;
    const when = window.prompt('When? (YYYY-MM-DD HH:MM, 24h)', defaultWhen(todayISO));
    if (!when) return;
    const iso = parseWhen(when);
    if (!iso) {
      window.alert("Sorry, I couldn't read that date. Use YYYY-MM-DD HH:MM.");
      return;
    }
    const id = `${client.id}-tp-sched-${Date.now().toString(36)}`;
    store.addTouchpoint({
      id,
      clientId: client.id,
      topic: topic.trim(),
      occurredAt: iso,
      kind: 'meeting',
      scheduled: true,
      attendeeIds: client.amId ? [client.amId] : [],
      tldr: '',
      calendarUrl: 'https://calendar.google.com/calendar',
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="detail-section" data-tab="touchpoints">
      <div className="detail-section-header">
        <div className="detail-section-title">Touchpoints</div>
        <div className="detail-section-sub">
          {quarterCount} touchpoint{quarterCount === 1 ? '' : 's'} this quarter
          {openActions > 0 && ` · ${openActions} open action item${openActions === 1 ? '' : 's'}`}
        </div>
      </div>

      <div className="meetings-section">
        <div className="meetings-header">
          <div className="meetings-header-left">
            <span className="meetings-cadence">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {quarterCount} touchpoint{quarterCount === 1 ? '' : 's'} this quarter
              {openActions > 0 && ` · ${openActions} open action item${openActions === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="meetings-header-actions">
            <button type="button" className="meetings-log-btn" onClick={handleLog}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Log touchpoint
            </button>
            <button type="button" className="meetings-log-btn meetings-log-btn--primary" onClick={handleSchedule}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Schedule meeting
            </button>
          </div>
        </div>

        {clientTps.length === 0 ? (
          <div
            className="meetings-list"
            style={{ padding: 20, color: 'var(--text-soft)', fontSize: 14 }}
          >
            No touchpoints yet. Log your first meeting to start the paper trail.
          </div>
        ) : (
          <div className="meetings-list">
            {clientTps.map(tp => (
              <MeetingEntry
                key={tp.id}
                touchpoint={tp}
                actions={clientActions.filter(a => a.touchpointId === tp.id)}
                members={members}
                contacts={contacts}
                store={store}
                todayISO={todayISO}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Meeting entry ─────────────────────────────────────────────────────────

function MeetingEntry({ touchpoint, actions, members, contacts, store, todayISO }: {
  touchpoint: Touchpoint;
  actions: ActionItem[];
  members: Member[];
  contacts: Contact[];
  store: FlizowStore;
  todayISO: string;
}) {
  const attendees = useMemo(
    () => touchpoint.attendeeIds
      .map(id => lookupAttendee(id, members, contacts))
      .filter((a): a is AttendeeDetail => !!a),
    [touchpoint.attendeeIds, members, contacts],
  );

  const openCount = actions.filter(a => !a.done).length;
  const overdueCount = actions.filter(a => !a.done && isOverdue(a.dueDate, todayISO)).length;
  const doneCount = actions.filter(a => a.done).length;
  const actionsLabel = buildActionsLabel(openCount, doneCount, overdueCount);

  const relative = touchpoint.scheduled
    ? upcomingRelative(touchpoint.occurredAt, todayISO)
    : pastRelative(touchpoint.occurredAt, todayISO);

  // Overflow ⋯ menu — tucked at the end of the top row. Today it only
  // carries "Delete meeting…" but is shaped plural so we can add
  // Reschedule, Duplicate, etc. later without moving the affordance.
  // Dismiss on outside pointerdown or Esc; matches the same pattern used
  // by the client hero ⋯.
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="meeting-entry" data-scheduled={touchpoint.scheduled ? 'true' : undefined}>
      <div className="meeting-top">
        <span
          className="meeting-type-icon"
          data-type={touchpoint.kind}
          title={labelForKind(touchpoint.kind)}
        >
          {kindIcon(touchpoint.kind)}
        </span>

        {touchpoint.scheduled && (
          <span className="meeting-scheduled-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {relative}
          </span>
        )}

        <span className="meeting-date">{formatMeetingDate(touchpoint.occurredAt, todayISO)}</span>
        <div className="meeting-topic">{touchpoint.topic}</div>

        {attendees.length > 0 && (
          <div className="meeting-attendees">
            {attendees.map(a => (
              <span
                key={a.id}
                className="attendee"
                style={{ background: a.color }}
                title={`${a.name}${a.role ? ` · ${a.role}` : ''}`}
              >
                {a.initials}
              </span>
            ))}
          </div>
        )}

        {touchpoint.scheduled && touchpoint.calendarUrl ? (
          <a
            href={touchpoint.calendarUrl}
            className="meeting-calendar-link"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Open in Calendar
          </a>
        ) : touchpoint.recordingUrl ? (
          <a
            href={touchpoint.recordingUrl}
            className="meeting-recording"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            {touchpoint.recordingLabel ?? `${touchpoint.durationMin ?? ''} min`}
          </a>
        ) : null}

        {/* Overflow menu — sits at the end of the row, hosting
            destructive / rarely-needed actions. Relative wrapper
            anchors the absolute .tb-menu dropdown. */}
        <div ref={menuRef} className="meeting-overflow" style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            type="button"
            className="tb-btn"
            aria-label="Meeting options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
            style={{
              width: 28, height: 28, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          <div className={`tb-menu${menuOpen ? ' open' : ''}`} role="menu">
            <div
              className="tb-menu-item danger"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setShowDeleteConfirm(true);
              }}
            >
              Delete meeting…
            </div>
          </div>
        </div>
      </div>

      <TldrField
        touchpoint={touchpoint}
        store={store}
      />

      {!touchpoint.scheduled && actions.length > 0 && (
        <div className="meeting-actions">
          <div className="meeting-actions-label">
            Action Items <span className="meeting-actions-count">{actionsLabel}</span>
          </div>
          {actions.map(a => (
            <ActionItemRow
              key={a.id}
              item={a}
              members={members}
              store={store}
              todayISO={todayISO}
            />
          ))}
        </div>
      )}

      {showDeleteConfirm && (() => {
        // Cascade: deleteTouchpoint drops every action item tied to the
        // meeting. Surface the count so the user isn't surprised — same
        // pattern as Delete Client. Promoted kanban cards stay; the
        // store deliberately spares those so ripping a meeting doesn't
        // wipe downstream work.
        const actionCount = actions.length;
        const cascadeLine = actionCount > 0
          ? ` Drops the ${actionCount} action item${actionCount === 1 ? '' : 's'} attached to it.`
          : '';
        return (
          <ConfirmDangerDialog
            title={`Delete "${touchpoint.topic}"?`}
            body={`Removes this meeting and its TL;DR.${cascadeLine} Cards already promoted to the kanban board stay.`}
            confirmLabel="Delete meeting"
            onConfirm={() => {
              setShowDeleteConfirm(false);
              store.deleteTouchpoint(touchpoint.id);
            }}
            onClose={() => setShowDeleteConfirm(false)}
          />
        );
      })()}
    </div>
  );
}

// ── TL;DR (inline-edit) ──────────────────────────────────────────────────

/**
 * Inline-edit on click. Locked TL;DRs render as a read-only paragraph
 * with a lock badge. Empty TL;DRs render a grey placeholder that
 * invites a click — consistent with the rest of the app's "hover the
 * cursor, see the edit affordance" rule.
 */
function TldrField({ touchpoint, store }: {
  touchpoint: Touchpoint;
  store: FlizowStore;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(touchpoint.tldr ?? '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const locked = !!touchpoint.tldrLocked;
  const hasTldr = !!touchpoint.tldr?.trim();

  const start = () => {
    if (locked) return;
    setDraft(touchpoint.tldr ?? '');
    setEditing(true);
    // Focus after render — scheduling it avoids the flash of the
    // read-only paragraph steering the cursor.
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const commit = () => {
    const next = draft.trim();
    if (next !== (touchpoint.tldr ?? '').trim()) {
      store.updateTouchpoint(touchpoint.id, { tldr: next });
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(touchpoint.tldr ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="meeting-tldr" data-editing="true">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Add TL;DR — why this meeting mattered."
          rows={3}
          style={{
            width: '100%', resize: 'vertical',
            fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit',
            color: 'inherit', background: 'transparent',
            border: 'none', outline: 'none', padding: 0,
          }}
        />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="meeting-tldr" data-locked="true">
        {hasTldr ? touchpoint.tldr : <em style={{ color: 'var(--text-soft)' }}>No TL;DR recorded.</em>}
        <span className="meeting-tldr-lock" title="Locked after 72h · edit trail visible">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Locked
        </span>
      </div>
    );
  }

  return (
    <div
      className="meeting-tldr"
      role="button"
      tabIndex={0}
      onClick={start}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
      }}
      style={{ cursor: 'text' }}
    >
      {hasTldr
        ? touchpoint.tldr
        : (
          <span
            className="meeting-tldr--empty"
            data-empty="true"
            data-placeholder="Add TL;DR — why this meeting mattered."
          >
            Add TL;DR — why this meeting mattered.
          </span>
        )
      }
    </div>
  );
}

// ── Action item row ───────────────────────────────────────────────────────

function ActionItemRow({ item, members, store, todayISO }: {
  item: ActionItem;
  members: Member[];
  store: FlizowStore;
  todayISO: string;
}) {
  const assignee = item.assigneeId ? members.find(m => m.id === item.assigneeId) ?? null : null;
  const dueStatus = dueChipStatus(item.dueDate, todayISO, item.done);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // If the action item has a promoted kanban card, delete surfaces that
  // fact in the confirm body so the user isn't surprised the card survives.
  const wasPromoted = !!item.promotedCardId;

  return (
    <>
      <div className="meeting-action" data-action-item data-done={item.done ? 'true' : 'false'}>
        <button
          type="button"
          className="meeting-action-check"
          role="checkbox"
          aria-checked={item.done}
          aria-label={item.done ? 'Mark not done' : 'Mark done'}
          onClick={() => store.toggleActionItem(item.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        <div className="meeting-action-text">{item.text}</div>
        {assignee && (
          <span
            className="meeting-action-assignee"
            style={{ background: assignee.color }}
            title={assignee.name}
          >
            {assignee.initials}
          </span>
        )}
        <span className="meeting-action-due" data-status={dueStatus}>
          {dueChipLabel(item.dueDate, todayISO, item.done)}
        </span>
        {item.promotedCardId ? (
          <span
            className="meeting-action-promote"
            title="Already promoted to a card"
            style={{ opacity: 0.6, pointerEvents: 'none' }}
          >
            On board
          </span>
        ) : (
          <button
            type="button"
            className="meeting-action-promote"
            onClick={() => {
              // Promotion to a kanban card lands once the board is wired.
              // For now the button stays visible but is a deliberate stub so
              // the interaction is discoverable before the wire-up.
              window.alert('Promotion to a kanban card ships with the Service board pass.');
            }}
          >
            Promote to card
          </button>
        )}
        <button
          type="button"
          className="meeting-action-delete"
          aria-label={`Delete action item: ${item.text}`}
          onClick={() => setShowDeleteConfirm(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {showDeleteConfirm && (
        <ConfirmDangerDialog
          title="Delete action item?"
          body={
            wasPromoted
              ? "Removes this row from the meeting's follow-ups. The kanban card it was promoted to stays on the board."
              : "Removes this follow-up from the meeting. This can't be undone."
          }
          confirmLabel="Delete action item"
          onConfirm={() => {
            store.deleteActionItem(item.id);
            setShowDeleteConfirm(false);
          }}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface AttendeeDetail {
  id: string;
  name: string;
  initials: string;
  color: string;
  role?: string;
}

function lookupAttendee(
  id: string, members: Member[], contacts: Contact[],
): AttendeeDetail | null {
  const member = members.find(m => m.id === id);
  if (member) {
    return {
      id: member.id,
      name: member.name,
      initials: member.initials,
      color: member.color,
      role: member.role,
    };
  }
  const contact = contacts.find(c => c.id === id);
  if (contact) {
    return {
      id: contact.id,
      name: contact.name,
      initials: initialsOf(contact.name),
      color: avatarColor(contact.id),
      role: contact.role,
    };
  }
  return null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Deterministic pastel hue for a contact id. Keeps each client-side
 *  attendee the same colour across re-renders without us having to
 *  store one. */
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 55% 55%)`;
}

function labelForKind(kind: TouchpointKind): string {
  switch (kind) {
    case 'meeting':  return 'Video meeting';
    case 'call':     return 'Phone call';
    case 'email':    return 'Email thread';
    case 'inperson': return 'In-person meeting';
  }
}

function kindIcon(kind: TouchpointKind): React.ReactNode {
  const p = {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (kind) {
    case 'meeting':
      return <svg {...p}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>;
    case 'call':
      return <svg {...p}><path d="M22 16.92V21a1 1 0 0 1-1.1 1 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 3.2 4.1 1 1 0 0 1 4.2 3h4.08a1 1 0 0 1 1 .75 12.78 12.78 0 0 0 .7 2.81 1 1 0 0 1-.23 1.05L8.21 9.21a16 16 0 0 0 6 6l1.6-1.6a1 1 0 0 1 1-.23 12.78 12.78 0 0 0 2.82.7 1 1 0 0 1 .75 1z" /></svg>;
    case 'email':
      return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 7 9-7" /></svg>;
    case 'inperson':
      return <svg {...p}><path d="M3 21V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v13" /><path d="M9 21V12h6v9" /></svg>;
  }
}

function formatMeetingDate(iso: string, todayISO: string): string {
  const datePart = iso.slice(0, 10);
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = daysBetween(datePart, todayISO);
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Yesterday · ${time}`;
  if (days === -1) return `Tomorrow · ${time}`;
  return `${formatMonthDay(datePart)} · ${time}`;
}

// `daysBetween(a, b)` returns `b - a`. For these helpers we always want
// the signed offset "from today's point of view": positive = in the
// past, negative = in the future. Pass the date-to-probe first and
// `todayISO` second so the sign lines up.

function upcomingRelative(iso: string, todayISO: string): string {
  // Scheduled meeting → meeting date is ahead of today → we want the
  // positive count of days-ahead, so flip the args.
  const diff = daysBetween(todayISO, iso.slice(0, 10));
  if (diff <= 0) return 'Now';
  if (diff === 1) return 'In 1 day';
  if (diff < 7) return `In ${diff} days`;
  return `In ${Math.round(diff / 7)} week${diff < 14 ? '' : 's'}`;
}

function pastRelative(iso: string, todayISO: string): string {
  const days = daysBetween(iso.slice(0, 10), todayISO);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatMonthDay(iso.slice(0, 10));
}

function isOverdue(dueISO: string, todayISO: string): boolean {
  // due was before today → today − due > 0.
  return daysBetween(dueISO, todayISO) > 0;
}

function dueChipStatus(
  dueISO: string, todayISO: string, done: boolean,
): 'today' | 'overdue' | undefined {
  if (done) return undefined;
  const days = daysBetween(dueISO, todayISO); // today − due
  if (days === 0) return 'today';
  if (days > 0) return 'overdue';
  return undefined;
}

function dueChipLabel(dueISO: string, todayISO: string, done: boolean): string {
  const days = daysBetween(dueISO, todayISO); // today − due
  if (done) return formatMonthDay(dueISO);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday'; // due one day in the past
  if (days === -1) return 'Tomorrow'; // due one day ahead
  return formatMonthDay(dueISO);
}

function buildActionsLabel(open: number, done: number, overdue: number): string {
  if (open === 0 && done > 0) return 'All done';
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (open - overdue > 0) parts.push(`${open - overdue} open`);
  if (done > 0) parts.push(`${done} done`);
  return parts.join(' · ');
}

function defaultWhen(todayISO: string): string {
  // Default the schedule prompt to tomorrow at 10:00 — the most
  // conservative "I need a default, not a decision" pick.
  const d = new Date(todayISO);
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} 10:00`;
}

function parseWhen(input: string): string | null {
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(
    Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0,
  );
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}
