import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Trap keyboard focus inside a modal while it is open.
 *
 * When a modal opens, Tab and Shift+Tab must wrap between the first and
 * last focusable descendant of the modal — otherwise a keyboard user
 * tabs past the modal and ends up focused on elements under the
 * backdrop, which is both confusing and a WCAG focus-order failure.
 *
 * The hook finds focusable descendants each time Tab fires so newly
 * rendered inputs (e.g., a picker that opens inside the modal) are
 * included automatically without re-registration.
 *
 * Also restores focus to the previously-focused element when the modal
 * unmounts, so dismissing a modal returns the user to where they were.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

export function useModalFocusTrap(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    // Remember where focus was before the modal took over; restore on
    // unmount so the user lands back on the button that opened it.
    const returnTo = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (returnTo && typeof returnTo.focus === 'function') {
        // Guard against the element having unmounted while the modal
        // was open — focus() on a detached node is a silent no-op but
        // the conditional keeps the intent legible.
        if (document.body.contains(returnTo)) returnTo.focus();
      }
    };
  }, [enabled, ref]);
}
