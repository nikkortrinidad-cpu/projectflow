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
  footerLeft?: React.ReactNode;
  editing?: boolean;
  onEditStart?: () => void;
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

export function MarkdownEditor({ value, onChange, maxLength, placeholder, headerRight, footerLeft, editing, onEditStart }: Props) {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  const isReadOnly = editing === false;

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
    editable: !isReadOnly,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[250px] p-3 text-sm text-slate-600 dark:text-slate-300 prose-editor',
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

  // Toggle editable when editing prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [isReadOnly, editor]);

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
  const hasContent = editor ? editor.getText().trim().length > 0 : false;

  const toolBtn = (active: boolean) =>
    `w-8 h-8 flex items-center justify-center rounded-lg transition ${
      active
        ? 'bg-[#0071e3]/10 text-[#0071e3]'
        : 'text-[#86868b] dark:text-[#86868b] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1d1d1f] dark:hover:text-[#e5e5ea]'
    }`;

  if (!editor) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold text-[#86868b] dark:text-[#86868b] uppercase tracking-wide flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          Description
        </label>
        {headerRight}
      </div>

      {/* Read-only preview mode */}
      {isReadOnly ? (
        <div
          className="ml-5 relative group cursor-pointer"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => onEditStart?.()}
        >
          <div className={`border rounded-xl min-h-[80px] p-3 text-sm transition-all ${
            isHovered
              ? 'border-[#0071e3]/30 bg-[#0071e3]/[0.02] dark:bg-[#0071e3]/[0.04]'
              : 'border-[#d2d2d7] dark:border-[#424245] bg-white dark:bg-[#2c2c2e]'
          }`}>
            {hasContent ? (
              <div
                className="prose-editor text-[#6e6e73] dark:text-[#aeaeb2]"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
              />
            ) : (
              <p className="text-[#86868b] dark:text-[#6e6e73] italic">{placeholder || 'Add a description...'}</p>
            )}
          </div>
          {/* Hover edit indicator */}
          <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
            isHovered ? 'opacity-100' : 'opacity-0'
          } bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Click to edit
          </div>
        </div>
      ) : (
        <>
          <div className="ml-5">
            <div className="flex items-center gap-1 border border-[#d2d2d7] dark:border-[#424245] border-b-0 rounded-t-xl bg-[#f5f5f7] dark:bg-[#2c2c2e] px-2 py-1.5">
              {/* Heading dropdown */}
              <div className="relative" ref={headingMenuRef}>
                <button
                  onClick={(e) => { e.preventDefault(); setShowHeadingMenu(!showHeadingMenu); }}
                  title="Text style"
                  className="h-8 flex items-center gap-1 rounded-lg text-[#86868b] dark:text-[#86868b] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1d1d1f] dark:hover:text-[#e5e5ea] transition px-2"
                >
                  <span className="text-[13px] font-bold leading-none">H</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showHeadingMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#2c2c2e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-50 py-1 w-52 overflow-hidden">
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
                        className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10 text-[#1d1d1f] dark:text-[#aeaeb2] transition ${h.className}`}
                      >
                        <span>{h.label}</span>
                        <span className="text-[10px] font-normal text-[#86868b] dark:text-[#6e6e73] ml-3">{headingShortcut(h.level)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-px h-5 bg-[#d2d2d7] dark:bg-[#424245] mx-1.5" />

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

              <div className="w-px h-5 bg-[#d2d2d7] dark:bg-[#424245] mx-1.5" />

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

              <div className="w-px h-5 bg-[#d2d2d7] dark:bg-[#424245] mx-1.5" />

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

            <div className="border border-[#d2d2d7] dark:border-[#424245] rounded-b-xl bg-white dark:bg-[#2c2c2e] overflow-hidden">
              <EditorContent editor={editor} />
            </div>
          </div>

          <div className="flex items-center justify-between mt-1 ml-5">
            <div>{footerLeft}</div>
            <span className={`text-[11px] ${
              charCount >= maxLength ? 'text-[#ff3b30] font-medium' :
              charCount >= maxLength * 0.9 ? 'text-[#ff9f0a]' :
              'text-[#86868b]'
            }`}>
              {charCount}/{maxLength}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
