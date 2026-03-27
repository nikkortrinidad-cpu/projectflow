import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface Props {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  headerRight?: React.ReactNode;
}

// Configure marked for converting legacy markdown content
marked.setOptions({ breaks: true, gfm: true });

function markdownToHtml(md: string): string {
  // If content already looks like HTML, return as-is
  if (md.startsWith('<') && (md.includes('</p>') || md.includes('</h'))) return md;
  const raw = marked.parse(md);
  if (typeof raw !== 'string') return '';
  return DOMPurify.sanitize(raw);
}

export function MarkdownEditor({ value, onChange, maxLength, placeholder, headerRight }: Props) {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline hover:text-primary-dark' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'max-w-full rounded-lg my-2' },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Add a description...',
      }),
    ],
    content: value ? markdownToHtml(value) : '',
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[280px] p-3 text-sm text-slate-600 dark:text-slate-300 prose-editor',
      },
      handleKeyDown: (_view, event) => {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && event.altKey && event.key >= '0' && event.key <= '5') {
          event.preventDefault();
          const level = parseInt(event.key);
          if (level === 0) {
            editor?.chain().focus().setParagraph().run();
          } else {
            editor?.chain().focus().toggleHeading({ level: level as 1|2|3|4|5 }).run();
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const textLen = ed.getText().length;
      if (textLen > maxLength) {
        // Truncate by reverting
        ed.commands.undo();
        return;
      }
      isInternalUpdate.current = true;
      const html = ed.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
  });

  // Sync external value changes (only if not from our own update)
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value ? markdownToHtml(value) : '');
    }
  }, [value, editor]);

  // Close heading dropdown on outside click
  useEffect(() => {
    if (!showHeadingMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (headingMenuRef.current && !headingMenuRef.current.contains(e.target as Node)) {
        setShowHeadingMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showHeadingMenu]);

  const handleHeading = useCallback((level: number) => {
    if (!editor) return;
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1|2|3|4|5 }).run();
    }
    setShowHeadingMenu(false);
  }, [editor]);

  const handleLink = useCallback(() => {
    if (!editor) return;
    const url = prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const handleImage = useCallback(() => {
    if (!editor) return;
    const url = prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const headingShortcut = (n: number) => isMac ? `\u2325\u2318${n}` : `Ctrl+Alt+${n}`;

  const charCount = editor ? editor.getText().length : 0;

  const toolBtn = (active: boolean) =>
    `w-8 h-8 flex items-center justify-center rounded transition ${
      active
        ? 'bg-primary/15 text-primary'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200'
    }`;

  if (!editor) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          Description
        </label>
        {headerRight}
      </div>

      <>
          <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-600 border-b-0 rounded-t-lg bg-slate-50 dark:bg-slate-700 px-2 py-1.5">
            {/* Heading dropdown */}
            <div className="relative" ref={headingMenuRef}>
              <button
                onClick={(e) => { e.preventDefault(); setShowHeadingMenu(!showHeadingMenu); }}
                title="Text style"
                className="h-8 flex items-center gap-1 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition px-2"
              >
                <span className="text-[13px] font-bold leading-none">H</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showHeadingMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-50 py-1 w-52 overflow-hidden">
                  {[
                    { level: 0, label: 'Plain Text', className: 'text-xs' },
                    { level: 1, label: 'Heading 1', className: 'text-base font-bold' },
                    { level: 2, label: 'Heading 2', className: 'text-sm font-bold' },
                    { level: 3, label: 'Heading 3', className: 'text-[13px] font-semibold' },
                    { level: 4, label: 'Heading 4', className: 'text-xs font-semibold' },
                    { level: 5, label: 'Heading 5', className: 'text-[11px] font-semibold' },
                  ].map(h => (
                    <button
                      key={h.level}
                      onClick={(e) => { e.preventDefault(); handleHeading(h.level); }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition ${h.className}`}
                    >
                      <span>{h.label}</span>
                      <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 ml-3">{headingShortcut(h.level)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-1.5" />

            {/* Bold */}
            <button onClick={() => editor.chain().focus().toggleBold().run()}
              title={`Bold (${isMac ? '\u2318' : 'Ctrl+'}B)`}
              className={toolBtn(editor.isActive('bold'))}>
              <span className="text-[14px] font-bold leading-none">B</span>
            </button>

            {/* Italic */}
            <button onClick={() => editor.chain().focus().toggleItalic().run()}
              title={`Italic (${isMac ? '\u2318' : 'Ctrl+'}I)`}
              className={toolBtn(editor.isActive('italic'))}>
              <span className="text-[14px] font-bold italic leading-none">I</span>
            </button>

            {/* Underline */}
            <button onClick={() => editor.chain().focus().toggleUnderline().run()}
              title={`Underline (${isMac ? '\u2318' : 'Ctrl+'}U)`}
              className={toolBtn(editor.isActive('underline'))}>
              <span className="text-[14px] font-bold underline leading-none">U</span>
            </button>

            {/* Strikethrough */}
            <button onClick={() => editor.chain().focus().toggleStrike().run()}
              title="Strikethrough"
              className={toolBtn(editor.isActive('strike'))}>
              <span className="text-[14px] font-bold line-through leading-none">S</span>
            </button>

            {/* Code */}
            <button onClick={() => editor.chain().focus().toggleCode().run()}
              title="Inline Code"
              className={toolBtn(editor.isActive('code'))}>
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>

            <div className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-1.5" />

            {/* Bullet List */}
            <button onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet List"
              className={toolBtn(editor.isActive('bulletList'))}>
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                <circle cx="1" cy="6" r="1" fill="currentColor" />
                <circle cx="1" cy="12" r="1" fill="currentColor" />
                <circle cx="1" cy="18" r="1" fill="currentColor" />
              </svg>
            </button>

            {/* Ordered List */}
            <button onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Numbered List"
              className={toolBtn(editor.isActive('orderedList'))}>
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13" />
                <text x="1" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
                <text x="1" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
                <text x="1" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
              </svg>
            </button>

            <div className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-1.5" />

            {/* Link */}
            <button onClick={handleLink}
              title={`Insert Link (${isMac ? '\u2318' : 'Ctrl+'}K)`}
              className={toolBtn(editor.isActive('link'))}>
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </button>

            {/* Image */}
            <button onClick={handleImage}
              title="Insert Image"
              className={toolBtn(false)}>
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Horizontal Rule */}
            <button onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Insert Line"
              className={toolBtn(false)}>
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h18" />
              </svg>
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-600 rounded-b-lg bg-white dark:bg-slate-700 overflow-hidden">
            <EditorContent editor={editor} />
          </div>
        </>

      <div className="flex justify-end mt-1">
        <span className={`text-[11px] ${
          charCount >= maxLength ? 'text-red-500 font-medium' :
          charCount >= maxLength * 0.9 ? 'text-yellow-500' :
          'text-slate-400'
        }`}>
          {charCount}/{maxLength}
        </span>
      </div>
    </div>
  );
}
