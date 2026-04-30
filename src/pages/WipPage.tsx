import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  BellAlertIcon,
  BookmarkIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  EnvelopeIcon,
  FireIcon,
  FlagIcon,
  ListBulletIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  QueueListIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType, SVGProps } from 'react';
import { navigate } from '../router';
import { flizowStore } from '../store/flizowStore';
import { useFlizow } from '../store/useFlizow';
import type { Client, ManualAgendaItem, MeetingCapture, MeetingCaptureType, Service, Task } from '../types/flizow';
import { daysBetween } from '../utils/dateFormat';
import { categoryLabel } from '../utils/clientDerived';
import { useActivatableRow } from '../hooks/useActivatableRow';
import { useModalAutofocus } from '../hooks/useModalAutofocus';
import { useModalKeyboard } from '../hooks/useModalKeyboard';
import { ConfirmDangerDialog } from '../components/ConfirmDangerDialog';
import { useUndoToast } from '../contexts/UndoToastContext';

/**
 * Weekly WIP — the standing-meeting agenda page.
 *
 * Auto-builds an agenda from live data every time the page mounts, then
 * lets the AM edit it before the meeting. Four groups, ordered by the
 * question they answer for the room:
 *
 *   1. New clients — "who are we now serving that we weren't last week?"
 *   2. Urgent     — "what's on fire and needs a decision today?"
 *   3. On track   — "what's worth celebrating or nudging forward?"
 *   4. Manual     — "what did the AM add by hand?"
 *
 * Drag-and-drop reordering and the live meeting timer land in a later
 * pass. This pass gets the read-side + remove-from-agenda working so
 * a real agenda can be walked top-to-bottom.
 */

type Tab = 'agenda' | 'live';

interface AgendaItem {
  key: string;
  kind: 'client' | 'task' | 'manual';
  label: string;
  meta: string;
  status: AgendaStatus;
  /** Empty string for manual items with no client link. */
  clientId: string;
  serviceId?: string;
  taskId?: string;
  /** For the urgent/ontrack groups we also surface the parent service so
   *  the agenda reads as "Service · Card". */
  serviceName?: string;
  /** Only set on `kind: 'manual'`. Points back at the row in
   *  data.manualAgendaItems so Edit and Remove can patch/delete
   *  directly. */
  manualId?: string;
  /** Free text context for manual items. Rendered under the title in
   *  the flat row so the AM has the reminder at a glance. */
  note?: string;
}

type AgendaStatus =
  | 'new' | 'blocked' | 'critical' | 'overdue' | 'review'
  | 'due-this' | 'due-next' | 'on-track' | 'manual';

interface AgendaGroup {
  key: 'new-clients' | 'urgent' | 'pinned' | 'ontrack' | 'manual';
  title: string;
  items: AgendaItem[];
  /** Count of items that matched the group's selector but were
   *  truncated by the per-group cap. Surfaced in the group head so
   *  the AM knows there's overflow beyond what the meeting will cover
   *  — hidden truncation is truncation that breaks trust. Audit: wip M5. */
  hiddenCount: number;
}

/** Modal state: closed, open for a new item, or open editing an existing item. */
type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; item: ManualAgendaItem };

/**
 * Live meeting session state.
 *
 *   - idle: no meeting running. Live tab shows the pre-start gate.
 *   - active: meeting is running. currentKey = which agenda item is on
 *     the stage; doneKeys tracks what's been marked complete;
 *     itemStartedAt = when the current item became current (for the
 *     per-item elapsed timer).
 *
 * State lives in the parent so switching to the Agenda tab mid-meeting
 * doesn't blow it away.
 */
type LiveMeetingState =
  | { phase: 'idle' }
  | {
      phase: 'active';
      currentKey: string;
      doneKeys: Set<string>;
      itemStartedAt: number;
      /** Wall-clock time the meeting kicked off. The Quick Capture log
       *  filters captures to those created at-or-after this timestamp,
       *  so previous meetings' captures don't bleed into this session.
       *  Captures themselves still persist in the store across meetings;
       *  only the *visible* list in the live stage is scoped. */
      meetingStartedAt: number;
    };

export function WipPage() {
  const { data } = useFlizow();
  const toast = useUndoToast();
  const [tab, setTab] = useState<Tab>('agenda');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [meeting, setMeeting] = useState<LiveMeetingState>({ phase: 'idle' });
  const [showPreRead, setShowPreRead] = useState(false);
  // Confirm gate before ending a running meeting. The meeting captures
  // (notes/decisions/actions the user typed) persist in the store either
  // way, but ending wipes the in-flight UI state — current item, per-item
  // timer, marked-done flags. Esc is bound to "end meeting" inside
  // LiveMeeting's keyboard handler, and Esc is muscle memory for "close
  // this thing," so an accidental press during a meeting silently
  // erases the "you are here" anchor. The confirm gives the AM one
  // chance to back out. Only the in-flight state is lost — captures
  // and the agenda survive — but losing your cursor mid-meeting is the
  // friction we're absorbing. Audit: wip MED (forgiveness gap).
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Archived cards are hidden work — they shouldn't show up in the
  // Weekly WIP agenda, even if their status would otherwise mark them
  // as urgent or blocked. Filter once, feed the filtered list into the
  // agenda builder.
  const liveTasks = useMemo(() => data.tasks.filter(t => !t.archived), [data.tasks]);
  const groups = useMemo(
    () => buildAgenda(
      data.clients, data.services, liveTasks, data.manualAgendaItems, data.today,
    ),
    [data.clients, data.services, liveTasks, data.manualAgendaItems, data.today],
  );

  // Apply per-session dismissals so removing an auto item sticks until
  // reload. Manual items delete from the store and never hit the dismiss
  // set — they vanish naturally on the next render.
  const visibleGroups = useMemo(() => groups.map(g => ({
    ...g,
    items: g.items.filter(i => !dismissed.has(i.key)),
  })), [groups, dismissed]);

  // Flat order for the live meeting timeline:
  //   new-clients → urgent → pinned → ontrack → manual
  // The Live Meeting component treats this as the run-of-show.
  const flatAgenda = useMemo(() => {
    const out: AgendaItem[] = [];
    for (const g of visibleGroups) out.push(...g.items);
    return out;
  }, [visibleGroups]);

  const itemCount = flatAgenda.length;
  const estMinutes = itemCount === 0 ? 0 : Math.max(15, itemCount * 2);

  function handleRemove(item: AgendaItem) {
    if (item.kind === 'manual' && item.manualId) {
      const undo = flizowStore.deleteManualAgendaItem(item.manualId);
      if (undo) {
        toast.show({ message: 'Agenda item deleted', onUndo: undo });
      }
      return;
    }
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(item.key);
      return next;
    });
  }

  function handleEditManual(item: AgendaItem) {
    if (item.kind !== 'manual' || !item.manualId) return;
    const found = data.manualAgendaItems.find(m => m.id === item.manualId);
    if (!found) return;
    setModal({ kind: 'edit', item: found });
  }

  function startMeeting() {
    if (flatAgenda.length === 0) return;
    const now = Date.now();
    setMeeting({
      phase: 'active',
      currentKey: flatAgenda[0].key,
      doneKeys: new Set(),
      itemStartedAt: now,
      meetingStartedAt: now,
    });
    setTab('live');
  }

  // Actually wipe the in-flight meeting state. Only called after the
  // confirm dialog — never directly from the End-meeting button or the
  // Esc keybind. Drops the user back to the Agenda tab so the "what's
  // next?" view replaces the no-longer-running stage.
  function endMeeting() {
    setMeeting({ phase: 'idle' });
    setTab('agenda');
    setShowEndConfirm(false);
  }

  // What the End-meeting button + Esc keybind actually call. Pops the
  // confirm; the user clicks "End meeting" in the dialog to fall through
  // to endMeeting() above.
  function requestEndMeeting() {
    setShowEndConfirm(true);
  }

  function jumpTo(key: string) {
    if (meeting.phase !== 'active') return;
    // Jumping to the currently-focused item is a no-op — don't reset the timer.
    if (meeting.currentKey === key) return;
    setMeeting({ ...meeting, currentKey: key, itemStartedAt: Date.now() });
  }

  function toggleDone(key: string) {
    if (meeting.phase !== 'active') return;
    const next = new Set(meeting.doneKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setMeeting({ ...meeting, doneKeys: next });
  }

  function advance(direction: 1 | -1) {
    if (meeting.phase !== 'active') return;
    const i = flatAgenda.findIndex(it => it.key === meeting.currentKey);
    if (i === -1) return;
    const next = flatAgenda[i + direction];
    if (!next) return;
    setMeeting({ ...meeting, currentKey: next.key, itemStartedAt: Date.now() });
  }

  return (
    <div className="view view-wip active">
      <main className="wip-page">
        <header className="wip-header">
          <div className="wip-header-text">
            <div className="page-greeting">Weekly WIP</div>
            <h1 className="page-title">Prep the meeting</h1>
            <p className="page-date">
              Your team's weekly sync, ready to run.
            </p>
          </div>
          <div className="wip-header-meta">
            <div className="wip-next-meeting" aria-live="polite">
              <span className="wip-next-label">Next meeting</span>
              <span className="wip-next-time">{nextMeetingLabel(data.today)}</span>
            </div>
          </div>
        </header>

        <nav className="wip-tabs" role="tablist" aria-label="Weekly WIP sections">
          <TabLink
            active={tab === 'agenda'}
            onClick={() => setTab('agenda')}
            id="wip-tab-agenda"
            controls="wip-panel-agenda"
          >
            <ListBulletIcon width={14} height={14} aria-hidden="true" />
            Agenda
          </TabLink>
          <TabLink
            active={tab === 'live'}
            onClick={() => setTab('live')}
            id="wip-tab-live"
            controls="wip-panel-live"
          >
            <PlayIcon width={14} height={14} aria-hidden="true" />
            Live meeting
          </TabLink>
        </nav>

        {tab === 'agenda' && (
          <section
            id="wip-panel-agenda"
            className="wip-sub wip-agenda"
            role="tabpanel"
            aria-labelledby="wip-tab-agenda"
          >
            <AgendaToolbar
              count={itemCount}
              onAdd={() => setModal({ kind: 'add' })}
              onStart={startMeeting}
              onSendPreRead={() => setShowPreRead(true)}
            />

            {itemCount === 0 ? (
              <div className="wip-agenda-empty">
                <BellAlertIcon
                  width={36}
                  height={36}
                  aria-hidden="true"
                  className="wip-empty-icon"
                />
                <div className="wip-empty-title">Nothing on the agenda</div>
                <div className="wip-empty-body">
                  No new clients, no urgent cards — quiet week. Use{' '}
                  <strong>Add agenda item</strong> if you want to raise something.
                </div>
              </div>
            ) : (
              <div className="wip-agenda-list" aria-label="This week's agenda">
                {visibleGroups.map(g => g.items.length > 0 && (
                  <AgendaGroupBlock
                    key={g.key}
                    group={g}
                    onRemove={handleRemove}
                    onEditManual={handleEditManual}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'live' && (
          meeting.phase === 'active'
            ? (
              <LiveMeeting
                flatAgenda={flatAgenda}
                currentKey={meeting.currentKey}
                doneKeys={meeting.doneKeys}
                itemStartedAt={meeting.itemStartedAt}
                meetingStartedAt={meeting.meetingStartedAt}
                meetingCaptures={data.meetingCaptures}
                estMinutes={estMinutes}
                onJump={jumpTo}
                onToggleDone={toggleDone}
                onPrev={() => advance(-1)}
                onNext={() => advance(1)}
                // onEnd now requests-the-end (pops confirm); endMeeting
                // is the actual wipe and runs only on confirm.
                onEnd={requestEndMeeting}
              />
            )
            : (
              <LiveMeetingPrestart
                itemCount={itemCount}
                estMinutes={estMinutes}
                nextMeeting={nextMeetingLabel(data.today)}
                onStart={startMeeting}
              />
            )
        )}
      </main>

      {modal.kind !== 'closed' && (
        <AddAgendaItemModal
          clients={data.clients}
          existing={modal.kind === 'edit' ? modal.item : null}
          hasManualItems={data.manualAgendaItems.length > 0}
          onClose={() => setModal({ kind: 'closed' })}
        />
      )}

      {showPreRead && (
        <PreReadModal
          groups={visibleGroups}
          todayISO={data.today}
          nextMeeting={nextMeetingLabel(data.today)}
          itemCount={itemCount}
          estMinutes={estMinutes}
          onClose={() => setShowPreRead(false)}
        />
      )}

      {showEndConfirm && (
        <ConfirmDangerDialog
          title="End the meeting?"
          body={
            <>
              Your captures (notes, decisions, actions) stay saved. The
              per-item timer, current item, and which items you've marked
              done will reset — you won't be able to pick up where you
              left off.
            </>
          }
          confirmLabel="End meeting"
          onConfirm={endMeeting}
          onClose={() => setShowEndConfirm(false)}
        />
      )}
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────

function AgendaToolbar({ count, onAdd, onStart, onSendPreRead }: {
  count: number;
  onAdd: () => void;
  onStart: () => void;
  onSendPreRead: () => void;
}) {
  return (
    <div className="wip-agenda-toolbar">
      <div className="wip-agenda-meta">
        {/* Toolbar used to read "{count} items · est. {minutes} min ·
            Saved just now". Two small lies dressed as status: the
            minute estimate was a `Math.max(15, count * 2)` floor (so
            any 1-to-7-item agenda read as "15 min"), and "Saved just
            now" rendered unconditionally with no save event behind it.
            Both chipped at the AM's trust in the rest of the surface.
            Now just the honest thing: item count. The pre-read modal
            and the Live tab still use estMinutes internally to pace
            the timeline — there it's a pacing guide, not a promise.
            Audit: wip M2 + M3. */}
        <span>{count}</span> item{count === 1 ? '' : 's'} on the agenda
      </div>
      <div className="wip-agenda-actions">
        <button type="button" className="wip-btn wip-btn-ring" onClick={onAdd}>
          <PlusIcon width={14} height={14} aria-hidden="true" />
          <span>Add agenda item</span>
        </button>
        <button
          type="button"
          className="wip-btn wip-btn-ring"
          onClick={onSendPreRead}
          disabled={count === 0}
          title={count === 0 ? 'Nothing on the agenda to pre-read' : 'Preview and send a pre-read'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
          <span>Send pre-read</span>
        </button>
        <button type="button" className="wip-btn wip-btn-primary" onClick={onStart} disabled={count === 0}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
          <span>Start meeting</span>
        </button>
      </div>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────

function TabLink({ active, children, onClick, id, controls }: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  /** id the matching <section role="tabpanel"> uses for
   *  aria-labelledby — closes the tabs ↔ panel loop. Audit: wip L3. */
  id: string;
  /** id of the panel this tab controls. */
  controls: string;
}) {
  return (
    <a
      href="#wip"
      id={id}
      className={`wip-tab${active ? ' on' : ''}`}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => { e.preventDefault(); onClick(); }}
    >
      {children}
    </a>
  );
}

// ── Groups ───────────────────────────────────────────────────────────────

/** Per-agenda-group icon. Replaces the old colored dot — same group
 *  semantic, but the icon adds meaning on top of color (color-blind
 *  users get a shape signal, not just a hue). Group-class CSS still
 *  paints the icon in the group's brand colour via currentColor. */
const AGENDA_GROUP_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  'new-clients': UsersIcon,
  'urgent': FireIcon,
  // Bookmark — matches the Pin-to-next-WIP toggle on the card modal
  // and the kanban-tile pinned badge, so the same visual carries the
  // user's intent across all three surfaces.
  'pinned': BookmarkIcon,
  'ontrack': CheckCircleIcon,
  'manual': PencilSquareIcon,
};

function AgendaGroupBlock({ group, onRemove, onEditManual }: {
  group: AgendaGroup;
  onRemove: (item: AgendaItem) => void;
  onEditManual: (item: AgendaItem) => void;
}) {
  const cls = `wip-agenda-group wip-agenda-group--${group.key}`;
  const GroupIcon = AGENDA_GROUP_ICONS[group.key] ?? PencilSquareIcon;

  return (
    <div className={cls}>
      <div className="wip-agenda-group-head">
        <div className="wip-agenda-group-title">
          <GroupIcon width={16} height={16} aria-hidden="true" />
          {group.title}
        </div>
        <div className="wip-agenda-group-count">
          {group.items.length} item{group.items.length === 1 ? '' : 's'}
          {/* When a group's selector matched more than the per-group
              cap, show "+N more" so the AM knows the meeting won't
              touch everything. Previously `.slice(0, N)` trimmed
              silently. Audit: wip M5. */}
          {group.hiddenCount > 0 && (
            <span style={{ marginLeft: 'var(--sp-xs)', color: 'var(--text-faint)' }}>
              · +{group.hiddenCount} more
            </span>
          )}
        </div>
      </div>

      <div className="wip-agenda-group-body">
        {group.key === 'new-clients' || group.key === 'manual'
          ? (
            // Flat list — no client/service hierarchy needed
            group.items.map(it => (
              <FlatRow
                key={it.key}
                item={it}
                onRemove={() => onRemove(it)}
                onActivate={it.kind === 'manual' ? () => onEditManual(it) : undefined}
              />
            ))
          )
          : (
            // Client → Service hierarchy for urgent and ontrack
            <ClientGrouped items={group.items} onRemove={onRemove} />
          )
        }
      </div>
    </div>
  );
}

function ClientGrouped({ items, onRemove }: {
  items: AgendaItem[];
  onRemove: (item: AgendaItem) => void;
}) {
  const byClient = useMemo(() => {
    const map = new Map<string, { label: string; services: Map<string, { name: string; items: AgendaItem[] }> }>();
    for (const it of items) {
      if (!map.has(it.clientId)) {
        map.set(it.clientId, { label: it.meta.split(' · ')[0], services: new Map() });
      }
      const entry = map.get(it.clientId)!;
      const svcKey = it.serviceId ?? '_none';
      if (!entry.services.has(svcKey)) {
        entry.services.set(svcKey, { name: it.serviceName ?? 'Work', items: [] });
      }
      entry.services.get(svcKey)!.items.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <>
      {byClient.map(([clientId, entry]) => (
        <div className="wip-agenda-client" key={clientId}>
          <div className="wip-agenda-client-name">{entry.label}</div>
          {Array.from(entry.services.entries()).map(([svcKey, svc]) => (
            <div className="wip-agenda-service" key={svcKey}>
              <div className="wip-agenda-service-name">{svc.name}</div>
              {svc.items.map(it => (
                <CardRow key={it.key} item={it} onRemove={() => onRemove(it)} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * Renders a row in the new-clients or manual group. `onActivate` is
 * what happens when the row is clicked (anywhere but the remove
 * button) — manual items hand this to the edit modal; new-client rows
 * leave it null and fall back to navigating to the client page.
 */
function FlatRow({ item, onRemove, onActivate }: {
  item: AgendaItem;
  onRemove: () => void;
  onActivate?: () => void;
}) {
  // The activate path — used by both click and keyboard. Falls back to
  // opening the client page when the row isn't a manual agenda item.
  function activate() {
    if (onActivate) {
      onActivate();
    } else if (item.clientId) {
      navigate(`#clients/${item.clientId}`);
    }
  }
  function handleClick(e: React.MouseEvent) {
    // Skip clicks that land on the remove button — they handle themselves.
    if ((e.target as HTMLElement).closest('.wip-agenda-remove')) return;
    activate();
  }
  // Destination-aware aria-label so the SR announces where Enter will
  // land. "Edit agenda item: …" for manual rows, "Open client: …" for
  // the auto-populated new-client rows (previously unlabeled).
  const label = item.kind === 'manual'
    ? `Edit agenda item: ${item.label}`
    : item.clientId ? `Open client: ${item.label}` : undefined;
  const rowProps = useActivatableRow(activate, { label });
  return (
    <div
      className="wip-agenda-flat-row"
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
      {...rowProps}
    >
      <DragHandle />
      <span className="wip-agenda-status" data-status={item.status}>{statusLabel(item.status)}</span>
      <span className="wip-agenda-card-title">
        <strong style={{ fontWeight: 600 }}>{item.label}</strong>
        {item.meta && (
          <span style={{ color: 'var(--text-soft)', marginLeft: 'var(--sp-sm)', fontWeight: 400 }}>
            {item.meta}
          </span>
        )}
        {item.note && (
          <div style={{ color: 'var(--text-soft)', marginTop: 'var(--sp-micro)', fontWeight: 400, fontSize: 'var(--fs-sm)', lineHeight: 1.45 }}>
            {item.note}
          </div>
        )}
      </span>
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function CardRow({ item, onRemove }: {
  item: AgendaItem;
  onRemove: () => void;
}) {
  function activate() {
    if (item.serviceId) navigate(`#board/${item.serviceId}`);
  }
  const rowProps = useActivatableRow(activate, {
    label: item.serviceId ? `Open service board: ${item.label}` : undefined,
  });
  return (
    <div
      className="wip-agenda-card-row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.wip-agenda-remove')) return;
        activate();
      }}
      style={{ cursor: 'pointer' }}
      {...rowProps}
    >
      <DragHandle />
      <span className="wip-agenda-status" data-status={item.status}>{statusLabel(item.status)}</span>
      <span className="wip-agenda-card-title">{item.label}</span>
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function DragHandle() {
  // Visual handle only for now; dragging to reorder lands in the next pass.
  // Keeping the button shape so the layout doesn't shift when drag arrives.
  return (
    <button
      type="button"
      className="wip-agenda-drag"
      aria-label="Reorder"
      tabIndex={-1}
      onClick={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="6" r="1.3" />
        <circle cx="9" cy="12" r="1.3" />
        <circle cx="9" cy="18" r="1.3" />
        <circle cx="15" cy="6" r="1.3" />
        <circle cx="15" cy="12" r="1.3" />
        <circle cx="15" cy="18" r="1.3" />
      </svg>
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="wip-agenda-remove"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label="Remove from agenda"
      title="Remove from agenda"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

// ── Agenda builder ───────────────────────────────────────────────────────

function buildAgenda(
  clients: Client[],
  services: Service[],
  tasks: Task[],
  manualItems: ManualAgendaItem[],
  todayISO: string,
): AgendaGroup[] {
  // 1. New clients: onboard status or started in the last 30 days
  const newClientsAll = clients.filter(c => {
    if (c.status === 'onboard') return true;
    if (!c.startedAt) return false;
    const age = daysBetween(c.startedAt, todayISO);
    return age >= 0 && age <= 30;
  });
  const newClients = newClientsAll.slice(0, 6);
  const newClientsHidden = Math.max(0, newClientsAll.length - newClients.length);

  // 2. Urgent: tasks that are blocked, severity critical, or overdue.
  // Capped at 12 rows so the group stays scannable; the remainder
  // count flows through to the group head so the AM sees there's
  // more urgent work than the meeting will cover. Audit: wip M5.
  // Pinned cards are skipped here — they get their own dedicated
  // group (#3 below), so a card that's BOTH urgent and pinned shows
  // up exactly once in Pinned (the user's explicit voice wins over
  // automatic categorisation).
  const urgentAll = tasks.filter(t => {
    if (t.columnId === 'done') return false;
    if (t.flaggedForWip) return false;
    if (t.columnId === 'blocked') return true;
    if (t.severity === 'critical') return true;
    if (t.dueDate && daysBetween(todayISO, t.dueDate) < 0) return true;
    return false;
  });
  const urgent = urgentAll.slice(0, 12);
  const urgentHidden = Math.max(0, urgentAll.length - urgent.length);

  // 3. Pinned for discussion: cards the user explicitly flagged for the
  //    next WIP via the card-modal "Pin to next WIP" toggle. Bypasses
  //    the auto-classification (urgent/on-track) — if the user asked
  //    for it, it shows up no matter what. Cleared automatically when
  //    a pinned card moves to `done` (handled in flizowStore.updateTask).
  const pinnedAll = tasks.filter(t => {
    if (t.columnId === 'done') return false;
    return t.flaggedForWip === true;
  });
  const pinned = pinnedAll.slice(0, 12);
  const pinnedHidden = Math.max(0, pinnedAll.length - pinned.length);

  // 4. On-track celebratory items: healthy clients with a task due this week.
  //    Same de-dupe rule as urgent — pinned cards skip this group too.
  const onTrackClients = new Set(
    clients.filter(c => c.status === 'track').map(c => c.id),
  );
  const onTrackAll = tasks.filter(t => {
    if (t.columnId === 'done') return false;
    if (t.flaggedForWip) return false;
    if (!onTrackClients.has(t.clientId)) return false;
    if (!t.dueDate) return false;
    const diff = daysBetween(todayISO, t.dueDate);
    return diff >= 0 && diff <= 14;
  });
  const onTrack = onTrackAll.slice(0, 8);
  const onTrackHidden = Math.max(0, onTrackAll.length - onTrack.length);

  return [
    {
      key: 'new-clients',
      title: 'New clients',
      hiddenCount: newClientsHidden,
      items: newClients.map(c => ({
        key: `nc-${c.id}`,
        kind: 'client',
        label: c.name,
        meta: `${categoryLabel(c.industryCategory)}${c.startedAt ? ` · started ${formatWhen(c.startedAt, todayISO)}` : ''}`,
        status: 'new',
        clientId: c.id,
      })),
    },
    {
      key: 'urgent',
      title: 'Top priority',
      hiddenCount: urgentHidden,
      items: urgent.map(t => {
        const client = clients.find(c => c.id === t.clientId);
        const service = services.find(s => s.id === t.serviceId);
        return {
          key: `urg-${t.id}`,
          kind: 'task' as const,
          label: t.title,
          meta: `${client?.name ?? 'Unknown client'} · ${service?.name ?? 'Work'}`,
          status: urgentStatus(t, todayISO),
          clientId: t.clientId,
          serviceId: t.serviceId,
          taskId: t.id,
          serviceName: service?.name ?? 'Work',
        };
      }),
    },
    {
      key: 'pinned',
      title: 'Pinned for discussion',
      hiddenCount: pinnedHidden,
      items: pinned.map(t => {
        const client = clients.find(c => c.id === t.clientId);
        const service = services.find(s => s.id === t.serviceId);
        return {
          key: `pin-${t.id}`,
          kind: 'task' as const,
          label: t.title,
          meta: `${client?.name ?? 'Unknown client'} · ${service?.name ?? 'Work'}`,
          // Pinned items reuse urgentStatus's vocabulary so chips read
          // consistently with the urgent group when the underlying task
          // is also overdue/blocked. The category badge ("Pinned") is
          // already conveyed by the group header — the chip status
          // just describes the work's actual state.
          status: urgentStatus(t, todayISO),
          clientId: t.clientId,
          serviceId: t.serviceId,
          taskId: t.id,
          serviceName: service?.name ?? 'Work',
        };
      }),
    },
    {
      key: 'ontrack',
      title: 'On track',
      hiddenCount: onTrackHidden,
      items: onTrack.map(t => {
        const client = clients.find(c => c.id === t.clientId);
        const service = services.find(s => s.id === t.serviceId);
        return {
          key: `ot-${t.id}`,
          kind: 'task' as const,
          label: t.title,
          meta: `${client?.name ?? 'Unknown client'} · ${service?.name ?? 'Work'}`,
          status: onTrackStatus(t, todayISO),
          clientId: t.clientId,
          serviceId: t.serviceId,
          taskId: t.id,
          serviceName: service?.name ?? 'Work',
        };
      }),
    },
    {
      key: 'manual',
      title: 'Added by hand',
      // Manual items never get truncated — if the AM added it by hand
      // we don't hide it from them at render time.
      hiddenCount: 0,
      items: [...manualItems]
        // Rank ascending = top-of-manual first. Fall back to createdAt
        // so two items with identical rank sort deterministically.
        .sort((a, b) => (a.rank - b.rank) || a.createdAt.localeCompare(b.createdAt))
        .map(m => {
          const client = m.clientId ? clients.find(c => c.id === m.clientId) : null;
          return {
            key: `mn-${m.id}`,
            kind: 'manual' as const,
            label: m.title,
            meta: client ? client.name : 'Cross-cutting',
            status: 'manual' as const,
            clientId: m.clientId ?? '',
            manualId: m.id,
            note: m.note,
          };
        }),
    },
  ];
}

function urgentStatus(t: Task, todayISO: string): AgendaStatus {
  // A task is in the urgent group for three reasons (see buildAgenda
  // "Urgent" branch): blocked column, severity=critical, or overdue.
  // The label has to reflect *which* reason — the old fallback returned
  // 'blocked' for everything that wasn't overdue/review, which turned
  // severity-critical on-time tasks into BLOCKED pills. The AM then
  // walked into the meeting with the wrong framing. Audit: wip.md M4.
  if (t.columnId === 'blocked') return 'blocked';
  if (t.dueDate && daysBetween(todayISO, t.dueDate) < 0) return 'overdue';
  if (t.columnId === 'review') return 'review';
  if (t.severity === 'critical') return 'critical';
  // Genuinely unreachable given the current buildAgenda selector, but
  // 'on-track' is the honest fallback if a future selector adds a new
  // path into this group without updating this switch.
  return 'on-track';
}

function onTrackStatus(t: Task, todayISO: string): AgendaStatus {
  const diff = t.dueDate ? daysBetween(todayISO, t.dueDate) : null;
  if (diff !== null && diff >= 0 && diff <= 6) return 'due-this';
  if (diff !== null && diff >= 7 && diff <= 13) return 'due-next';
  return 'on-track';
}

function statusLabel(s: AgendaStatus): string {
  switch (s) {
    case 'new':       return 'NEW';
    case 'blocked':   return 'BLOCKED';
    case 'critical':  return 'CRITICAL';
    case 'overdue':   return 'OVERDUE';
    case 'review':    return 'REVIEW';
    case 'due-this':  return 'DUE THIS WK';
    case 'due-next':  return 'DUE NEXT WK';
    case 'on-track':  return 'ON TRACK';
    case 'manual':    return 'MANUAL';
  }
}

function formatWhen(iso: string, todayISO: string): string {
  const d = daysBetween(iso, todayISO);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

function nextMeetingLabel(todayISO: string): string {
  // Mondays 10:00 is a reasonable default until we wire meeting cadence.
  const today = new Date(todayISO);
  if (Number.isNaN(today.getTime())) return 'Monday · 10:00 AM';
  const dow = today.getDay(); // 0 = Sun, 1 = Mon, … 6 = Sat
  // If today is Monday we want next Monday (7 days). Otherwise the
  // number of days until Monday is (8 - dow) % 7, which is always
  // >= 1 for dow in 2..6 and 1 for dow = 0 (Sunday). The earlier
  // `|| 7` tail was dead — it only triggered at dow = 1, which the
  // outer ternary already handled. Audit: wip L5.
  const daysToMon = dow === 1 ? 7 : (8 - dow) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysToMon);
  return next.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + ' · 10:00 AM';
}

// ── Add / Edit agenda item modal ─────────────────────────────────────────

/**
 * The modal for raising something by hand. Four fields (client / title /
 * context / position), clean footer (Cancel + Save). Two modes driven by
 * the `existing` prop:
 *
 *   - existing == null → Add flow. Position defaults to "bottom" (below
 *     what's already been added by hand). Only shows the position field
 *     when there's at least one existing manual item to position
 *     against.
 *   - existing != null → Edit flow. Fields pre-fill; the position field
 *     is hidden because reorder doesn't belong in the edit modal — it
 *     belongs to a later drag-to-reorder pass.
 *
 * Validation is intentionally thin: title is required, everything else
 * is optional. We trim on save so an all-whitespace title is rejected.
 */
function AddAgendaItemModal({ clients, existing, hasManualItems, onClose }: {
  clients: Client[];
  existing: ManualAgendaItem | null;
  hasManualItems: boolean;
  onClose: () => void;
}) {
  const isEdit = existing != null;
  const [clientId, setClientId] = useState<string>(existing?.clientId ?? '');
  const [title, setTitle] = useState<string>(existing?.title ?? '');
  const [note, setNote] = useState<string>(existing?.note ?? '');
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-focus the title field after the overlay mounts. Shared hook
  // encapsulates the 80ms "wait for the transition" delay.
  useModalAutofocus(titleRef);

  function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(true);
      titleRef.current?.focus();
      // Auto-clear the red outline after a moment so it feels like a
      // nudge, not a permanent error state.
      window.setTimeout(() => setTitleError(false), 1400);
      return;
    }
    const patch = {
      title: trimmedTitle,
      clientId: clientId || null,
      note: note.trim(),
    };
    if (isEdit && existing) {
      flizowStore.updateManualAgendaItem(existing.id, patch);
    } else {
      flizowStore.addManualAgendaItem({ ...patch, position });
    }
    onClose();
  }

  // Escape closes; ⌘/Ctrl+Enter saves. Shared hook.
  useModalKeyboard({ onClose, onSave: handleSave });

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wip-flag-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document">
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="wip-flag-modal-title">
            <FlagIcon width={18} height={18} aria-hidden="true" />
            {isEdit ? 'Edit agenda item' : 'Add agenda item'}
          </h2>
          <button
            type="button"
            className="wip-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <XMarkIcon width={14} height={14} aria-hidden="true" />
          </button>
        </header>

        <div className="wip-modal-body">
          <label className="wip-field">
            <span className="wip-field-label">Client (optional)</span>
            <select
              className="wip-field-input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">No specific client</option>
              {clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="wip-field">
            <span className="wip-field-label">Title</span>
            <input
              ref={titleRef}
              type="text"
              className="wip-field-input"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
              placeholder="e.g. Q2 OKRs — confirm team commitments"
              style={titleError ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={titleError || undefined}
            />
          </label>

          <label className="wip-field">
            <span className="wip-field-label">Context</span>
            <textarea
              className="wip-field-input wip-field-textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What the team needs to know — shows up in the pre-read."
            />
          </label>

          {/* Hide position in the edit flow — reordering is a different
              motion (drag-to-reorder) that lands in a later pass. */}
          {!isEdit && hasManualItems && (
            <label className="wip-field">
              <span className="wip-field-label">Insert position</span>
              <select
                className="wip-field-input"
                value={position}
                onChange={(e) => setPosition(e.target.value as 'top' | 'bottom')}
                aria-label="Where in the manual agenda group to insert this item"
              >
                <option value="bottom">Bottom of manual items</option>
                <option value="top">Top of manual items</option>
              </select>
            </label>
          )}
        </div>

        <footer className="wip-modal-foot">
          <button
            type="button"
            className="wip-btn wip-btn-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="wip-btn wip-btn-primary"
            onClick={handleSave}
          >
            {isEdit ? 'Save changes' : 'Save item'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Pre-read modal ───────────────────────────────────────────────────────

/**
 * Preview of the meeting pre-read. Shows the compiled text in a
 * read-only textarea, with two actions at the bottom: copy to
 * clipboard (the fast path — paste into whatever tool the team uses)
 * and open in email (mailto: — opens the default client with the
 * subject and body pre-filled). Close dismisses.
 *
 * We don't actually "send" anything — the button label is honest
 * ("Copy" / "Open email"), because "Send" would imply this app knows
 * the team's email addresses, which it doesn't. Design rule: never
 * promise something the software can't deliver.
 */
function PreReadModal({ groups, todayISO, nextMeeting, itemCount, estMinutes, onClose }: {
  groups: AgendaGroup[];
  todayISO: string;
  nextMeeting: string;
  itemCount: number;
  estMinutes: number;
  onClose: () => void;
}) {
  const body = useMemo(
    () => buildPreRead(groups, todayISO, nextMeeting, itemCount, estMinutes),
    [groups, todayISO, nextMeeting, itemCount, estMinutes],
  );
  const subject = `Weekly WIP pre-read — ${formatPreReadDate(todayISO)}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  // Escape-to-close only — no save shortcut since this modal compiles
  // text, it doesn't write state.
  useModalKeyboard({ onClose });

  async function handleCopy() {
    const text = body;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (textareaRef.current) {
        // Fallback for older/insecure contexts where the Clipboard API
        // isn't available. Select the textarea contents and exec copy.
        textareaRef.current.focus();
        textareaRef.current.select();
        document.execCommand('copy');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Swallow — the textarea is already selectable, so the user can
      // manual-copy as a last resort. Showing an error would be noisier
      // than the actual failure mode is worth.
    }
  }

  function handleEmail() {
    const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // Open in new tab so we don't navigate the app itself if the user's
    // OS doesn't have a mail client registered.
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wip-preread-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 640 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="wip-preread-title">
            <EnvelopeIcon width={18} height={18} aria-hidden="true" />
            Pre-read preview
          </h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <XMarkIcon width={14} height={14} aria-hidden="true" />
          </button>
        </header>

        <div className="wip-modal-body">
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-soft)', marginBottom: 'var(--sp-sm)' }}>
            Copy this into Slack/email or open in your mail client. We don't
            send from here — the team's addresses live elsewhere.
          </div>
          <label className="wip-field" style={{ marginBottom: 0 }}>
            <span className="wip-field-label">Subject</span>
            <input
              type="text"
              readOnly
              className="wip-field-input"
              value={subject}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <label className="wip-field" style={{ marginTop: 'var(--sp-base)' }}>
            <span className="wip-field-label">Body</span>
            <textarea
              ref={textareaRef}
              readOnly
              className="wip-field-input wip-field-textarea"
              value={body}
              rows={14}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="wip-btn wip-btn-ring" onClick={handleEmail}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <polyline points="3 7 12 13 21 7" />
            </svg>
            Open in email
          </button>
          <button type="button" className="wip-btn wip-btn-primary" onClick={handleCopy}>
            {/* Whole-icon swap on copy state. The previous shape was a
                shared <svg> wrapper with conditional inner shapes — fine
                for hand-rolled paths but didn't compose with Heroicons
                (each Heroicon is itself a complete <svg>). Component-level
                swap reads cleaner anyway. */}
            {copied ? (
              <CheckIcon     width={14} height={14} aria-hidden="true" />
            ) : (
              <ClipboardIcon width={14} height={14} aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Plain-text body for the pre-read. Markdown would be nicer in Slack
 *  but breaks mailto encoding, and the AM is usually pasting into a
 *  channel or Gmail compose either way. Text is the lowest-common-
 *  denominator that survives both paths cleanly. */
function buildPreRead(
  groups: AgendaGroup[],
  todayISO: string,
  nextMeeting: string,
  itemCount: number,
  estMinutes: number,
): string {
  const lines: string[] = [];
  lines.push(`Weekly WIP pre-read — ${formatPreReadDate(todayISO)}`);
  lines.push(`Next meeting: ${nextMeeting}`);
  lines.push('');
  lines.push(`${itemCount} item${itemCount === 1 ? '' : 's'} · est. ${estMinutes} min`);

  for (const g of groups) {
    if (g.items.length === 0) continue;
    lines.push('');
    lines.push(`${g.title} (${g.items.length})`);
    for (const item of g.items) {
      lines.push(`• ${item.label} — ${item.meta}`);
      if (item.note) lines.push(`  Context: ${item.note}`);
    }
  }

  lines.push('');
  lines.push('—');
  lines.push('Sent from Flizow');
  return lines.join('\n');
}

function formatPreReadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Live meeting: pre-start gate ─────────────────────────────────────────

/**
 * What the user sees on the Live tab when a meeting hasn't been started
 * yet. Three stat tiles (items / est minutes / next meeting time) plus
 * the Start button — same button they can click from the Agenda tab, but
 * reachable here too for the case where they navigate straight to the
 * Live tab.
 */
function LiveMeetingPrestart({ itemCount, estMinutes, nextMeeting, onStart }: {
  itemCount: number;
  estMinutes: number;
  nextMeeting: string;
  onStart: () => void;
}) {
  const hasAgenda = itemCount > 0;
  return (
    <section
      id="wip-panel-live"
      className="wip-sub"
      role="tabpanel"
      aria-labelledby="wip-tab-live"
      aria-label="Live meeting"
    >
      <div className="wip-live-prestart">
        <div className="wip-live-prestart-eyebrow">Live meeting</div>
        <h2 className="wip-live-prestart-title">
          {hasAgenda ? 'Ready when you are' : 'No agenda yet'}
        </h2>
        <p className="wip-live-prestart-body">
          {hasAgenda
            ? 'Starting will walk the agenda top-to-bottom with a per-item timer. You can jump around, mark items complete, and end the meeting whenever you like.'
            : "Head back to the Agenda tab, raise what you want to cover, then come back here to start."
          }
        </p>
        <div className="wip-live-prestart-stats">
          <div className="wip-live-prestart-stat">
            <strong>{itemCount}</strong>
            <span>item{itemCount === 1 ? '' : 's'}</span>
          </div>
          <div className="wip-live-prestart-stat">
            <strong>{hasAgenda ? `~${estMinutes}` : '—'}</strong>
            <span>est. minutes</span>
          </div>
          <div className="wip-live-prestart-stat">
            <strong style={{ fontSize: 'var(--fs-base)' }}>{nextMeeting.split(' · ')[0]}</strong>
            <span>{nextMeeting.split(' · ')[1] ?? 'scheduled for'}</span>
          </div>
        </div>
        <div className="wip-live-prestart-actions">
          <button
            type="button"
            className="wip-btn wip-btn-primary wip-live-prestart-cta"
            onClick={onStart}
            disabled={!hasAgenda}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
            <span>Start meeting</span>
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Live meeting: in-session stage ───────────────────────────────────────

/**
 * The live meeting surface — top bar with wall clock and End control, a
 * sticky timeline sidebar on the left (jump to any item), and a stage on
 * the right showing the focused item with a per-item elapsed timer and
 * Prev / Mark done / Next controls.
 *
 * Keyboard: Space = mark current item done, ← / → = prev/next, Esc =
 * prompt to end meeting. Keeps the facilitator's eyes on the team, not
 * the UI.
 */
function LiveMeeting({
  flatAgenda, currentKey, doneKeys, itemStartedAt, meetingStartedAt,
  meetingCaptures, estMinutes,
  onJump, onToggleDone, onPrev, onNext, onEnd,
}: {
  flatAgenda: AgendaItem[];
  currentKey: string;
  doneKeys: Set<string>;
  itemStartedAt: number;
  /** Wall-clock time the meeting kicked off — used to filter captures
   *  to those raised during this session. Earlier captures stay in the
   *  store but don't pollute the live log. */
  meetingStartedAt: number;
  /** Full Quick-Capture log from the store. Filtered locally to
   *  captures with createdAt &gt;= meetingStartedAt before rendering. */
  meetingCaptures: MeetingCapture[];
  estMinutes: number;
  onJump: (key: string) => void;
  onToggleDone: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  // Active Quick-Capture composer. `null` = no composer open;
  // anything else means we're typing a note/decision/action and the
  // input is focused. Esc/Enter close it.
  const [composer, setComposer] = useState<{ type: MeetingCaptureType; text: string } | null>(null);
  const composerRef = useRef<HTMLInputElement | null>(null);
  const toast = useUndoToast();

  // One-second tick for the wall clock and per-item elapsed timer. A
  // single interval powers both — no need for two.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-focus the composer input when it opens. Doing this in an effect
  // (instead of autoFocus on the input) keeps the focus jump scoped to
  // composer toggles, not every re-render.
  useEffect(() => {
    if (composer && composerRef.current) {
      composerRef.current.focus();
      composerRef.current.select();
    }
  }, [composer?.type]);

  // Open the focused agenda item's client profile in a new tab so the
  // live meeting timer + state stay running in the original window.
  // Hash-based deep link via the existing #clients/<id> route — assemble
  // the full URL so window.open lands on the same origin instead of
  // navigating the current tab.
  function openClientProfile(clientId: string) {
    if (!clientId) return;
    const base = window.location.href.split('#')[0];
    window.open(`${base}#clients/${clientId}`, '_blank', 'noopener');
  }

  // Open the focused agenda item's specific kanban with the card modal
  // pre-opened. Same new-tab approach as openClientProfile so the
  // live meeting state survives. Falls back to the bare board URL when
  // there's no taskId — both routes resolve cleanly.
  function openKanbanCard(serviceId: string, taskId: string) {
    if (!serviceId) return;
    const base = window.location.href.split('#')[0];
    const path = taskId ? `#board/${serviceId}/card/${taskId}` : `#board/${serviceId}`;
    window.open(`${base}${path}`, '_blank', 'noopener');
  }

  // Keyboard shortcuts. Ignore when the focused element is an input or
  // textarea so we never steal keystrokes from the Quick Capture
  // composer or any other field that lands here later.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'j') { e.preventDefault(); onNext(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'k')  { e.preventDefault(); onPrev(); return; }
      if (e.key === ' ') { e.preventDefault(); onToggleDone(currentKey); return; }
      if (e.key === 'Escape') { e.preventDefault(); onEnd(); return; }
      // Quick Capture shortcuts. Lower-case match only — uppercase is
      // typically Shift+letter and could clash with browser shortcuts.
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setComposer({ type: 'note', text: '' }); return; }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setComposer({ type: 'decision', text: '' }); return; }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); setComposer({ type: 'action', text: '' }); return; }
      // O = open the focused item's client profile in a new tab.
      // No-op for manual items not tied to a client.
      if (e.key === 'o' || e.key === 'O') {
        const cur = flatAgenda.find(it => it.key === currentKey);
        if (!cur?.clientId) return;
        e.preventDefault();
        openClientProfile(cur.clientId);
        return;
      }
      // C = open the focused task's kanban card in a new tab. K is
      // already bound to "previous item," so C ("card") is the next
      // closest letter for "open card." No-op for client-only or
      // manual items where there's no specific service to open.
      if (e.key === 'c' || e.key === 'C') {
        const cur = flatAgenda.find(it => it.key === currentKey);
        if (!cur?.serviceId) return;
        e.preventDefault();
        openKanbanCard(cur.serviceId, cur.taskId ?? '');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentKey, flatAgenda, onNext, onPrev, onToggleDone, onEnd]);

  const current = flatAgenda.find(it => it.key === currentKey);
  const currentIndex = Math.max(0, flatAgenda.findIndex(it => it.key === currentKey));
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === flatAgenda.length - 1;

  const elapsedSec = Math.max(0, Math.floor((now - itemStartedAt) / 1000));
  // Target per-item = total estimate / count, rounded to whole minutes.
  const perItemSec = flatAgenda.length > 0 ? Math.round((estMinutes * 60) / flatAgenda.length) : 0;
  const isOverTime = perItemSec > 0 && elapsedSec > perItemSec;

  const dateLabel = new Date(now).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  });
  const clockLabel = new Date(now).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  return (
    <section
      id="wip-panel-live"
      className="wip-sub"
      role="tabpanel"
      aria-labelledby="wip-tab-live"
      aria-label="Live meeting in progress"
    >
      <div className="wip-live-root">
        <header className="wip-live-topbar">
          <span className="wip-live-topbar-kicker">Weekly WIP · In session</span>
          <span className="wip-live-topbar-date">{dateLabel}</span>
          <span className="wip-live-topbar-clock" aria-label="Current time">{clockLabel}</span>
          <div className="wip-live-topbar-ctrls">
            <button
              type="button"
              className="wip-btn wip-btn-ghost"
              onClick={onPrev}
              disabled={isFirst}
              aria-label="Previous item"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Prev</span>
            </button>
            <button
              type="button"
              className="wip-btn wip-btn-ring"
              onClick={() => onToggleDone(currentKey)}
            >
              {doneKeys.has(currentKey) ? 'Reopen' : 'Mark done'}
            </button>
            <button
              type="button"
              className="wip-btn wip-btn-primary"
              onClick={onNext}
              disabled={isLast}
              aria-label="Next item"
            >
              <span>Next</span>
              <ChevronRightIcon width={14} height={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="wip-btn wip-btn-ghost"
              onClick={onEnd}
            >
              End meeting
            </button>
          </div>
        </header>

        <div className="wip-live-grid">
          <aside className="wip-live-timeline" aria-label="Run of show">
            <div className="wip-live-timeline-head">
              <QueueListIcon width={14} height={14} aria-hidden="true" />
              Run of show
            </div>
            {flatAgenda.map((it, idx) => {
              const isDone = doneKeys.has(it.key);
              const isCurrent = it.key === currentKey;
              const cls = [
                'wip-live-tl-item',
                isCurrent && 'is-current',
                isDone && !isCurrent && 'is-done',
              ].filter(Boolean).join(' ');
              return (
                <button
                  type="button"
                  key={it.key}
                  className={cls}
                  onClick={() => onJump(it.key)}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="wip-live-tl-state">
                    {isDone ? '✓' : idx + 1}
                  </span>
                  <span className="wip-live-tl-body">
                    <div className="wip-live-tl-title">{it.label}</div>
                    <div className="wip-live-tl-sub">{it.meta}</div>
                  </span>
                  <span className="wip-live-tl-time">
                    {statusLabel(it.status)}
                  </span>
                </button>
              );
            })}
          </aside>

          <div className="wip-live-stage" aria-live="polite">
            {current ? (
              <>
                <div className="wip-live-stage-head">
                  <div>
                    <div className="wip-live-stage-eyebrow">
                      Item {currentIndex + 1} of {flatAgenda.length} · {statusLabel(current.status)}
                    </div>
                    <h2 className="wip-live-stage-title">{current.label}</h2>
                    <div className="wip-live-stage-meta">
                      <span className="owner">{current.meta}</span>
                      {current.serviceName && current.kind === 'task' && (
                        <>
                          <span className="sep">·</span>
                          <span>{current.serviceName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className={`wip-live-stage-timer${isOverTime ? ' is-over' : ''}`}
                    aria-label={`Elapsed on this item: ${formatElapsed(elapsedSec)}`}
                  >
                    {formatElapsed(elapsedSec)}
                  </div>
                </div>

                {/* Side trips — open the focused item's profile or
                    its specific kanban card in a new tab. Live meeting
                    timer + state stay running here in the original
                    window. Buttons only render when the underlying ids
                    exist (manual agenda items without a client get no
                    buttons; client-only items get just "Open profile";
                    task items get both). */}
                {(current.clientId || current.serviceId) && (
                  <div className="wip-live-stage-actions">
                    {current.clientId && (
                      <button
                        type="button"
                        className="wip-stage-context-btn"
                        onClick={() => openClientProfile(current.clientId)}
                        title={`Open ${current.label} profile in a new tab (O)`}
                      >
                        Open profile
                        <ArrowTopRightOnSquareIcon
                          width={12}
                          height={12}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                    {current.serviceId && (
                      <button
                        type="button"
                        className="wip-stage-context-btn"
                        onClick={() => openKanbanCard(current.serviceId!, current.taskId ?? '')}
                        title="Open this card on its kanban board in a new tab (C)"
                      >
                        Open card
                        <ArrowTopRightOnSquareIcon
                          width={12}
                          height={12}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                )}

                {current.note && (
                  <div>
                    <div className="wip-live-section-label">
                      <ChatBubbleLeftIcon width={12} height={12} aria-hidden="true" />
                      Context
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-soft)', lineHeight: 1.55 }}>
                      {current.note}
                    </p>
                  </div>
                )}

                {/* Quick Capture — lifted from the original mockup. Three
                    primary actions (note / decision / action) raise to
                    the meeting log; each has a one-key shortcut so the
                    AM running the meeting never has to take their
                    hands off the keyboard. Captures persist via the
                    store, so a refresh mid-meeting doesn't lose them.
                    Filter to this session only; older captures still
                    sit in data.meetingCaptures for future export. */}
                <div className="wip-quick-capture">
                  <div className="wip-quick-capture-head">
                    <div className="wip-live-section-label">Quick capture</div>
                    <div className="wip-quick-capture-keys" aria-hidden="true">
                      <span><kbd>N</kbd>ote</span>
                      <span><kbd>D</kbd>ecision</span>
                      <span><kbd>A</kbd>ction</span>
                    </div>
                  </div>

                  {composer ? (
                    <form
                      className="wip-quick-capture-composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!composer.text.trim() || !current) return;
                        flizowStore.addMeetingCapture({
                          type: composer.type,
                          text: composer.text,
                          agendaItemKey: current.key,
                          agendaItemLabel: current.label,
                        });
                        setComposer(null);
                      }}
                    >
                      <span className={`wip-capture-type-tag wip-capture-type-tag--${composer.type}`}>
                        {composer.type === 'note' ? 'Note' : composer.type === 'decision' ? 'Decision' : 'Action'}
                      </span>
                      <input
                        ref={composerRef}
                        type="text"
                        className="wip-quick-capture-input"
                        value={composer.text}
                        onChange={(e) => setComposer({ ...composer, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            setComposer(null);
                          }
                        }}
                        placeholder={
                          composer.type === 'note'
                            ? 'What was said worth remembering?'
                            : composer.type === 'decision'
                            ? 'What did we decide?'
                            : 'What needs to happen, and (briefly) by whom?'
                        }
                        aria-label={`${composer.type} text`}
                      />
                      <button
                        type="button"
                        className="wip-btn wip-btn-ghost"
                        onClick={() => setComposer(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="wip-btn wip-btn-primary"
                        disabled={!composer.text.trim()}
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <div className="wip-quick-capture-buttons">
                      <button
                        type="button"
                        className="wip-quick-capture-btn"
                        onClick={() => setComposer({ type: 'note', text: '' })}
                      >
                        + Add note
                      </button>
                      <button
                        type="button"
                        className="wip-quick-capture-btn"
                        onClick={() => setComposer({ type: 'decision', text: '' })}
                      >
                        + Log decision
                      </button>
                      <button
                        type="button"
                        className="wip-quick-capture-btn"
                        onClick={() => setComposer({ type: 'action', text: '' })}
                      >
                        + Assign action
                      </button>
                    </div>
                  )}

                  {/* Running log of this meeting's captures. Filter on
                      meetingStartedAt so prior meetings' entries sit
                      quietly in the store without bleeding in. Newest
                      first so the most recent capture is always at the
                      top of the eyeline. */}
                  {(() => {
                    const sessionCaptures = meetingCaptures
                      .filter(c => new Date(c.createdAt).getTime() >= meetingStartedAt)
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                    if (sessionCaptures.length === 0) return null;
                    return (
                      <ul className="wip-quick-capture-log" aria-label="Captured this meeting">
                        {sessionCaptures.map(c => (
                          <li key={c.id} className={`wip-capture-row wip-capture-row--${c.type}`}>
                            <span className={`wip-capture-type-tag wip-capture-type-tag--${c.type}`}>
                              {c.type === 'note' ? 'Note' : c.type === 'decision' ? 'Decision' : 'Action'}
                            </span>
                            <span className="wip-capture-text">{c.text}</span>
                            <span className="wip-capture-context">{c.agendaItemLabel}</span>
                            <button
                              type="button"
                              className="wip-capture-remove"
                              aria-label={`Remove ${c.type}`}
                              title="Remove"
                              onClick={() => {
                                const undo = flizowStore.deleteMeetingCapture(c.id);
                                if (undo) {
                                  const label = c.type === 'note' ? 'Note' : c.type === 'decision' ? 'Decision' : 'Action';
                                  toast.show({
                                    message: `${label} deleted`,
                                    onUndo: undo,
                                  });
                                }
                              }}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>

                <div>
                  <div className="wip-live-section-label">Keyboard</div>
                  <p style={{ margin: 0, color: 'var(--text-faint)', fontSize: 'var(--fs-sm)' }}>
                    <kbd>←</kbd> prev · <kbd>→</kbd> next · <kbd>Space</kbd> toggle done · <kbd>N</kbd>/<kbd>D</kbd>/<kbd>A</kbd> capture · <kbd>O</kbd> open profile · <kbd>C</kbd> open card · <kbd>Esc</kbd> end meeting
                  </p>
                </div>
              </>
            ) : (
              <div className="wip-agenda-empty" style={{ margin: 0 }}>
                <div className="wip-empty-title">All items covered</div>
                <div className="wip-empty-body">
                  Nothing left on the run of show. Click End meeting when the room is ready.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Format seconds as m:ss or h:mm:ss. Tabular-nums in CSS keeps the width stable. */
function formatElapsed(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
