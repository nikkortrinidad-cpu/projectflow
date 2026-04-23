import { useEffect, useRef, useState } from 'react';

/**
 * Tiny themed dialog for "enter a URL" prompts. Replaces the native
 * `window.prompt(...)` calls that were scattered across the rich-text
 * toolbars (notes link, comment link, comment image).
 *
 * One component, two skins via `kind`:
 *   - 'link'  → "Insert link", placeholder "https://example.com"
 *   - 'image' → "Insert image", placeholder "https://example.com/photo.jpg"
 *
 * Behaviour matches the other Flizow wip-modal entries (AddQuickLinkModal
 * is the closest sibling): autofocus on mount, Esc closes, Cmd/Ctrl+Enter
 * saves, backdrop click closes, error flash when the URL is empty,
 * https:// auto-prepended when the user types a bare domain.
 */

interface Props {
  /** Determines title, placeholder, save-label, and helper copy. */
  kind: 'link' | 'image';
  /** Pre-fill — useful if you ever want to "edit" an existing link. */
  initialUrl?: string;
  /** Fires with the normalized URL. Dialog does not close itself —
   *  callers that want a one-shot can call onClose() from onInsert. */
  onInsert: (url: string) => void;
  onClose: () => void;
}

export function InsertLinkDialog({ kind, initialUrl = '', onInsert, onClose }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus + select on mount. Select-all covers the edit case cleanly
  // and is a no-op on empty fields. 80ms matches the other modals so
  // the focus doesn't fight the modal's mount animation.
  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

  function handleSave() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError(true);
      inputRef.current?.focus();
      window.setTimeout(() => setError(false), 1400);
      return;
    }
    // Normalize: bare domains become https://. Image URLs get the same
    // treatment — TipTap's Image extension needs a real URL, not a path.
    // Leave data: and blob: URLs alone so drag-drop handlers keep working
    // if we ever wire them through this dialog.
    const normalized = /^(https?:|data:|blob:|mailto:|tel:)/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    onInsert(normalized);
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const isImage = kind === 'image';
  const title = isImage ? 'Insert image' : 'Insert link';
  const placeholder = isImage ? 'https://example.com/photo.jpg' : 'https://example.com';
  const saveLabel = isImage ? 'Insert image' : 'Insert link';
  const helper = isImage
    ? 'Paste a direct image URL (png, jpg, gif, webp).'
    : 'Bare domains get an https:// prefix automatically.';

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="insert-link-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 440 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="insert-link-title">{title}</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body">
          <label className="wip-field">
            <span className="wip-field-label">URL</span>
            <input
              ref={inputRef}
              type="url"
              className="wip-field-input"
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (error) setError(false); }}
              placeholder={placeholder}
              style={error ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={error || undefined}
              autoComplete="off"
              spellCheck={false}
            />
            <span
              className="wip-field-hint"
              style={{
                display: 'block',
                marginTop: 6,
                fontSize: 'var(--fs-xs)',
                color: 'var(--text-faint)',
              }}
            >
              {helper}
            </span>
          </label>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="wip-btn wip-btn-primary" onClick={handleSave}>
            {saveLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
