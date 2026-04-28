import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Login screen. One card, one action.
 *
 * Composition: brand (icon + title + subtitle) anchors the sign-in action
 * inside a single card. Meta footer sits below, intentionally de-emphasized.
 *
 * Invite-landing variant: when the URL carries `?join=&token=&n=`
 * params (set by an invite link), we read the workspace name from
 * the `n` param and show "You've been invited to join {name}" above
 * the regular sign-in card. Pre-auth Firestore rules prevent reading
 * the workspace doc to fetch the name, so we ferry it through the URL.
 *
 * Note on styling: the exact card dimensions, corner radius, and layered
 * shadow are in `style={}` not Tailwind arbitrary-value classes. The JIT
 * scanner silently dropped `max-w-[380px]` and `shadow-[0_...]` on the
 * previous revision, which made the card render full-width. Inline styles
 * can't fail to compile.
 */
export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Read invite-landing params on render. App.tsx scrubs these from
  // the URL after stashing them in sessionStorage, so on a refresh
  // we won't have them in window.location.search. We don't need them
  // there — sessionStorage is the source of truth for the join name
  // post-stash. We also fall back to URL on initial render before
  // App's effect fires.
  const inviteName = useMemo<string | null>(() => {
    try {
      const stashed = sessionStorage.getItem('flizow-pending-join');
      if (stashed) {
        const parsed = JSON.parse(stashed);
        if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
          return parsed.name.trim();
        }
      }
    } catch { /* fall through */ }
    try {
      const params = new URLSearchParams(window.location.search);
      const n = params.get('n');
      if (n && n.trim()) return n.trim();
    } catch { /* fall through */ }
    return null;
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err: any) {
      // User-cancelled popup is not an error — they explicitly
      // backed out, surface nothing. For the common-but-confusing
      // failure modes (popup blocked by browser, network down), give
      // a plain-language explanation instead of Firebase's raw text.
      const code: string = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // silent — user closed the Google popup deliberately
      } else if (code === 'auth/popup-blocked') {
        setError('Your browser blocked the Google sign-in popup. Allow popups for this site and try again.');
      } else if (code === 'auth/network-request-failed') {
        setError("Couldn't reach Google. Check your connection and try again.");
      } else if (code === 'auth/unauthorized-domain') {
        setError('This site isn\'t authorized for Google sign-in yet. Contact support.');
      } else {
        setError(err?.message || 'Sign in failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    // <main> so screen readers expose this as the page's primary
    // landmark — login is the only thing on the screen, so it IS
    // the main content. Audit: login HIGH (no landmark).
    <main
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{ backgroundColor: '#f5f5f7' }}
    >
      <div className="w-full mx-auto" style={{ maxWidth: '400px' }}>
        {/* Card: unified brand + action so nothing orphans on the gray page.
            Layered shadow = crisp 1px edge + soft 12/32 ambient — reads as a
            card without needing a border. */}
        <div
          className="bg-white"
          style={{
            borderRadius: '22px',
            padding: '40px 36px 32px',
            boxShadow:
              '0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(0, 0, 0, 0.06)',
          }}
        >
          <div className="flex flex-col items-center">
            {/* App mark — 64px, soft drop shadow so it lifts off the card. */}
            <div
              className="flex items-center justify-center"
              aria-hidden="true"
              style={{
                width: 64,
                height: 64,
                background: '#1d1d1f',
                borderRadius: 16,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
              }}
            >
              <svg
                width="32"
                height="32"
                fill="none"
                stroke="white"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
            </div>

            {/* Brand pair — title + subtitle are one Gestalt unit (4px gap).
                Variant: when arriving from an invite link with a workspace
                name, the title becomes "Join {name}" and the sub-copy
                explains the action — Flizow brand demoted to a meta line
                below since the user's mental model right now is "join
                Acme Marketing," not "discover Flizow." */}
            {inviteName ? (
              <>
                <p
                  style={{
                    marginTop: 16,
                    marginBottom: 0,
                    fontSize: 'var(--fs-sm)',
                    fontWeight: 600,
                    color: '#86868b',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  You've been invited
                </p>
                <h1
                  style={{
                    marginTop: 6,
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: '#1d1d1f',
                    lineHeight: 1.2,
                    textAlign: 'center',
                    padding: '0 8px',
                  }}
                >
                  Join {inviteName}
                </h1>
                <p
                  style={{
                    marginTop: 6,
                    fontSize: 'var(--fs-md)',
                    color: '#86868b',
                    lineHeight: 1.4,
                  }}
                >
                  Sign in with Google to accept · Flizow
                </p>
              </>
            ) : (
              <>
                <h1
                  style={{
                    marginTop: 20,
                    fontSize: 26,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: '#1d1d1f',
                    lineHeight: 1.15,
                  }}
                >
                  Flizow
                </h1>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 'var(--fs-base)',
                    color: '#86868b',
                    lineHeight: 1.4,
                  }}
                >
                  Project Management
                </p>
              </>
            )}
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 24,
                padding: '10px 14px',
                backgroundColor: 'rgba(255, 59, 48, 0.08)',
                color: '#c41e14',
                fontSize: 'var(--fs-md)',
                lineHeight: 1.4,
                borderRadius: 12,
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          {/* Primary and only action. Pill button, 48px tall. */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            aria-busy={loading}
            className="login-cta"
            style={{
              marginTop: 32,
              width: '100%',
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: loading ? '#333336' : '#1d1d1f',
              color: 'white',
              borderRadius: 999,
              fontSize: 'var(--fs-base)',
              fontWeight: 500,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              transition: 'background-color 120ms ease',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = '#333336';
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = '#1d1d1f';
            }}
          >
            {loading ? (
              <>
                <span
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                  style={{
                    width: 18,
                    height: 18,
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                  }}
                />
                <span>Signing in…</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Trust microcopy — closes the "what happens next" question quietly. */}
          <p
            style={{
              marginTop: 20,
              fontSize: 'var(--fs-sm)',
              color: '#86868b',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Your data syncs securely across all your devices.
          </p>
        </div>

        {/* Meta footer — sits outside the card because it's about the service,
            not the sign-in action. Smaller than microcopy, tracked, muted. */}
        <p
          style={{
            marginTop: 20,
            fontSize: 'var(--fs-xs)',
            color: '#86868b',
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}
        >
          Powered by Firebase · Hosted on GitHub Pages
        </p>
      </div>
    </main>
  );
}
