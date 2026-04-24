import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Dismiss a popover / menu / dropdown on outside click or Escape.
 *
 * Consolidated from copy-paste `useEffect`s scattered across BoardPage
 * (crumb menu, members popover, board settings) and other pages. All of
 * them used the same `pointerdown` + `keydown` pattern — `pointerdown`
 * specifically (not `mousedown`) so touch and pen interactions fire the
 * same dismissal.
 *
 * The hook is inert while `open` is false: it attaches no listeners,
 * so dozens of popovers across a page pay nothing for their dismissal
 * plumbing until they actually open.
 *
 * Pass a second ref via `ignoreRef` to keep the popover open when the
 * user clicks a separate trigger button (e.g., a confirm-delete dialog
 * that lives outside the popover's own subtree).
 */
export function useDismissable(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  opts: { ignoreRef?: RefObject<HTMLElement | null> } = {},
) {
  const { ignoreRef } = opts;
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (ref.current && ref.current.contains(target)) return;
      if (ignoreRef?.current && ignoreRef.current.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, ref, ignoreRef]);
}
