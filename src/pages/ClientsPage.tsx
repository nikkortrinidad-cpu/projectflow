import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute, navigate } from '../router';
import { flizowStore } from '../store/flizowStore';
import { useFlizow } from '../store/useFlizow';
import { useModalAutofocus } from '../hooks/useModalAutofocus';
import { useModalKeyboard } from '../hooks/useModalKeyboard';
import {
  servicePills,
  clientMetric,
  clientLastTouched,
  relativeTimeAgo,
  categoryLabel,
} from '../utils/clientDerived';
import type { Client, ClientStatus, IndustryCategory, Member } from '../types/flizow';

/**
 * Clients directory — the left (list) pane of the Mail.app-style split
 * view. The right pane renders from `ClientDetailPage`; both live inside
 * `ClientsSplit` so the layout can stay in a single `.clients-split-wrapper`.
 *
 * This file only renders the list. Wiring the detail pane, new-client
 * flow, pinned cards, and custom saved views lands in later passes.
 */

type SavedViewId = 'all' | 'mine' | 'fire' | 'risk' | 'track' | 'onboard' | 'paused';

interface SavedViewDef {
  id: SavedViewId;
  label: string;
  /** Optional status narrowing. `mine` filters by assignee, not status. */
  status?: ClientStatus;
}

const SAVED_VIEWS: SavedViewDef[] = [
  { id: 'all',     label: 'All' },
  { id: 'mine',    label: 'Assigned to me' },
  { id: 'fire',    label: 'On Fire',    status: 'fire' },
  { id: 'risk',    label: 'At Risk',    status: 'risk' },
  { id: 'track',   label: 'On Track',   status: 'track' },
  { id: 'onboard', label: 'Onboarding', status: 'onboard' },
  { id: 'paused',  label: 'Paused',     status: 'paused' },
];

const SAVED_VIEW_IDS: ReadonlySet<SavedViewId> = new Set(SAVED_VIEWS.map(v => v.id));

/** Narrow an untrusted URL segment back to a SavedViewId, or fall back
 *  to 'all'. Keeps the router's `params.view` type-safe without the
 *  consumer having to repeat the validation inline. */
function parseViewParam(raw: string | undefined): SavedViewId {
  if (raw && SAVED_VIEW_IDS.has(raw as SavedViewId)) return raw as SavedViewId;
  return 'all';
}

export function ClientsPage() {
  const { data, store } = useFlizow();
  const route = useRoute();
  const selectedId = route.params.id ?? null;

  // The saved-view chip state is seeded from the URL so Overview's health
  // cells ("On Fire", "At Risk", "On Track") can deep-link into the
  // filtered list (router parses `#clients/view/<id>`). After mount, the
  // chips update local state — they don't rewrite the URL, because most
  // chip changes are transient filter-tweaks, not shareable views. The
  // effect below re-syncs if a fresh URL with a different view param
  // arrives while we're already mounted (back button, paste, etc.).
  const viewFromRoute = parseViewParam(route.params.view);
  const [activeView, setActiveView] = useState<SavedViewId>(viewFromRoute);
  useEffect(() => {
    if (viewFromRoute !== activeView) setActiveView(viewFromRoute);
    // We only want to react when the URL's view param changes, not when
    // a chip click flips activeView. Depending on viewFromRoute alone
    // gives the right behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewFromRoute]);
  const [search, setSearch] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  // Demo loader sits in the empty state so a first-time user lands on
  // something to do, not a stale message. Tracked locally so the button
  // can show a loading spinner while the dynamic import resolves.
  const [loadingDemo, setLoadingDemo] = useState(false);

  const currentMemberId = store.getCurrentMemberId();

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    try {
      await store.loadDemoData();
    } finally {
      setLoadingDemo(false);
    }
  };

  // Compute filtered rows + per-view counts in one pass so the chip labels
  // stay in lockstep with the list and we don't walk the client list
  // twice on every keystroke.
  const { filtered, counts } = useMemo(() => {
    return filterClients(data.clients, activeView, search, currentMemberId);
  }, [data.clients, activeView, search, currentMemberId]);

  const handleClear = () => {
    setSearch('');
    setActiveView('all');
  };

  return (
    <div className="view view-clients active">
      <main className="clients-page">
        {/* Full-width header — CSS hides it inside .clients-split-wrapper,
            but we keep it so the same component still renders correctly
            if/when the page gets used outside the split. */}
        <div className="clients-header">
          <div className="clients-heading">
            <div className="clients-title">Clients</div>
            <div className="clients-count">{data.clients.length} active</div>
          </div>
        </div>

        {/* List-pane toolbar: search + count + add */}
        <div className="list-pane-toolbar">
          <label className="list-pane-search">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.656a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
            </svg>
            <input
              type="search"
              placeholder="Search clients"
              aria-label="Search clients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="list-pane-count" aria-label={`${filtered.length} clients in view`}>
            {filtered.length}
          </div>
          <button
            type="button"
            className="list-pane-add-btn"
            aria-label="Add client"
            onClick={() => setShowAddClient(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add client</span>
          </button>
        </div>

        {/* "All Clients" section header used to live here. The page
            title above is already "Clients" and the default saved-view
            chip reads "All," so the header tripled the same signal and
            pushed the filter chips down the page. Removed per audit
            clients.md M1. */}

        <div className="saved-views-wrap">
          <div className="saved-views" role="tablist" aria-label="Saved views">
            {SAVED_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={activeView === view.id}
                className={`view-chip${activeView === view.id ? ' active' : ''}`}
                onClick={() => setActiveView(view.id)}
              >
                {view.label}
                <span className="view-chip-count">{counts[view.id]}</span>
              </button>
            ))}
            {/* A disabled "+ new view" chip used to sit at the end of
                the row. It looked clickable, read as a button to screen
                readers, and did nothing — a dead-end affordance. Pulled
                per audit clients.md M2; the chip will return when the
                Templates pass actually ships the save-a-filter-set
                plumbing it was promising. */}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="list-empty-state" role="status" aria-live="polite" style={{ display: 'flex' }}>
            {data.clients.length === 0 ? (
              // Fresh workspace — offer both a demo loader (low-friction
              // poke-around) and a direct "Add client" entry. The demo
              // button leads so a first-time user has a one-click path
              // to seeing the product full of realistic data.
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <div className="list-empty-title">No clients yet</div>
                <div className="list-empty-sub">
                  Load a demo workspace to explore Flizow, or add your first client.
                </div>
                {/* Button order + spacing per audit clients.md M4/M5:
                    "Load demo data" sits on the right so the cursor
                    lands on the lower-friction first-time path (Fitts'
                    Law on LTR layouts reads the rightmost button as
                    primary). gap/marginTop now on the 4-grid. */}
                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="list-empty-clear"
                    onClick={() => setShowAddClient(true)}
                  >
                    Add client
                  </button>
                  <button
                    type="button"
                    className="list-empty-clear"
                    onClick={handleLoadDemo}
                    disabled={loadingDemo}
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      borderColor: 'var(--accent)',
                      opacity: loadingDemo ? 0.7 : 1,
                      cursor: loadingDemo ? 'progress' : 'pointer',
                    }}
                  >
                    {loadingDemo ? 'Loading demo…' : 'Load demo data'}
                  </button>
                </div>
              </>
            ) : (
              // Workspace has clients, but the current filter/search
              // produced no matches.
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <div className="list-empty-title">No clients match</div>
                <div className="list-empty-sub">Try a different search or saved view.</div>
                <button type="button" className="list-empty-clear" onClick={handleClear}>
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="clients-list" role="list">
            <div className="clients-list-header">
              <div></div>
              <div>Client</div>
              <div>Services</div>
              <div>Account Manager</div>
              {/* Renamed from "Status" per audit clients.md M3. The
                  status dot on the left already carries the state
                  ("On fire" / "At risk" / "On track"); this column
                  is really "the next thing that needs attention" —
                  overdue counts, setup %, review due. "Attention"
                  names the thing instead of duplicating the dot. */}
              <div>Attention</div>
              <div style={{ textAlign: 'right' }}>Updated</div>
              <div></div>
            </div>

            {filtered.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                selected={client.id === selectedId}
              />
            ))}
          </div>
        )}
      </main>

      {showAddClient && (
        <AddClientModal
          members={data.members}
          todayISO={data.today}
          onClose={() => setShowAddClient(false)}
        />
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

interface RowProps {
  client: Client;
  selected: boolean;
}

function ClientRow({ client, selected }: RowProps) {
  const { data } = useFlizow();
  const pills = servicePills(client, data.services);
  const metric = clientMetric(client, data);
  const lastTouched = clientLastTouched(client, data.tasks);
  const am = client.amId ? data.members.find(m => m.id === client.amId) : null;

  // Use an anchor so middle-click / cmd-click still works, but intercept
  // left-click so the router updates without a full hash round-trip.
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(`#clients/${client.id}`);
  };

  const statusTip = statusTooltip(client.status);

  return (
    <a
      href={`#clients/${client.id}`}
      data-client-id={client.id}
      className={`client-row${selected ? ' selected' : ''}`}
      role="listitem"
      onClick={handleClick}
    >
      <span
        className={`client-status-dot ${client.status}`}
        aria-label={statusTip}
        title={statusTip}
      />

      <div className="client-identity">
        <div className={`client-logo ${client.logoClass}`}>{client.initials}</div>
        <div className="client-identity-body">
          <div className="client-name">{client.name}</div>
          <div className="client-industry">{categoryLabel(client.industryCategory)}</div>
        </div>
      </div>

      <div className="client-services">
        {pills.visible.map((name) => (
          <span key={name} className="service-pill">{name}</span>
        ))}
        {pills.overflow > 0 && (
          <span
            className="service-pill more"
            title={`${pills.overflow} more service${pills.overflow === 1 ? '' : 's'}`}
          >
            +{pills.overflow}
          </span>
        )}
      </div>

      <div className="client-am">
        {am ? (
          <>
            <div className="client-am-avatar" style={{ background: am.color }}>
              {am.initials}
            </div>
            <div className="client-am-name">{am.name}</div>
          </>
        ) : (
          <div className="client-am-name" style={{ color: 'var(--text-faint)' }}>—</div>
        )}
      </div>

      <div className={`client-metric${metric.urgent ? ' urgent' : ''}`}>
        {metric.text}
      </div>

      <div className="client-timestamp">
        {relativeTimeAgo(lastTouched, data.today)}
      </div>

      <span className="client-chevron" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </a>
  );
}

function statusTooltip(status: ClientStatus): string {
  switch (status) {
    case 'fire':    return 'On fire — needs attention now';
    case 'risk':    return 'At risk — review soon';
    case 'onboard': return 'Onboarding — first 30 days';
    case 'paused':  return 'Paused — retainer on hold';
    case 'track':
    default:        return 'On track';
  }
}

// ── Filtering ─────────────────────────────────────────────────────────────

interface FilterResult {
  filtered: Client[];
  counts: Record<SavedViewId, number>;
}

/**
 * One-pass filter that returns the rows to render AND the tab counts for
 * every saved view. Counts always reflect the current search, so the
 * chips stay honest as the user types — you never see "At Risk 6" when
 * there are zero matches for the query.
 */
function filterClients(
  clients: Client[],
  activeView: SavedViewId,
  search: string,
  currentMemberId: string | null,
): FilterResult {
  const q = search.trim().toLowerCase();
  const counts: Record<SavedViewId, number> = {
    all: 0, mine: 0, fire: 0, risk: 0, track: 0, onboard: 0, paused: 0,
  };

  const matchesSearch = (c: Client): boolean => {
    if (!q) return true;
    return c.name.toLowerCase().includes(q)
        || categoryLabel(c.industryCategory).toLowerCase().includes(q);
  };

  const matchesMine = (c: Client): boolean => {
    if (!currentMemberId) return false;
    return c.amId === currentMemberId;
  };

  const filtered: Client[] = [];
  for (const c of clients) {
    if (!matchesSearch(c)) continue;

    // Tally every view this client qualifies for — the chip counts are
    // independent from which view the user has active right now.
    counts.all += 1;
    if (matchesMine(c)) counts.mine += 1;
    switch (c.status) {
      case 'fire':    counts.fire    += 1; break;
      case 'risk':    counts.risk    += 1; break;
      case 'track':   counts.track   += 1; break;
      case 'onboard': counts.onboard += 1; break;
      case 'paused':  counts.paused  += 1; break;
    }

    // Gate the rendered list by the active view.
    const def = SAVED_VIEWS.find(v => v.id === activeView)!;
    if (def.id === 'all') { filtered.push(c); continue; }
    if (def.id === 'mine') {
      if (matchesMine(c)) filtered.push(c);
      continue;
    }
    if (def.status && c.status === def.status) filtered.push(c);
  }

  return { filtered, counts };
}

// ── Add client modal ──────────────────────────────────────────────────────

/**
 * The nine logo gradients live in flizow.css as `.logo-indigo`, `.logo-sky`
 * etc. Keeping this list in one place means the modal swatches and the
 * rendered client-row avatar can't drift.
 */
const LOGO_CLASSES = [
  'logo-indigo', 'logo-sky', 'logo-teal', 'logo-green',
  'logo-amber',  'logo-orange', 'logo-pink', 'logo-purple', 'logo-slate',
] as const;

const INDUSTRY_CATEGORIES: { value: IndustryCategory; label: string }[] = [
  { value: 'saas',         label: 'SaaS / Tech' },
  { value: 'ecommerce',    label: 'E-commerce / Retail' },
  { value: 'healthcare',   label: 'Healthcare / Wellness' },
  { value: 'fnb',          label: 'Food & Beverage' },
  { value: 'education',    label: 'Education' },
  { value: 'professional', label: 'Professional services' },
  { value: 'realestate',   label: 'Real estate' },
  { value: 'services',     label: 'Consumer services' },
  { value: 'industrial',   label: 'Industrial / Manufacturing' },
  { value: 'media',        label: 'Media & Publishing' },
];

/**
 * Derive two-letter initials from a free-text client name. Falls back to
 * 'NC' (new client) if the name is empty — purely defensive; the modal
 * won't let you save an empty name.
 */
function deriveInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'NC';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return (words[0].slice(0, 2)).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

// defaultRenewsAt() lived here. Removed 2026-04-26 along with the
// renewsAt field on Client.

/** Local-only shape for a queued additional-contact card in the Add
 *  Client modal. `draftId` is a render key + remove/update handle —
 *  it's NOT persisted; at save time each non-empty draft becomes a
 *  Contact record with a fresh `ct-` id. */
interface DraftExtraContact {
  draftId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

function AddClientModal({ members, todayISO, onClose }: {
  members: Member[];
  todayISO: string;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [industryCategory, setIndustryCategory] = useState<IndustryCategory>('saas');
  const [amId, setAmId] = useState<string>('');
  const [status, setStatus] = useState<ClientStatus>('onboard');
  const [logoClass, setLogoClass] = useState<typeof LOGO_CLASSES[number]>('logo-indigo');
  // Primary-contact fields — REQUIRED. A new client must ship with one
  // primary point of contact (name, position, email, mobile). Save is
  // blocked until all five required fields (client name + the four
  // primary-contact fields) are filled. Additional contacts beyond the
  // primary live in `extraContacts` below and are fully optional.
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  // Each entry is a draft contact card the user has appended via the
  // "Add another contact" button. `draftId` is local only (used as the
  // React key + the key for remove/update) — at save time we generate
  // fresh `ct-` ids for the persisted Contact records.
  const [extraContacts, setExtraContacts] = useState<DraftExtraContact[]>([]);
  // Per-field error map for required fields. Keys: 'name' (client name),
  // 'contactName', 'contactRole', 'contactEmail', 'contactPhone'. A field
  // ID appears here only after the user clicks Save with it empty —
  // typing into a field clears its error so the modal doesn't yell at
  // someone mid-fix.
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // Refs for required inputs — used to focus the first invalid one when
  // Save fails so the user lands on the field they need to fix.
  const nameRef = useRef<HTMLInputElement>(null);
  const contactNameRef = useRef<HTMLInputElement>(null);
  const contactRoleRef = useRef<HTMLInputElement>(null);
  const contactEmailRef = useRef<HTMLInputElement>(null);
  const contactPhoneRef = useRef<HTMLInputElement>(null);

  // AM picker shows only members typed 'am'. Operators live on the team
  // strip of the client detail page — a new client doesn't pick operators
  // at creation.
  const ams = useMemo(() => members.filter(m => m.type === 'am'), [members]);

  useModalAutofocus(nameRef);

  // Helper to clear an error key the moment the user starts typing in
  // that field. Avoids the "still red while I'm fixing it" friction.
  const clearError = (key: string) => {
    if (errors[key]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  function addExtraContact() {
    setExtraContacts(prev => [...prev, {
      draftId: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: '', role: '', email: '', phone: '',
    }]);
  }

  function removeExtraContact(draftId: string) {
    setExtraContacts(prev => prev.filter(c => c.draftId !== draftId));
  }

  function updateExtraContact(draftId: string, field: keyof Omit<DraftExtraContact, 'draftId'>, value: string) {
    setExtraContacts(prev => prev.map(c =>
      c.draftId === draftId ? { ...c, [field]: value } : c,
    ));
  }

  function handleSave() {
    // 1. Validate required fields. Five gates: client name + the four
    //    primary-contact fields. Build the error map first so we can set
    //    them all at once and focus the first invalid one in DOM order.
    const trimmedName         = name.trim();
    const trimmedContactName  = contactName.trim();
    const trimmedContactRole  = contactRole.trim();
    const trimmedContactEmail = contactEmail.trim();
    const trimmedContactPhone = contactPhone.trim();

    const newErrors: Record<string, boolean> = {};
    if (!trimmedName)         newErrors.name = true;
    if (!trimmedContactName)  newErrors.contactName = true;
    if (!trimmedContactRole)  newErrors.contactRole = true;
    if (!trimmedContactEmail) newErrors.contactEmail = true;
    if (!trimmedContactPhone) newErrors.contactPhone = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Focus the first invalid field in visual/DOM order so the user
      // lands on what they need to fix.
      const focusOrder: Array<[string, React.RefObject<HTMLInputElement | null>]> = [
        ['name',         nameRef],
        ['contactName',  contactNameRef],
        ['contactRole',  contactRoleRef],
        ['contactEmail', contactEmailRef],
        ['contactPhone', contactPhoneRef],
      ];
      const firstErr = focusOrder.find(([k]) => newErrors[k]);
      firstErr?.[1].current?.focus();
      return;
    }

    // 2. Build + persist the Client. Initials are derived at save time
    //    so the user doesn't have to maintain them separately.
    const id = `cl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const client: Client = {
      id,
      name: trimmedName,
      initials: deriveInitials(trimmedName),
      logoClass,
      status,
      industryCategory,
      amId: amId || null,
      startedAt: todayISO,
      serviceIds: [],
      teamIds: [],
    };
    flizowStore.addClient(client);

    // 3. Persist the primary contact. All four fields are required so
    //    we know they're populated by the time we get here. Role/email/
    //    phone are typed `string | undef` on Contact — we pass strings
    //    because validation guarantees non-empty.
    flizowStore.addContact({
      id: `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      clientId: id,
      name: trimmedContactName,
      role: trimmedContactRole,
      email: trimmedContactEmail,
      phone: trimmedContactPhone,
      primary: true,
    });

    // 4. Persist any additional contacts. Each draft only becomes a
    //    Contact when its name is non-empty — empty rows the user added
    //    but never filled in are silently dropped. Role/email/phone are
    //    omitted from the doc when blank so Firestore's
    //    ignoreUndefinedProperties keeps the stored shape tidy.
    extraContacts.forEach(ec => {
      const ecName = ec.name.trim();
      if (!ecName) return;
      const role  = ec.role.trim();
      const email = ec.email.trim();
      const phone = ec.phone.trim();
      flizowStore.addContact({
        id: `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        clientId: id,
        name: ecName,
        primary: false,
        ...(role  ? { role }  : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      });
    });

    onClose();
    // Land the user on the new client's detail page so they can keep going.
    navigate(`#clients/${id}`);
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
      aria-labelledby="add-client-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 560 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="add-client-title">Add client</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body">
          <label className="wip-field">
            <span className="wip-field-label">
              Client name
              <span style={{ color: 'var(--status-fire)' }} aria-hidden="true"> *</span>
            </span>
            <input
              ref={nameRef}
              type="text"
              className="wip-field-input"
              value={name}
              onChange={(e) => { setName(e.target.value); clearError('name'); }}
              placeholder="e.g. Acme Industries"
              style={errors.name ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={errors.name || undefined}
              aria-required="true"
              aria-describedby={errors.name ? 'err-name' : undefined}
            />
            {errors.name && (
              <span id="err-name" style={{ fontSize: 'var(--fs-xs)', color: 'var(--status-fire)', marginTop: 4 }}>
                Client name is required to save.
              </span>
            )}
          </label>

          {/* Industry + Status share a row. Both are short-label dropdowns
              that read better paired than stacked — pairing them halves the
              vertical reach of the modal and groups the two "what is this
              account" descriptors next to each other. The free-text
              Industry input that used to live next to the dropdown was
              removed 2026-04-27 — the dropdown's label already does the
              display job everywhere else in the app. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="wip-field">
              <span className="wip-field-label">Industry</span>
              <select
                className="wip-field-input"
                value={industryCategory}
                onChange={(e) => setIndustryCategory(e.target.value as IndustryCategory)}
              >
                {INDUSTRY_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="wip-field">
              <span className="wip-field-label">Status</span>
              <select
                className="wip-field-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as ClientStatus)}
              >
                <option value="onboard">Onboarding (first 30 days)</option>
                <option value="track">On track</option>
                <option value="risk">At risk</option>
                <option value="fire">On fire</option>
                <option value="paused">Paused</option>
              </select>
            </label>
          </div>

          <label className="wip-field">
            <span className="wip-field-label">Account Manager</span>
            <select
              className="wip-field-input"
              value={amId}
              onChange={(e) => setAmId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {ams.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>

          {/* MRR + Renewal-date inputs used to live here. Removed
              2026-04-26 — Flizow no longer tracks per-client revenue
              or renewal dates. */}

          {/* Primary contact group. All four fields are now REQUIRED —
              a new client must ship with at least one named primary
              point of contact, with their position, email, and phone.
              The asterisk on each label and the inline error text after
              a failed Save make the requirement obvious. Additional
              contacts (rendered below) stay fully optional — the user
              can stop after the primary or add as many more as they like. */}
          <div style={{
            fontSize: 'var(--fs-xs)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginTop: 4,
          }}>
            Primary contact
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="wip-field">
              <span className="wip-field-label">
                Contact name
                <span style={{ color: 'var(--status-fire)' }} aria-hidden="true"> *</span>
              </span>
              <input
                ref={contactNameRef}
                type="text"
                className="wip-field-input"
                value={contactName}
                onChange={(e) => { setContactName(e.target.value); clearError('contactName'); }}
                placeholder="e.g. Jamie Chen"
                style={errors.contactName ? { borderColor: 'var(--status-fire)' } : undefined}
                aria-invalid={errors.contactName || undefined}
                aria-required="true"
                aria-describedby={errors.contactName ? 'err-contactName' : undefined}
              />
              {errors.contactName && (
                <span id="err-contactName" style={{ fontSize: 'var(--fs-xs)', color: 'var(--status-fire)', marginTop: 4 }}>
                  Contact name is required to save.
                </span>
              )}
            </label>
            <label className="wip-field">
              <span className="wip-field-label">
                Position
                <span style={{ color: 'var(--status-fire)' }} aria-hidden="true"> *</span>
              </span>
              <input
                ref={contactRoleRef}
                type="text"
                className="wip-field-input"
                value={contactRole}
                onChange={(e) => { setContactRole(e.target.value); clearError('contactRole'); }}
                placeholder="e.g. VP Marketing"
                style={errors.contactRole ? { borderColor: 'var(--status-fire)' } : undefined}
                aria-invalid={errors.contactRole || undefined}
                aria-required="true"
                aria-describedby={errors.contactRole ? 'err-contactRole' : undefined}
              />
              {errors.contactRole && (
                <span id="err-contactRole" style={{ fontSize: 'var(--fs-xs)', color: 'var(--status-fire)', marginTop: 4 }}>
                  Position is required to save.
                </span>
              )}
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="wip-field">
              <span className="wip-field-label">
                Email address
                <span style={{ color: 'var(--status-fire)' }} aria-hidden="true"> *</span>
              </span>
              <input
                ref={contactEmailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                className="wip-field-input"
                value={contactEmail}
                onChange={(e) => { setContactEmail(e.target.value); clearError('contactEmail'); }}
                placeholder="jamie@acme.com"
                style={errors.contactEmail ? { borderColor: 'var(--status-fire)' } : undefined}
                aria-invalid={errors.contactEmail || undefined}
                aria-required="true"
                aria-describedby={errors.contactEmail ? 'err-contactEmail' : undefined}
              />
              {errors.contactEmail && (
                <span id="err-contactEmail" style={{ fontSize: 'var(--fs-xs)', color: 'var(--status-fire)', marginTop: 4 }}>
                  Email address is required to save.
                </span>
              )}
            </label>
            <label className="wip-field">
              <span className="wip-field-label">
                Mobile number
                <span style={{ color: 'var(--status-fire)' }} aria-hidden="true"> *</span>
              </span>
              <input
                ref={contactPhoneRef}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="wip-field-input"
                value={contactPhone}
                onChange={(e) => { setContactPhone(e.target.value); clearError('contactPhone'); }}
                placeholder="+1 555 123 4567"
                style={errors.contactPhone ? { borderColor: 'var(--status-fire)' } : undefined}
                aria-invalid={errors.contactPhone || undefined}
                aria-required="true"
                aria-describedby={errors.contactPhone ? 'err-contactPhone' : undefined}
              />
              {errors.contactPhone && (
                <span id="err-contactPhone" style={{ fontSize: 'var(--fs-xs)', color: 'var(--status-fire)', marginTop: 4 }}>
                  Mobile number is required to save.
                </span>
              )}
            </label>
          </div>

          {/* Additional contacts. Optional — the primary above is the
              only contact required to create a client. Each draft is
              rendered with its own Remove button; on save, drafts with
              an empty name are silently dropped (the rest of the row's
              fields go too — orphan email-with-no-name isn't useful). */}
          {extraContacts.map((ec, idx) => (
            <div
              key={ec.draftId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sp-lg)',
                paddingTop: 'var(--sp-md)',
                borderTop: '1px solid var(--hairline)',
                marginTop: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Contact {idx + 2}{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(optional)</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeExtraContact(ec.draftId)}
                  aria-label={`Remove contact ${idx + 2}`}
                  style={{
                    fontSize: 'var(--fs-xs)',
                    color: 'var(--text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  Remove
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="wip-field">
                  <span className="wip-field-label">Contact name</span>
                  <input
                    type="text"
                    className="wip-field-input"
                    value={ec.name}
                    onChange={(e) => updateExtraContact(ec.draftId, 'name', e.target.value)}
                    placeholder="e.g. Sam Patel"
                  />
                </label>
                <label className="wip-field">
                  <span className="wip-field-label">Position</span>
                  <input
                    type="text"
                    className="wip-field-input"
                    value={ec.role}
                    onChange={(e) => updateExtraContact(ec.draftId, 'role', e.target.value)}
                    placeholder="e.g. Head of Growth"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="wip-field">
                  <span className="wip-field-label">Email address</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="wip-field-input"
                    value={ec.email}
                    onChange={(e) => updateExtraContact(ec.draftId, 'email', e.target.value)}
                    placeholder="sam@acme.com"
                  />
                </label>
                <label className="wip-field">
                  <span className="wip-field-label">Mobile number</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className="wip-field-input"
                    value={ec.phone}
                    onChange={(e) => updateExtraContact(ec.draftId, 'phone', e.target.value)}
                    placeholder="+1 555 123 4567"
                  />
                </label>
              </div>
            </div>
          ))}

          {/* Dashed-border button matches the conventional "add row"
              pattern — visually distinct from primary CTAs (solid blue)
              and destructive ones (red), reads as "extend the form".
              Lives at the bottom of the contact stack so it stays at
              the natural append point regardless of how many extras
              the user has added. */}
          <button
            type="button"
            onClick={addExtraContact}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 'var(--sp-9) var(--sp-base)',
              background: 'transparent',
              border: '1px dashed var(--hairline)',
              borderRadius: 8,
              fontSize: 'var(--fs-sm)',
              fontWeight: 500,
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add another contact
          </button>

          <div className="wip-field">
            <span className="wip-field-label">Logo colour</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="radiogroup" aria-label="Logo colour">
              {LOGO_CLASSES.map(cls => (
                <button
                  key={cls}
                  type="button"
                  role="radio"
                  aria-checked={logoClass === cls}
                  aria-label={cls.replace('logo-', '')}
                  className={`client-logo ${cls}`}
                  onClick={() => setLogoClass(cls)}
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    border: logoClass === cls
                      ? '2px solid var(--highlight)'
                      : '2px solid transparent',
                    outline: 'none',
                    cursor: 'pointer',
                    color: 'transparent', // hide any text content
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="wip-btn wip-btn-primary" onClick={handleSave}>
            Create client
          </button>
        </footer>
      </div>
    </div>
  );
}
