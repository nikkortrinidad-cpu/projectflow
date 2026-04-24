import { useCallback } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * Make a non-button element keyboard-activatable.
 *
 * Non-semantic elements (`<div>` with `role="button"` + `tabIndex={0}`)
 * are focusable but do NOT respond to Enter/Space by default — only real
 * `<button>` elements do. Without an explicit `onKeyDown`, tab-to-focus
 * works but Enter does nothing, locking out keyboard-only users.
 *
 * This hook returns the spreadable props to attach to such a row so the
 * trio (role, tabIndex, onKeyDown) is always consistent. Prefer a real
 * `<button>` when the element is semantically a button and styling
 * permits it; use this helper when the row is a larger composite that
 * wraps other interactive children.
 *
 * Pass `label` to set an `aria-label` in one place alongside the rest.
 *
 * @example
 *   <div {...activatableRowProps(openCard, { label: 'Open card: Build CI' })}>
 *     …
 *   </div>
 */
export function useActivatableRow(
  onActivate: (e: KeyboardEvent<HTMLElement>) => void,
  opts: { label?: string; disabled?: boolean } = {},
) {
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (opts.disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate(e);
      }
    },
    // onActivate + disabled are the only inputs; label is forwarded statically.
    [onActivate, opts.disabled],
  );

  return {
    role: 'button' as const,
    tabIndex: opts.disabled ? -1 : 0,
    onKeyDown,
    'aria-label': opts.label,
    'aria-disabled': opts.disabled || undefined,
  };
}
