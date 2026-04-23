import { useMemo, useState } from 'react';
import { navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import type { Client, Service, Task } from '../types/flizow';
import { daysBetween } from '../utils/dateFormat';

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
  kind: 'client' | 'task';
  label: string;
  meta: string;
  status: AgendaStatus;
  clientId: string;
  serviceId?: string;
  taskId?: string;
  /** For the urgent/ontrack groups we also surface the parent service so
   *  the agenda reads as "Service · Card". */
  serviceName?: string;
}

type AgendaStatus =
  | 'new' | 'blocked' | 'overdue' | 'review'
  | 'due-this' | 'due-next' | 'on-track' | 'manual';

interface AgendaGroup {
  key: 'new-clients' | 'urgent' | 'ontrack' | 'manual';
  title: string;
  items: AgendaItem[];
}

export function WipPage() {
  const { data } = useFlizow();
  const [tab, setTab] = useState<Tab>('agenda');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const groups = useMemo(
    () => buildAgenda(data.clients, data.services, data.tasks, data.today),
    [data.clients, data.services, data.tasks, data.today],
  );

  // Apply per-session dismissals so removing an item sticks until reload.
  const visibleGroups = useMemo(() => groups.map(g => ({
    ...g,
    items: g.items.filter(i => !dismissed.has(i.key)),
  })), [groups, dismissed]);

  const itemCount = visibleGroups.reduce((n, g) => n + g.items.length, 0);
  const estMinutes = itemCount === 0 ? 0 : Math.max(15, itemCount * 2);

  function handleRemove(key: string) {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  return (
    <div className="view view-wip active" data-view="wip">
      <main className="wip-page">
        <header className="wip-header">
          <div className="wip-header-text">
            <div className="page-greeting">Weekly WIP</div>
            <h1 className="page-title">Prep the meeting</h1>
            <p className="page-date">
              Auto-populated from the kanban. Remove what you'll skip, add what you want to raise, start when ready.
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
          <TabLink active={tab === 'agenda'} onClick={() => setTab('agenda')}>Agenda</TabLink>
          <TabLink active={tab === 'live'} onClick={() => setTab('live')}>Live meeting</TabLink>
        </nav>

        {tab === 'agenda' && (
          <section className="wip-sub wip-agenda" aria-label="Agenda builder">
            <AgendaToolbar
              count={itemCount}
              minutes={estMinutes}
              onStart={() => setTab('live')}
            />

            {itemCount === 0 ? (
              <div className="wip-agenda-empty">
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
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'live' && (
          <section className="wip-sub" aria-label="Live meeting">
            <div className="wip-agenda-empty" style={{ maxWidth: 720, margin: '40px auto' }}>
              <div className="wip-empty-title">Live meeting mode lands next</div>
              <div className="wip-empty-body">
                The run-of-show timer, per-item notes capture, and talking-point
                prompts come in the next pass. For now, prep the agenda on the
                Agenda tab and walk it yourself.
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────

function AgendaToolbar({ count, minutes, onStart }: {
  count: number;
  minutes: number;
  onStart: () => void;
}) {
  return (
    <div className="wip-agenda-toolbar">
      <div className="wip-agenda-meta">
        <span>{count}</span> item{count === 1 ? '' : 's'} on the agenda · est. <span>{minutes}</span> min
        <span className="wip-save-hint">· Saved just now</span>
      </div>
      <div className="wip-agenda-actions">
        <button type="button" className="wip-btn wip-btn-ring" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add agenda item</span>
        </button>
        <button type="button" className="wip-btn wip-btn-ring" disabled>
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

function TabLink({ active, children, onClick }: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <a
      href="#wip"
      className={`wip-tab${active ? ' on' : ''}`}
      role="tab"
      aria-current={active ? 'page' : undefined}
      onClick={(e) => { e.preventDefault(); onClick(); }}
    >
      {children}
    </a>
  );
}

// ── Groups ───────────────────────────────────────────────────────────────

function AgendaGroupBlock({ group, onRemove }: {
  group: AgendaGroup;
  onRemove: (key: string) => void;
}) {
  const cls = `wip-agenda-group wip-agenda-group--${group.key === 'new-clients' ? 'new-clients' : group.key === 'urgent' ? 'urgent' : group.key === 'ontrack' ? 'ontrack' : 'manual'}`;

  return (
    <div className={cls}>
      <div className="wip-agenda-group-head">
        <div className="wip-agenda-group-title">
          <span className="wip-agenda-dot" />
          {group.title}
        </div>
        <div className="wip-agenda-group-count">
          {group.items.length} item{group.items.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="wip-agenda-group-body">
        {group.key === 'new-clients' || group.key === 'manual'
          ? (
            // Flat list — no client/service hierarchy needed
            group.items.map(it => (
              <FlatRow key={it.key} item={it} onRemove={() => onRemove(it.key)} />
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
  onRemove: (key: string) => void;
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
                <CardRow key={it.key} item={it} onRemove={() => onRemove(it.key)} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function FlatRow({ item, onRemove }: {
  item: AgendaItem;
  onRemove: () => void;
}) {
  return (
    <div
      className="wip-agenda-flat-row"
      onClick={(e) => {
        // Click the row (not the remove button) jumps to the client.
        if ((e.target as HTMLElement).closest('.wip-agenda-remove')) return;
        navigate(`#clients/${item.clientId}`);
      }}
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
    >
      <DragHandle />
      <span className="wip-agenda-status" data-status={item.status}>{statusLabel(item.status)}</span>
      <span className="wip-agenda-card-title">
        <strong style={{ fontWeight: 600 }}>{item.label}</strong>
        {item.meta && (
          <span style={{ color: 'var(--text-soft)', marginLeft: 8, fontWeight: 400 }}>
            {item.meta}
          </span>
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
  return (
    <div
      className="wip-agenda-card-row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.wip-agenda-remove')) return;
        if (item.serviceId) navigate(`#board/${item.serviceId}`);
      }}
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
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

function buildAgenda(clients: Client[], services: Service[], tasks: Task[], todayISO: string): AgendaGroup[] {
  // 1. New clients: onboard status or started in the last 30 days
  const newClients = clients
    .filter(c => {
      if (c.status === 'onboard') return true;
      if (!c.startedAt) return false;
      const age = daysBetween(c.startedAt, todayISO);
      return age >= 0 && age <= 30;
    })
    .slice(0, 6);

  // 2. Urgent: tasks that are blocked, severity critical, or overdue
  const urgent = tasks
    .filter(t => {
      if (t.columnId === 'done') return false;
      if (t.columnId === 'blocked') return true;
      if (t.severity === 'critical') return true;
      if (t.dueDate && daysBetween(todayISO, t.dueDate) < 0) return true;
      return false;
    })
    // Limit to ~12 rows so the urgent group stays scannable
    .slice(0, 12);

  // 3. On-track celebratory items: healthy clients with a task due this week
  const onTrackClients = new Set(
    clients.filter(c => c.status === 'track').map(c => c.id),
  );
  const onTrack = tasks
    .filter(t => {
      if (t.columnId === 'done') return false;
      if (!onTrackClients.has(t.clientId)) return false;
      if (!t.dueDate) return false;
      const diff = daysBetween(todayISO, t.dueDate);
      return diff >= 0 && diff <= 14;
    })
    .slice(0, 8);

  return [
    {
      key: 'new-clients',
      title: 'New clients',
      items: newClients.map(c => ({
        key: `nc-${c.id}`,
        kind: 'client',
        label: c.name,
        meta: `${c.industry}${c.startedAt ? ` · started ${formatWhen(c.startedAt, todayISO)}` : ''}`,
        status: 'new',
        clientId: c.id,
      })),
    },
    {
      key: 'urgent',
      title: 'Top priority',
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
      key: 'ontrack',
      title: 'On track',
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
      items: [], // Populated by the (not-yet-built) Add agenda item flow
    },
  ];
}

function urgentStatus(t: Task, todayISO: string): AgendaStatus {
  if (t.columnId === 'blocked') return 'blocked';
  if (t.dueDate && daysBetween(todayISO, t.dueDate) < 0) return 'overdue';
  if (t.columnId === 'review') return 'review';
  return 'blocked';
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
  const dow = today.getDay(); // 0 = Sun
  const daysToMon = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysToMon);
  return next.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + ' · 10:00 AM';
}
