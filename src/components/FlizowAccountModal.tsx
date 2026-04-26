import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFlizow } from '../store/useFlizow';

/**
 * FlizowAccountModal — the Account Settings overlay reachable from the
 * avatar in the top nav. Mirrors the mockup's `.acct-modal` structure
 * so the CSS in flizow.css styles it without component-level work.
 *
 * Tabs:
 *   • Profile         — name, preferred name, email (Google), role, tz
 *   • Preferences     — appearance (light/dark/system), week start, time fmt
 *   • Notifications   — 5 delivery toggles
 *   • Sign-in         — connected Google identity + Sign out
 *
 * Scope for this pass:
 *   ✓ Tab switching (no persistence for inline form fields; they're
 *     demo inputs until we add a user-prefs slice to the store)
 *   ✓ Appearance wired to the legacy BoardStore's theme (the only slot
 *     currently backing the app's light/dark — App.tsx reads it there)
 *   ✓ Sign out via useAuth().logout()
 *   ✓ "Load demo data" + "Reset workspace" danger-zone buttons in the
 *     Profile footer (quality-of-life for testers clearing state)
 *
 * Out of scope (noted in MEMORY):
 *   • Form field persistence to Firestore — needs a UserPreferences slice
 *   • Notification channel persistence — shape already in types, wiring later
 *   • Timezone-driven date formatting — future pass
 */

type Section = 'profile' | 'preferences' | 'notifications' | 'signin';

const AVATAR_COLORS = [
  { id: 'indigo', hex: '#5e5ce6' },
  { id: 'blue',   hex: '#0a84ff' },
  { id: 'green',  hex: '#30d158' },
  { id: 'orange', hex: '#ff9f0a' },
  { id: 'red',    hex: '#ff375f' },
  { id: 'purple', hex: '#bf5af2' },
  { id: 'cyan',   hex: '#64d2ff' },
];

interface Props {
  onClose: () => void;
}

export default function FlizowAccountModal({ onClose }: Props) {
  const { user, logout } = useAuth();
  const { data, store } = useFlizow();
  const isDark = data.theme === 'dark';

  const [section, setSection] = useState<Section>('profile');
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Esc closes + initial focus on the safe dismissal target +
  // focus trap so Tab cycles within the modal instead of escaping
  // to the background page. Audit: account HIGH (no focus trap).
  useEffect(() => {
    closeBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      // Focus trap. Collect every focusable inside the modal, then
      // wrap Tab/Shift+Tab around the ends. Skip if no modal yet
      // mounted or no focusables (defensive).
      const root = modalRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Identity. Name/email come from Firebase; avatar initial is the first
  // letter of the display name (fall back to "U").
  const displayName = user?.displayName || 'You';
  const email = user?.email || '—';
  const initials = (displayName || 'U').trim().split(/\s+/)
    .map(p => p[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'U';

  // Draft state for editable fields. No Save button — we store locally
  // only until a user prefs slice lands. Matches the mockup's "edits
  // save instantly" pattern for the segmented controls.
  const [nameDraft, setNameDraft] = useState(displayName);
  const [preferredDraft, setPreferredDraft] = useState(displayName.split(' ')[0]);
  const [roleDraft, setRoleDraft] = useState('Account Manager');
  const [tzDraft, setTzDraft] = useState('pst');
  const [avatarHex, setAvatarHex] = useState('#5e5ce6');

  // Preferences. Appearance is the only one wired through — light/dark/system
  // routes through flizowStore.setTheme(). "System" applies the OS-preferred
  // scheme once on select, then behaves as a one-shot until a richer
  // pref-store ships. weekStart used to live here (Sun/Mon segment) — gone
  // because the Schedule grid is Mon–Fri-only.
  const [timeFmt, setTimeFmt] = useState<'12h' | '24h'>('12h');

  // Notifications — local checkbox state. No persistence yet.
  const [notifDigest, setNotifDigest]   = useState(true);
  const [notifWip, setNotifWip]         = useState(true);
  const [notifMentions, setNotifMentions] = useState(true);
  const [notifOverdue, setNotifOverdue] = useState(false);
  const [notifInapp, setNotifInapp]     = useState(true);

  // Danger-zone state — the Reset confirmation needs a typed confirmation.
  const [resetPhase, setResetPhase] = useState<'idle' | 'confirm'>('idle');
  const [resetInput, setResetInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function handleLoadDemo() {
    await store.loadDemoData();
    showToast('Demo workspace loaded');
  }

  function handleReset() {
    if (resetInput.trim().toLowerCase() !== 'reset') return;
    store.reset();
    setResetPhase('idle');
    setResetInput('');
    showToast('Workspace reset');
  }

  async function handleSignOut() {
    await logout();
    // The AuthContext listener flips `user` to null; App.tsx renders LoginPage.
    onClose();
  }

  function setAppearance(mode: 'light' | 'dark' | 'system') {
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      store.setTheme(prefersDark ? 'dark' : 'light');
    } else {
      store.setTheme(mode);
    }
  }

  return (
    <div
      className="acct-overlay"
      // `data-open` is the trigger the flizow.css rule uses to unhide
      // the overlay (display + opacity) and scale the inner modal to 1.
      // Previously we forced `display: flex` inline, which won the
      // visibility battle but left opacity at 0 and the modal at 0.97x —
      // the modal rendered, but invisibly.
      data-open="true"
      aria-hidden={false}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="acct-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settingsTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="acct-header">
          <h2 className="acct-title" id="settingsTitle">Account settings</h2>
          <button
            ref={closeBtnRef}
            className="acct-close"
            type="button"
            aria-label="Close settings (Esc)"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div className="acct-body">
          <nav className="acct-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
            <NavItem section="profile" label="Profile" active={section === 'profile'} onClick={() => setSection('profile')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
            </NavItem>
            <NavItem section="preferences" label="Preferences" active={section === 'preferences'} onClick={() => setSection('preferences')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/></svg>
            </NavItem>
            <NavItem section="notifications" label="Notifications" active={section === 'notifications'} onClick={() => setSection('notifications')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </NavItem>
            <NavItem section="signin" label="Sign-in" active={section === 'signin'} onClick={() => setSection('signin')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </NavItem>
          </nav>

          <div className="acct-content">

            {/* ── Profile ────────────────────────────────────────── */}
            {section === 'profile' && (
              <section
                className="acct-section"
                role="tabpanel"
                id="acct-panel-profile"
                aria-labelledby="acct-tab-profile"
                tabIndex={0}
                data-active="true"
              >
                <div className="acct-section-header">
                  <h3 className="acct-section-title">Profile</h3>
                  <p className="acct-section-sub">How you appear across Flizow — visible to your team and clients you share work with.</p>
                  {/* Honest signal that profile-field saving isn't wired
                      yet — without this, users edit, navigate away, come
                      back to defaults, and don't know why. Audit:
                      account MED (silent persistence gap). */}
                  <p className="acct-section-sub" style={{ marginTop: 6, color: 'var(--text-faint)', fontStyle: 'italic' }}>
                    Profile field saving lands in the next pass. Theme &amp; sign-out work today.
                  </p>
                </div>

                <div className="acct-avatar-block">
                  <div className="acct-avatar-large" style={{ background: avatarHex }}>{initials}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Avatar color
                    </div>
                    <div className="acct-avatar-colors" role="group" aria-label="Avatar color">
                      {AVATAR_COLORS.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="acct-avatar-color"
                          style={{ background: c.hex }}
                          aria-label={c.id}
                          aria-pressed={avatarHex === c.hex}
                          onClick={() => setAvatarHex(c.hex)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="acct-form-grid">
                  <Field label="Full name" htmlFor="acct-name">
                    <input
                      id="acct-name"
                      type="text"
                      className="acct-input"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Preferred name" htmlFor="acct-preferred">
                    <input
                      id="acct-preferred"
                      type="text"
                      className="acct-input"
                      value={preferredDraft}
                      onChange={(e) => setPreferredDraft(e.target.value)}
                      autoComplete="nickname"
                    />
                  </Field>
                  <Field label="Email" full htmlFor="acct-email">
                    <input
                      id="acct-email"
                      type="email"
                      className="acct-input"
                      value={email}
                      readOnly
                      autoComplete="email"
                    />
                    <div className="acct-field-hint">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Managed by Google. Change it from your Google account.
                    </div>
                  </Field>
                  <Field label="Role / title" htmlFor="acct-role">
                    <input
                      id="acct-role"
                      type="text"
                      className="acct-input"
                      value={roleDraft}
                      onChange={(e) => setRoleDraft(e.target.value)}
                      autoComplete="organization-title"
                    />
                  </Field>
                  <Field label="Time zone" htmlFor="acct-tz">
                    <select
                      id="acct-tz"
                      className="acct-input"
                      value={tzDraft}
                      onChange={(e) => setTzDraft(e.target.value)}
                    >
                      <option value="pst">Pacific · Los Angeles</option>
                      <option value="mst">Mountain · Denver</option>
                      <option value="cst">Central · Chicago</option>
                      <option value="est">Eastern · New York</option>
                      <option value="utc">UTC</option>
                      <option value="gmt">London</option>
                      <option value="cet">Berlin</option>
                      <option value="sgt">Singapore</option>
                      <option value="jst">Tokyo</option>
                      <option value="aest">Sydney</option>
                    </select>
                  </Field>
                </div>

                <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Workspace data
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <button type="button" className="acct-btn-text" onClick={handleLoadDemo}>
                      Load demo data
                    </button>
                    <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>· Seeds the mockup's 50 demo clients</span>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    {resetPhase === 'idle' ? (
                      <button
                        type="button"
                        onClick={() => setResetPhase('confirm')}
                        style={{
                          padding: '8px 14px', borderRadius: 8,
                          background: 'transparent',
                          border: '1px solid var(--accent)', color: 'var(--accent)',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                      >Reset workspace…</button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
                        <div style={{ fontSize: 13, color: 'var(--text)' }}>
                          This deletes every client, service, and task in your workspace. Type <strong>reset</strong> to confirm.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="text"
                            className="acct-input"
                            value={resetInput}
                            onChange={(e) => setResetInput(e.target.value)}
                            placeholder="Type reset to confirm"
                            autoFocus
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={handleReset}
                            disabled={resetInput.trim().toLowerCase() !== 'reset'}
                            style={{
                              padding: '0 14px', borderRadius: 8,
                              background: resetInput.trim().toLowerCase() === 'reset' ? 'var(--accent)' : 'var(--bg-faint)',
                              color: resetInput.trim().toLowerCase() === 'reset' ? '#fff' : 'var(--text-faint)',
                              border: 'none',
                              fontSize: 13, fontWeight: 600,
                              cursor: resetInput.trim().toLowerCase() === 'reset' ? 'pointer' : 'not-allowed',
                            }}
                          >Reset</button>
                          <button
                            type="button"
                            onClick={() => { setResetPhase('idle'); setResetInput(''); }}
                            className="acct-btn-text"
                          >Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ── Preferences ────────────────────────────────────── */}
            {section === 'preferences' && (
              <section
                className="acct-section"
                role="tabpanel"
                id="acct-panel-preferences"
                aria-labelledby="acct-tab-preferences"
                tabIndex={0}
                data-active="true"
              >
                <div className="acct-section-header">
                  <h3 className="acct-section-title">Preferences</h3>
                  <p className="acct-section-sub">Changes save instantly.</p>
                </div>

                <Row
                  title="Appearance"
                  sub="Match your device or pick a fixed theme."
                >
                  <Segment>
                    <SegBtn pressed={!isDark} onClick={() => setAppearance('light')}>Light</SegBtn>
                    <SegBtn pressed={isDark} onClick={() => setAppearance('dark')}>Dark</SegBtn>
                    <SegBtn pressed={false} onClick={() => setAppearance('system')}>System</SegBtn>
                  </Segment>
                </Row>

                {/* "Start week on" Sun/Mon segment used to live here.
                    Removed 2026-04-26 — the Schedule grid on Overview
                    only ever shows Mon–Fri (weekends are skipped by
                    design), so picking a starting day was a meaningless
                    setting. If a real Sat/Sun-aware view ships later,
                    bring it back as part of that view's preferences. */}

                <Row
                  title="Time format"
                  sub="How due dates and meetings display."
                >
                  <Segment>
                    <SegBtn pressed={timeFmt === '12h'} onClick={() => setTimeFmt('12h')}>12-hour</SegBtn>
                    <SegBtn pressed={timeFmt === '24h'} onClick={() => setTimeFmt('24h')}>24-hour</SegBtn>
                  </Segment>
                </Row>
              </section>
            )}

            {/* ── Notifications ──────────────────────────────────── */}
            {section === 'notifications' && (
              <section
                className="acct-section"
                role="tabpanel"
                id="acct-panel-notifications"
                aria-labelledby="acct-tab-notifications"
                tabIndex={0}
                data-active="true"
              >
                <div className="acct-section-header">
                  <h3 className="acct-section-title">Notifications</h3>
                  <p className="acct-section-sub">We err on the side of quiet. Opt in to what's useful.</p>
                </div>

                <Row title="Daily email digest" sub="One email at 8:00 AM with what needs you today.">
                  <Toggle checked={notifDigest} onChange={setNotifDigest} label="Daily email digest" />
                </Row>
                <Row title="Weekly WIP reminder" sub="Monday morning nudge to prep your WIP meetings.">
                  <Toggle checked={notifWip} onChange={setNotifWip} label="Weekly WIP reminder" />
                </Row>
                <Row title="@Mentions & direct assignments" sub="Email when someone tags you or assigns you a card.">
                  <Toggle checked={notifMentions} onChange={setNotifMentions} label="Mentions and direct assignments" />
                </Row>
                <Row title="Overdue tasks" sub="Evening summary of anything slipping on your clients.">
                  <Toggle checked={notifOverdue} onChange={setNotifOverdue} label="Overdue tasks" />
                </Row>
                <Row title="In-app notifications" sub="The bell icon lights up. Always on by default.">
                  <Toggle checked={notifInapp} onChange={setNotifInapp} label="In-app notifications" />
                </Row>
              </section>
            )}

            {/* ── Sign-in ────────────────────────────────────────── */}
            {section === 'signin' && (
              <section
                className="acct-section"
                role="tabpanel"
                id="acct-panel-signin"
                aria-labelledby="acct-tab-signin"
                tabIndex={0}
                data-active="true"
              >
                <div className="acct-section-header">
                  <h3 className="acct-section-title">Sign-in</h3>
                  <p className="acct-section-sub">Flizow uses Google to sign you in. Your password lives with Google.</p>
                </div>
                <div className="acct-connected">
                  <div className="acct-connected-logo" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.3-1.67 3.8-5.5 3.8A5.9 5.9 0 0 1 6.1 12 5.9 5.9 0 0 1 12 6.1c1.9 0 3.2.8 4 1.5l2.7-2.6A9.3 9.3 0 0 0 12 2.5a9.5 9.5 0 1 0 0 19c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"/>
                      <path fill="#FBBC05" d="M6.1 12c0-.4 0-.8.1-1.2L3.5 8.8A9.5 9.5 0 0 0 2.5 12c0 1.5.4 2.9 1 4.2l2.7-2c-.1-.7-.1-1.4-.1-2.2z"/>
                      <path fill="#34A853" d="M12 21.5c2.6 0 4.7-.8 6.3-2.3l-2.7-2.1c-.8.5-1.9 1-3.6 1-2.8 0-5.2-1.9-6-4.4l-2.7 2c1.5 3 4.6 5.8 8.7 5.8z"/>
                      <path fill="#4285F4" d="M21.1 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5a4.7 4.7 0 0 1-2 3.1l2.7 2.1c1.6-1.5 2.9-3.7 2.9-7.5z"/>
                    </svg>
                  </div>
                  <div className="acct-connected-text">
                    <div className="acct-connected-label">Google</div>
                    <div className="acct-connected-email">{email}</div>
                  </div>
                  <a
                    className="acct-external-link"
                    href="https://myaccount.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
                  </a>
                </div>

                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--hairline)' }}>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    style={{
                      padding: '10px 18px', borderRadius: 8,
                      background: 'transparent',
                      border: '1px solid var(--hairline)',
                      color: 'var(--text)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >Sign out of Flizow</button>
                </div>
              </section>
            )}

          </div>
        </div>

        <footer className="acct-footer">
          <span className="acct-footer-status" role="status" aria-live="polite">{toast ?? ''}</span>
          <button type="button" className="acct-btn-text" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}

// ── Internal helpers ─────────────────────────────────────────────────

function NavItem({
  section, label, active, onClick, children,
}: {
  section: Section;
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // tabId / panelId pair so the section panels below can claim
  // aria-labelledby={tabId} and we can claim aria-controls={panelId}.
  // Closes the WAI-ARIA tabs pattern that was previously orphaned.
  // Audit: account HIGH (broken tab/tabpanel pairing).
  return (
    <button
      role="tab"
      type="button"
      className="acct-nav-item"
      id={`acct-tab-${section}`}
      aria-selected={active}
      aria-controls={`acct-panel-${section}`}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
    >
      {children}
      {label}
    </button>
  );
}

function Field({
  label, full, htmlFor, children,
}: {
  label: string;
  full?: boolean;
  /** id of the input the label should target. When provided, click on
   *  the label focuses the input and screen readers announce the
   *  pairing. Audit: account MED (orphaned labels). */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`acct-form-field${full ? ' acct-field-full' : ''}`}>
      <label className="acct-field-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function Row({
  title, sub, children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="acct-row">
      <div className="acct-row-text">
        <div className="acct-row-title">{title}</div>
        <div className="acct-row-sub">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function Segment({ children }: { children: React.ReactNode }) {
  return <div className="acct-segment" role="group">{children}</div>;
}

function SegBtn({
  pressed, onClick, children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="acct-segment-btn"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="acct-toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}
