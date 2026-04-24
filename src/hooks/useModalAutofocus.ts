import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Auto-focus an input/textarea/contenteditable element after a modal
 * mounts. Runs once on mount.
 *
 * The delay exists because focus set during the same frame as the modal's
 * enter transition can be eaten by the transition or — on Safari — cause
 * a visible flash as the focus ring jumps. 80ms is the empirically-picked
 * value from the original hand-rolled copies; it sits just past the
 * transition's first paint without being long enough for a user to
 * notice the lag.
 *
 * When `select` is true, the field's full value is selected after focus,
 * which is the right default for "open modal, fix the typo, press Enter"
 * flows (e.g., rename service).
 */
export function useModalAutofocus(
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement | HTMLElement | null>,
  opts: { select?: boolean; delayMs?: number } = {},
) {
  const { select = false, delayMs = 80 } = opts;
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (select && 'select' in el && typeof el.select === 'function') {
        el.select();
      }
    }, delayMs);
    return () => window.clearTimeout(t);
    // Intentional: fire-once on mount. ref.current is mutable and we
    // don't want to refocus every time the caller reassigns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
