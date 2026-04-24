import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute, navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import type {
  Client, Service, Task, Member, FlizowData, ClientStatus, ColumnId,
  OnboardingItem, Contact, QuickLink,
} from '../types/flizow';
import { flizowStore, type FlizowStore } from '../store/flizowStore';
import { formatMonthYear, formatMonthDay, formatMrr, daysBetween } from '../utils/dateFormat';
import { NotesTab } from '../components/NotesTab';
import { TouchpointsTab } from '../components/TouchpointsTab';
import { StatsTab } from '../components/StatsTab';
import { ConfirmDangerDialog } from '../components/ConfirmDangerDialog';
import { defaultNextDeliverableAt } from '../data/serviceTemplateOptions';
import { ServiceMetadataForm } from '../components/shared/ServiceMetadataForm';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';

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
  const [showDeleteClient, setShowDeleteClient] = useState(false);

  // Reset to Overview whenever the user lands on a different client, so the
  // first thing they see on a new row isn't whatever tab they peeked at on
  // the previous one. Also drops edit mode + any in-flight confirm dialog
  // so a half-finished delete doesn't bleed onto the next client.
  useEffect(() => {
    setActiveTab('overview');
    setShowAddService(false);
    setServicesEditMode(false);
    setDeleteServiceId(null);
    setShowDeleteClient(false);
  }, [client.id]);

  const am = client.amId ? data.members.find(m => m.id === client.amId) ?? null : null;
  // Client.serviceIds is the documented source of truth for display order.
  // Sorting by its position lets reorderService nudge a service without
  // touching the global services array. Defensive fallback: anything that
  // exists under this client but isn't listed in serviceIds drops to the
  // end of the strip rather than disappearing.
  const services = useMemo(() => {
    const owned = data.services.filter(s => s.clientId === client.id);
    const order = client.serviceIds;
    const indexOf = new Map(order.map((id, i) => [id, i]));
    return owned.slice().sort((a, b) => {
      const ai = indexOf.has(a.id) ? (indexOf.get(a.id) as number) : Infinity;
      const bi = indexOf.has(b.id) ? (indexOf.get(b.id) as number) : Infinity;
      return ai - bi;
    });
  }, [data.services, client.id, client.serviceIds]);
  // Archived cards are hidden everywhere active work is measured —
  // attention counts, service counts, activity feed. Pre-filter once so
  // every consumer on this page uses the same definition.
  const liveTasks = useMemo(() => data.tasks.filter(t => !t.archived), [data.tasks]);
  const openTasks = useMemo(
    () => liveTasks.filter(t => t.clientId === client.id && t.columnId !== 'done'),
    [liveTasks, client.id],
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
      <Hero client={client} am={am} onRequestDelete={() => setShowDeleteClient(true)} />
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
            onMoveUp={(id) => store.reorderService(id, 'up')}
            onMoveDown={(id) => store.reorderService(id, 'down')}
            favoriteIds={data.favoriteServiceIds}
            onToggleFavorite={(id) => store.toggleServiceFavorite(id)}
          />
          <ActivitySection client={client} tasks={liveTasks} todayISO={data.today} />
        </>
      )}

      {activeTab === 'onboarding' && (
        <OnboardingSection
          services={services}
          items={clientOnboarding}
          onToggle={(id) => store.toggleOnboardingItem(id)}
          onAdd={(serviceId, group, label) => {
            const id = `onb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            store.addOnboardingItem({ id, serviceId, group, label, done: false });
          }}
          onDelete={(id) => store.deleteOnboardingItem(id)}
          onRename={(id, label) => store.updateOnboardingItem(id, label)}
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
          services={data.services}
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

      {showDeleteClient && (() => {
        // Tally what the cascade will take with it, so the user isn't
        // surprised by missing data somewhere else after the delete.
        // Counts here mirror the filters in store.deleteClient().
        const serviceIds = services.map(s => s.id);
        const serviceCount = services.length;
        const taskCount = data.tasks.filter(t => serviceIds.includes(t.serviceId)).length;
        const contactCount = data.contacts.filter(c => c.clientId === client.id).length;
        const noteCount = data.notes.filter(n => n.clientId === client.id).length;
        const touchpointCount = data.touchpoints.filter(t => t.clientId === client.id).length;

        // Tiny helper so the sentence stays readable. Only list categories
        // that have something — a list of five zeros is just noise.
        const parts: string[] = [];
        const push = (n: number, singular: string, plural: string) => {
          if (n > 0) parts.push(`${n} ${n === 1 ? singular : plural}`);
        };
        push(serviceCount,    'service',    'services');
        push(taskCount,       'card',       'cards');
        push(contactCount,    'contact',    'contacts');
        push(noteCount,       'note',       'notes');
        push(touchpointCount, 'touchpoint', 'touchpoints');
        const cascadeLine = parts.length > 0
          ? `Cascades ${parts.join(', ')}.`
          : 'No services, cards, or notes to cascade.';

        return (
          <ConfirmDangerDialog
            title={`Delete "${client.name}"?`}
            body={
              <>
                {cascadeLine} Also removes the account-manager link, quick
                links, and every activity entry tied to this client. This
                can't be undone.
              </>
            }
            confirmLabel="Delete client"
            onConfirm={() => {
              flizowStore.deleteClient(client.id);
              setShowDeleteClient(false);
              // Land on the clients list. The detail pane unmounts as the
              // row disappears; navigate explicitly so state resets cleanly.
              navigate('#clients');
            }}
            onClose={() => setShowDeleteClient(false)}
          />
        );
      })()}

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

function Hero({ client, am, onRequestDelete }: {
  client: Client;
  am: Member | null;
  onRequestDelete: () => void;
}) {
  const statusLabel = statusChipLabel(client.status);
  // Inline rename: click the name to edit, Enter/blur to commit, Esc to
  // cancel. No pencil icon — cursor:text + hover tint + ring on focus do
  // the affordance work (house rule).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(client.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Overflow menu (⋯) — lives in the top-right of the hero. Today it
  // only carries "Delete client…" but is plural in shape so we can drop
  // Archive, Export, etc. in later without moving the affordance.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [client.id]);
  // Dismiss on outside click or Esc. We scope the outside-click check to
  // pointerdown so button handlers still fire in the same gesture.
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

      {/* Overflow menu at the top-right of the hero. Kept tucked behind a
          ⋯ so destructive actions aren't one click away — the user has to
          open the menu, pick delete, then confirm in a dialog. Three
          steps, matching Finder / Mail / most adult apps. */}
      <div
        ref={menuRef}
        className="hero-overflow"
        style={{ position: 'absolute', top: 16, right: 16 }}
      >
        <button
          type="button"
          className="tb-btn"
          aria-label="Client options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(v => !v)}
          style={{
            width: 32, height: 32, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, border: 'none', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
              onRequestDelete();
            }}
          >
            Delete client…
          </div>
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

function ServicesSection({ services, onAdd, editing, onToggleEdit, onDelete, onMoveUp, onMoveDown, favoriteIds, onToggleFavorite }: {
  services: Service[];
  onAdd: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  favoriteIds: string[];
  onToggleFavorite: (id: string) => void;
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
        {services.map((s, i) => (
          <ServiceCard
            key={s.id}
            service={s}
            editing={editing}
            onRemove={editing ? () => onDelete(s.id) : undefined}
            onMoveUp={editing && i > 0 ? () => onMoveUp(s.id) : undefined}
            onMoveDown={editing && i < services.length - 1 ? () => onMoveDown(s.id) : undefined}
            isFavorite={favoriteIds.includes(s.id)}
            onToggleFavorite={() => onToggleFavorite(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({ service, editing, onRemove, onMoveUp, onMoveDown, isFavorite, onToggleFavorite }: {
  service: Service;
  editing?: boolean;
  onRemove?: () => void;
  /** Undefined when the card is already at the top — lets this component
   *  stay dumb about bounds. */
  onMoveUp?: () => void;
  /** Undefined when the card is already at the bottom. */
  onMoveDown?: () => void;
  /** Whether the service is pinned to the user's "My Boards" strip on
   *  the Overview. Drives the filled/outlined star affordance. */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
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
      {editing && (onMoveUp || onMoveDown) && (
        // Reorder nudges sit in the top-left — paired so they share one
        // mental spot ("move this around") without crowding the × button
        // in the top-right. Disabled-looking buttons at the ends of the
        // strip are hidden outright (handler undefined) rather than
        // rendered disabled, keeping the edit UI less noisy.
        <div className="service-reorder-wrap">
          {onMoveUp ? (
            <button
              type="button"
              className="service-reorder-btn"
              aria-label={`Move ${service.name} up`}
              title="Move up"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          ) : (
            <span className="service-reorder-spacer" aria-hidden="true" />
          )}
          {onMoveDown ? (
            <button
              type="button"
              className="service-reorder-btn"
              aria-label={`Move ${service.name} down`}
              title="Move down"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          ) : (
            <span className="service-reorder-spacer" aria-hidden="true" />
          )}
        </div>
      )}
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
      {!editing && onToggleFavorite && (
        <button
          type="button"
          className={`service-favorite-btn${isFavorite ? ' is-favorite' : ''}`}
          aria-label={isFavorite ? `Unpin ${service.name} from My Boards` : `Pin ${service.name} to My Boards`}
          aria-pressed={isFavorite ? 'true' : 'false'}
          title={isFavorite ? 'Unpin from My Boards' : 'Pin to My Boards'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

// ── Overview · Latest tasks ───────────────────────────────────────────────
//
// This started life as "Recent Activity" — five rows rendering:
//
//   [dot] **Sam** flagged a blocker on "Brief"        Feb 10
//
// The label said "activity", but there was no activity log: we were
// pulling the 5 newest tasks, labelling each with a verb derived from
// its *current* column, and timestamping with `createdAt`. A task
// created six months ago that moved to Review yesterday would render
// "moved to review … Feb 10" — the verb described an event from
// yesterday, the timestamp was the creation date six months prior,
// and the user had no way to know. Audit: client-detail.md H1.
//
// Reframed to what the data actually is: the latest N tasks on this
// client, showing title + current column + creation age. Honest. Still
// fills the sidebar. When a real activity log ships, *that* gets its
// own section with real event timestamps.

function ActivitySection({ client, tasks, todayISO }: {
  client: Client;
  tasks: Task[];
  todayISO: string;
}) {
  const items = useMemo(
    () => latestTasks(client, tasks, todayISO),
    [client, tasks, todayISO],
  );

  if (items.length === 0) {
    return (
      <div className="detail-section">
        <div className="detail-section-header">
          <div className="detail-section-title">Latest tasks</div>
        </div>
        <div style={{ padding: 20, color: 'var(--text-soft)', fontSize: 14 }}>
          No cards on this client yet. New tasks land here as work kicks off.
        </div>
      </div>
    );
  }

  return (
    <div className="detail-section">
      <div className="detail-section-header">
        <div className="detail-section-title">Latest tasks</div>
      </div>
      <div className="activity-list">
        {items.map((item) => (
          <div className="activity-item" key={item.key}>
            <span
              className="activity-dot"
              style={item.dotColor ? { background: item.dotColor } : undefined}
            />
            <div className="activity-text">
              <strong>{item.title}</strong>{' '}
              <span className="subject">· {item.columnLabel}</span>
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
  title: string;
  columnLabel: string;
  time: string;
  dotColor?: string;
}

function latestTasks(
  client: Client,
  tasks: Task[],
  todayISO: string,
): ActivityItem[] {
  return tasks
    .filter(t => t.clientId === client.id)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5)
    .map((task) => ({
      key: task.id,
      title: task.title,
      columnLabel: columnLabelFor(task.columnId),
      time: quickTime(task.createdAt, todayISO),
      dotColor: dotFor(task),
    }));
}

function columnLabelFor(id: ColumnId): string {
  switch (id) {
    case 'todo':       return 'To Do';
    case 'inprogress': return 'In Progress';
    case 'blocked':    return 'Blocked';
    case 'review':     return 'Needs Review';
    case 'done':       return 'Done';
  }
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
function OnboardingSection({ services, items, onToggle, onAdd, onDelete, onRename }: {
  services: Service[];
  items: OnboardingItem[];
  onToggle: (id: string) => void;
  onAdd: (serviceId: string, group: 'client' | 'us', label: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
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
          <OnboardingServiceCard
            key={g.service.id}
            group={g}
            onToggle={onToggle}
            onAdd={onAdd}
            onDelete={onDelete}
            onRename={onRename}
          />
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

function OnboardingServiceCard({ group, onToggle, onAdd, onDelete, onRename }: {
  group: OnboardingGroup;
  onToggle: (id: string) => void;
  onAdd: (serviceId: string, group: 'client' | 'us', label: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
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
          {/* Both groups render unconditionally now — the "+ Add item"
              composer lives at the bottom of each, so the group needs
              to exist even when it's currently empty. Label the group
              regardless so the user knows where their new item will
              land. */}
          <div className="onboarding-group-label">Needed from client</div>
          {client.map(item => (
            <OnboardingRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} onRename={onRename} />
          ))}
          <OnboardingAddItem
            serviceId={service.id}
            group="client"
            onAdd={onAdd}
          />

          <div className="onboarding-group-label" style={{ marginTop: 16 }}>We take care of</div>
          {us.map(item => (
            <OnboardingRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} onRename={onRename} />
          ))}
          <OnboardingAddItem
            serviceId={service.id}
            group="us"
            onAdd={onAdd}
          />
        </div>
      </div>
    </div>
  );
}

function OnboardingRow({ item, onToggle, onDelete, onRename }: {
  item: OnboardingItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
}) {
  // Double-click on the label text enters edit mode. Single click still
  // toggles the row (via the <label> wrapping). Apple Finder pattern —
  // single click for the primary action, double click to rename. Keeps
  // the most-common gesture (check off an item) one click away while
  // making the rarer gesture (fix a typo) discoverable through OS habit.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      const t = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 40);
      return () => window.clearTimeout(t);
    }
  }, [editing]);

  // Reset the draft if the underlying label changes from elsewhere (e.g.
  // another tab). Without this the input would cling to the old value
  // when the user reopens it.
  useEffect(() => {
    if (!editing) setDraft(item.label);
  }, [item.label, editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.label) {
      setEditing(false);
      setDraft(item.label);
      return;
    }
    onRename(item.id, trimmed);
    setEditing(false);
  };

  const cancelRename = () => {
    setDraft(item.label);
    setEditing(false);
  };

  return (
    <label
      className={`onboarding-item${item.done ? ' done' : ''}${editing ? ' editing' : ''}`}
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
        // Disabled during rename — the input owns the row until Enter/Esc.
        disabled={editing}
      >
        {item.done && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          className="onboarding-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitRename();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelRename();
            }
          }}
          onBlur={commitRename}
          onClick={(e) => e.preventDefault()}
          aria-label="Rename onboarding item"
        />
      ) : (
        <span
          className="onboarding-item-label"
          onDoubleClick={(e) => {
            e.preventDefault();
            setEditing(true);
          }}
          title="Double-click to rename"
        >
          {item.label}
        </span>
      )}

      {/* × lives on the right edge, far from the checkbox on the left,
          and only fades in on row hover. Low-cost data — no confirm
          dialog. If a user regrets the delete they can just re-add it. */}
      {!editing && (
        <button
          type="button"
          className="onboarding-delete-btn"
          aria-label={`Delete "${item.label}"`}
          title="Delete item"
          onClick={(e) => {
            // stopPropagation because the row <label> would otherwise
            // treat the click as a toggle on the checkbox.
            e.preventDefault();
            e.stopPropagation();
            onDelete(item.id);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </label>
  );
}

/**
 * Inline-composer row that sits at the end of each onboarding group.
 *
 * Default state: a faint "+ Add item" button styled like the row it
 * replaces, so the rhythm of the list stays unbroken. Click switches
 * to a text input with autofocus. Enter commits, Escape cancels, blur
 * with empty reverts. No modal — this is a micro-interaction, not a
 * flow, and a modal would be overkill.
 */
function OnboardingAddItem({ serviceId, group, onAdd }: {
  serviceId: string;
  group: 'client' | 'us';
  onAdd: (serviceId: string, group: 'client' | 'us', label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed) onAdd(serviceId, group, trimmed);
    setDraft('');
    setEditing(false);
  }

  function cancel() {
    setDraft('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="onboarding-add-btn"
        onClick={() => setEditing(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add item
      </button>
    );
  }

  return (
    <div className="onboarding-add-input-wrap">
      <input
        ref={inputRef}
        type="text"
        className="onboarding-add-input"
        value={draft}
        placeholder={group === 'client' ? 'e.g. Logo assets in SVG' : 'e.g. Book kickoff call'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        aria-label={`New ${group === 'client' ? 'client' : 'team'} onboarding item`}
      />
    </div>
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
  const [contactsEditMode, setContactsEditMode] = useState(false);
  const [linksEditMode, setLinksEditMode] = useState(false);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  // Contact row clicks (outside edit mode) open the same modal as Add,
  // pre-filled via this id. Edit vs. Add is decided inside the modal —
  // one shape, two flows, no duplicated fields.
  const [editContactId, setEditContactId] = useState<string | null>(null);
  // Same pattern for quick links, except the edit trigger only fires
  // in edit mode — view mode rows are <a> tags that navigate.
  const [editLinkId, setEditLinkId] = useState<string | null>(null);

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
          <ContactsCard
            contacts={contacts}
            onAdd={() => setShowAddContact(true)}
            editing={contactsEditMode}
            onToggleEdit={() => setContactsEditMode(v => !v)}
            onRemove={(id) => setDeleteContactId(id)}
            onTogglePrimary={(id, primary) => flizowStore.updateContact(id, { primary })}
            onEdit={(id) => setEditContactId(id)}
          />
          <QuickLinksCard
            links={quickLinks}
            onAdd={() => setShowAddQuickLink(true)}
            editing={linksEditMode}
            onToggleEdit={() => setLinksEditMode(v => !v)}
            onRemove={(id) => flizowStore.deleteQuickLink(id)}
            onEdit={(id) => setEditLinkId(id)}
          />
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
          existingPrimary={contacts.find(c => c.primary) ?? null}
          onClose={() => setShowAddContact(false)}
        />
      )}

      {editContactId && (() => {
        const target = contacts.find(c => c.id === editContactId);
        if (!target) return null;
        return (
          <AddContactModal
            clientId={client.id}
            existingPrimary={contacts.find(c => c.primary) ?? null}
            contact={target}
            onClose={() => setEditContactId(null)}
          />
        );
      })()}

      {showAddQuickLink && (
        <AddQuickLinkModal
          clientId={client.id}
          onClose={() => setShowAddQuickLink(false)}
        />
      )}

      {editLinkId && (() => {
        const target = quickLinks.find(q => q.id === editLinkId);
        if (!target) return null;
        return (
          <AddQuickLinkModal
            clientId={client.id}
            link={target}
            onClose={() => setEditLinkId(null)}
          />
        );
      })()}

      {showAddOperator && (
        <AddOperatorModal
          clientId={client.id}
          allMembers={data.members}
          currentTeamIds={client.teamIds}
          onClose={() => setShowAddOperator(false)}
        />
      )}

      {deleteContactId && (() => {
        const c = contacts.find(c => c.id === deleteContactId);
        if (!c) return null;
        return (
          <ConfirmDangerDialog
            title={`Remove ${c.name}?`}
            body={
              <>
                This removes their contact row for this client. Stored email,
                phone, and role go with it.
                {c.primary && (
                  <>
                    {' '}They're currently the <strong>primary contact</strong> —
                    set someone else as primary before removing them if you
                    want the "primary" flag on another person.
                  </>
                )}
              </>
            }
            confirmLabel="Remove contact"
            onConfirm={() => {
              flizowStore.deleteContact(c.id);
              setDeleteContactId(null);
            }}
            onClose={() => setDeleteContactId(null)}
          />
        );
      })()}
    </>
  );
}

function ContactsCard({ contacts, onAdd, editing, onToggleEdit, onRemove, onTogglePrimary, onEdit }: {
  contacts: Contact[];
  onAdd: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  onRemove: (id: string) => void;
  onTogglePrimary: (id: string, primary: boolean) => void;
  /** Fires when the row body (not icons, not edit-mode buttons) is
   *  clicked. Opens the shared AddContactModal in edit mode. */
  onEdit: (id: string) => void;
}) {
  return (
    <div className="relationship-card">
      <div className="relationship-card-head">
        <div className="relationship-card-label">Client contacts</div>
        {/* Two-button right side wrapped in a flex group. Edit button hides
            when the list is empty — nothing to edit, and the button would
            just add noise. */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {contacts.length > 0 && (
            <button
              type="button"
              className="relationship-card-link"
              onClick={onToggleEdit}
              style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
          <button
            type="button"
            className="relationship-card-link"
            onClick={onAdd}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
          >
            + Add contact
          </button>
        </div>
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
        <div className="contacts-list" data-edit={editing ? 'true' : undefined}>
          {contacts.map(c => (
            <div
              key={c.id}
              className="contact-row"
              data-contact-primary={c.primary ? 'true' : undefined}
              // Row body doubles as the edit trigger when NOT in edit mode.
              // No pencil icon — hover tint + cursor:pointer do the
              // affordance work (per the "no pencil icons" rule). In
              // edit mode the row becomes a management surface for
              // primary toggle + remove, so click-through is disabled.
              onClick={editing ? undefined : () => onEdit(c.id)}
              onKeyDown={editing ? undefined : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEdit(c.id);
                }
              }}
              role={editing ? undefined : 'button'}
              tabIndex={editing ? -1 : 0}
              aria-label={editing ? undefined : `Edit ${c.name}`}
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

              {/* View actions — email + phone shortcuts. Hidden in edit mode
                  via .contacts-list[data-edit="true"] [data-contact-view-actions]
                  rule in flizow.css. stopPropagation so a click on the
                  envelope/phone doesn't also trigger the row-level
                  "open edit modal" handler. */}
              <div className="contact-actions" data-contact-view-actions>
                {c.email && (
                  <a
                    className="contact-icon-btn"
                    href={`mailto:${c.email}`}
                    title={c.email}
                    aria-label={`Email ${c.name} at ${c.email}`}
                    onClick={(e) => e.stopPropagation()}
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
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 16.92V21a1 1 0 0 1-1.1 1 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 3.2 4.1 1 1 0 0 1 4.2 3h4.08a1 1 0 0 1 1 .75 12.78 12.78 0 0 0 .7 2.81 1 1 0 0 1-.23 1.05L8.21 9.21a16 16 0 0 0 6 6l1.6-1.6a1 1 0 0 1 1-.23 12.78 12.78 0 0 0 2.82.7 1 1 0 0 1 .75 1z" />
                    </svg>
                  </a>
                )}
              </div>

              {/* Edit actions — star-to-primary toggle + × remove. Shown in
                  edit mode via the same CSS rule. Star click toggles
                  primary (store handles demoting the existing primary). */}
              <div className="contact-edit-actions" data-contact-edit-actions>
                <button
                  type="button"
                  className="contact-icon-btn contact-primary-btn"
                  aria-label={c.primary ? 'Primary contact' : 'Set as primary'}
                  aria-pressed={c.primary ? 'true' : 'false'}
                  title={c.primary ? 'Primary contact' : 'Set as primary'}
                  onClick={() => onTogglePrimary(c.id, !c.primary)}
                >
                  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="contact-icon-btn contact-delete-btn"
                  aria-label={`Remove ${c.name}`}
                  title="Remove contact"
                  onClick={() => onRemove(c.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickLinksCard({ links, onAdd, editing, onToggleEdit, onRemove, onEdit }: {
  links: QuickLink[];
  onAdd: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  onRemove: (id: string) => void;
  /** Fires when the user clicks the row body (not the × remove button)
   *  in edit mode. Unlike contacts, links can't be clicked for edit in
   *  view mode because the row is an <a> that navigates to the URL —
   *  the edit affordance only appears once the user enters edit mode. */
  onEdit: (id: string) => void;
}) {
  return (
    <div className="relationship-card">
      <div className="relationship-card-head">
        <div className="relationship-card-label">Quick links</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {links.length > 0 && (
            <button
              type="button"
              className="relationship-card-link"
              onClick={onToggleEdit}
              style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
          <button
            type="button"
            className="relationship-card-link"
            onClick={onAdd}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
          >
            + Add link
          </button>
        </div>
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
        <div className="quick-links-list" data-edit={editing ? 'true' : undefined}>
          {links.map(l => (
            // In edit mode we drop the <a> so an accidental click doesn't
            // rip the user out of the app. The row becomes a button whose
            // body opens the Edit Quick Link modal; the trailing × is the
            // remove action (red hover, low-info data so no confirm —
            // consistent with Team removal, and if you wanted the link
            // back you'd just re-add it).
            editing ? (
              <div
                key={l.id}
                className="quick-link"
                role="button"
                tabIndex={0}
                onClick={() => onEdit(l.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onEdit(l.id);
                  }
                }}
                aria-label={`Edit ${l.label}`}
              >
                <span className="quick-link-icon" aria-hidden="true">
                  {renderLinkIcon(l.icon)}
                </span>
                <span>
                  <span className="quick-link-label">{l.label}</span>
                  <span className="quick-link-host">{hostOf(l.url)}</span>
                </span>
                <button
                  type="button"
                  className="quick-link-remove-btn"
                  aria-label={`Remove ${l.label}`}
                  title="Remove link"
                  onClick={(e) => {
                    // Don't also trigger the row's "open edit modal" —
                    // × is its own destination.
                    e.stopPropagation();
                    onRemove(l.id);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
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
            )
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

// Template options + the date default live in src/data/serviceTemplateOptions
// so both modals can share the source of truth.

function AddServiceModal({ clientId, onClose }: {
  clientId: string;
  onClose: () => void;
}) {
  // Thin wrapper over the shared form. This file used to carry ~190
  // lines of form JSX copy-pasted from EditServiceModal; both are now
  // ~20-line shells that only differ in their submit handler.
  return (
    <ServiceMetadataForm
      mode="add"
      initial={{
        name: '',
        type: 'retainer',
        templateKey: 'demandgen',
        progress: 0,
        nextDeliverableAt: defaultNextDeliverableAt(),
      }}
      onClose={onClose}
      onSubmit={(values) => {
        const id = `svc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const service: Service = {
          id,
          clientId,
          name: values.name,
          type: values.type,
          templateKey: values.templateKey,
          progress: 0,
          nextDeliverableAt: values.nextDeliverableAt,
          taskIds: [],
        };
        flizowStore.addService(service);
        onClose();
        // Land on the new board so the user can immediately add their first card.
        navigate(`#board/${id}`);
      }}
    />
  );
}

// ── Add Contact Modal ─────────────────────────────────────────────────────

function AddContactModal({ clientId, existingPrimary, contact, onClose }: {
  clientId: string;
  /** The client's current primary contact, or null if none exists.
   *  We need the actual record (not just a boolean) so the demotion
   *  confirm can name the person being demoted — "Jamie Chen will
   *  stop being primary" is a lot more honest than "the primary will
   *  change." Audit: add-contact-modal.md H1. */
  existingPrimary: Contact | null;
  /** When provided, the modal switches to edit mode: pre-fills every
   *  field, flips the title + save button copy, and calls updateContact
   *  instead of addContact. Keeping one component for both flows means
   *  field layout + validation never drift between the two. */
  contact?: Contact;
  onClose: () => void;
}) {
  const isEdit = !!contact;
  const hasPrimary = !!existingPrimary;
  const [name, setName] = useState(contact?.name ?? '');
  const [role, setRole] = useState(contact?.role ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  // Edit mode honours the contact's existing flag; add mode defaults to
  // "primary" only when the client has no primary yet (first-contact case).
  // New primary demotes the old one — the store handles that, but we
  // gate the save behind a confirm first (see pendingDemotion below).
  const [primary, setPrimary] = useState<boolean>(
    isEdit ? !!contact.primary : !hasPrimary,
  );
  const [nameError, setNameError] = useState(false);
  // When non-null, a demotion confirm dialog is stacked over the form.
  // Tracked as a trimmed-name string so we can reuse it as the saved
  // payload (no point running the validation twice).
  const [pendingDemotion, setPendingDemotion] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // Trap focus inside the form while it's the top-most modal. When the
  // demotion confirm stacks over us, disable the trap so Tab can enter
  // the child dialog — that dialog owns the focus ring until it closes.
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(modalRef, !pendingDemotion);

  useEffect(() => {
    const t = window.setTimeout(() => {
      nameRef.current?.focus();
      // In edit mode the name is already filled — select-all is more
      // useful than leaving the cursor floating at the end, since the
      // user opened this to change something.
      if (isEdit) nameRef.current?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [isEdit]);

  // True when saving with `primary === true` would demote a *different*
  // contact. Editing the existing primary with primary still true is a
  // no-op; adding a new primary when there's no current primary is
  // first-primary, not a demotion.
  function wouldDemote(trimmedName: string): boolean {
    if (!primary) return false;
    if (!existingPrimary) return false;
    if (isEdit && contact && existingPrimary.id === contact.id) return false;
    // Silence the unused-arg warning without sacrificing the signature
    // symmetry with handleSave.
    void trimmedName;
    return true;
  }

  function persistSave(trimmedName: string) {
    if (isEdit && contact) {
      flizowStore.updateContact(contact.id, {
        name: trimmedName,
        role: role.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        primary: primary || undefined,
      });
    } else {
      const id = `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const next: Contact = {
        id,
        clientId,
        name: trimmedName,
        role: role.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        primary: primary || undefined,
      };
      flizowStore.addContact(next);
    }
    onClose();
  }

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      nameRef.current?.focus();
      window.setTimeout(() => setNameError(false), 1400);
      return;
    }
    if (wouldDemote(trimmedName)) {
      // Park the save behind a confirm. Weekly WIP pings route by the
      // primary flag, so flipping it without a visible "you are about
      // to demote Jamie" beat was a forgiveness-principle failure.
      setPendingDemotion(trimmedName);
      return;
    }
    persistSave(trimmedName);
  }

  useEffect(() => {
    // While the stacked confirm is open, let *that* modal own the
    // keyboard — otherwise Escape would close both at once and
    // Cmd+Enter would save twice.
    if (pendingDemotion) return;
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
  }, [onClose, name, role, email, phone, primary, pendingDemotion]);

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
      <div ref={modalRef} className="wip-modal" role="document" style={{ maxWidth: 480 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="add-contact-title">
            {isEdit ? 'Edit contact' : 'Add contact'}
          </h2>
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
              {/* Naming the existing primary in the hint means a
                  distracted user sees the consequence before saving, not
                  just in a post-save toast. The stacked confirm still
                  runs on save either way. */}
              {isEdit && contact?.primary
                ? '— this is the primary contact'
                : existingPrimary
                  ? `— replaces ${existingPrimary.name} as primary`
                  : '— gets CC\u2019d on Weekly WIP pings'}
            </span>
          </label>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="wip-btn wip-btn-primary" onClick={handleSave}>
            {isEdit ? 'Save changes' : 'Add contact'}
          </button>
        </footer>
      </div>

      {pendingDemotion && existingPrimary && (
        <ConfirmDangerDialog
          title="Reassign primary contact?"
          body={
            <>
              <p style={{ margin: 0 }}>
                <strong>{existingPrimary.name}</strong> will stop being the
                primary contact for this client. They'll no longer receive
                Weekly WIP pings.
              </p>
              <p style={{ margin: '10px 0 0' }}>
                <strong>{pendingDemotion}</strong> will take over the
                primary role.
              </p>
            </>
          }
          confirmLabel="Switch primary"
          onConfirm={() => {
            const trimmedName = pendingDemotion;
            setPendingDemotion(null);
            persistSave(trimmedName);
          }}
          onClose={() => setPendingDemotion(null)}
        />
      )}
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

function AddQuickLinkModal({ clientId, link, onClose }: {
  clientId: string;
  /** When provided, the modal is in edit mode — same fields, same
   *  validation, but the save button rewrites the existing link via
   *  updateQuickLink instead of creating a new one. */
  link?: QuickLink;
  onClose: () => void;
}) {
  const isEdit = !!link;
  const [label, setLabel] = useState(link?.label ?? '');
  // Strip the https:// prefix for display so the URL input doesn't look
  // noisier than it has to. handleSave re-adds it on write.
  const [url, setUrl] = useState(link?.url ?? '');
  const [icon, setIcon] = useState<NonNullable<QuickLink['icon']>>(
    link?.icon ?? 'link',
  );
  const [labelError, setLabelError] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      labelRef.current?.focus();
      if (isEdit) labelRef.current?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [isEdit]);

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

    if (isEdit && link) {
      flizowStore.updateQuickLink(link.id, {
        label: trimmedLabel,
        url: normalizedUrl,
        icon,
      });
    } else {
      const id = `ql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const next: QuickLink = {
        id,
        clientId,
        label: trimmedLabel,
        url: normalizedUrl,
        icon,
      };
      flizowStore.addQuickLink(next);
    }
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
          <h2 className="wip-modal-title" id="add-link-title">
            {isEdit ? 'Edit quick link' : 'Add quick link'}
          </h2>
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
            {isEdit ? 'Save changes' : 'Add link'}
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

