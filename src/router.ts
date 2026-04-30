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
  | 'template-detail'
  /** Phase 7C — synthetic route used by deep-linked notifications.
   *  The Account modal opens via callback (it isn't a real page),
   *  so the App-level effect that watches the route catches the
   *  'account' name + opens the modal at `params.section`, then
   *  navigates back to overview to clear the hash. */
  | 'account';

export type Route = {
  name: RouteName;
  params: Record<string, string>;
  hash: string;
};

const DEFAULT: Route = { name: 'overview', params: {}, hash: '#overview' };

/** Pull `?key=value&...` query-string params off the end of a hash
 *  fragment (e.g. `#ops/timeoff?focus=tor-abc123`). The web URL spec
 *  doesn't define query strings inside hashes; treating it that way
 *  is a common convention and works fine for our deep-link case.
 *  Returns the bare path (no `?`) + the parsed params. */
function splitHashQuery(raw: string): { path: string; query: Record<string, string> } {
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return { path: raw, query: {} };
  const path = raw.slice(0, qIndex);
  const queryStr = raw.slice(qIndex + 1);
  const query: Record<string, string> = {};
  for (const pair of queryStr.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) {
      query[decodeURIComponent(pair)] = '';
    } else {
      query[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return { path, query };
}

// Hash → Route. Longest prefixes first so `#clients/<id>` matches before `#clients`.
function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  if (!raw) return DEFAULT;

  // Strip any query-string suffix once at the top so each branch
  // can see the bare path. The query is merged into params below.
  const { path, query } = splitHashQuery(raw);

  const parts = path.split('/');
  const head = parts[0];
  const rest = parts.slice(1);

  switch (head) {
    case 'overview':
      return { name: 'overview', params: { ...query }, hash };
    case 'clients':
      // `#clients/view/<id>` pre-selects a saved view (fire, risk, track,
      // onboard, paused, all, mine). Driven by Overview's health cells so
      // a user clicking "On Fire · 3" lands on the filtered list, not
      // the unfiltered one. Audit: overview.md H1.
      if (rest[0] === 'view' && rest[1]) {
        return { name: 'clients', params: { view: rest[1], ...query }, hash };
      }
      if (rest.length > 0) return { name: 'client-detail', params: { id: rest[0], ...query }, hash };
      return { name: 'clients', params: { ...query }, hash };
    case 'board':
      // `#board/{svcId}/card/{cardId}` deep-links directly to a card.
      // We don't support this on the initial tier — it's reached via
      // the card modal's "Copy link" menu — but when the receiver (or
      // the original user later) opens the URL, the board mounts with
      // that card pre-opened.
      if (rest.length >= 3 && rest[1] === 'card') {
        return { name: 'board', params: { id: rest[0], cardId: rest[2], ...query }, hash };
      }
      if (rest.length > 0) return { name: 'board', params: { id: rest[0], ...query }, hash };
      return { name: 'board', params: { ...query }, hash };
    case 'ops':
      // Phase 7C — `#ops/<sub-tab>` deep-links to an Ops sub-tab.
      // Known sub-tabs: 'board' (default), 'brief', 'capacity',
      // 'timeoff'. Unknown sub-tabs fall back to 'board' so a stale
      // link doesn't dead-end. `?focus=<id>` carries a row id for
      // the sub-tab to scroll + highlight (used by approval-queue
      // notifications). Both are optional.
      return {
        name: 'ops',
        params: {
          ...(rest[0] ? { tab: rest[0] } : {}),
          ...query,
        },
        hash,
      };
    case 'analytics':
      return { name: 'analytics', params: { ...query }, hash };
    case 'wip':
      // Mockup uses `#wip/agenda`; we treat the sub-path as a pane key for now.
      return { name: 'wip', params: { ...(rest[0] ? { pane: rest[0] } : {}), ...query }, hash };
    case 'templates':
      if (rest.length > 0) return { name: 'template-detail', params: { id: rest[0], ...query }, hash };
      return { name: 'templates', params: { ...query }, hash };
    case 'account':
      // Phase 7C — `#account/<section>` opens the Account modal at
      // a specific section. The App-level effect catches this,
      // calls onOpenAccount() with the requested section, and
      // navigates back to overview to clear the hash so the modal
      // doesn't keep re-opening. `?focus=<id>` carries an
      // optional row id (e.g. a TimeOffRequest the modal scrolls
      // + highlights once mounted).
      return {
        name: 'account',
        params: {
          ...(rest[0] ? { section: rest[0] } : {}),
          ...query,
        },
        hash,
      };
  }

  return DEFAULT;
}

/** Test-only re-export of the internal parser. The hash router
 *  derives every other surface from this function, so tests assert
 *  against parsed shapes here rather than driving a hashchange + a
 *  React renderer. Underscore prefix marks it as not-public. */
export const __parseHashForTest = parse;

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
