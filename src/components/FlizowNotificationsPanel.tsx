import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type {
  NotificationGroup,
  NotificationItem,
  NotificationState,
  NotificationType,
} from '../types/flizow';
import { useFlizow } from '../store/useFlizow';
import { deriveNotifications } from '../data/deriveNotifications';

/**
 * Flizow Notifications panel — anchored dropdown rendered inside `.notif-wrap`.
 *
 * Header: "Notifications" + Mark-all-read (disabled when unreadCount === 0)
 * Filters: All / Unread / Mentions (mentions includes replies)
 * Body: grouped by Today/Yesterday/Earlier with icon per type
 * Footer: "View all in Weekly WIP →"
 *
 * Data source: live derive from FlizowData via deriveNotifications() —
 * surfaces real overdue + due-today tasks assigned to me, real on-fire
 * clients on my team, plus a daily-digest roll-up. No more hardcoded
 * SEED. Read/dismissed flags persist to localStorage under
 * `flizow-notifs-v1`; ids are stable per source row so a notification
 * the user has seen stays read across reloads.
 */

const STORAGE_KEY = 'flizow-notifs-v1';

type Filter = 'all' | 'unread' | 'mentions';

const GROUP_ORDER: NotificationGroup[] = ['Today', 'Yesterday', 'Earlier'];

// Empty-state title per filter. "all=Nothing urgent" reads better
// than "Nothing here yet" now that the panel derives from real data
// — an empty all-feed means there's genuinely nothing overdue, due
// today, or on fire. That's a result, not a missing state.
const EMPTY_COPY: Record<Filter, string> = {
  all: "Nothing urgent. You're clear.",
  unread: "You're all caught up.",
  mentions: 'No mentions right now.',
};

/** Icon SVG per notification type — colour comes from the CSS class
 *  `.notif-icon--<type>` so we only emit the path geometry here. */
const ICONS: Record<NotificationType, ReactElement> = {
  mention: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  ),
  assign: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
  reply: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  ),
  due: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  overdue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  status: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  /* Calendar — same shape as the Holidays nav-item icon so the two
     surfaces share visual language: time off + holidays both relate
     to "days off" and the calendar mark reads instantly. */
  time_off: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

function loadState(): NotificationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Partial<NotificationState>;
      return {
        read: p.read && typeof p.read === 'object' ? p.read : {},
        dismissed: p.dismissed && typeof p.dismissed === 'object' ? p.dismissed : {},
      };
    }
  } catch {
    /* corrupt JSON — fall through to empty state */
  }
  return { read: {}, dismissed: {} };
}

function saveState(s: NotificationState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage quota / Safari private mode — no-op */
  }
}

// withSeedDefaults() used to live here — applied a hardcoded "3 items
// arrive unread" rule on top of the SEED constant. With derived
// notifications, every newly-derived id is implicitly unread (state.read
// has no entry → passesFilter treats it as unread). No defaulting
// needed; behaviour falls naturally out of the data + read map.

interface Props {
  /** Drives the panel's open/closed transition via `data-open`. */
  open: boolean;
  onClose: () => void;
  /** The bell button — outside-click close skips this so the bell can
   *  toggle the panel without immediately re-closing it. */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** Fires whenever the unread count changes, so the parent can light up
   *  the bell's red dot without re-reading the feed itself. */
  onUnreadChange?: (unread: number) => void;
}

export default function FlizowNotificationsPanel({ open, onClose, triggerRef, onUnreadChange }: Props) {
  const { data, store } = useFlizow();
  const [state, setState] = useState<NotificationState>(() => loadState());
  const [filter, setFilter] = useState<Filter>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  // Derive the live notification list from store data. Re-runs whenever
  // tasks / clients / services / today change — surfaces overdue work,
  // due-today reminders, on-fire client alerts, daily digest. Stable
  // ids per source row keep read state coherent across re-derives.
  const memberId = store.getCurrentMemberId();
  const liveItems = useMemo(
    () => deriveNotifications(data, memberId),
    [data, memberId],
  );

  // Persist read/dismissed on every change so the dot stays down across reloads.
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Esc closes (matches the account modal and card modal).
  // We also restore focus to the bell trigger so keyboard users
  // don't get dumped to <body>. Audit: notif HIGH (focus return).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, triggerRef]);

  // Outside click closes — but ignore clicks on the trigger button, so the
  // bell's own onClick can drive toggle behaviour without fighting us.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && panelRef.current.contains(target)) return;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      onClose();
    };
    // Defer one frame so the click that opened the panel doesn't
    // immediately close it (the opening click still bubbles to document).
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDocClick, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick, true);
    };
  }, [open, onClose, triggerRef]);

  // passesFilter: an item passes the active filter if it's not
  // dismissed AND matches the filter rule. Unread = "not yet marked
  // read" (read map either has no entry OR has !== true). Mentions
  // currently never match — derived items don't include type 'mention'
  // or 'reply' yet (those need a comment-mention parser we haven't
  // built). The filter stays in the UI for when we add them.
  const passesFilter = (n: NotificationItem, f: Filter): boolean => {
    if (state.dismissed[n.id]) return false;
    if (f === 'all') return true;
    if (f === 'unread') return state.read[n.id] !== true;
    if (f === 'mentions') return n.type === 'mention' || n.type === 'reply';
    return true;
  };

  const visible = useMemo(
    () => liveItems.filter((n) => passesFilter(n, filter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, state, liveItems],
  );

  const countFor = (f: Filter): number =>
    liveItems.filter((n) => passesFilter(n, f)).length;

  const unreadCount = useMemo(
    () =>
      liveItems.reduce(
        (acc, n) =>
          !state.dismissed[n.id] && state.read[n.id] !== true ? acc + 1 : acc,
        0,
      ),
    [state, liveItems],
  );

  // Reflect the unread count back to the parent so the bell's dot mirrors
  // whatever the panel knows. Fires on first mount too, which is what we
  // want — initial state includes FRESH_UNREAD defaults.
  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  const markRead = (id: string) => {
    setState((s) => ({ ...s, read: { ...s.read, [id]: true } }));
  };

  const markAllRead = () => {
    setState((s) => {
      const read = { ...s.read };
      for (const n of liveItems) {
        if (!s.dismissed[n.id]) read[n.id] = true;
      }
      return { ...s, read };
    });
  };

  const dismiss = (id: string) => {
    setState((s) => ({ ...s, dismissed: { ...s.dismissed, [id]: true } }));
  };

  const onRowClick = (n: NotificationItem) => {
    markRead(n.id);
    onClose();
    if (n.href && n.href.startsWith('#')) {
      window.location.hash = n.href.slice(1);
    }
  };

  // Group visible items into Today / Yesterday / Earlier buckets.
  const groups: Record<string, NotificationItem[]> = {};
  for (const n of visible) {
    (groups[n.group] = groups[n.group] ?? []).push(n);
  }

  return (
    <div
      ref={panelRef}
      className="notif-panel"
      id="notifPanel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="notifPanelTitle"
      aria-hidden={open ? 'false' : 'true'}
      data-open={open ? 'true' : 'false'}
    >
      <header className="notif-header">
        <h2 className="notif-title" id="notifPanelTitle">
          Notifications
        </h2>
        <button
          className="notif-btn-text"
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          Mark all read
        </button>
      </header>

      {/* Filter buttons (NOT ARIA tabs). The previous revision used
          role="tab" / role="tablist" but the WAI-ARIA tabs pattern
          requires a paired tabpanel with aria-controls / aria-labelledby
          — we don't have that, the body just re-filters in place. So
          these are toggle buttons with aria-pressed, which conveys the
          active state without lying to screen readers about a panel
          relationship. Audit: notif HIGH (broken tabs ARIA). */}
      <div
        className="notif-tabs"
        role="group"
        aria-label="Notification filters"
      >
        <FilterButton
          label="All"
          count={countFor('all')}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterButton
          label="Unread"
          count={countFor('unread')}
          active={filter === 'unread'}
          onClick={() => setFilter('unread')}
        />
        <FilterButton
          label="Mentions"
          count={countFor('mentions')}
          active={filter === 'mentions'}
          onClick={() => setFilter('mentions')}
        />
      </div>

      <div className="notif-body">
        {visible.length === 0 ? (
          <div className="notif-empty">
            <div className="notif-empty-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div className="notif-empty-title">{EMPTY_COPY[filter]}</div>
            <div className="notif-empty-sub">We&rsquo;ll ping you when something needs you.</div>
          </div>
        ) : (
          GROUP_ORDER.map((g) => {
            const items = groups[g];
            if (!items || items.length === 0) return null;
            return (
              <div key={g} className="notif-group" role="group" aria-labelledby={`notif-group-${g}`}>
                {/* h3 (not div) so screen reader users can navigate
                    by section landmark. Visual styling stays the
                    same — `.notif-group-label` controls all of that.
                    Audit: notif MED (no semantic group headings). */}
                <h3 className="notif-group-label" id={`notif-group-${g}`}>{g}</h3>
                {items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    item={n}
                    read={state.read[n.id] === true}
                    onOpen={() => onRowClick(n)}
                    onDismiss={() => dismiss(n.id)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      <footer className="notif-footer">
        <a
          href="#wip/agenda"
          onClick={() => {
            onClose();
          }}
        >
          View all in Weekly WIP{' '}
          {/* Decorative arrow — hidden from screen readers because
              the link text already says where it goes. Audit: notif LOW. */}
          <span aria-hidden="true">&rarr;</span>
        </a>
      </footer>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

interface FilterButtonProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterButton({ label, count, active, onClick }: FilterButtonProps) {
  return (
    <button
      className="notif-tab"
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {label} <span className="notif-tab-count">{count}</span>
    </button>
  );
}

interface RowProps {
  item: NotificationItem;
  read: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

function NotificationRow({ item, read, onOpen, onDismiss }: RowProps) {
  return (
    <div className="notif-item" data-notif-id={item.id} data-notif-read={read} data-notif-type={item.type}>
      <button
        className="notif-item-main"
        type="button"
        onClick={onOpen}
        aria-label={`${read ? '' : 'Unread: '}${stripTags(item.text)} — ${item.context}, ${item.ago}`}
      >
        <span className={`notif-icon notif-icon--${item.type}`} aria-hidden="true">
          {ICONS[item.type]}
        </span>
        <span className="notif-content">
          <span
            className="notif-item-title"
            // SEED text uses a trusted subset of tags (<strong>, <em>) we
            // emit ourselves — it's display formatting, not user input.
            dangerouslySetInnerHTML={{ __html: item.text }}
          />
          <span className="notif-item-meta">
            {item.context} · {item.ago}
          </span>
        </span>
      </button>
      <button
        className="notif-dismiss"
        type="button"
        aria-label="Dismiss this notification"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}
