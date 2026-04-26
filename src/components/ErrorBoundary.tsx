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
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console for now — when we wire a real error reporter (Sentry,
    // Datadog), it slots in here. Format mirrors the React dev
    // overlay so the trace stays scannable.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return <DefaultFallback scope={this.props.scope ?? 'route'} error={this.state.error} reset={this.reset} />;
  }
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
            background: '#007aff',
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
