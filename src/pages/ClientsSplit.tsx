import { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useRoute } from '../router';
import { ClientsPage } from './ClientsPage';
import { ClientDetailPage } from './ClientDetailPage';

/**
 * Master-detail wrapper for the Clients area. The mockup ships both panes
 * inside a single `.clients-split-wrapper` element and keys the layout off
 * `body[data-active-view]` — present that attribute for the whole time we
 * stay on either the list or the detail route so the CSS can flip the
 * flex layout on/off cleanly.
 *
 * Keeping this component stateless-on-top of the router means the list
 * pane doesn't unmount when you click into a client — no scroll reset, no
 * wasted re-fetch of the list when you come back.
 *
 * Also owns the list-pane collapse state. The toggle button slides
 * between the boundary of list/detail pane (when expanded) and the left
 * edge of the detail pane (when collapsed) — same DOM node, animated
 * via CSS `left` transition. Collapse state is body-attribute-driven so
 * the existing CSS rules (.view-clients flex: 0 0 0 when collapsed) can
 * pick it up.
 */
export function ClientsSplit() {
  const route = useRoute();
  const activeView = route.name === 'client-detail' ? 'client-detail' : 'clients';
  const [listCollapsed, setListCollapsed] = useState(false);

  useLayoutEffect(() => {
    // Use useLayoutEffect so the attribute lands before the browser
    // paints — otherwise the wrapper flashes `display: none` for one
    // frame because the CSS default hides .clients-split-wrapper until
    // body[data-active-view] names an active clients view.
    document.body.setAttribute('data-active-view', activeView);
    return () => {
      // Only clear if we still own the current value — guards against a
      // later route having already swapped it to something else.
      if (document.body.getAttribute('data-active-view') === activeView) {
        document.body.removeAttribute('data-active-view');
      }
    };
  }, [activeView]);

  // Mirror the collapse state to a body attribute so CSS can react. We
  // do this in a regular effect (not layout effect) because the
  // transition fires either way — the CSS animation picks up the
  // attribute change on the next frame.
  useEffect(() => {
    if (listCollapsed) {
      document.body.setAttribute('data-list-collapsed', 'true');
    } else {
      document.body.removeAttribute('data-list-collapsed');
    }
    return () => {
      document.body.removeAttribute('data-list-collapsed');
    };
  }, [listCollapsed]);

  return (
    <div className="clients-split-wrapper">
      <ClientsPage />
      <ClientDetailPage />
      <button
        type="button"
        className="list-pane-toggle"
        onClick={() => setListCollapsed(v => !v)}
        aria-label={listCollapsed ? 'Show client list' : 'Hide client list'}
        aria-expanded={!listCollapsed}
        title={listCollapsed ? 'Show client list' : 'Hide client list'}
      >
        {listCollapsed
          ? <ChevronRightIcon aria-hidden="true" />
          : <ChevronLeftIcon aria-hidden="true" />}
      </button>
    </div>
  );
}
