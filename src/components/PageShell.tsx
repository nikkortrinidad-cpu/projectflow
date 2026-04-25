import type { ReactElement } from 'react';
import { useRoute } from '../router';
import { OverviewPage } from '../pages/OverviewPage';
import { ClientsSplit } from '../pages/ClientsSplit';
import { BoardPage } from '../pages/BoardPage';
import { OpsPage } from '../pages/OpsPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { WipPage } from '../pages/WipPage';
import { TemplatesPage } from '../pages/TemplatesPage';

export function PageShell() {
  const route = useRoute();

  let page: ReactElement;
  switch (route.name) {
    case 'overview':         page = <OverviewPage />; break;
    // Clients list and client detail share one layout (`.clients-split-wrapper`).
    // Keeping them under a single component means the list pane never
    // unmounts when the user clicks into a detail row — scroll state,
    // filters, and search all stay put.
    case 'clients':          page = <ClientsSplit />; break;
    case 'client-detail':    page = <ClientsSplit />; break;
    case 'board':            page = <BoardPage />; break;
    case 'ops':              page = <OpsPage />; break;
    case 'analytics':        page = <AnalyticsPage />; break;
    case 'wip':              page = <WipPage />; break;
    case 'templates':        page = <TemplatesPage />; break;
    case 'template-detail':  page = <TemplatesPage />; break;
    default:                 page = <OverviewPage />;
  }

  return (
    <>
      {/* Skip-link target. tabIndex=-1 lets the link move focus here
          without making it a Tab stop. The next Tab from this anchor
          lands on the first focusable inside the page — bypasses the
          top nav entirely. Audit: overview re-audit MED (no skip
          target). */}
      <span id="main-content" tabIndex={-1} style={{ outline: 'none' }} />
      {page}
    </>
  );
}
