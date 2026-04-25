import { useEffect, useRef, useState } from 'react';

/**
 * Inline "+ Add Card" composer used at the bottom of a To-Do column.
 *
 * Before extraction, BoardPage.AddCardInline and OpsPage.AddOpsCardInline
 * were ~55 lines of near-identical JSX each. The only real difference
 * was the shape of the object the caller wrote to the store — everything
 * about the composer itself (closed-state button, open-state textarea,
 * Enter-submits, Shift+Enter-newlines, Escape-cancels, disabled-until-
 * non-empty primary button) was duplicated.
 *
 * This component owns the UX. The caller owns the write: `onSubmit`
 * receives only the trimmed title and is responsible for building the
 * task object and calling its store. That keeps the composer free of
 * task-shape knowledge — it works equally well for client tasks, ops
 * tasks, or anything future we want to inline-create.
 *
 * Placement rule (from the house design memo): the composer only
 * renders in the To Do column. Other columns are inboxes for existing
 * work, not entry points. This component doesn't enforce that — the
 * caller is expected to gate rendering on columnId === 'todo'.
 */
interface Props {
  onSubmit: (title: string) => void;
  placeholder?: string;
  /** Primary button label. Default: "Add card". */
  submitLabel?: string;
}

export function InlineCardComposer({
  onSubmit,
  placeholder = 'What needs to get done?',
  submitLabel = 'Add card',
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea the moment the composer opens. Running on
  // every open transition (not just mount) means re-opening after
  // Cancel focuses again, which is what the user expects.
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    onSubmit(trimmed);
    setTitle('');
    setOpen(false);
  }

  function cancel() {
    setOpen(false);
    setTitle('');
  }

  if (!open) {
    return (
      <button type="button" className="add-card-btn" onClick={() => setOpen(true)}>
        ＋ Add Card
      </button>
    );
  }

  const hasContent = title.trim().length > 0;

  return (
    <div className="inline-card-composer">
      <textarea
        ref={inputRef}
        className="inline-card-composer-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits; Shift+Enter adds a newline (textarea default).
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          if (e.key === 'Escape') cancel();
        }}
        placeholder={placeholder}
        rows={2}
      />
      <div className="inline-card-composer-actions">
        <button type="button" className="btn-sm" onClick={cancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn-sm inline-card-composer-submit${hasContent ? ' is-ready' : ''}`}
          onClick={submit}
          disabled={!hasContent}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
