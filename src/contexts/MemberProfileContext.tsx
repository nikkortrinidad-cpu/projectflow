import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from 'react';

// Lazy-import the panel so its bundle (Heroicons set, format helpers,
// capacity utils) only loads when a profile is actually opened. The
// provider itself is in the main chunk because it has to be at the
// app root for the hook to work everywhere.
const MemberProfilePanel = lazy(() =>
  import('../components/MemberProfilePanel').then(m => ({ default: m.MemberProfilePanel })),
);

/**
 * MemberProfileContext — owns the "currently open profile" state for
 * the side-panel sheet that slides in when any member avatar is
 * clicked. Sits at the app root inside AuthProvider so any component
 * can subscribe via useMemberProfile() without lifting state through
 * the tree.
 *
 * One profile open at a time. Opening a second profile while one is
 * showing simply swaps the active id — no stacked panels, no queue,
 * matches how Slack / Notion handle profile popovers.
 *
 * Usage:
 *   const profile = useMemberProfile();
 *   <button onClick={() => profile.open(member.id)}>...</button>
 *
 * The panel itself reads { activeId, close } and renders against the
 * live store (via useFlizow) so any edit a peer makes lands in the
 * panel without a refetch.
 */

interface MemberProfileContextValue {
  /** id of the currently-displayed member, or null when closed. */
  activeId: string | null;
  /** Open the panel for this member id. Replaces any currently-
   *  active profile. Pass null or '' to close (same as close()). */
  open: (memberId: string | null) => void;
  /** Close the panel. */
  close: () => void;
}

const MemberProfileContext = createContext<MemberProfileContextValue | null>(null);

export function MemberProfileProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const open = useCallback((memberId: string | null) => {
    setActiveId(memberId && memberId.length > 0 ? memberId : null);
  }, []);

  const close = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <MemberProfileContext.Provider value={{ activeId, open, close }}>
      {children}
      {/* Panel renders lazily once a profile is opened. Suspense
          fallback is null — the slide-in animation absorbs the
          one-frame load delay so users don't see a flicker.
          Gated on activeId so the chunk doesn't load until needed. */}
      {activeId && (
        <Suspense fallback={null}>
          <MemberProfilePanel />
        </Suspense>
      )}
    </MemberProfileContext.Provider>
  );
}

/** Subscribe to the profile-panel API. Throws when used outside the
 *  provider — loud failure beats silent no-op clicks on avatars. */
export function useMemberProfile(): MemberProfileContextValue {
  const ctx = useContext(MemberProfileContext);
  if (!ctx) {
    throw new Error('useMemberProfile must be used within <MemberProfileProvider>');
  }
  return ctx;
}
