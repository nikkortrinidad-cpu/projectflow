import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute, navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import type {
  Client, Service, ServiceType, TemplateKey, Task, Member, FlizowData, ClientStatus,
  OnboardingItem, Contact, QuickLink,
} from '../types/flizow';
import { flizowStore, type FlizowStore } from '../store/flizowStore';
import { formatMonthYear, formatMonthDay, formatMrr, daysBetween } from '../utils/dateFormat';
import { NotesTab } from '../components/NotesTab';
import { TouchpointsTab } from '../components/TouchpointsTab';
import { StatsTab } from '../components/StatsTab';
import { ConfirmDangerDialog } from '../components/ConfirmDangerDialog';

/**
 * Right-hand pane of the Clients split view. Ports the Acme detail layout
 * (`<section class="client-detail-page">` in the mockup) and drives tab
 * switching from local state — URL stays at `#clients/{id}` so that hitting
 * Back from a service board always lands you where you started, rather
 * than on the last tab you peeked at.
 *
 * Overview tab is fully wired (hero, needs-attention, services strip,
 * recent activity). The other five tabs render a short placeholder that
 * points at the next port pass.
 */

type TabKey = 'overview' | 'onboarding' | 'about' | 'stats' | 'touchpoints' | 'notes';

interface TabDef {
  key: TabKey;
  label: string;
}

const TABS: TabDef[] = [
  { key: 'overview',    label: 'Overview' },
  { key: 'onboarding',  label: 'Onboarding' },
  { key: 'about',       label: 'About' },
  { key: 'stats',       label: 'Stats' },
  { key: 'touchpoints', label: 'Touchpoints' },
  { key: 'notes',       label: 'Notes' },
];

export function ClientDetailPage() {
  const route = useRoute();
  const { data, store } = useFlizow();
  const id = route.params.id ?? null;
  const client = id ? data.clients.find(c => c.id === id) ?? null : null;

  return (
    <div className="view view-client-detail active" data-view="client-detail">
      {client ? <ClientDetail client={client} data={data} store={store} /> : <EmptyState />}
    </div>
  );
}

// ── Empty (no client selected) ────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="detail-empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        <path d="M3 7l9 6 9-6" />
      </svg>
      <div className="detail-empty-title">Select a client</div>
      <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-faint)' }}>
        Pick a row on the left to see their services, activity, and notes.
      </div>
    </div>
  );
}

// ── Top-level detail layout ───────────────────────────────────────────────

interface DetailProps {
  client: Client;
  data: FlizowData;
  store: FlizowStore;
}

function ClientDetail({ client, data, store }: DetailProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showAddService, setShowAddService] = useState(false);
  const [servicesEditMode, setServicesEditMode] = useState(false);
  const [deleteServiceId, setDeleteServiceId] = useState<string | null>(null);

  // Reset to Overview whenever the user lands on a different client, so the
  // first thing they see on a new row isn't whatever tab they peeked at on
  // the previous one. Also drops edit mode + any in-flight confirm dialog
  // so a half-finished delete doesn't bleed onto the next client.
  useEffect(() => {
    setActiveTab('overview');
    setShowAddService(false);
    setServicesEditMode(false);
    setDeleteServiceId(null);
  }, [client.id]);

  const am = client.amId ? data.members.find(m => m.id === client.amId) ?? null : null;
  const services = useMemo(
    () => data.services.filter(s => s.clientId === client.id),
    [data.services, client.id],
  );
  const openTasks = useMemo(
    () => data.tasks.filter(t => t.clientId === client.id && t.columnId !== 'done'),
    [data.tasks, client.id],
  );
  const clientOnboarding = useMemo(() => {
    const svcIds = new Set(services.map(s => s.id));
    return data.onboardingItems.filter(o => svcIds.has(o.serviceId));
  }, [data.onboardingItems, services]);

  return (
    <section
      className="client-detail-page"
      data-client-panel={client.id}
      data-active-tab={activeTab}
    >
      <Hero client={client} am={am} />
      <TabsRow tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <>
          <AttentionSection client={client} tasks={openTasks} services={services} />
          <ServicesSection
            services={services}
            onAdd={() => setShowAddService(true)}
            editing={servicesEditMode}
            onToggleEdit={() => setServicesEditMode(v => !v)}
            onDelete={(id) => setDeleteServiceId(id)}
          />
          <ActivitySection client={client} tasks={data.tasks} members={data.members} todayISO={data.today} />
        </>
      )}

      {activeTab === 'onboarding' && (
        <OnboardingSection
          services={services}
          items={clientOnboarding}
          onToggle={(id) => store.toggleOnboardingItem(id)}
        />
      )}

      {activeTab === 'about' && (
        <AboutSection client={client} data={data} />
      )}

      {activeTab === 'notes' && (
        <NotesTab clientId={client.id} notes={data.notes} store={store} />
      )}

      {activeTab === 'touchpoints' && (
        <TouchpointsTab
          client={client}
          touchpoints={data.touchpoints}
          actionItems={data.actionItems}
          members={data.members}
          contacts={data.contacts}
          store={store}
          todayISO={data.today}
        />
      )}

      {activeTab === 'stats' && (
        <StatsTab client={client} />
      )}

      {showAddService && (
        <AddServiceModal
          clientId={client.id}
          onClose={() => setShowAddService(false)}
        />
      )}

      {deleteServiceId && (() => {
        const svc = data.services.find(s => s.id === deleteServiceId);
        if (!svc) return null;
        const taskCount = data.tasks.filter(t => t.serviceId === svc.id).length;
        const onbCount = data.onboardingItems.filter(o => o.serviceId === svc.id).length;
        return (
          <ConfirmDangerDialog
            title={`Delete "${svc.name}"?`}
            body={
              <>
                This removes the service board and cascades{' '}
                <strong>{taskCount}</strong> card{taskCount === 1 ? '' : 's'}
                {onbCount > 0 && (
                  <>
                    {' '}plus <strong>{onbCount}</strong> onboarding item{onbCount === 1 ? '' : 's'}
                  </>
                )}
                . This can't be undone.
              </>
            }
            confirmLabel="Delete service"
            onConfirm={() => {
              flizowStore.deleteService(svc.id);
              setDeleteServiceId(null);
              // If this was the last service and we were in edit mode, drop
              // the edit state so the empty-state CTA reads naturally.
              setServicesEditMode(false);
            }}
            onClose={() => setDeleteServiceId(null)}
          />
        );
      })()}
    </section>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────

/**
 * Mirror of ClientsPage.deriveInitials — re-derives the two-letter initials
 * used on the hero logo when a user renames the client inline. Kept local
 * rather than extracted to a util because it's only two call sites; if a
 * third shows up, move this to src/utils.
 */
function deriveInitialsLocal(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'NC';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function Hero({ client, am }: { client: Client; am: Member | null }) {
  const statusLabel = statusChipLabel(client.status);
  // Inline rename: click the name to edit, Enter/blur to commit, Esc to
  // cancel. No pencil icon — cursor:text + hover tint + ring on focus do
  // the affordance work (house rule).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(client.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync when the user switches clients without leaving
  // edit mode (unlikely but cheap to guard against).
  useEffect(() => {
    setNameDraft(client.name);
    setEditingName(false);
  }, [client.id, client.name]);

  useEffect(() => {
    if (!editingName) return;
    // Focus + select on next tick so the transition doesn't eat the focus.
    const t = window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(t);
  }, [editingName]);

  function commitName() {
    const next = nameDraft.trim();
    if (!next) {
      setNameDraft(client.name);
      setEditingName(false);
      return;
    }
    if (next !== client.name) {
      // Also refresh initials so the hero logo stays in sync with the name.
      flizowStore.updateClient(client.id, {
        name: next,
        initials: deriveInitialsLocal(next),
      });
    }
    setEditingName(false);
  }

  return (
    <div className="client-hero">
      <div className={`hero-logo ${client.logoClass}`}>
        <span className="hero-logo-initials">{client.initials}</span>
      </div>
      <div className="hero-body">
        <div className="hero-name-row">
          {editingName ? (
            <input
              ref={nameInputRef}
              className="hero-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setNameDraft(client.name);
                  setEditingName(false);
                }
              }}
              style={{
                background: 'var(--bg-elev)',
                border: '1px solid var(--hairline)',
                borderRadius: 8,
                padding: '2px 8px',
                outline: 'none',
                boxShadow: '0 0 0 3px var(--highlight-soft)',
                font: 'inherit',
                color: 'inherit',
                minWidth: 240,
              }}
              aria-label="Rename client"
            />
          ) : (
            <span
              className="hero-name"
              role="button"
              tabIndex={0}
              title="Click to rename"
              onClick={() => setEditingName(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditingName(true);
                }
              }}
              style={{
                cursor: 'text',
                borderRadius: 6,
                padding: '0 4px',
                margin: '0 -4px',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {client.name}
            </span>
          )}
          <span
            className={`status-chip ${client.status}`}
            title="Auto-computed from attention items, onboarding progress, and activity"
          >
            <span className="dot" />
            {statusLabel}
          </span>
        </div>
        <div className="hero-meta">
          <span className="hero-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <span>{client.industry}</span>
          </span>

          {am && (
            <>
              <span className="meta-dot" />
              <span className="hero-meta-item">
                <span className="hero-meta-label">Manager:</span>
                <span className="hero-am-avatar" style={{ background: am.color }}>{am.initials}</span>
                <span>{am.name}</span>
              </span>
            </>
          )}

          {client.startedAt && (
            <>
              <span className="meta-dot" />
              <span className="hero-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>Client since {formatMonthYear(client.startedAt)}</span>
              </span>
            </>
          )}

          {client.mrr > 0 && (
            <>
              <span className="meta-dot" />
              <span className="hero-billing">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                <span><strong>{formatMrr(client.mrr)}</strong>/mo</span>
                {client.renewsAt && (
                  <span className="renew">· Renews {formatMonthDay(client.renewsAt)}</span>
                )}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tabs row ──────────────────────────────────────────────────────────────

interface TabsRowProps {
  tabs: TabDef[];
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

function TabsRow({ tabs, activeTab, onChange }: TabsRowProps) {
  return (
    <div className="client-tabs-row">
      <div className="client-tabs" role="tablist" aria-label="Client sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className="client-tab"
            data-active={activeTab === tab.key ? 'true' : undefined}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Overview · Needs Attention ────────────────────────────────────────────

function AttentionSection({ client, tasks, services }: {
  client: Client;
  tasks: Task[];
  services: Service[];
}) {
  const chips = useMemo(() => buildAttentionChips(client, tasks, services), [client, tasks, services]);

  if (chips.length === 0) {
    // No urgent signals — say so directly rather than render an empty block.
    return (
      <div className="detail-section">
        <div className="detail-section-header">
          <div className="detail-section-title">Needs attention</div>
          <div className="detail-section-sub">As of this morning</div>
        </div>
        <div
          className="attention-panel"
          style={{ padding: 20, color: 'var(--text-soft)', fontSize: 14 }}
        >
          Nothing's on fire right now. You're good.
        </div>
      </div>
    );
  }

  return (
    <div className="detail-section">
      <div className="detail-section-header">
        <div className="detail-section-title">Needs attention</div>
        <div className="detail-section-sub">As of this morning</div>
      </div>
      <div className="attention-panel">
        {chips.map((chip) => (
          <a
            key={chip.key}
            href={chip.href}
            className={`attention-chip${chip.tint ? ` ${chip.tint}` : ''}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigate(chip.href);
            }}
          >
            <span className="attention-chip-icon">{chip.icon}</span>
            <span className="attention-chip-body">
              <span className="attention-chip-value">{chip.value}</span>
              <span className="attention-chip-label">{chip.label}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

interface AttentionChip {
  key: string;
  value: string;
  label: string;
  tint?: 'fire' | 'warn';
  href: string;
  icon: React.ReactNode;
}

/** Build the attention strip from the live task state. Keeping this as a
 *  pure function makes the "no signal, nothing to show" path trivially
 *  testable and keeps render code free of branching. */
function buildAttentionChips(
  client: Client,
  openTasks: Task[],
  services: Service[],
): AttentionChip[] {
  const out: AttentionChip[] = [];

  // 1. Overdue cards — the loudest thing a row can carry.
  const overdue = openTasks.filter(t => t.severity === 'critical' || t.columnId === 'blocked');
  if (overdue.length > 0) {
    // Point at the first offending service so clicking takes you somewhere
    // useful rather than to a generic list.
    const firstServiceId = overdue[0].serviceId;
    const serviceName = services.find(s => s.id === firstServiceId)?.name ?? 'Work';
    out.push({
      key: 'overdue',
      value: `${overdue.length} card${overdue.length === 1 ? '' : 's'} past due`,
      label: `${serviceName} · tap to open`,
      tint: 'fire',
      href: `#board/${firstServiceId}`,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ),
    });
  }

  // 2. Warning-severity tasks (at-risk drafts, blocked-ish work).
  const atRisk = openTasks.filter(t => t.severity === 'warning');
  if (atRisk.length > 0) {
    const firstServiceId = atRisk[0].serviceId;
    const serviceName = services.find(s => s.id === firstServiceId)?.name ?? 'Work';
    out.push({
      key: 'risk',
      value: `${atRisk.length} at risk`,
      label: `${serviceName} · review soon`,
      tint: 'warn',
      href: `#board/${firstServiceId}`,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    });
  }

  // 3. Renewal within 30 days — a gentle heads-up, never urgent.
  if (client.renewsAt) {
    const days = daysBetween(new Date().toISOString().slice(0, 10), client.renewsAt);
    if (days >= 0 && days <= 30) {
      out.push({
        key: 'renewal',
        value: days === 0 ? 'Renews today' : `Renews in ${days}d`,
        label: `${formatMonthDay(client.renewsAt)} · finance pings this automatically`,
        href: `#clients/${client.id}`,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      });
    }
  }

  return out;
}

// ── Overview · Active Services ────────────────────────────────────────────

function ServicesSection({ services, onAdd, editing, onToggleEdit, onDelete }: {
  services: Service[];
  onAdd: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  onDelete: (id: string) => void;
}) {
  if (services.length === 0) {
    // Empty state: the "Add a service" hint becomes the CTA itself. A button
    // right inside the empty panel beats a button far away in the header —
    // the user's eye is already there. No Edit button here: there's nothing
    // to edit, and the button would just add noise.
    return (
      <div className="detail-section">
        <div className="detail-section-header">
          <div className="detail-section-title">Active Services</div>
          <button
            type="button"
            className="detail-section-link"
            onClick={onAdd}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            + Add service
          </button>
        </div>
        <div
          className="services-list"
          style={{ padding: 20, color: 'var(--text-soft)', fontSize: 14 }}
        >
          Nothing is running for this client yet.{' '}
          <button
            type="button"
            onClick={onAdd}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--highlight)',
              fontSize: 'inherit',
              cursor: 'pointer',
              textDecoration: 'underline',
              font: 'inherit',
            }}
          >
            Add a service
          </button>{' '}
          to spin up a board.
        </div>
      </div>
    );
  }

  const projects = services.filter(s => s.type === 'project').length;
  const retainers = services.filter(s => s.type === 'retainer').length;

  return (
    <div className="detail-section">
      <div className="detail-section-header">
        <div className="detail-section-title">Active Services</div>
        <div className="detail-section-sub">
          {services.length} of {services.length} · {projects} project{projects === 1 ? '' : 's'}, {retainers} retainer{retainers === 1 ? '' : 's'}
        </div>
        {/* Wrapper div so `.detail-section-header > *:last-child { margin-left: auto }`
            pushes both buttons to the right as a group — same trick as the
            Team section. */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            className="detail-section-link"
            onClick={onToggleEdit}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            type="button"
            className="detail-section-link"
            onClick={onAdd}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            + Add service
          </button>
        </div>
      </div>
      <div className="services-list" data-services-list data-edit={editing ? 'true' : 'false'}>
        {services.map(s => (
          <ServiceCard
            key={s.id}
            service={s}
            editing={editing}
            onRemove={editing ? () => onDelete(s.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({ service, editing, onRemove }: {
  service: Service;
  editing?: boolean;
  onRemove?: () => void;
}) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // In edit mode the card is a management surface, not a link — clicks
    // that hit the body are swallowed so users don't accidentally open a
    // board they're about to delete. The × button handles its own stop
    // propagation so it still works.
    if (editing) {
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    navigate(`#board/${service.id}`);
  };
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`#board/${service.id}`);
    }
  };

  return (
    <div
      className="service-card"
      role={editing ? undefined : 'link'}
      tabIndex={editing ? -1 : 0}
      aria-label={editing ? undefined : `Open board for ${service.name}`}
      onClick={handleClick}
      onKeyDown={handleKey}
    >
      {editing && onRemove && (
        <button
          type="button"
          className="service-remove-btn"
          aria-label={`Delete ${service.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      <div className="service-icon logo-indigo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </div>
      <div className="service-card-body">
        <div className="service-name-row">
          <div className="service-name">{service.name}</div>
          <span className={`service-type ${service.type}`}>
            {service.type === 'project' ? 'Project' : 'Retainer'}
          </span>
        </div>
        <div className="service-sub">
          Template: {humanTemplate(service.templateKey)}
          {service.nextDeliverableAt && (
            <>
              <span className="sep">·</span>
              {service.type === 'project'
                ? `Due ${formatMonthDay(service.nextDeliverableAt)}`
                : `Next ${formatMonthDay(service.nextDeliverableAt)}`}
            </>
          )}
        </div>
      </div>
      <div className="service-progress">
        <div className="service-progress-label">
          <span>{service.type === 'project' ? 'Progress' : 'This month'}</span>
          <strong>{service.progress}%</strong>
        </div>
        <div className="service-progress-bar">
          <div className="service-progress-fill" style={{ width: `${service.progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function humanTemplate(key: string): string {
  // Template keys come from a closed union in types/flizow; this is the
  // display-side reverse — it's a lookup, not a fallback, so adding a new
  // key shows up as a literal here until someone labels it.
  const MAP: Record<string, string> = {
    demandgen:   'Demand Gen',
    contentSEO:  'Content + SEO',
    launch:      'Product Launch',
    cro:         'CRO Sprint',
    paidSocial:  'Paid Social',
    email:       'Email Lifecycle',
    seasonal:    'Seasonal Campaign',
    localSEO:    'Local SEO',
    paidLead:    'Paid Lead Gen',
    reputation:  'Reputation',
    social:      'Social Retainer',
    photo:       'Photo / Video',
    linkedin:    'LinkedIn Growth',
    website:     'Website Build',
    'web-design-full-stack': 'Web Design — Full Stack',
    'brand-refresh':         'Brand Refresh',
  };
  return MAP[key] ?? key;
}

// ── Overview · Recent Activity ────────────────────────────────────────────

function ActivitySection({ client, tasks, members, todayISO }: {
  client: Client;
  tasks: Task[];
  members: Member[];
  todayISO: string;
}) {
  // We don't have a real activity log yet — synthesize a light feed from
  // the latest task events for this client so the section doesn't stay
  // empty. This gets ripped out the moment activity logging lands.
  const items = useMemo(
    () => synthesizeActivity(client, tasks, members, todayISO),
    [client, tasks, members, todayISO],
  );

  if (items.length === 0) {
    return (
      <div className="detail-section">
        <div className="detail-section-header">
          <div className="detail-section-title">Recent Activity</div>
        </div>
        <div style={{ padding: 20, color: 'var(--text-soft)', fontSize: 14 }}>
          Nothing logged yet. As the team works, this feed will fill in.
        </div>
      </div>
    );
  }

  return (
    <div className="detail-section">
      <div className="detail-section-header">
        <div className="detail-section-title">Recent Activity</div>
      </div>
      <div className="activity-list">
        {items.map((item) => (
          <div className="activity-item" key={item.key}>
            <span
              className="activity-dot"
              style={item.dotColor ? { background: item.dotColor } : undefined}
            />
            <div className="activity-text">
              <strong>{item.actor}</strong>{' '}
              <span className="subject">{item.subject}</span>
            </div>
            <span className="activity-time">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ActivityItem {
  key: string;
  actor: string;
  subject: string;
  time: string;
  dotColor?: string;
}

function synthesizeActivity(
  client: Client,
  tasks: Task[],
  members: Member[],
  todayISO: string,
): ActivityItem[] {
  const recent = tasks
    .filter(t => t.clientId === client.id)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  return recent.map((task, i) => {
    const assignee = task.assigneeId
      ? members.find(m => m.id === task.assigneeId)
      : null;
    const actor = assignee?.name.split(' ')[0] ?? 'Someone';
    const subject = verbFor(task) + ' "' + task.title + '"';
    return {
      key: `${task.id}-${i}`,
      actor,
      subject,
      time: quickTime(task.createdAt, todayISO),
      dotColor: dotFor(task),
    };
  });
}

function verbFor(task: Task): string {
  if (task.columnId === 'blocked') return 'flagged a blocker on';
  if (task.columnId === 'review')  return 'moved to review';
  if (task.columnId === 'done')    return 'marked complete';
  if (task.columnId === 'inprogress') return 'started';
  return 'opened';
}

function dotFor(task: Task): string | undefined {
  if (task.severity === 'critical' || task.columnId === 'blocked') return 'var(--status-fire)';
  if (task.severity === 'warning') return 'var(--status-risk)';
  if (task.columnId === 'done')    return 'var(--status-track)';
  return undefined;
}

function quickTime(createdAt: string, todayISO: string): string {
  const days = daysBetween(createdAt, todayISO);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatMonthDay(createdAt);
}

// ── Onboarding tab ────────────────────────────────────────────────────────

/**
 * Setup checklist grouped by service. Each service is its own collapsible
 * card; completed services collapse by default so incomplete work is what
 * the user sees first. Checkboxes flip optimistically through the store
 * (local + Firestore debounce handles durability).
 *
 * Design notes, Apple-style:
 * - Clarity over ornament: one checkbox, one label, no icons on items.
 * - Hierarchy through count/progress — the eye lands on "3 of 7" first.
 * - Forgiveness: toggling is a flip, so an accidental tick is one more
 *   click to fix.
 * - Keyboard: head is a <button>, each check is a <button aria-pressed>.
 */
function OnboardingSection({ services, items, onToggle }: {
  services: Service[];
  items: OnboardingItem[];
  onToggle: (id: string) => void;
}) {
  const groups = useMemo(() => groupByService(services, items), [services, items]);

  // Header math: how many services still have open items, total items.
  const totalItems = items.length;
  const doneItems  = items.filter(i => i.done).length;
  const openServices = groups.filter(g => g.doneCount < g.total).length;

  if (services.length === 0) {
    return (
      <div className="detail-section">
        <div className="detail-section-header">
          <div className="detail-section-title">Setup & Onboarding</div>
          <div className="detail-section-sub">No services to set up yet</div>
        </div>
        <div
          className="onboarding-service-stack"
          style={{ padding: 20, color: 'var(--text-soft)', fontSize: 14 }}
        >
          Spin up a service to see its onboarding checklist here.
        </div>
      </div>
    );
  }

  if (totalItems === 0) {
    // Services exist but none carry a template checklist. Rare, but keep
    // the tab from rendering an empty stack.
    return (
      <div className="detail-section">
        <div className="detail-section-header">
          <div className="detail-section-title">Setup & Onboarding</div>
          <div className="detail-section-sub">No checklists for these services</div>
        </div>
        <div
          className="onboarding-service-stack"
          style={{ padding: 20, color: 'var(--text-soft)', fontSize: 14 }}
        >
          Setup checklists attach to services through templates. Swap in a
          template to see yours here.
        </div>
      </div>
    );
  }

  return (
    <div className="detail-section">
      <div className="detail-section-header">
        <div className="detail-section-title">Setup & Onboarding</div>
        <div className="detail-section-sub">
          {openServices === 0
            ? `All set · ${doneItems} of ${totalItems} items complete`
            : `${openServices} of ${services.length} service${services.length === 1 ? '' : 's'} in progress · ${doneItems} of ${totalItems} items complete`
          }
        </div>
      </div>
      <div className="onboarding-service-stack">
        {groups.map(g => (
          <OnboardingServiceCard key={g.service.id} group={g} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

interface OnboardingGroup {
  service: Service;
  client: OnboardingItem[];
  us: OnboardingItem[];
  doneCount: number;
  total: number;
}

function groupByService(services: Service[], items: OnboardingItem[]): OnboardingGroup[] {
  return services.map(service => {
    const svcItems = items.filter(i => i.serviceId === service.id);
    const client = svcItems.filter(i => i.group === 'client');
    const us     = svcItems.filter(i => i.group === 'us');
    const doneCount = svcItems.filter(i => i.done).length;
    return { service, client, us, doneCount, total: svcItems.length };
  });
}

function OnboardingServiceCard({ group, onToggle }: {
  group: OnboardingGroup;
  onToggle: (id: string) => void;
}) {
  const { service, client, us, doneCount, total } = group;
  const complete = total > 0 && doneCount === total;
  // Completed services collapse by default — the tab points the user at
  // unfinished setup first, not green checkmarks.
  const [collapsed, setCollapsed] = useState<boolean>(complete);
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const classes = [
    'onboarding-service-card',
    complete ? 'complete' : '',
    collapsed ? 'collapsed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <button
        type="button"
        className="onboarding-service-head"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        aria-controls={`onb-body-${service.id}`}
      >
        <span className="onb-svc-icon" aria-hidden="true">
          {complete ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M8 3v4M16 3v4M3 11h18" />
            </svg>
          )}
        </span>
        <span className="onb-svc-body">
          <span className="onb-svc-name">{service.name}</span>
          <span className="onb-svc-sub">
            {humanTemplate(service.templateKey)}
            {complete ? ' · setup complete' : ` · ${total - doneCount} item${total - doneCount === 1 ? '' : 's'} left`}
          </span>
        </span>
        <span className="onb-svc-progress">
          <span className="onb-svc-count">{doneCount}/{total}</span>
          <span className="onb-svc-bar">
            <span className="onb-svc-fill" style={{ width: `${percent}%` }} />
          </span>
        </span>
        <span className="onb-svc-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      <div id={`onb-body-${service.id}`} className="onboarding-service-body">
        <div className="onboarding-checklist">
          {client.length > 0 && (
            <>
              <div className="onboarding-group-label">Needed from client</div>
              {client.map(item => (
                <OnboardingRow key={item.id} item={item} onToggle={onToggle} />
              ))}
            </>
          )}
          {us.length > 0 && (
            <>
              <div className="onboarding-group-label">We take care of</div>
              {us.map(item => (
                <OnboardingRow key={item.id} item={item} onToggle={onToggle} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingRow({ item, onToggle }: {
  item: OnboardingItem;
  onToggle: (id: string) => void;
}) {
  return (
    <label
      className={`onboarding-item${item.done ? ' done' : ''}`}
      // The whole row is clickable for the same reason toggles on iOS let
      // you tap anywhere on the row: bigger target, fewer missed taps.
    >
      <button
        type="button"
        className="onboarding-check"
        role="checkbox"
        aria-checked={item.done}
        aria-label={`${item.done ? 'Mark as not done' : 'Mark as done'}: ${item.label}`}
        onClick={(e) => { e.preventDefault(); onToggle(item.id); }}
      >
        {item.done && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <span>{item.label}</span>
    </label>
  );
}

// ── About tab ─────────────────────────────────────────────────────────────

/**
 * Relationship + Team. View-only for now — the mockup exposes Manage/Edit
 * affordances that flip the surrounding cards into editable form, but the
 * inline-edit interaction pattern lands in the next pass once we have a
 * reusable <InlineField /> primitive to share with Notes and Touchpoints.
 * Keeping the read side clean and accessible today so the tab is useful
 * immediately rather than hidden behind a WIP flag.
 */
function AboutSection({ client, data }: { client: Client; data: FlizowData }) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddQuickLink, setShowAddQuickLink] = useState(false);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [teamEditMode, setTeamEditMode] = useState(false);

  const contacts = useMemo(
    () => data.contacts.filter(c => c.clientId === client.id)
      // Primary first, then original order. Small, consistent ordering
      // beats a per-session sort on name — the user learns where each
      // contact sits on the page.
      .sort((a, b) => Number(!!b.primary) - Number(!!a.primary)),
    [data.contacts, client.id],
  );
  const quickLinks = useMemo(
    () => data.quickLinks.filter(q => q.clientId === client.id),
    [data.quickLinks, client.id],
  );
  const am = client.amId ? data.members.find(m => m.id === client.amId) ?? null : null;
  const team = useMemo(
    () => client.teamIds
      .map(id => data.members.find(m => m.id === id))
      .filter((m): m is Member => !!m),
    [client.teamIds, data.members],
  );

  return (
    <>
      <div className="detail-section" data-tab="about">
        <div className="detail-section-header">
          <div className="detail-section-title">Relationship</div>
          <div className="detail-section-sub">Who we talk to, and where to find their stuff</div>
        </div>
        <div className="relationship-grid">
          <ContactsCard contacts={contacts} onAdd={() => setShowAddContact(true)} />
          <QuickLinksCard links={quickLinks} onAdd={() => setShowAddQuickLink(true)} />
        </div>
      </div>

      <div
        className="detail-section"
        data-tab="about"
        data-team-section
        data-edit={teamEditMode ? 'true' : undefined}
      >
        <div className="detail-section-header">
          <div className="detail-section-title">Team</div>
          <div className="detail-section-sub">
            {am ? '1 account manager' : 'No account manager'}
            {team.length > 0 && ` · ${team.length} operator${team.length === 1 ? '' : 's'}`}
          </div>
          {/* Wrap the two right-side buttons so the CSS rule
              `.detail-section-header > *:last-child { margin-left: auto }`
              pushes both of them to the right as a pair. */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {team.length > 0 && (
              <button
                type="button"
                className="detail-section-link"
                onClick={() => setTeamEditMode(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
              >
                {teamEditMode ? 'Done' : 'Edit'}
              </button>
            )}
            <button
              type="button"
              className="detail-section-link"
              onClick={() => setShowAddOperator(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
            >
              + Add operator
            </button>
          </div>
        </div>
        <TeamGrid
          am={am}
          team={team}
          onAdd={() => setShowAddOperator(true)}
          onRemove={(memberId) => flizowStore.removeTeamMember(client.id, memberId)}
        />
      </div>

      {showAddContact && (
        <AddContactModal
          clientId={client.id}
          hasPrimary={contacts.some(c => c.primary)}
          onClose={() => setShowAddContact(false)}
        />
      )}

      {showAddQuickLink && (
        <AddQuickLinkModal
          clientId={client.id}
          onClose={() => setShowAddQuickLink(false)}
        />
      )}

      {showAddOperator && (
        <AddOperatorModal
          clientId={client.id}
          allMembers={data.members}
          currentTeamIds={client.teamIds}
          onClose={() => setShowAddOperator(false)}
        />
      )}
    </>
  );
}

function ContactsCard({ contacts, onAdd }: { contacts: Contact[]; onAdd: () => void }) {
  return (
    <div className="relationship-card">
      <div className="relationship-card-head">
        <div className="relationship-card-label">Client contacts</div>
        <button
          type="button"
          className="relationship-card-link"
          onClick={onAdd}
          style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
        >
          + Add contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <div style={{ padding: '12px 0', color: 'var(--text-soft)', fontSize: 14 }}>
          No contacts yet.{' '}
          <button
            type="button"
            onClick={onAdd}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--highlight)', fontSize: 'inherit', font: 'inherit',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Add the first person
          </button>{' '}
          we work with here.
        </div>
      ) : (
        <div className="contacts-list">
          {contacts.map(c => (
            <div
              key={c.id}
              className="contact-row"
              data-contact-primary={c.primary ? 'true' : undefined}
            >
              <div className="contact-avatar" style={{ background: avatarColor(c.id) }}>
                {initialsOf(c.name)}
              </div>
              <div className="contact-body">
                <div className="contact-name">
                  {c.name}
                  {c.primary && (
                    <span
                      className="contact-primary-badge"
                      title="Primary contact — gets CC'd on Weekly WIP pings"
                      aria-label="Primary contact"
                      style={{
                        marginLeft: 8, color: '#ffb800',
                        display: 'inline-flex', verticalAlign: 'middle',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
                      </svg>
                    </span>
                  )}
                </div>
                {c.role && <div className="contact-role">{c.role}</div>}
              </div>
              <div className="contact-actions">
                {c.email && (
                  <a
                    className="contact-icon-btn"
                    href={`mailto:${c.email}`}
                    title={c.email}
                    aria-label={`Email ${c.name} at ${c.email}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M3 7l9 7 9-7" />
                    </svg>
                  </a>
                )}
                {c.phone && (
                  <a
                    className="contact-icon-btn"
                    href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
                    title={c.phone}
                    aria-label={`Call ${c.name} at ${c.phone}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 16.92V21a1 1 0 0 1-1.1 1 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 3.2 4.1 1 1 0 0 1 4.2 3h4.08a1 1 0 0 1 1 .75 12.78 12.78 0 0 0 .7 2.81 1 1 0 0 1-.23 1.05L8.21 9.21a16 16 0 0 0 6 6l1.6-1.6a1 1 0 0 1 1-.23 12.78 12.78 0 0 0 2.82.7 1 1 0 0 1 .75 1z" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickLinksCard({ links, onAdd }: { links: QuickLink[]; onAdd: () => void }) {
  return (
    <div className="relationship-card">
      <div className="relationship-card-head">
        <div className="relationship-card-label">Quick links</div>
        <button
          type="button"
          className="relationship-card-link"
          onClick={onAdd}
          style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
        >
          + Add link
        </button>
      </div>

      {links.length === 0 ? (
        <div style={{ padding: '12px 0', color: 'var(--text-soft)', fontSize: 14 }}>
          No saved links yet.{' '}
          <button
            type="button"
            onClick={onAdd}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--highlight)', fontSize: 'inherit', font: 'inherit',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Pin the client's website, Drive, or design system
          </button>.
        </div>
      ) : (
        <div className="quick-links-list">
          {links.map(l => (
            <a
              key={l.id}
              className="quick-link"
              href={l.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="quick-link-icon" aria-hidden="true">
                {renderLinkIcon(l.icon)}
              </span>
              <span>
                <span className="quick-link-label">{l.label}</span>
                <span className="quick-link-host">{hostOf(l.url)}</span>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="14" height="14" style={{ color: 'var(--text-faint)' }}>
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamGrid({ am, team, onAdd, onRemove }: {
  am: Member | null;
  team: Member[];
  onAdd: () => void;
  onRemove: (memberId: string) => void;
}) {
  return (
    <div className="team-section-grid">
      <div className="team-group">
        <div className="team-group-label">Account manager</div>
        <div className="team-group-row">
          {am ? (
            <MemberCard member={am} solid />
          ) : (
            <span style={{ color: 'var(--text-soft)', fontSize: 14 }}>
              None assigned yet.
            </span>
          )}
        </div>
      </div>

      <div className="team-group-divider" />

      <div className="team-group">
        <div className="team-group-label">Project team</div>
        <div className="team-group-row">
          {team.length === 0 ? (
            <span style={{ color: 'var(--text-soft)', fontSize: 14 }}>
              No operators attached yet.{' '}
              <button
                type="button"
                onClick={onAdd}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--highlight)', fontSize: 'inherit', font: 'inherit',
                  cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                Add the first one
              </button>.
            </span>
          ) : (
            team.map(m => (
              <MemberCard key={m.id} member={m} onRemove={() => onRemove(m.id)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MemberCard({ member, solid = false, onRemove }: {
  member: Member;
  solid?: boolean;
  onRemove?: () => void;
}) {
  // AMs use a solid avatar fill; operators use a soft background with
  // coloured text. Mirrors the mockup's visual split between the two roles
  // so you can tell roles apart at a glance.
  const style = solid
    ? { background: member.color, color: '#fff' }
    : { background: member.bg ?? 'var(--bg-soft)', color: member.color };
  return (
    <div className="team-member-card" data-team-member>
      <span className="team-member-avatar" style={style}>{member.initials}</span>
      <div className="team-member-body">
        <div className="team-member-name">{member.name}</div>
        {member.role && <div className="team-member-role">{member.role}</div>}
      </div>
      {onRemove && (
        <button
          type="button"
          className="team-remove-btn"
          onClick={onRemove}
          aria-label={`Remove ${member.name} from team`}
          title={`Remove ${member.name}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── About helpers ─────────────────────────────────────────────────────────

/** Deterministic pastel avatar tint from a stable id. Keeps each contact's
 *  swatch the same across re-renders without us having to store a colour. */
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 55% 55%)`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ''); }
  catch { return url; }
}

function renderLinkIcon(kind?: QuickLink['icon']): React.ReactNode {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (kind) {
    case 'globe':
      return (
        <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
      );
    case 'drive':
      return (
        <svg {...props}><path d="M8 3l8 14M3 17l4-14M21 17l-4-14M3 17h18" /></svg>
      );
    case 'doc':
      return (
        <svg {...props}><path d="M6 3h9l5 5v13a0 0 0 0 1 0 0H6z" /><path d="M14 3v6h6M8 13h8M8 17h8" /></svg>
      );
    case 'figma':
      return (
        <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M15 9h-6a3 3 0 1 1 0-6h6zM15 3h-3v6M9 21a3 3 0 1 1 0-6h3v3a3 3 0 0 1-3 3zM15 9h-3v6" /></svg>
      );
    case 'folder':
      return (
        <svg {...props}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
      );
    case 'link':
    default:
      return (
        <svg {...props}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
      );
  }
}

// ── Misc ──────────────────────────────────────────────────────────────────

function statusChipLabel(status: ClientStatus): string {
  switch (status) {
    case 'fire':    return 'On Fire';
    case 'risk':    return 'At Risk';
    case 'onboard': return 'Onboarding';
    case 'paused':  return 'Paused';
    case 'track':
    default:        return 'On Track';
  }
}

// ── Add Service Modal ─────────────────────────────────────────────────────

/**
 * Template options rendered in the dropdown. The order matches the mockup's
 * Board Settings picker so an operator who's seen both places isn't hunting.
 * Project-specific templates live in a separate group because they wouldn't
 * make sense on a retainer (a "Brand Refresh retainer" is a contradiction).
 */
const TEMPLATE_OPTIONS: Array<{
  value: TemplateKey;
  label: string;
  allowed: ServiceType[];
}> = [
  { value: 'demandgen',             label: 'Demand Gen',           allowed: ['retainer', 'project'] },
  { value: 'contentSEO',            label: 'Content + SEO',        allowed: ['retainer', 'project'] },
  { value: 'launch',                label: 'Product Launch',       allowed: ['project'] },
  { value: 'cro',                   label: 'CRO Sprint',           allowed: ['project'] },
  { value: 'paidSocial',            label: 'Paid Social',          allowed: ['retainer', 'project'] },
  { value: 'email',                 label: 'Email Lifecycle',      allowed: ['retainer', 'project'] },
  { value: 'seasonal',              label: 'Seasonal Campaign',    allowed: ['project'] },
  { value: 'localSEO',              label: 'Local SEO',            allowed: ['retainer'] },
  { value: 'paidLead',              label: 'Paid Lead Gen',        allowed: ['retainer', 'project'] },
  { value: 'reputation',            label: 'Reputation',           allowed: ['retainer'] },
  { value: 'social',                label: 'Social Retainer',      allowed: ['retainer'] },
  { value: 'photo',                 label: 'Photo / Video',        allowed: ['retainer', 'project'] },
  { value: 'linkedin',              label: 'LinkedIn Growth',      allowed: ['retainer'] },
  { value: 'website',               label: 'Website Build',        allowed: ['project'] },
  { value: 'web-design-full-stack', label: 'Web Design — Full Stack', allowed: ['project'] },
  { value: 'brand-refresh',         label: 'Brand Refresh',        allowed: ['project'] },
];

function defaultNextDeliverableAt(): string {
  // Default to two weeks out — far enough that nothing's urgent on day one,
  // close enough that the user will correct it rather than leave the
  // default in place for a year.
  return new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
}

function AddServiceModal({ clientId, onClose }: {
  clientId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ServiceType>('retainer');
  const [templateKey, setTemplateKey] = useState<TemplateKey>('demandgen');
  const [nextDeliverableAt, setNextDeliverableAt] = useState<string>(defaultNextDeliverableAt);
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Keep the template valid for the selected type. If the user picks
  // "project" while a retainer-only template is selected, snap to the first
  // template that still fits rather than letting them save a mismatch.
  const visibleTemplates = useMemo(
    () => TEMPLATE_OPTIONS.filter(t => t.allowed.includes(type)),
    [type],
  );

  useEffect(() => {
    if (!visibleTemplates.some(t => t.value === templateKey) && visibleTemplates.length) {
      setTemplateKey(visibleTemplates[0].value);
    }
  }, [visibleTemplates, templateKey]);

  useEffect(() => {
    const t = window.setTimeout(() => nameRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      nameRef.current?.focus();
      window.setTimeout(() => setNameError(false), 1400);
      return;
    }

    const id = `svc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const service: Service = {
      id,
      clientId,
      name: trimmedName,
      type,
      templateKey,
      progress: 0,
      nextDeliverableAt,
      taskIds: [],
    };
    flizowStore.addService(service);
    onClose();
    // Land on the new board so the user can immediately add their first card.
    navigate(`#board/${id}`);
  }

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
  }, [onClose, name, type, templateKey, nextDeliverableAt]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-service-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 520 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="add-service-title">Add service</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body">
          <label className="wip-field">
            <span className="wip-field-label">Service name</span>
            <input
              ref={nameRef}
              type="text"
              className="wip-field-input"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
              placeholder="e.g. Q2 Paid Social Retainer"
              style={nameError ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={nameError || undefined}
            />
          </label>

          <div className="wip-field" role="radiogroup" aria-label="Service type">
            <span className="wip-field-label">Type</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['retainer', 'project'] as ServiceType[]).map(opt => {
                const checked = type === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setType(opt)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: checked
                        ? '2px solid var(--highlight)'
                        : '1px solid var(--hairline-soft)',
                      background: checked ? 'var(--highlight-soft)' : 'var(--bg-elev)',
                      color: 'var(--text)',
                      font: 'inherit',
                      fontWeight: checked ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ textTransform: 'capitalize' }}>{opt}</div>
                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-soft)', marginTop: 2 }}>
                      {opt === 'retainer'
                        ? 'Ongoing monthly scope'
                        : 'Fixed deliverable, ships once'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="wip-field">
            <span className="wip-field-label">Template</span>
            <select
              className="wip-field-input"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value as TemplateKey)}
            >
              {visibleTemplates.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', marginTop: 4, display: 'block' }}>
              Seeds the board with starter columns and a few example cards.
            </span>
          </label>

          <label className="wip-field">
            <span className="wip-field-label">
              {type === 'project' ? 'Due date' : 'Next deliverable'}
            </span>
            <input
              type="date"
              className="wip-field-input"
              value={nextDeliverableAt}
              onChange={(e) => setNextDeliverableAt(e.target.value)}
            />
          </label>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="wip-btn wip-btn-primary" onClick={handleSave}>
            Create service
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Add Contact Modal ─────────────────────────────────────────────────────

function AddContactModal({ clientId, hasPrimary, onClose }: {
  clientId: string;
  hasPrimary: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // New primary demotes the old one (handled in the store). Default is
  // "set as primary" only if the client has no primary yet — the common
  // case is the first contact you add is the main one, and we shouldn't
  // make the user think about it.
  const [primary, setPrimary] = useState<boolean>(!hasPrimary);
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => nameRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      nameRef.current?.focus();
      window.setTimeout(() => setNameError(false), 1400);
      return;
    }
    const id = `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const contact: Contact = {
      id,
      clientId,
      name: trimmedName,
      role: role.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      primary: primary || undefined,
    };
    flizowStore.addContact(contact);
    onClose();
  }

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
  }, [onClose, name, role, email, phone, primary]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-contact-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 480 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="add-contact-title">Add contact</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body">
          <label className="wip-field">
            <span className="wip-field-label">Name</span>
            <input
              ref={nameRef}
              type="text"
              className="wip-field-input"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
              placeholder="e.g. Jamie Chen"
              style={nameError ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={nameError || undefined}
            />
          </label>

          <label className="wip-field">
            <span className="wip-field-label">Role</span>
            <input
              type="text"
              className="wip-field-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. VP Marketing"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="wip-field">
              <span className="wip-field-label">Email</span>
              <input
                type="email"
                className="wip-field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jamie@acme.com"
              />
            </label>
            <label className="wip-field">
              <span className="wip-field-label">Phone</span>
              <input
                type="tel"
                className="wip-field-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 1234"
              />
            </label>
          </div>

          <label
            className="wip-field"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={primary}
              onChange={(e) => setPrimary(e.target.checked)}
              style={{ margin: 0, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 'var(--fs-md)', color: 'var(--text)' }}>
              Set as primary contact
            </span>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
              {hasPrimary
                ? '— this will replace the current primary'
                : '— gets CC\u2019d on Weekly WIP pings'}
            </span>
          </label>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="wip-btn wip-btn-primary" onClick={handleSave}>
            Add contact
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Add Quick Link Modal ──────────────────────────────────────────────────

const LINK_ICON_OPTIONS: Array<{ value: NonNullable<QuickLink['icon']>; label: string }> = [
  { value: 'link',   label: 'Link (generic)' },
  { value: 'globe',  label: 'Website' },
  { value: 'drive',  label: 'Drive / cloud' },
  { value: 'doc',    label: 'Document' },
  { value: 'figma',  label: 'Figma' },
  { value: 'folder', label: 'Folder' },
];

function AddQuickLinkModal({ clientId, onClose }: {
  clientId: string;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState<NonNullable<QuickLink['icon']>>('link');
  const [labelError, setLabelError] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => labelRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  function handleSave() {
    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();
    let bad = false;
    if (!trimmedLabel) { setLabelError(true); bad = true; }
    if (!trimmedUrl)   { setUrlError(true);   bad = true; }
    if (bad) {
      window.setTimeout(() => { setLabelError(false); setUrlError(false); }, 1400);
      if (!trimmedLabel) labelRef.current?.focus();
      return;
    }

    // Normalize: if the user typed "acme.com", prepend https:// so the
    // anchor tag opens a real URL instead of a local path.
    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`;

    const id = `ql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const link: QuickLink = {
      id,
      clientId,
      label: trimmedLabel,
      url: normalizedUrl,
      icon,
    };
    flizowStore.addQuickLink(link);
    onClose();
  }

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
  }, [onClose, label, url, icon]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-link-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 460 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="add-link-title">Add quick link</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body">
          <label className="wip-field">
            <span className="wip-field-label">Label</span>
            <input
              ref={labelRef}
              type="text"
              className="wip-field-input"
              value={label}
              onChange={(e) => { setLabel(e.target.value); if (labelError) setLabelError(false); }}
              placeholder="e.g. Brand docs"
              style={labelError ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={labelError || undefined}
            />
          </label>

          <label className="wip-field">
            <span className="wip-field-label">URL</span>
            <input
              type="url"
              className="wip-field-input"
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (urlError) setUrlError(false); }}
              placeholder="https://drive.google.com/..."
              style={urlError ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={urlError || undefined}
            />
          </label>

          <label className="wip-field">
            <span className="wip-field-label">Icon</span>
            <select
              className="wip-field-input"
              value={icon}
              onChange={(e) => setIcon(e.target.value as NonNullable<QuickLink['icon']>)}
            >
              {LINK_ICON_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="wip-btn wip-btn-primary" onClick={handleSave}>
            Add link
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Add Operator Modal ────────────────────────────────────────────────────

function AddOperatorModal({ clientId, allMembers, currentTeamIds, onClose }: {
  clientId: string;
  allMembers: Member[];
  currentTeamIds: string[];
  onClose: () => void;
}) {
  // Only operators can join the project team — AMs go through `amId` on
  // the client itself. Hide anyone already on the team so the list only
  // shows people the user can actually act on.
  const available = useMemo(
    () => allMembers.filter(m =>
      m.type === 'operator' && !currentTeamIds.includes(m.id),
    ),
    [allMembers, currentTeamIds],
  );

  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    if (picked.size === 0) {
      onClose();
      return;
    }
    // Loop through addTeamMember so the store's dedupe + array-replace
    // logic runs per id. The store is cheap and the list is small.
    picked.forEach(id => flizowStore.addTeamMember(clientId, id));
    onClose();
  }

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
  }, [onClose, picked]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-operator-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 460 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="add-operator-title">Add operators</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body">
          {available.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--text-soft)', fontSize: 14 }}>
              Every operator is already on this team. Add a new team member in
              Settings, then come back.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 360, overflowY: 'auto' }}>
              {available.map(m => {
                const checked = picked.has(m.id);
                return (
                  <label
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: checked
                        ? '2px solid var(--highlight)'
                        : '1px solid var(--hairline-soft)',
                      background: checked ? 'var(--highlight-soft)' : 'var(--bg-elev)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(m.id)}
                      style={{ margin: 0, cursor: 'pointer' }}
                    />
                    <span
                      className="team-member-avatar"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 600,
                        background: m.bg ?? 'var(--bg-soft)',
                        color: m.color,
                        flexShrink: 0,
                      }}
                    >
                      {m.initials}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--fs-md)', color: 'var(--text)', fontWeight: 500 }}>
                        {m.name}
                      </span>
                      {m.role && (
                        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-soft)' }}>
                          {m.role}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="wip-btn wip-btn-primary"
            onClick={handleSave}
            disabled={picked.size === 0 || available.length === 0}
            style={(picked.size === 0 || available.length === 0)
              ? { opacity: 0.5, cursor: 'not-allowed' }
              : undefined}
          >
            {picked.size > 1 ? `Add ${picked.size} operators` : 'Add operator'}
          </button>
        </footer>
      </div>
    </div>
  );
}

