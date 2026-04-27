import type { Client, IndustryCategory, Service, Task, FlizowData } from '../types/flizow';

/**
 * Human-readable label for a category enum value. The dropdown in the Add
 * Client modal owns the same mapping; centralising it here means the list
 * row, the detail-page hero, the command palette, and the notifications
 * digest all read the same string. Falls back to the raw key if a future
 * category slips in without a label — better to render "saas" than nothing.
 */
const CATEGORY_LABELS: Record<IndustryCategory, string> = {
  saas:         'SaaS / Tech',
  ecommerce:    'E-commerce / Retail',
  healthcare:   'Healthcare / Wellness',
  fnb:          'Food & Beverage',
  education:    'Education',
  professional: 'Professional services',
  realestate:   'Real estate',
  services:     'Consumer services',
  industrial:   'Industrial / Manufacturing',
  media:        'Media & Publishing',
};

export function categoryLabel(cat: IndustryCategory): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

/**
 * Pure helpers for deriving row-level display data on the Clients list.
 * Keeping these out of the component makes them easy to unit-test later
 * and keeps the list-row JSX focused on markup.
 *
 * All functions take the store snapshot (`FlizowData`) and a single
 * `Client`, and return display-ready strings/arrays. They never mutate.
 */

/** Max pills to show inline before we collapse the rest into "+N more". */
const MAX_VISIBLE_PILLS = 3;

export interface ServicePills {
  /** Service names to render inline, in the order the client lists them. */
  visible: string[];
  /** How many further services got hidden (0 when everything fit). */
  overflow: number;
}

export function servicePills(client: Client, services: Service[]): ServicePills {
  // Resolve ids → services in the same order the client stores them so the
  // strip always shows newest project work first (demo-data unshifts
  // projects to the front of the list).
  const ordered = client.serviceIds
    .map(id => services.find(s => s.id === id))
    .filter((s): s is Service => Boolean(s));

  if (ordered.length <= MAX_VISIBLE_PILLS) {
    return { visible: ordered.map(s => s.name), overflow: 0 };
  }
  return {
    visible: ordered.slice(0, MAX_VISIBLE_PILLS).map(s => s.name),
    overflow: ordered.length - MAX_VISIBLE_PILLS,
  };
}

export interface ClientMetric {
  text: string;
  /** True when the row should highlight the metric in the fire colour. */
  urgent: boolean;
}

/**
 * The right-hand status column on each row. Derived from the actual task
 * state rather than hand-authored strings so numbers stay honest as the
 * user works.
 *   fire    → "{n} overdue" (urgent tint)
 *   risk    → "{n} at risk" (plain)
 *   onboard → "{%} setup" (weighted average service progress)
 *   track   → "On track"
 *   paused  → "Paused"
 */
export function clientMetric(
  client: Client,
  data: FlizowData,
): ClientMetric {
  switch (client.status) {
    case 'fire': {
      const overdue = countOverdueTasks(client, data);
      return {
        text: overdue > 0
          ? `${overdue} overdue`
          : 'Needs attention',
        urgent: true,
      };
    }
    case 'risk': {
      const flagged = data.tasks.filter(
        t => t.clientId === client.id && (t.severity === 'warning' || t.severity === 'critical'),
      ).length;
      return {
        text: flagged > 0 ? `${flagged} at risk` : 'At risk',
        urgent: false,
      };
    }
    case 'onboard': {
      const progress = averageServiceProgress(client, data.services);
      return { text: `${progress}% setup`, urgent: false };
    }
    case 'paused':
      return { text: 'Paused', urgent: false };
    case 'track':
    default:
      return { text: 'On track', urgent: false };
  }
}

function countOverdueTasks(client: Client, data: FlizowData): number {
  const today = data.today;
  return data.tasks.filter(
    t => t.clientId === client.id
      && t.columnId !== 'done'
      && t.dueDate
      && t.dueDate < today,
  ).length;
}

function averageServiceProgress(client: Client, services: Service[]): number {
  const owned = services.filter(s => s.clientId === client.id);
  if (owned.length === 0) return 0;
  const sum = owned.reduce((acc, s) => acc + s.progress, 0);
  return Math.round(sum / owned.length);
}

/**
 * Client's "last touched" timestamp — the most recent `createdAt` of any
 * task tied to the client's services. Real systems would track this as a
 * separate `updatedAt` field; the demo-data tasks only carry `createdAt`,
 * so we derive from that. Falls back to the client's `startedAt` so brand
 * new rows never render an empty column.
 */
export function clientLastTouched(client: Client, tasks: Task[]): string {
  const owned = tasks.filter(t => t.clientId === client.id);
  if (owned.length === 0) return client.startedAt;
  let latest = owned[0].createdAt;
  for (let i = 1; i < owned.length; i++) {
    if (owned[i].createdAt > latest) latest = owned[i].createdAt;
  }
  return latest;
}

/**
 * Formats an ISO date against the store's `today` anchor. Matches the
 * mockup's cadence: "Xh ago" for the current day, "Xd ago" for the last
 * week, a weekday name for the last month, otherwise a short date.
 * Keeping the anchor explicit means the output stays stable across
 * re-renders — we never drift because `Date.now()` ticked.
 */
export function relativeTimeAgo(iso: string, todayISO: string): string {
  const now = parseISO(todayISO);
  const then = parseISO(iso);
  if (!now || !then) return '';
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) {
    if (minutes < 1) return 'just now';
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) {
    // Use the weekday name for mid-range — friendlier than "14d ago".
    return then.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Strict ISO parser that refuses malformed input so the caller can fall
 *  back cleanly instead of rendering "NaN". */
function parseISO(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
