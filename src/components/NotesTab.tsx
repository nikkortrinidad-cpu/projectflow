import { useEffect, useMemo, useRef, useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import type { Note } from '../types/flizow';
import type { FlizowStore } from '../store/flizowStore';
import { ConfirmDangerDialog } from './ConfirmDangerDialog';
import { InsertLinkDialog } from './InsertLinkDialog';

/**
 * Notes tab for Client Detail. Two-pane Apple-Notes layout: searchable
 * list on the left, a single TipTap editor on the right.
 *
 * Auto-save debounces ~400ms after typing stops — long enough that we're
 * not thrashing Firestore, short enough that the user can navigate away
 * and trust the body landed. The store's own Firestore debounce adds
 * another layer on top, so worst case we're writing once per ~1.4s of
 * activity.
 *
 * Data flow:
 *   - parent passes the full notes array + clientId
 *   - selection is local state, resets on clientId change
 *   - editor content swaps via editor.commands.setContent when selection
 *     changes; we guard the onUpdate handler against that swap so it
 *     doesn't loop-save the note we just loaded
 */

interface Props {
  clientId: string;
  notes: Note[];
  store: FlizowStore;
  /** When true, the "Notes" title in the section header is hidden —
   *  the "+ New note" button still renders, just right-aligned with
   *  the title slot empty. Used by the Ops page where the tab itself
   *  is already labeled "Notes," so an extra title underneath reads
   *  as redundant. Client Detail leaves this off so the section
   *  anchors itself within the longer scrolling page where Notes is
   *  one of several stacked sections. Audit: ops MED. */
  hideSectionTitle?: boolean;
}

export function NotesTab({ clientId, notes, store, hideSectionTitle = false }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Clear selection when the visible client changes. Without this, a
  // stale id from the previous client would point at a note in this
  // client's list only by coincidence (and usually nothing at all).
  useEffect(() => { setSelectedId(null); setQuery(''); }, [clientId]);

  const clientNotes = useMemo(
    () => notes.filter(n => n.clientId === clientId),
    [notes, clientId],
  );

  const filtered = useMemo(() => filterNotes(clientNotes, query), [clientNotes, query]);

  // Auto-focus the newest note if none selected — mirrors how Apple
  // Notes opens to the last edited one rather than an empty pane.
  const activeId = selectedId ?? pickDefault(filtered)?.id ?? null;
  const active = activeId ? clientNotes.find(n => n.id === activeId) ?? null : null;

  const pinned = filtered.filter(n => n.pinned);
  const rest   = filtered.filter(n => !n.pinned);

  const handleNew = () => {
    const now = new Date().toISOString();
    const id = `${clientId}-note-${Date.now().toString(36)}`;
    store.addNote({
      id,
      clientId,
      body: '',
      pinned: false,
      createdAt: now,
      updatedAt: now,
    });
    setSelectedId(id);
  };

  const handleDelete = (id: string) => {
    store.deleteNote(id);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="detail-section notes-section" data-tab="notes">
      <div className="detail-section-header">
        {!hideSectionTitle && <div className="detail-section-title">Notes</div>}
        <button type="button" className="notes-new-btn" onClick={handleNew}>
          <PlusIcon aria-hidden="true" />
          New note
        </button>
      </div>

      <div className="notes-app">
        <aside className="notes-sidebar">
          <label className="notes-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
            />
          </label>

          <div className="notes-list">
            {filtered.length === 0 ? (
              // aria-live="polite" announces "Nothing matches that
              // search." after a search filters the list to zero,
              // so a screen reader user typing in the search box
              // hears the result instead of staring at silence.
              // Audit: notes MED (silent search empty state).
              <div className="notes-list-empty" role="status" aria-live="polite">
                {clientNotes.length === 0
                  ? 'No notes yet. Press New note to start one.'
                  : 'Nothing matches that search.'}
              </div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <>
                    <div className="notes-list-group-label">Pinned</div>
                    {pinned.map(n => (
                      <NoteListItem
                        key={n.id} note={n} active={n.id === activeId}
                        onSelect={() => setSelectedId(n.id)}
                      />
                    ))}
                  </>
                )}
                {rest.length > 0 && (
                  <>
                    {pinned.length > 0 && <div className="notes-list-group-label">Notes</div>}
                    {rest.map(n => (
                      <NoteListItem
                        key={n.id} note={n} active={n.id === activeId}
                        onSelect={() => setSelectedId(n.id)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </aside>

        <div className="notes-editor">
          {active ? (
            <NoteEditor
              key={active.id}
              note={active}
              store={store}
              onDelete={() => handleDelete(active.id)}
            />
          ) : (
            <EmptyEditor hasNotes={clientNotes.length > 0} onNew={handleNew} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar list item ─────────────────────────────────────────────────────

function NoteListItem({ note, active, onSelect }: {
  note: Note;
  active: boolean;
  onSelect: () => void;
}) {
  const title = deriveTitle(note.body);
  const preview = derivePreview(note.body, title);
  return (
    <div
      className="notes-list-item"
      data-active={active ? 'true' : undefined}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
    >
      <div className="notes-list-title-row">
        {note.pinned && (
          <svg className="notes-list-pin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l2.39 6.26 6.61.58-5 4.38L17.5 20 12 16.5 6.5 20l1.5-6.78-5-4.38 6.61-.58z" />
          </svg>
        )}
        <span className="notes-list-title">{title || 'New note'}</span>
      </div>
      <div className="notes-list-meta">
        <span className="notes-list-date">{formatRelative(note.updatedAt)}</span>
        <span className="notes-list-preview">{preview || 'Empty'}</span>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyEditor({ hasNotes, onNew }: { hasNotes: boolean; onNew: () => void }) {
  return (
    <div className="notes-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
      </svg>
      <div className="notes-empty-title">
        {hasNotes ? 'Pick a note to read' : 'No notes yet'}
      </div>
      <div className="notes-empty-sub">
        {hasNotes
          ? 'Choose one from the list on the left.'
          : 'Add your first note to start.'}
      </div>
      {/* Inline CTA only shows on the truly-empty state (no notes
          anywhere). When the user has notes but hasn't picked one,
          the sub copy already nudges them to the list — adding a
          second action would compete with that. Previously the
          button was inlined inside the prose ("Press [+ New note]
          to start one") which rendered the full primary-CTA button
          mid-sentence at full size. It looked broken because it
          basically was. Promoted to a proper standalone CTA. */}
      {!hasNotes && (
        <button
          type="button"
          className="notes-new-btn"
          onClick={onNew}
        >
          <PlusIcon aria-hidden="true" />
          New note
        </button>
      )}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────

/**
 * Per-note editor. A fresh editor instance per note id (via key={id} in
 * the parent) keeps us from having to race setContent/onUpdate. The
 * cost is spinning up TipTap on every selection change — cheap enough
 * against a simple StarterKit config.
 */
function NoteEditor({ note, store, onDelete }: {
  note: Note;
  store: FlizowStore;
  onDelete: () => void;
}) {
  const [savedLabel, setSavedLabel] = useState<string>('All changes saved');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Delete-confirm lives at the editor level so the dialog's Escape /
  // backdrop / focus handling doesn't collide with the editor's own
  // key bindings. Native window.confirm would bypass dark mode and the
  // themed shell we use for every other destructive action.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
        placeholder: 'Start writing…',
      }),
    ],
    content: note.body || '',
    editable: !note.locked,
    editorProps: {
      // aria-label gives the contentEditable an accessible name so
      // screen reader users land on "Note body, edit text" instead of
      // a nameless "edit text" region. role="textbox" + aria-multiline
      // make the widget category explicit. Audit: notes HIGH (editor
      // had no accessible name).
      attributes: {
        class: 'notes-body-editor',
        'aria-label': 'Note body',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: ed }) => {
      setSavedLabel('Saving…');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        // TipTap's getHTML() can throw if the doc is in a bad state
        // (corrupt content, custom marks the schema doesn't know).
        // Without a guard, the timer callback throws unhandled and
        // the next save never fires — the user keeps typing and
        // savedLabel sticks at "Saving…" forever. Audit: notes MED.
        try {
          store.updateNote(note.id, { body: ed.getHTML() });
          setSavedLabel('All changes saved');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[NotesTab] failed to serialise editor HTML:', err);
          setSavedLabel("Couldn't save — your last changes may not have persisted");
        }
      }, 400);
    },
  });

  // Editable flag changes when the user toggles the lock — reflect that
  // on the live editor instance without remounting.
  useEffect(() => {
    editor?.setEditable(!note.locked);
  }, [editor, note.locked]);

  // On unmount, flush any pending save so a tab-switch doesn't lose the
  // last few characters. getHTML() guarded — see onUpdate above for
  // why. A flush failure here is silent because the unmount path can't
  // surface a savedLabel update anymore.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (editor) {
          try {
            store.updateNote(note.id, { body: editor.getHTML() });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[NotesTab] flush on unmount failed:', err);
          }
        }
      }
    };
  }, [editor, note.id, store]);

  if (!editor) return null;

  return (
    <div className="notes-editor-panel">
      <div className="notes-editor-header">
        <span className="notes-date">
          {formatFullDate(note.updatedAt)} · edited {formatRelative(note.updatedAt)}
        </span>
        <div className="notes-editor-actions">
          <button
            type="button"
            className="notes-icon-btn"
            data-active={note.pinned ? 'true' : undefined}
            onClick={() => store.toggleNotePinned(note.id)}
            title={note.pinned ? 'Unpin' : 'Pin'}
            aria-pressed={note.pinned}
            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          >
            <svg viewBox="0 0 24 24" fill={note.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2l2.39 6.26 6.61.58-5 4.38L17.5 20 12 16.5 6.5 20l1.5-6.78-5-4.38 6.61-.58z" />
            </svg>
          </button>
          <button
            type="button"
            className="notes-icon-btn"
            data-active={note.locked ? 'true' : undefined}
            onClick={() => store.toggleNoteLocked(note.id)}
            title={note.locked ? 'Unlock to edit' : 'Lock (read-only)'}
            aria-pressed={!!note.locked}
            aria-label={note.locked ? 'Unlock note' : 'Lock note'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              {note.locked
                ? <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                : <path d="M8 11V8a4 4 0 0 1 8 0" />}
            </svg>
          </button>
          <button
            type="button"
            className="notes-icon-btn notes-icon-btn--danger"
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete note"
            aria-label="Delete note"
          >
            <TrashIcon aria-hidden="true" />
          </button>
        </div>
      </div>

      <Toolbar editor={editor} disabled={!!note.locked} />

      <EditorContent editor={editor} />

      {/* role="status" + aria-live="polite" so screen readers
          announce save state changes ("Saving…" → "All changes
          saved") without stealing focus. The lock state is static
          per-note so it doesn't need announcement — but we leave the
          live region in either branch so the polite queue stays
          consistent. Audit: notes HIGH (silent autosave). */}
      <div
        className="notes-editor-footer"
        role="status"
        aria-live="polite"
        style={{
          padding: '8px 16px',
          fontSize: 'var(--fs-sm)',
          color: 'var(--text-faint)',
          borderTop: '1px solid var(--hairline-soft)',
        }}
      >
        {note.locked ? 'Locked — read-only' : savedLabel}
      </div>

      {showDeleteConfirm && (() => {
        // Use the first non-empty line as the note's title in the dialog
        // so the user knows which note they're about to drop. Falls back
        // to "Untitled note" when the note is still empty.
        const title = deriveTitle(note.body).trim();
        const displayTitle = title || 'Untitled note';
        return (
          <ConfirmDangerDialog
            title={`Delete "${displayTitle}"?`}
            body="This removes the note from this client permanently."
            confirmLabel="Delete note"
            onConfirm={() => {
              setShowDeleteConfirm(false);
              onDelete();
            }}
            onClose={() => setShowDeleteConfirm(false)}
          />
        );
      })()}
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────

function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  // Insert-link dialog state lives on the toolbar so the button can flip
  // to the dialog without lifting through NoteEditor. wip-modal-overlay is
  // fixed-position so it renders above everything regardless of where we
  // mount it in the tree.
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const btn = (
    key: string, label: string, active: boolean, run: () => void, icon: React.ReactNode,
  ) => (
    <button
      key={key}
      type="button"
      className="notes-fmt-btn"
      data-active={active ? 'true' : undefined}
      onClick={run}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div className="notes-toolbar" role="toolbar" aria-label="Formatting">
      {btn('h2', 'Heading', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16M4 18V6M20 18V6" /></svg>
      )}
      {btn('h3', 'Sub-heading', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 10h12M6 14h8M6 18V6M18 18V6" /></svg>
      )}
      <span className="notes-toolbar-divider" />
      {btn('b', 'Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(),
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" /></svg>
      )}
      {btn('i', 'Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(),
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 4h-9M14 20H5M15 4L9 20" /></svg>
      )}
      {btn('s', 'Strikethrough', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(),
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16M7 7a4 4 0 0 1 8 0M17 17a4 4 0 0 1-8 0" /></svg>
      )}
      <span className="notes-toolbar-divider" />
      {btn('ul', 'Bullet list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(),
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="9" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="9" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>
      )}
      {btn('ol', 'Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(),
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></svg>
      )}
      <span className="notes-toolbar-divider" />
      {btn('link', 'Link', editor.isActive('link'), () => {
        // If the caret already sits inside a link, treat the button as
        // "remove link" — matches the toggle pattern of every other
        // formatting button in the row. Otherwise flip open the themed
        // URL dialog.
        if (editor.isActive('link')) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        setLinkDialogOpen(true);
      }, <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
      )}

      {linkDialogOpen && (
        <InsertLinkDialog
          kind="link"
          onInsert={(url) => {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
          onClose={() => setLinkDialogOpen(false)}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Strip HTML, take first non-empty line, truncate. Kept generous — the
 *  sidebar's ellipsis does the visual truncation. */
function deriveTitle(html: string): string {
  const text = stripTags(html).trim();
  if (!text) return '';
  const firstLine = text.split(/\n|\r/).find(l => l.trim().length > 0) ?? '';
  return firstLine.slice(0, 80);
}

function derivePreview(html: string, title: string): string {
  const text = stripTags(html).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const after = title && text.startsWith(title) ? text.slice(title.length).trim() : text;
  return after.slice(0, 160);
}

function stripTags(html: string): string {
  // Browser-side only — we don't SSR. innerText respects <br>, <p>, <div>
  // line breaks the way a user would read them, which deriveTitle wants.
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.innerText;
}

/** Filter on stripped-text for forgiveness (users shouldn't need to type
 *  HTML-aware queries). Case-insensitive, matches anywhere in the body.
 *  Sorts pinned first, newest next — mirrors pickDefault's preference so
 *  "top of the list" and "default selection" agree. */
function filterNotes(notes: Note[], rawQuery: string): Note[] {
  const q = rawQuery.trim().toLowerCase();
  const sorted = notes.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  if (!q) return sorted;
  return sorted.filter(n => stripTags(n.body).toLowerCase().includes(q));
}

/** Default selection when the user hasn't explicitly picked one. The
 *  topmost pinned note wins; otherwise the most recently edited. */
function pickDefault(sorted: Note[]): Note | null {
  return sorted.find(n => n.pinned) ?? sorted[0] ?? null;
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
