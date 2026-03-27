import { useState, useRef, useEffect, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  wrapSelection,
  insertAtLineStart,
  insertLink,
  insertImage,
  setHeading,
  type InsertResult,
} from '../utils/markdownInsert';

interface Props {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
}

// Configure marked for safety
marked.setOptions({
  breaks: true,
  gfm: true,
});

function renderMarkdown(md: string): string {
  const raw = marked.parse(md);
  if (typeof raw !== 'string') return '';
  return DOMPurify.sanitize(raw);
}

export function MarkdownEditor({ value, onChange, maxLength, placeholder }: Props) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<{ start: number; end: number } | null>(null);

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

  // Restore cursor after React re-render
  useEffect(() => {
    if (pendingCursor.current && textareaRef.current) {
      const { start, end } = pendingCursor.current;
      textareaRef.current.setSelectionRange(start, end);
      textareaRef.current.focus();
      pendingCursor.current = null;
    }
  }, [value]);

  const applyInsert = useCallback((result: InsertResult) => {
    if (result.newValue.length > maxLength) return;
    onChange(result.newValue);
    pendingCursor.current = { start: result.selectionStart, end: result.selectionEnd };
  }, [onChange, maxLength]);

  const getSelection = () => {
    const ta = textareaRef.current;
    if (!ta) return { start: 0, end: 0 };
    return { start: ta.selectionStart, end: ta.selectionEnd };
  };

  const handleBold = () => {
    const { start, end } = getSelection();
    applyInsert(wrapSelection(value, start, end, '**', '**'));
  };

  const handleItalic = () => {
    const { start, end } = getSelection();
    applyInsert(wrapSelection(value, start, end, '_', '_'));
  };

  const handleStrikethrough = () => {
    const { start, end } = getSelection();
    applyInsert(wrapSelection(value, start, end, '~~', '~~'));
  };

  const handleCode = () => {
    const { start, end } = getSelection();
    const selected = value.slice(start, end);
    if (selected.includes('\n')) {
      applyInsert(wrapSelection(value, start, end, '```\n', '\n```'));
    } else {
      applyInsert(wrapSelection(value, start, end, '`', '`'));
    }
  };

  const handleHeading = (level: number) => {
    const { start } = getSelection();
    applyInsert(setHeading(value, start, level));
    setShowHeadingMenu(false);
  };

  const handleUnorderedList = () => {
    const { start, end } = getSelection();
    applyInsert(insertAtLineStart(value, start, end, '- '));
  };

  const handleOrderedList = () => {
    const { start, end } = getSelection();
    applyInsert(insertAtLineStart(value, start, end, (i) => `${i + 1}. `));
  };

  const handleLink = () => {
    const { start, end } = getSelection();
    applyInsert(insertLink(value, start, end));
  };

  const handleImage = () => {
    const { start, end } = getSelection();
    applyInsert(insertImage(value, start, end));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'b') { e.preventDefault(); handleBold(); }
    if (mod && e.key === 'i') { e.preventDefault(); handleItalic(); }
    if (mod && e.key === 'k') { e.preventDefault(); handleLink(); }
  };

  const tools: { label: string; icon: React.ReactNode; action: () => void; title: string }[] = [
    {
      label: 'B',
      icon: <span className="text-[11px] font-bold leading-none">B</span>,
      action: handleBold,
      title: 'Bold (Ctrl+B)',
    },
    {
      label: 'I',
      icon: <span className="text-[11px] font-bold italic leading-none">I</span>,
      action: handleItalic,
      title: 'Italic (Ctrl+I)',
    },
    {
      label: 'S',
      icon: <span className="text-[11px] font-bold line-through leading-none">S</span>,
      action: handleStrikethrough,
      title: 'Strikethrough',
    },
    {
      label: 'code',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
      action: handleCode,
      title: 'Code',
    },
    { label: 'sep', icon: null, action: () => {}, title: '' },
    {
      label: 'ul',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="1" cy="6" r="1" fill="currentColor" />
          <circle cx="1" cy="12" r="1" fill="currentColor" />
          <circle cx="1" cy="18" r="1" fill="currentColor" />
        </svg>
      ),
      action: handleUnorderedList,
      title: 'Bullet List',
    },
    {
      label: 'ol',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13" />
          <text x="1" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
          <text x="1" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
          <text x="1" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
        </svg>
      ),
      action: handleOrderedList,
      title: 'Numbered List',
    },
    { label: 'sep2', icon: null, action: () => {}, title: '' },
    {
      label: 'link',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
      action: handleLink,
      title: 'Insert Link (Ctrl+K)',
    },
    {
      label: 'image',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      action: handleImage,
      title: 'Insert Image',
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Description</label>
        <button
          onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
          className="text-[10px] text-primary hover:text-primary-dark font-medium transition">
          {mode === 'edit' ? 'Preview' : 'Edit'}
        </button>
      </div>

      {mode === 'edit' && (
        <>
          <div className="flex items-center gap-0.5 border border-slate-200 dark:border-slate-600 border-b-0 rounded-t-lg bg-slate-50 dark:bg-slate-700 px-1.5 py-1">
            {/* Heading dropdown */}
            <div className="relative" ref={headingMenuRef}>
              <button
                onClick={(e) => { e.preventDefault(); setShowHeadingMenu(!showHeadingMenu); }}
                title="Text style"
                className="h-6 flex items-center gap-0.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition px-1.5"
              >
                <span className="text-[11px] font-bold leading-none">H</span>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showHeadingMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-50 py-1 w-36 overflow-hidden">
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
                      className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition ${h.className}`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-1" />
            {tools.map(tool =>
              tool.icon === null ? (
                <div key={tool.label} className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-1" />
              ) : (
                <button
                  key={tool.label}
                  onClick={(e) => { e.preventDefault(); tool.action(); }}
                  title={tool.title}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition"
                >
                  {tool.icon}
                </button>
              )
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => { if (e.target.value.length <= maxLength) onChange(e.target.value); }}
            onKeyDown={handleKeyDown}
            maxLength={maxLength}
            placeholder={placeholder || 'Add a description...'}
            className="w-full min-h-[120px] text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-b-lg p-3 outline-none focus:border-primary resize-none bg-white dark:bg-slate-700 font-mono"
          />
        </>
      )}

      {mode === 'preview' && (
        <div
          className="markdown-preview w-full min-h-[120px] text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg p-3 bg-white dark:bg-slate-700 overflow-auto"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<span class="text-slate-400 dark:text-slate-500 italic">Nothing to preview</span>' }}
        />
      )}

      <div className="flex justify-end mt-1">
        <span className={`text-[11px] ${
          value.length >= maxLength ? 'text-red-500 font-medium' :
          value.length >= maxLength * 0.9 ? 'text-yellow-500' :
          'text-slate-400'
        }`}>
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
