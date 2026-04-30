import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * UndoToast — the 5-second "Item deleted [Undo]" affordance that
 * appears bottom-right after any soft-delete (and after the three
 * hard-delete-only types: checklist items, meeting captures,
 * notification dismissals — those rely on this for their only
 * recovery path).
 *
 * Why a context + provider rather than render-as-prop or a global
 * singleton:
 *   - The store doesn't own React state; we need a React-y way to
 *     show transient UI from any depth in the tree
 *   - A singleton (window-level event bus) would work but loses
 *     React's StrictMode double-render protection and is harder to
 *     test
 *   - Render-as-prop forces every caller to lift state, which is
 *     friction for the dozens of delete call sites this needs to
 *     plug into
 *
 * Usage:
 *   const toast = useUndoToast();
 *   toast.show({
 *     message: 'Note deleted',
 *     onUndo: () => flizowStore.restoreFromTrash(entryId),
 *   });
 *
 * Behavior:
 *   - 5-second auto-dismiss. Configurable per call via `duration` ms.
 *   - Only one toast visible at a time. A second show() while one is
 *     active replaces the first (the deferred onUndo is dropped — the
 *     user's most recent action gets the recovery path). This matches
 *     Gmail / Notion / Linear's behavior: they show the latest delete,
 *     not a queue.
 *   - Clicking Undo fires onUndo synchronously and dismisses the toast
 *     immediately so the user sees their action take effect.
 *   - The "X" close button dismisses without firing onUndo. Some users
 *     read the message and don't want to undo; closing is faster than
 *     waiting 5s.
 */

interface ShowToastArgs {
  /** Short message describing what was deleted. e.g. "Note deleted",
   *  "Comment deleted", "Card deleted". Plain — no rich content. */
  message: string;
  /** Fires when the user clicks Undo. The caller decides what
   *  "undo" means — restore from Trash, re-add a hard-deleted
   *  checklist item, etc. Idempotent expectation: if onUndo can't
   *  succeed (entry already purged), the caller should fail
   *  gracefully — the toast doesn't surface errors back. */
  onUndo: () => void;
  /** Override the default 5-second auto-dismiss. Used by tests +
   *  edge-case callers; left undefined for the standard delete path. */
  duration?: number;
}

interface ActiveToast extends ShowToastArgs {
  /** Unique id per toast invocation. Used as the React key so the
   *  toast remounts and re-runs its enter animation when a new
   *  delete fires while the previous one is still on-screen. */
  id: string;
}

interface UndoToastContextValue {
  show: (args: ShowToastArgs) => void;
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveToast | null>(null);
  // Hold the active toast's auto-dismiss timer so a follow-up show()
  // can clear it before kicking off the new one. setTimeout ids are
  // numbers in browsers; useRef avoids re-renders on assignment.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setActive(null);
  }, []);

  const show = useCallback((args: ShowToastArgs) => {
    // Clear any previous timer first so a back-to-back delete
    // doesn't dismiss the new toast on the old toast's clock.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setActive({ ...args, id });
    const duration = args.duration ?? DEFAULT_DURATION_MS;
    timerRef.current = setTimeout(() => {
      setActive(null);
      timerRef.current = null;
    }, duration);
  }, []);

  // Cleanup timer on unmount (StrictMode double-mount + provider
  // remount paths). Active toast naturally evaporates with the
  // provider; no re-fire on remount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <UndoToastContext.Provider value={{ show }}>
      {children}
      {active && (
        <UndoToast
          // key forces a fresh mount when a new toast replaces an
          // existing one — the slide-in animation re-fires so the
          // user notices the new toast against the old one.
          key={active.id}
          message={active.message}
          onUndo={() => {
            // Fire the user's callback first, then dismiss. If
            // onUndo throws we still dismiss — a stuck toast on a
            // failed restore would be worse than the silent miss.
            try {
              active.onUndo();
            } finally {
              dismiss();
            }
          }}
          onDismiss={dismiss}
        />
      )}
    </UndoToastContext.Provider>
  );
}

/** Subscribe to the toast API. Throws if used outside the provider —
 *  we want a loud failure here rather than silent no-op deletes. */
export function useUndoToast(): UndoToastContextValue {
  const ctx = useContext(UndoToastContext);
  if (!ctx) {
    throw new Error('useUndoToast must be used within <UndoToastProvider>');
  }
  return ctx;
}

// ── The toast itself ────────────────────────────────────────────────────

/**
 * The visible component. Lives inside the provider so the provider
 * controls when it mounts/unmounts. Pure — every interaction goes
 * through callbacks supplied by the provider.
 *
 * Layout matches the locked spec (vertical stacked, centered):
 *
 *     ╭──────────────╮
 *     │ Note deleted │
 *     │    [Undo]    │
 *     ╰──────────────╯
 *
 * Positioning is bottom-right via fixed positioning. Animates in
 * with a translate + opacity transition.
 */
function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="undo-toast"
      role="status"
      aria-live="polite"
    >
      <div className="undo-toast-message">{message}</div>
      <div className="undo-toast-actions">
        <button
          type="button"
          className="undo-toast-undo"
          onClick={onUndo}
          autoFocus
        >
          Undo
        </button>
      </div>
      {/* Close button is intentionally small + secondary — most
          users will let the auto-dismiss run. The X is for the
          minority who read "Note deleted" and want it gone faster
          than the 5-second timer. Positioned in the corner so it
          doesn't compete with the centered Undo button. */}
      <button
        type="button"
        className="undo-toast-close"
        onClick={onDismiss}
        aria-label="Dismiss"
        title="Dismiss"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
