import { useEffect, useRef, useState } from 'react';

/**
 * Inline-editable single-line text. Renders as plain text by default;
 * click → becomes an input; Enter or blur commits; Esc reverts.
 *
 * House rule (per the no-pencil design memo): no pencil icons. The
 * affordance is cursor:text on hover + a soft background tint + a
 * focus ring on the active editor. The user finds editability by
 * pointing at the text — same pattern as the breadcrumb rename and
 * the client hero name.
 *
 * `disabled` lets a parent gate the affordance behind a permission
 * check (e.g., the templates editor wraps every InlineText in
 * `useCanEditTemplates()` — false there means the field renders as
 * plain read-only text).
 *
 * Empty-string commits are silently rejected — the field reverts to
 * its previous value. The caller can override with
 * `allowEmpty: true` when an empty value is meaningful (rare).
 */
export function InlineText({
  value,
  onSave,
  disabled = false,
  allowEmpty = false,
  placeholder,
  className,
  ariaLabel,
  multiline = false,
}: {
  value: string;
  onSave: (next: string) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** When true, renders a textarea instead of an input — Enter
   *  inserts a newline (Shift+Enter still commits, matching the
   *  card composer's gesture). */
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Sync draft to incoming value when not editing — covers the case
  // where the parent re-renders with a fresh value from the store
  // mid-mount (e.g., a different template selected).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Focus + select-all when entering edit mode. rAF so the input is
  // in the DOM before we reach for it.
  useEffect(() => {
    if (!editing) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (inputRef.current && 'select' in inputRef.current) {
        inputRef.current.select();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [editing]);

  function commit() {
    const next = draft;
    if (!allowEmpty && !next.trim()) {
      setDraft(value);
      setEditing(false);
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    onSave(next);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (disabled) {
    // Read-only mode: render as plain text, no affordances.
    return <span className={className}>{value || placeholder || ''}</span>;
  }

  if (!editing) {
    return (
      <span
        className={`${className ?? ''} inline-text-readonly`}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ? `${ariaLabel} (click to edit)` : 'Click to edit'}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {value || (
          <span className="inline-text-placeholder">{placeholder ?? 'Click to edit…'}</span>
        )}
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        className={`${className ?? ''} inline-text-input`}
        value={draft}
        rows={2}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Shift+Enter commits (mirrors card composer); plain Enter
          // adds a newline. Esc reverts.
          if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      className={`${className ?? ''} inline-text-input`}
      type="text"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
    />
  );
}
