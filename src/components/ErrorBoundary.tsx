import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Generic React error boundary. The app had zero of these as of the
 * Wave 9 audit — any thrown render error in a route or modal crashed
 * the whole tree. This catches the throw, renders a quiet recovery
 * card, and gives the user two paths: reload the page (gets back to
 * the home route fresh), or report the error (mailto with details).
 *
 * Why a class component: React still requires class components for
 * `componentDidCatch` and `getDerivedStateFromError`. Function
 * components can't catch render errors.
 *
 * Wrap usage:
 *   <ErrorBoundary scope="route">
 *     <SomePage />
 *   </ErrorBoundary>
 *
 * The `scope` prop lets the fallback copy adapt — "this page failed"
 * vs "this dialog failed" reads better than a generic message.
 *
 * Audit: error/offline HIGH (no boundaries anywhere).
 */

interface Props {
  children: ReactNode;
  /** Affects the fallback's copy. 'route' is the default — used when
   *  wrapping a top-level page. 'modal' is for dialogs that portal
   *  outside the page tree. 'feature' is for narrower regions. */
  scope?: 'route' | 'modal' | 'feature';
  /** Optional render-prop fallback. When provided, the boundary calls
   *  this with the error + a reset function instead of using the
   *  built-in card. Lets a modal render its own minimal "couldn't
   *  load" message inline. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  /** True when the caught error matches the "stale chunk" signature.
   *  Code-split apps hit this whenever a long-open tab tries to lazy-
   *  fetch a chunk whose hashed filename has changed on the server
   *  (typical after a deploy). The right response is to reload, not
   *  to show a recovery card. Audit: stale-chunk auto-reload. */
  staleChunk: boolean;
}

/** sessionStorage key for the auto-reload guard. We stash a timestamp
 *  whenever we trigger a reload so we don't loop — if the same error
 *  fires again within RELOAD_LOOP_WINDOW_MS, we fall through to the
 *  regular recovery card instead of reloading forever. */
const RELOAD_TS_KEY = 'flizow-stale-chunk-reload-ts';
const RELOAD_LOOP_WINDOW_MS = 15_000;

/** Pattern-match the error message to decide if this is a stale-
 *  chunk failure. Three known wordings across browsers + bundlers:
 *    - Vite (Chrome / Firefox / new Safari): "Failed to fetch
 *      dynamically imported module"
 *    - Older Safari: "Importing a module script failed"
 *    - Webpack legacy: "Loading chunk N failed" (we don't use webpack
 *      but covering it costs nothing) */
function isStaleChunkError(err: Error | null | undefined): boolean {
  if (!err || !err.message) return false;
  const msg = err.message;
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError')
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, staleChunk: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, staleChunk: isStaleChunkError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console for now — when we wire a real error reporter (Sentry,
    // Datadog), it slots in here. Format mirrors the React dev
    // overlay so the trace stays scannable.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);

    // Stale-chunk auto-recovery. Vite hashes chunk filenames per build,
    // so a long-open tab carrying yesterday's index.js will 404 when it
    // tries to lazy-fetch today's chunks. The ONLY recovery is to load
    // a fresh index.js — i.e. reload. We do that here instead of
    // forcing the user through "click Try again, hit the same error,
    // give up" cycle. Guarded so a genuinely broken deploy doesn't
    // loop the page forever.
    if (this.state.staleChunk) {
      const lastReload = readLastReloadTs();
      const now = Date.now();
      if (lastReload && now - lastReload < RELOAD_LOOP_WINDOW_MS) {
        // Recently reloaded and still seeing the error — something
        // else is wrong. Fall through to the regular recovery card so
        // the user has visibility instead of an infinite reload.
        return;
      }
      writeLastReloadTs(now);
      // Tiny delay so the "we updated, reloading…" copy gets a frame
      // to paint before the page goes blank. Otherwise the user sees
      // a flash of nothing.
      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    }
  }

  reset = () => {
    this.setState({ error: null, staleChunk: false });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.state.staleChunk) {
      return <StaleChunkFallback />;
    }
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return <DefaultFallback scope={this.props.scope ?? 'route'} error={this.state.error} reset={this.reset} />;
  }
}

function readLastReloadTs(): number | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_TS_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function writeLastReloadTs(ts: number): void {
  try { sessionStorage.setItem(RELOAD_TS_KEY, String(ts)); } catch { /* private mode */ }
}

/** Brief notice shown for ~700ms before the page reloads. Quieter
 *  than the full recovery card — this isn't a failure the user has
 *  to act on; we're just telling them why the page is flashing. */
function StaleChunkFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        zIndex: 10000,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          background: 'var(--bg-elev)',
          border: '1px solid var(--hairline)',
          borderRadius: 12,
          boxShadow: 'var(--shadow)',
          color: 'var(--text)',
          fontSize: 14,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            border: '2px solid var(--hairline)',
            borderTopColor: 'var(--text)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span>Flizow was updated. Reloading…</span>
      </div>
    </div>
  );
}

function DefaultFallback({
  scope,
  error,
  reset,
}: {
  scope: 'route' | 'modal' | 'feature';
  error: Error;
  reset: () => void;
}) {
  const title =
    scope === 'modal'  ? "We couldn't open that"
    : scope === 'feature' ? 'Something went sideways here'
    : 'This page hit a snag';

  const sub =
    scope === 'modal'
      ? 'Close this dialog and try again. The rest of the app is fine.'
      : 'The rest of the app is still working — try again, or jump back home.';

  // mailto link with the error message + a snippet of the stack so a
  // user reporting the bug doesn't have to type anything. Trimmed to
  // 1500 chars so URL length stays sane.
  const body = encodeURIComponent(
    [
      `Error: ${error.message}`,
      '',
      `Where: ${window.location.href}`,
      `When: ${new Date().toISOString()}`,
      '',
      'Stack:',
      (error.stack ?? '(no stack)').slice(0, 1500),
    ].join('\n'),
  );
  const reportHref = `mailto:nikkortrinidad@gmail.com?subject=${encodeURIComponent('Flizow error report')}&body=${body}`;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        maxWidth: 480,
        margin: '80px auto',
        padding: '28px 32px',
        background: 'var(--bg-elev)',
        border: '1px solid var(--hairline)',
        borderRadius: 14,
        boxShadow: 'var(--shadow)',
        textAlign: 'center',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 44, height: 44,
          margin: '0 auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255, 159, 10, 0.14)',
          color: '#b45309',
          borderRadius: 12,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.5 }}>
        {sub}
      </p>
      {/* Surface the underlying message in a quiet code-styled box.
          Helps the user (and us) when they mention the error verbally. */}
      <div
        style={{
          margin: '0 0 18px',
          padding: '8px 12px',
          background: 'var(--bg-soft)',
          border: '1px solid var(--hairline-soft)',
          borderRadius: 8,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          color: 'var(--text-muted)',
          textAlign: 'left',
          maxHeight: 80,
          overflow: 'auto',
        }}
      >
        {error.message || 'Unknown error'}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: '#F15A24',
            color: '#fff',
            border: 'none',
            fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        {scope === 'route' && (
          <button
            type="button"
            onClick={() => { window.location.hash = '#overview'; reset(); }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--hairline)',
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Go home
          </button>
        )}
        <a
          href={reportHref}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--text-soft)',
            border: '1px solid var(--hairline)',
            fontSize: 13, fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center',
          }}
        >
          Report
        </a>
      </div>
    </div>
  );
}
