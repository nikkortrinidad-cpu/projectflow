import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';

/**
 * Brief modal — generic over what kind of brief is being edited.
 *
 * Used today by:
 *   • Board page (per-service project brief)
 *   • Ops page (workspace-level Ops brief)
 *
 * The title is whatever the caller wants to show ("Project Brief —
 * Web Redesign" / "Ops Brief"); onSave is the caller's persistence
 * choice (store.updateServiceBrief vs store.updateOpsBrief). The
 * modal stays unaware of which surface owns the brief — it only
 * knows about HTML in, HTML out.
 *
 * Save behaviour: explicit Save / Cancel buttons. Esc / backdrop / X
 * with unsaved edits prompts a discard confirmation; with no edits,
 * closes silently. Loss of accidental work is the failure mode that
 * matters most here — these can be hours of writing.
 *
 * Width: 960px. Wider than the 640px Add Client modal because the
 * brief is a reading-and-writing surface, not a form. Comfortable
 * 60–70cpl line length at body text size.
 */
export function BriefModal({
  title,
  subtitle,
  initialBrief,
  onSave,
  onClose,
}: {
  /** Modal heading. e.g. "Project Brief" — call-site decides. */
  title: string;
  /** Soft caption next to the title — e.g. service name on a per-
   *  service brief, or undefined when the title is self-sufficient. */
  subtitle?: string;
  /** HTML string. Empty/undefined renders the placeholder. */
  initialBrief?: string;
  /** Called with the new HTML when the user clicks Save. The modal
   *  closes itself after — caller's onClose runs as part of the
   *  normal close path. */
  onSave: (html: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(dialogRef);

  // Inline confirm state. Shown when the user tries to close with
  // unsaved edits — local to the modal so we don't stack a second
  // ConfirmDangerDialog on top.
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { rel: 'noreferrer noopener', target: '_blank' },
      }),
      Placeholder.configure({
        placeholder: 'Write the brief — goals, audience, scope, success metrics…',
      }),
    ],
    content: initialBrief || '',
    editorProps: {
      attributes: {
        // Reuses .notes-body-editor styling (h1/h2/p/li typography +
        // is-editor-empty placeholder rule) so the brief editor inherits
        // every text-treatment rule the Notes tab already uses. The
        // .brief-modal-editor hook is left empty in CSS today — kept as
        // a future override surface if the brief surface ever needs to
        // diverge from the notes one.
        class: 'brief-modal-editor notes-body-editor',
        'aria-label': 'Project brief body',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
  });

  // Dirty check — compare the editor's current HTML against the
  // snapshot we opened with. TipTap's getHTML() is the same string the
  // store would persist, so equality on it is the right signal.
  const isDirty = editor
    ? editor.getHTML() !== (initialBrief || '<p></p>')
    : false;

  function handleSave() {
    if (!editor) return;
    onSave(editor.getHTML());
    onClose();
  }

  function handleCancelClick() {
    // Cancel button is a deliberate "throw away changes" — no confirm.
    // (The button label tells the user what's about to happen.)
    onClose();
  }

  function handleSoftClose() {
    // Esc / backdrop / X. If dirty, prompt; if clean, close silently.
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }

  // Esc handler. Tied to `isDirty` so the prompt path runs only when
  // there's something to lose.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleSoftClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) handleSoftClose();
  }

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="brief-modal-title"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="wip-modal"
        role="document"
        // 960 wide is the "wider than form modals" call we made — gives
        // the editor a comfortable 60–70cpl line length at body text.
        // 85vh max-height + the body's flex:1 + the editor's
        // overflow-y:auto lets long briefs scroll inside the modal
        // instead of pushing the footer off-screen.
        style={{ maxWidth: 960, width: '94vw', maxHeight: '85vh' }}
      >
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="brief-modal-title">
            {title}
            {subtitle && (
              <span style={{
                marginLeft: 12,
                fontSize: 'var(--fs-md)',
                fontWeight: 400,
                color: 'var(--text-soft)',
                letterSpacing: '-0.005em',
              }}>
                {subtitle}
              </span>
            )}
          </h2>
          <button type="button" className="wip-modal-close" onClick={handleSoftClose} aria-label="Close">
            <XMarkIcon width={14} height={14} aria-hidden="true" />
          </button>
        </header>

        <div
          className="wip-modal-body"
          // padding:0 + flex:1 + minHeight:0 hand the height budget to
          // the EditorContent's own overflow:auto. The editor's class
          // (.notes-body-editor) already provides comfortable inner
          // padding (18px 28px 16px), so wrapping with more would
          // double-pad the brief surface.
          style={{ padding: 0, flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          <EditorContent editor={editor} />
        </div>

        <footer className="wip-modal-foot">
          {showDiscardConfirm ? (
            <>
              <span style={{
                marginRight: 'auto',
                fontSize: 'var(--fs-md)',
                color: 'var(--status-fire)',
                fontWeight: 500,
              }}>
                Discard unsaved changes?
              </span>
              <button
                type="button"
                className="wip-btn wip-btn-ghost"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="wip-btn"
                style={{
                  background: 'var(--status-fire)',
                  borderColor: 'var(--status-fire)',
                  color: '#fff',
                }}
                onClick={onClose}
              >
                Discard
              </button>
            </>
          ) : (
            <>
              <button type="button" className="wip-btn wip-btn-ghost" onClick={handleCancelClick}>
                Cancel
              </button>
              <button
                type="button"
                className="wip-btn wip-btn-primary"
                onClick={handleSave}
                disabled={!isDirty}
              >
                Save brief
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
