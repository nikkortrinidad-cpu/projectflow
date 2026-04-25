import { lazy, Suspense, type ReactElement } from 'react';
import { useRoute } from '../router';

// Route-level code splitting. Each page is its own chunk so the
// initial bundle no longer includes Recharts (Analytics), TipTap
// (board/ops/client-detail), and the rest of the per-page deps.
// The user lands on Overview and only that chunk loads; everything
// else streams in on first navigation. Audit: D1 (bundle was 1.37
// MB → splits below). Named exports get adapted to default-shaped
// modules via the `.then` wrapper React.lazy expects.
const OverviewPage    = lazy(() => import('../pages/OverviewPage').then(m => ({ default: m.OverviewPage })));
const ClientsSplit    = lazy(() => import('../pages/ClientsSplit').then(m => ({ default: m.ClientsSplit })));
const BoardPage       = lazy(() => import('../pages/BoardPage').then(m => ({ default: m.BoardPage })));
const OpsPage         = lazy(() => import('../pages/OpsPage').then(m => ({ default: m.OpsPage })));
const AnalyticsPage   = lazy(() => import('../pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const WipPage         = lazy(() => import('../pages/WipPage').then(m => ({ default: m.WipPage })));
const TemplatesPage   = lazy(() => import('../pages/TemplatesPage').then(m => ({ default: m.TemplatesPage })));

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
      {/* Suspense fallback is a quiet, full-page spinner. Most chunks
          are <100 KB gzipped so the flash is brief; the spinner only
          shows up on the first visit to a route, then the chunk is
          cached for the session. */}
      <Suspense fallback={<RouteFallback />}>
        {page}
      </Suspense>
    </>
  );
}

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', color: 'var(--text-faint)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28, height: 28,
          border: '2px solid var(--hairline)',
          borderTopColor: 'var(--text)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span
        style={{
          // Visually hidden — present for screen readers only so the
          // route-change is announced.
          position: 'absolute', width: 1, height: 1,
          padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap', border: 0,
        }}
      >
        Loading…
      </span>
    </div>
  );
}
