import type { FlizowData, NotificationItem } from '../types/flizow';
import { categoryLabel } from '../utils/clientDerived';

/**
 * Derive notifications from live store data — no event log required.
 *
 * Each notification has a stable id derived from its source row
 * (`overdue-{taskId}`, `due-today-{taskId}`, `fire-{clientId}`), so
 * the read/dismissed state in localStorage persists across reloads.
 * When the underlying condition resolves (a task gets done, a client
 * status flips off On Fire), the notification simply disappears from
 * the next derive — no GC needed.
 *
 * Categories (in display order):
 *   1. Overdue tasks assigned to me
 *   2. Tasks due today assigned to me
 *   3. Currently On Fire clients
 *   4. System digest line if there's anything urgent
 *
 * Future event-driven categories (need an activity log we don't have
 * yet — they live in `taskActivity` on the store but aren't read by
 * any UI yet): @mentions, status flips, comment replies, assignment
 * events. Wire them in when the activity log gains the right shape.
 *
 * Group is always 'Today' for now — without real event timestamps
 * for these derivations, "Yesterday" and "Earlier" stay empty by
 * design. The panel skips empty group labels.
 */
export function deriveNotifications(
  data: FlizowData,
  memberId: string | null,
): NotificationItem[] {
  if (!memberId) return [];

  // Read the current user's notification prefs. Both default to true
  // when undefined (legacy members from before the prefs slice land).
  // Toggles live on Member.notifPrefs and are edited in Account
  // Settings → Notifications.
  const me = data.members.find((m) => m.id === memberId);
  const showUrgent = me?.notifPrefs?.urgent !== false;
  const showDigest = me?.notifPrefs?.digest !== false;

  const todayStr = data.today;
  const items: NotificationItem[] = [];

  // Pre-index for context lookups so we don't pay O(n) per task.
  const clientById = new Map(data.clients.map((c) => [c.id, c]));
  const serviceById = new Map(data.services.map((s) => [s.id, s]));

  // ── 1. Overdue tasks assigned to me ───────────────────────────────
  // Filter: my assignment, not done, not archived, has a due date,
  // due date in the past. Sort oldest-first so the worst-case rises
  // to the top — and cap at 6 so the panel doesn't drown in stale
  // work (overflow surfaces in the digest line below).
  const myOverdue = data.tasks
    .filter(
      (t) =>
        !t.archived &&
        t.columnId !== 'done' &&
        t.assigneeId === memberId &&
        t.dueDate &&
        t.dueDate < todayStr,
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // We always compute counts (used by the digest line below) even
  // when showUrgent is false — turning off urgent items in the bell
  // shouldn't suppress the digest line if THAT toggle is on.
  if (showUrgent) {
    for (const t of myOverdue.slice(0, 6)) {
      const days = daysBetween(t.dueDate, todayStr);
      const client = clientById.get(t.clientId);
      const service = serviceById.get(t.serviceId);
      items.push({
        id: `overdue-${t.id}`,
        type: 'overdue',
        group: 'Today',
        ago: `${days}d`,
        text: `<em>${escapeHTML(t.title)}</em> is ${days} ${pluralize(days, 'day', 'days')} overdue`,
        context: `${client?.name ?? 'Unknown'} · ${service?.name ?? 'Service'}`,
        href: `#board/${t.serviceId}`,
      });
    }
  }

  // ── 2. Due today (assigned to me, not done) ───────────────────────
  const myDueToday = data.tasks.filter(
    (t) =>
      !t.archived &&
      t.columnId !== 'done' &&
      t.assigneeId === memberId &&
      t.dueDate === todayStr,
  );
  if (showUrgent) {
    for (const t of myDueToday.slice(0, 5)) {
      const client = clientById.get(t.clientId);
      const service = serviceById.get(t.serviceId);
      items.push({
        id: `due-today-${t.id}`,
        type: 'due',
        group: 'Today',
        ago: 'Today',
        text: `<em>${escapeHTML(t.title)}</em> is due today`,
        context: `${client?.name ?? 'Unknown'} · ${service?.name ?? 'Service'}`,
        href: `#board/${t.serviceId}`,
      });
    }
  }

  // ── 3. Currently On Fire clients ──────────────────────────────────
  // Status-based, not event-based — flips off the moment status
  // changes back to risk/track/etc. Only surface if I'm on the team
  // (amId or teamIds) so I'm not pestered about clients that aren't
  // mine.
  if (showUrgent) {
    const myFireClients = data.clients.filter(
      (c) =>
        c.status === 'fire' &&
        (c.amId === memberId || (c.teamIds ?? []).includes(memberId)),
    );
    for (const c of myFireClients.slice(0, 5)) {
      items.push({
        id: `fire-${c.id}`,
        type: 'overdue',
        group: 'Today',
        ago: 'Now',
        text: `<strong>${escapeHTML(c.name)}</strong> is marked <em>On Fire</em>`,
        context: `${escapeHTML(categoryLabel(c.industryCategory))} · Client status`,
        href: `#clients/${c.id}`,
      });
    }
  }

  // ── 4. System digest line ─────────────────────────────────────────
  // One quiet roll-up at the top of the panel when there's anything
  // urgent. Independent toggle — a user might want the digest line as
  // a quick "how busy am I" glance even with the urgent rows
  // suppressed. The count itself reflects what the bell *would* show
  // if urgent were on.
  const urgent = myOverdue.length + myDueToday.length;
  if (showDigest && urgent > 0) {
    items.push({
      id: 'system-daily-digest',
      type: 'system',
      group: 'Today',
      ago: 'Now',
      text: `<strong>${urgent}</strong> ${pluralize(urgent, 'item needs', 'items need')} you today`,
      context: 'Flizow · Daily digest',
      href: '#wip/agenda',
    });
  }

  return items;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Escape user-supplied strings before they're embedded in the small
 *  HTML snippets above (text fields are rendered via
 *  dangerouslySetInnerHTML in the panel). Without this, a task titled
 *  '<img onerror=...>' would execute. */
function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;'
    : c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '"' ? '&quot;'
    : '&#39;',
  );
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/** ISO-string date math. Both args are YYYY-MM-DD (the format used
 *  throughout the store). Parses via UTC so we don't slip a day on
 *  timezone-offset quirks; returns whole days, minimum 1 (an overdue
 *  task is "1 day overdue" the moment its date is in the past). */
function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !ty) return 1;
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.max(1, Math.round((to - from) / 86_400_000));
}
