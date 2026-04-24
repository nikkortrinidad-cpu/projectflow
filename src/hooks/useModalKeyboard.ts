import { useEffect } from 'react';

/**
 * Global keyboard shortcuts while a modal is open.
 *
 * - **Escape** → `onClose` (always). Preserves the "Esc closes any modal"
 *   expectation every UI should honour.
 * - **⌘/Ctrl+Enter** → `onSave` (when provided). Lets a user save from
 *   any input in the modal without having to Tab back to the primary
 *   button. Follows the pattern the hand-rolled copies in WipPage,
 *   EditServiceModal and others converged on before extraction.
 *
 * Listeners are bound to `window` so they work regardless of which field
 * inside the modal holds focus. The hook re-binds whenever `onClose` or
 * `onSave` identity changes — callers should memoise them or accept the
 * small rebind cost per render.
 */
export function useModalKeyboard(opts: {
  onClose: () => void;
  onSave?: () => void;
  /** When false, neither shortcut fires. Useful to suspend the layer
   *  while a nested confirm dialog is open. */
  enabled?: boolean;
}) {
  const { onClose, onSave, enabled = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (onSave && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onSave, enabled]);
}
