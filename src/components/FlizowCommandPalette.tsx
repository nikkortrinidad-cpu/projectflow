import { useEffect, useMemo, useRef, useState } from 'react';
import { useFlizow } from '../store/useFlizow';
import { navigate } from '../router';
import type { Client, Service, Task, Member, ColumnId, ClientStatus } from '../types/flizow';

/**
 * Flizow Command Palette — the ⌘K surface.
 *
 * Live search against the FlizowData store (clients, services, tasks,
 * members) plus a small fixed set of navigation commands. Mirrors the
 * mockup at public/flizow-test.html (~line 13324 and ~line 26750).
 *
 * Grouping order is deliberate: Commands > Clients > Boards > Tasks > People.
 * It's the same order the mockup uses and keeps the most "destination-like"
 * results up top so a blind press of Enter usually lands somewhere sensible.
 */

const STATUS_LABEL: Record<ClientStatus, string> = {
  fire: 'On Fire',
  risk: 'At Risk',
  track: 'On Track',
  onboard: 'Onboarding',
  paused: 'Paused',
};

const COLUMN_LABEL: Record<ColumnId, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  blocked: 'Blocked',
  review: 'Needs Review',
  done: 'Done',
};

type ItemType = 'cmd' | 'client' | 'service' | 'task' | 'member';

interface PaletteItem {
  type: ItemType;
  title: string;
  sub: string;
  icon: string;
  /** For commands / clients / services — fire navigate(hash) on activate. */
  hash?: string;
  /** For tasks — we navigate to the board, then open the card. */
  taskId?: string;
  serviceId?: string;
}

const COMMANDS: PaletteItem[] = [
  {
    type: 'cmd',
    icon: '⌂',
    title: 'Go to Home',
    sub: 'Dashboard — portfolio health, attention',
    hash: '#overview',
  },
  {
    type: 'cmd',
    icon: '◉',
    title: 'Go to Clients',
    sub: 'Directory of all client accounts',
    hash: '#clients',
  },
  {
    type: 'cmd',
    icon: '⊞',
    title: 'Go to Ops',
    sub: "Internal work that isn't tied to a client",
    hash: '#ops',
  },
  {
    type: 'cmd',
    icon: '☰',
    title: 'Go to Analytics',
    sub: 'Throughput, aging, trends',
    hash: '#analytics',
  },
  {
    type: 'cmd',
    icon: '✓',
    title: 'Go to Weekly WIP',
    sub: 'Agenda for this week',
    hash: '#wip/agenda',
  },
  {
    type: 'cmd',
    icon: '▦',
    title: 'Go to Templates',
    sub: 'Service blueprints and phases',
    hash: '#templates',
  },
];

/** Limits per section — tight when the query is empty (recent-ish view),
 *  looser when the user is actively filtering. Matches the mockup. */
const LIMITS = {
  clients: { empty: 5, query: 12 },
  services: { empty: 5, query: 15 },
  tasks: { empty: 5, query: 20 },
  members: { empty: 5, query: 15 },
};

const GROUP_LABEL: Record<ItemType, string> = {
  cmd: 'Commands',
  client: 'Clients',
  service: 'Boards',
  task: 'Tasks',
  member: 'People',
};

const GROUP_ORDER: ItemType[] = ['cmd', 'client', 'service', 'task', 'member'];

function matches(hay: string, q: string): boolean {
  return hay.toLowerCase().includes(q);
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FlizowCommandPalette({ open, onClose }: Props) {
  const { data } = useFlizow();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);
  // Track which input device drove the last interaction. Mouse hover
  // should NOT yank the active row away while the user is arrow-key
  // navigating — that's a classic command-palette antipattern. We
  // flip to 'keyboard' on any arrow keystroke, and back to 'mouse'
  // on the next mousemove. Audit: cmdk HIGH (hover-jacks-keyboard).
  const interactionRef = useRef<'mouse' | 'keyboard'>('mouse');
  // Element that had focus when the palette opened. Restored on close
  // so keyboard users don't get dumped to <body>. Audit: cmdk MED.
  const triggerRef = useRef<HTMLElement | null>(null);

  // Reset state every time the palette opens — the mockup clears input
  // and scroll on open so the user always starts from the top.
  useEffect(() => {
    if (open) {
      // Capture whoever opened us so we can restore focus on close.
      triggerRef.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setActiveIdx(0);
      interactionRef.current = 'keyboard';
      // Focus on next frame so the input exists in the DOM before we focus.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (triggerRef.current) {
      // Closing — return focus to whoever opened us.
      triggerRef.current.focus?.();
      triggerRef.current = null;
    }
  }, [open]);

  // Build the flat results list. Order matters — it's also the order
  // ArrowUp/ArrowDown walks through, so the groups render in GROUP_ORDER.
  const items = useMemo<PaletteItem[]>(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const out: PaletteItem[] = [];

    // Commands first. Always included, filtered by title only.
    for (const c of COMMANDS) {
      if (!q || matches(c.title, q)) out.push(c);
    }

    const clientById = new Map<string, Client>(data.clients.map((c) => [c.id, c]));
    const serviceById = new Map<string, Service>(data.services.map((s) => [s.id, s]));

    // Clients. Match on name OR industry.
    let n = 0;
    const clientCap = q ? LIMITS.clients.query : LIMITS.clients.empty;
    for (const c of data.clients) {
      if (n >= clientCap) break;
      if (q && !matches(c.name, q) && !matches(c.industry, q)) continue;
      n++;
      out.push({
        type: 'client',
        title: c.name,
        sub: `${c.industry} · ${STATUS_LABEL[c.status] ?? c.status}`,
        icon: c.initials,
        hash: `#clients/${c.id}`,
      });
    }

    // Services (a.k.a. Boards). Match on service name or parent client name.
    n = 0;
    const serviceCap = q ? LIMITS.services.query : LIMITS.services.empty;
    for (const s of data.services) {
      if (n >= serviceCap) break;
      const cli = clientById.get(s.clientId);
      if (q && !matches(s.name, q) && !(cli && matches(cli.name, q))) continue;
      n++;
      const typeLabel = s.type === 'project' ? 'Project' : 'Retainer';
      out.push({
        type: 'service',
        title: s.name,
        sub: `${cli ? cli.name + ' · ' : ''}${typeLabel}`,
        icon: '⊞',
        hash: `#board/${s.id}`,
      });
    }

    // Tasks. Match on title only — task names are the high-signal field.
    n = 0;
    const taskCap = q ? LIMITS.tasks.query : LIMITS.tasks.empty;
    for (const t of data.tasks as Task[]) {
      if (n >= taskCap) break;
      if (q && !matches(t.title, q)) continue;
      n++;
      const svc = serviceById.get(t.serviceId);
      const cli = clientById.get(t.clientId);
      const parts: string[] = [];
      if (cli) parts.push(cli.name);
      if (svc) parts.push(svc.name);
      parts.push(COLUMN_LABEL[t.columnId] ?? t.columnId);
      out.push({
        type: 'task',
        title: t.title,
        sub: parts.join(' · '),
        icon: 'T',
        taskId: t.id,
        serviceId: t.serviceId,
      });
    }

    // People. Match on name, initials, or role.
    n = 0;
    const memberCap = q ? LIMITS.members.query : LIMITS.members.empty;
    for (const m of data.members as Member[]) {
      if (n >= memberCap) break;
      if (
        q &&
        !matches(m.name, q) &&
        !matches(m.initials, q) &&
        !matches(m.role || '', q)
      )
        continue;
      n++;
      out.push({
        type: 'member',
        title: m.name,
        sub: m.role || (m.type === 'operator' ? 'Team member' : 'Account Manager'),
        icon: m.initials,
      });
    }

    return out;
  }, [data, query, open]);

  // Clamp active index when the result set shrinks beneath it.
  useEffect(() => {
    if (activeIdx > items.length - 1) {
      setActiveIdx(Math.max(0, items.length - 1));
    }
  }, [items.length, activeIdx]);

  // Global keyboard: ⌘K / Ctrl+K toggles, Esc closes.
  // Parent owns the toggle when closed (so ⌘K anywhere opens it); when
  // open we own Esc here.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Keep the active row scrolled into view as the user walks with arrows.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Activate a result: close + navigate. Tasks route through the board
  // hash; the BoardPage will handle auto-open-card in a later pass (the
  // FlizowCardModal is per-board local state today).
  const activate = (item: PaletteItem) => {
    onClose();
    if (item.type === 'task' && item.serviceId) {
      navigate(`#board/${item.serviceId}`);
      return;
    }
    if (item.hash) {
      navigate(item.hash);
    }
  };

  if (!open) return null;

  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      interactionRef.current = 'keyboard';
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      interactionRef.current = 'keyboard';
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      // Bonus: Home jumps to first, End to last — cheap quality-of-life
      // for power users who want to navigate long result lists.
      e.preventDefault();
      interactionRef.current = 'keyboard';
      setActiveIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      interactionRef.current = 'keyboard';
      setActiveIdx(Math.max(0, items.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[activeIdx];
      if (it) activate(it);
    }
  };

  // Group for rendering. We track each item's absolute index so the active
  // highlight and click handlers line up with `items[activeIdx]`.
  const grouped: Record<ItemType, { item: PaletteItem; idx: number }[]> = {
    cmd: [],
    client: [],
    service: [],
    task: [],
    member: [],
  };
  items.forEach((it, idx) => {
    grouped[it.type].push({ item: it, idx });
  });

  // Trimmed query for the empty-state echo. We show the user what they
  // actually typed so they know the search ran.
  const queryEcho = query.trim();
  // Stable id for the active option, threaded into the input via
  // aria-activedescendant. AT can now follow the keyboard navigation
  // even though focus stays in the input. Audit: cmdk HIGH.
  const activeOptionId = items[activeIdx] ? `cmdk-option-${activeIdx}` : undefined;

  return (
    <div
      className="cmdk-overlay open"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // Mousemove flips us back to mouse mode after keyboard nav. We
      // bind on the overlay (not each row) so a single move anywhere
      // counts. mouseenter on the row only fires if mode is 'mouse',
      // which prevents the active highlight from chasing the cursor
      // while the user is arrow-keying. Audit: cmdk HIGH.
      onMouseMove={() => { interactionRef.current = 'mouse'; }}
    >
      <div
        className="cmdk-modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="cmdk-input-wrap">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.656a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
          </svg>
          {/* WAI-ARIA combobox pattern. Input drives a listbox below;
              aria-activedescendant tells AT which option is "active"
              even though focus stays on the input. Without this, the
              visible highlighted row was invisible to screen readers.
              Audit: cmdk HIGH (broken combobox/listbox pairing). */}
          <input
            ref={inputRef}
            type="text"
            className="cmdk-input"
            placeholder="Search clients, tasks, people, or commands…"
            aria-label="Search clients, tasks, people, or commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={handleInputKey}
          />
          <span className="cmdk-esc">ESC</span>
        </div>
        <div
          className="cmdk-results"
          id="cmdk-listbox"
          role="listbox"
          aria-label="Search results"
        >
          {items.length === 0 ? (
            <div className="cmdk-group" role="presentation">
              <div className="cmdk-group-label">No results</div>
              {/* Friendlier empty state — echo the query and give the
                  user a hint about what to try. Audit: cmdk MED. */}
              <div className="cmdk-empty-hint" role="status" aria-live="polite">
                {queryEcho ? (
                  <>
                    No matches for <strong>"{queryEcho}"</strong>. Try a client name,
                    a board, or a command like <em>Go to Analytics</em>.
                  </>
                ) : (
                  <>Start typing to search clients, boards, tasks, people, or commands.</>
                )}
              </div>
            </div>
          ) : (
            GROUP_ORDER.map((key) => {
              const grp = grouped[key];
              if (grp.length === 0) return null;
              return (
                <div key={key} className="cmdk-group" role="presentation">
                  <div className="cmdk-group-label">{GROUP_LABEL[key]}</div>
                  {grp.map(({ item, idx }) => (
                    <div
                      key={`${key}-${idx}`}
                      id={`cmdk-option-${idx}`}
                      ref={idx === activeIdx ? activeRowRef : undefined}
                      className={`cmdk-item${idx === activeIdx ? ' active' : ''}`}
                      role="option"
                      aria-selected={idx === activeIdx}
                      // Only let mouse hover claim the highlight if the
                      // user is actually interacting with the mouse.
                      // Suppresses the "cursor at rest under the panel"
                      // jerk during keyboard nav.
                      onMouseEnter={() => {
                        if (interactionRef.current === 'mouse') setActiveIdx(idx);
                      }}
                      onClick={() => activate(item)}
                    >
                      <div className="cmdk-icon" aria-hidden="true">{item.icon}</div>
                      <div className="cmdk-item-main">
                        <div className="cmdk-item-title">{item.title}</div>
                        <div className="cmdk-item-sub">{item.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
