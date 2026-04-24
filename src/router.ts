import { useSyncExternalStore } from 'react';

export type RouteName =
  | 'overview'
  | 'clients'
  | 'client-detail'
  | 'board'
  | 'ops'
  | 'analytics'
  | 'wip'
  | 'templates'
  | 'template-detail';

export type Route = {
  name: RouteName;
  params: Record<string, string>;
  hash: string;
};

const DEFAULT: Route = { name: 'overview', params: {}, hash: '#overview' };

// Hash → Route. Longest prefixes first so `#clients/<id>` matches before `#clients`.
function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  if (!raw) return DEFAULT;

  const parts = raw.split('/');
  const head = parts[0];
  const rest = parts.slice(1);

  switch (head) {
    case 'overview':
      return { name: 'overview', params: {}, hash };
    case 'clients':
      // `#clients/view/<id>` pre-selects a saved view (fire, risk, track,
      // onboard, paused, all, mine). Driven by Overview's health cells so
      // a user clicking "On Fire · 3" lands on the filtered list, not
      // the unfiltered one. Audit: overview.md H1.
      if (rest[0] === 'view' && rest[1]) {
        return { name: 'clients', params: { view: rest[1] }, hash };
      }
      if (rest.length > 0) return { name: 'client-detail', params: { id: rest[0] }, hash };
      return { name: 'clients', params: {}, hash };
    case 'board':
      // `#board/{svcId}/card/{cardId}` deep-links directly to a card.
      // We don't support this on the initial tier — it's reached via
      // the card modal's "Copy link" menu — but when the receiver (or
      // the original user later) opens the URL, the board mounts with
      // that card pre-opened.
      if (rest.length >= 3 && rest[1] === 'card') {
        return { name: 'board', params: { id: rest[0], cardId: rest[2] }, hash };
      }
      if (rest.length > 0) return { name: 'board', params: { id: rest[0] }, hash };
      return { name: 'board', params: {}, hash };
    case 'ops':
      return { name: 'ops', params: {}, hash };
    case 'analytics':
      return { name: 'analytics', params: {}, hash };
    case 'wip':
      // Mockup uses `#wip/agenda`; we treat the sub-path as a pane key for now.
      return { name: 'wip', params: rest[0] ? { pane: rest[0] } : {}, hash };
    case 'templates':
      if (rest.length > 0) return { name: 'template-detail', params: { id: rest[0] }, hash };
      return { name: 'templates', params: {}, hash };
  }

  return DEFAULT;
}

let current = parse(window.location.hash);
const listeners = new Set<() => void>();

function emit() {
  current = parse(window.location.hash);
  listeners.forEach((l) => l());
}

window.addEventListener('hashchange', emit);

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}

export function navigate(hash: string) {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`;
  if (window.location.hash === normalized) return;
  window.location.hash = normalized;
}

/**
 * Navigate to `hash` AND guarantee a fresh hashchange event even if we
 * were already on that hash. Callers use this when a downstream page
 * has a mount-time effect keyed to hashchange that needs to re-fire —
 * most notably BoardPage's "open the card whose id is in sessionStorage"
 * flow after a card duplicate.
 *
 * Implementation is a deliberate two-step: set hash to '' so the browser
 * fires one hashchange, then set to the target so it fires another. The
 * ugly part is contained here so the callers aren't re-implementing it.
 * Audit: card-modal M5.
 */
export function navigateForceReparse(hash: string) {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`;
  if (window.location.hash === normalized) {
    window.location.hash = '';
  }
  window.location.hash = normalized;
}
