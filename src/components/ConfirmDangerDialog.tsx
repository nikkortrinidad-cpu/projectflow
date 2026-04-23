import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Reusable "are you sure" dialog for destructive actions. Matches the
 * `wip-modal-*` pattern used by every other modal in the app so the shell
 * (backdrop, Esc-to-close, autofocus) reads the same.
 *
 * The confirm button is rendered in red rather than the blue primary to
 * signal "this is the dangerous one" — per design rule, we never use
 * color alone, so the label also says what it does ("Delete service",
 * "Delete card", etc.) rather than a generic "Confirm".
 *
 * Focus lands on the destructive button on open. Putting focus on the
 * *dangerous* action is the Apple pattern (Finder's "Move to Trash"
 * dialog does the same): the user arrived here by clicking delete, so
 * the default action should be the one they asked for, not an extra
 * reach to say yes a second time.
 *
 * Used today by:
 *   • Delete Service (ClientDetailPage services-strip edit mode)
 *   • Delete Card (FlizowCardModal toolbar menu)
 */
export function ConfirmDangerDialog({ title, body, confirmLabel, onConfirm, onClose }: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => confirmRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-danger-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 440 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="confirm-danger-title">{title}</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body" style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.55 }}>
          {body}
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="wip-btn"
            onClick={onConfirm}
            style={{
              background: '#ff453a',
              color: '#fff',
              borderColor: '#ff453a',
            }}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
