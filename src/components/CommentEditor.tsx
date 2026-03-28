import { useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface Props {
  onSubmit: (html: string, scheduledAt?: string) => void;
  placeholder?: string;
  compact?: boolean;
  initialContent?: string;
}

export function CommentEditor({ onSubmit, placeholder: placeholderText, compact, initialContent }: Props) {
  const { state } = useBoard();
  const currentMemberId = store.getCurrentMemberId();
  const [showToolbar, setShowToolbar] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDateTime, setCustomDateTime] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEmpty, setIsEmpty] = useState(!initialContent);
  const submitRef = useRef<() => void>(null);

  const EnterSubmit = Extension.create({
    name: 'enterSubmit',
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          submitRef.current?.();
          return true;
        },
      };
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      EnterSubmit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline hover:text-primary-dark' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'max-w-full rounded my-1' },
      }),
      Placeholder.configure({
        placeholder: placeholderText || 'Write a comment...',
      }),
    ],
    content: initialContent || '',
    autofocus: initialContent ? 'end' : false,
    editorProps: {
      attributes: {
        class: `outline-none text-xs text-slate-600 dark:text-slate-300 leading-relaxed overflow-y-auto px-3 py-2 ${compact ? 'min-h-[32px] max-h-[80px]' : 'min-h-[40px] max-h-[120px]'}`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      setIsEmpty(!ed.getText().trim());
    },
  });

  if (!editor) return null;

  const handleSubmit = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const text = editor.getText().trim();
    if (!text) return;
    onSubmit(html);
    editor.commands.clearContent();
    setIsEmpty(true);
  }, [editor, onSubmit]);

  submitRef.current = handleSubmit;

  const toolBtn = (active: boolean) =>
    `p-1.5 rounded-lg transition ${active ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'text-[#86868b] dark:text-[#6e6e73] hover:text-[#6e6e73] dark:hover:text-[#aeaeb2] hover:bg-black/5 dark:hover:bg-white/10'}`;

  const actionBtn = (active: boolean = false) =>
    `p-1.5 rounded-lg transition ${active ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'text-[#86868b] dark:text-[#6e6e73] hover:text-[#6e6e73] dark:hover:text-[#aeaeb2] hover:bg-black/5 dark:hover:bg-white/10'}`;

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const addImage = () => {
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const insertMention = (name: string) => {
    editor.chain().focus()
      .insertContent(`<a href="#mention" data-mention="true">@${name}</a> `)
      .run();
    setShowMentionPicker(false);
    setMentionSearch('');
  };

  const insertEmoji = (emoji: string) => {
    editor.chain().focus().insertContent(emoji).run();
    setShowEmojiPicker(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For images, convert to data URL and insert
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          editor.chain().focus().setImage({ src: reader.result }).run();
        }
      };
      reader.readAsDataURL(file);
    } else {
      // For non-image files, insert as a link/text
      editor.chain().focus().insertContent(`📎 ${file.name}`).run();
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="relative">
      {/* Formatting toolbar — shown/hidden via toggle */}
      {showToolbar && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#e8e8ed] dark:border-[#38383a] flex-wrap bg-[#f5f5f7] dark:bg-[#1c1c1e]">
          {/* Bold */}
          <button onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold" className={toolBtn(editor.isActive('bold'))}>
            <span className="text-xs font-bold leading-none w-4 h-4 flex items-center justify-center">B</span>
          </button>

          {/* Italic */}
          <button onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic" className={toolBtn(editor.isActive('italic'))}>
            <span className="text-xs font-bold italic leading-none w-4 h-4 flex items-center justify-center">I</span>
          </button>

          {/* Underline */}
          <button onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline" className={toolBtn(editor.isActive('underline'))}>
            <span className="text-xs font-bold underline leading-none w-4 h-4 flex items-center justify-center">U</span>
          </button>

          {/* Strikethrough */}
          <button onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough" className={toolBtn(editor.isActive('strike'))}>
            <span className="text-xs font-bold line-through leading-none w-4 h-4 flex items-center justify-center">S</span>
          </button>

          <div className="w-px h-4 bg-[#d2d2d7] dark:bg-[#424245] mx-0.5" />

          {/* Bullet List */}
          <button onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List" className={toolBtn(editor.isActive('bulletList'))}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          {/* Blockquote */}
          <button onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote" className={toolBtn(editor.isActive('blockquote'))}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" /></svg>
          </button>

          <div className="w-px h-4 bg-[#d2d2d7] dark:bg-[#424245] mx-0.5" />

          {/* Link */}
          <button onClick={addLink}
            title="Add Link" className={toolBtn(editor.isActive('link'))}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          </button>

          {/* Code */}
          <button onClick={() => editor.chain().focus().toggleCode().run()}
            title="Inline Code" className={toolBtn(editor.isActive('code'))}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          </button>

          {/* Image */}
          <button onClick={addImage}
            title="Add Image" className={toolBtn(false)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </button>
        </div>
      )}

      {/* Editor area */}
      <EditorContent editor={editor} />

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-t border-[#e8e8ed] dark:border-[#38383a]">
        {/* Left: action buttons */}
        <div className="flex items-center gap-0.5">
          {/* Formatting toggle */}
          <button
            onClick={() => { setShowToolbar(!showToolbar); setShowEmojiPicker(false); setShowGifPicker(false); setShowMentionPicker(false); }}
            title="Formatting options"
            className={actionBtn(showToolbar)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" /></svg>
          </button>

          {/* Mention */}
          <div className="relative">
            <button
              onClick={() => { setShowMentionPicker(!showMentionPicker); setShowEmojiPicker(false); setShowGifPicker(false); setShowToolbar(false); }}
              title="Mention someone"
              className={actionBtn(showMentionPicker)}
            >
              <span className="text-sm font-bold leading-none w-4 h-4 flex items-center justify-center">@</span>
            </button>
            {showMentionPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setShowMentionPicker(false); setMentionSearch(''); }} />
                <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-[#2c2c2e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-20 w-[220px] overflow-hidden">
                  <div className="px-2.5 pt-2.5 pb-1.5">
                    <p className="text-[10px] font-semibold text-[#86868b] dark:text-[#6e6e73] uppercase tracking-wide mb-1.5">Mention</p>
                    <input
                      autoFocus
                      value={mentionSearch}
                      onChange={e => setMentionSearch(e.target.value)}
                      placeholder="Search members..."
                      className="w-full text-xs border border-[#d2d2d7] dark:border-[#424245] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0071e3] bg-[#f5f5f7] dark:bg-[#2c2c2e] dark:text-[#e5e5ea]"
                    />
                  </div>
                  <div className="max-h-[160px] overflow-y-auto py-1">
                    {state.members
                      .filter(m => m.name.toLowerCase().includes(mentionSearch.toLowerCase()))
                      .map(m => (
                        <button
                          key={m.id}
                          onClick={() => insertMention(m.name)}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs leading-normal text-[#1d1d1f] dark:text-[#e5e5ea] hover:bg-black/5 dark:hover:bg-white/10 transition"
                        >
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full rounded-full object-cover" /> : m.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate">{m.name}</span>
                          {m.id === currentMemberId && <span className="text-[10px] text-[#86868b] dark:text-[#6e6e73]">(You)</span>}
                        </button>
                      ))}
                    {state.members.filter(m => m.name.toLowerCase().includes(mentionSearch.toLowerCase())).length === 0 && (
                      <p className="text-[10px] text-[#86868b] dark:text-[#6e6e73] text-center py-2">No members found</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Emoji */}
          <div className="relative">
            <button
              onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowMentionPicker(false); setShowGifPicker(false); setShowToolbar(false); }}
              title="Add emoji"
              className={actionBtn(showEmojiPicker)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            {showEmojiPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                <div className="absolute bottom-full left-0 mb-2 z-20">
                  <Picker
                    data={data}
                    onEmojiSelect={(emoji: { native: string }) => {
                      insertEmoji(emoji.native);
                      setShowEmojiPicker(false);
                    }}
                    theme="light"
                    previewPosition="none"
                    skinTonePosition="search"
                    perLine={8}
                    maxFrequentRows={2}
                  />
                </div>
              </>
            )}
          </div>

          {/* GIF / Sticker */}
          <div className="relative">
            <button
              onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); setShowMentionPicker(false); setShowToolbar(false); }}
              title="Add GIF or sticker"
              className={actionBtn(showGifPicker)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
            </button>
            {showGifPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowGifPicker(false)} />
                <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-[#2c2c2e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-20 p-3 w-[240px]">
                  <p className="text-[10px] font-semibold text-[#86868b] dark:text-[#6e6e73] uppercase tracking-wide mb-2 px-0.5">GIF & Stickers</p>
                  <input
                    placeholder="Search GIFs..."
                    className="w-full text-xs border border-[#d2d2d7] dark:border-[#424245] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0071e3] bg-[#f5f5f7] dark:bg-[#2c2c2e] dark:text-[#e5e5ea] mb-2"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    {['👋','🎊','🤩','💥','🌟','😂','🥳','❤️‍🔥','🫡'].map((s, i) => (
                      <button key={i} onClick={() => { editor.chain().focus().insertContent(s).run(); setShowGifPicker(false); }}
                        className="aspect-square bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-lg flex items-center justify-center text-xl hover:bg-black/5 dark:hover:bg-white/10 transition">
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#86868b] dark:text-[#6e6e73] text-center mt-2">GIF integration coming soon</p>
                </div>
              </>
            )}
          </div>

          {/* Upload file */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload file"
            className={actionBtn(false)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx" />
        </div>

        {/* Right: Send + Schedule */}
        <div className="flex items-center shrink-0">
          <button onClick={handleSubmit}
            disabled={isEmpty}
            title="Send (⌘+Enter)"
            className={`text-white px-2.5 h-8 rounded-l-xl transition flex items-center justify-center ${isEmpty ? 'bg-[#0071e3]/40 cursor-not-allowed' : 'bg-[#0071e3] hover:bg-[#0077ED]'}`}>
            <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
          <div className="relative">
            <button
              onClick={() => !isEmpty && setShowScheduleMenu(!showScheduleMenu)}
              disabled={isEmpty}
              title="Schedule send"
              className={`text-white px-1.5 h-8 rounded-r-xl transition border-l border-white/20 flex items-center justify-center ${isEmpty ? 'bg-[#0071e3]/40 cursor-not-allowed' : 'bg-[#0071e3] hover:bg-[#0077ED]'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            {showScheduleMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setShowScheduleMenu(false); setShowCustomPicker(false); }} />
                <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-[#2c2c2e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-20 w-56 overflow-hidden">
                  <div className="px-3 pt-3 pb-1.5">
                    <p className="text-[10px] font-semibold text-[#86868b] dark:text-[#6e6e73] uppercase tracking-wide">Schedule send</p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => {
                        const time = new Date(Date.now() + 20 * 60 * 1000);
                        const html = editor.getHTML();
                        const text = editor.getText().trim();
                        if (!text) return;
                        onSubmit(html, time.toISOString());
                        editor.commands.clearContent();
                        setIsEmpty(true);
                        setShowScheduleMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs leading-normal text-[#1d1d1f] dark:text-[#e5e5ea] hover:bg-black/5 dark:hover:bg-white/10 transition"
                    >
                      <svg className="w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      In 20 minutes
                    </button>
                    <button
                      onClick={() => {
                        const time = new Date(Date.now() + 2 * 60 * 60 * 1000);
                        const html = editor.getHTML();
                        const text = editor.getText().trim();
                        if (!text) return;
                        onSubmit(html, time.toISOString());
                        editor.commands.clearContent();
                        setIsEmpty(true);
                        setShowScheduleMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs leading-normal text-[#1d1d1f] dark:text-[#e5e5ea] hover:bg-black/5 dark:hover:bg-white/10 transition"
                    >
                      <svg className="w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      In 2 hours
                    </button>
                    <button
                      onClick={() => {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        tomorrow.setHours(9, 0, 0, 0);
                        const html = editor.getHTML();
                        const text = editor.getText().trim();
                        if (!text) return;
                        onSubmit(html, tomorrow.toISOString());
                        editor.commands.clearContent();
                        setIsEmpty(true);
                        setShowScheduleMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs leading-normal text-[#1d1d1f] dark:text-[#e5e5ea] hover:bg-black/5 dark:hover:bg-white/10 transition"
                    >
                      <svg className="w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Tomorrow at 9:00 AM
                    </button>
                  </div>
                  <div className="border-t border-[#e8e8ed] dark:border-[#38383a]">
                    {!showCustomPicker ? (
                      <button
                        onClick={() => setShowCustomPicker(true)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs leading-normal text-[#1d1d1f] dark:text-[#e5e5ea] hover:bg-black/5 dark:hover:bg-white/10 transition"
                      >
                        <svg className="w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Pick a custom time
                      </button>
                    ) : (
                      <div className="px-3 py-2.5 space-y-2">
                        <input
                          type="datetime-local"
                          value={customDateTime}
                          onChange={e => setCustomDateTime(e.target.value)}
                          min={new Date().toISOString().slice(0, 16)}
                          className="w-full text-xs border border-[#d2d2d7] dark:border-[#424245] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0071e3] bg-white dark:bg-[#2c2c2e] dark:text-[#e5e5ea]"
                        />
                        <button
                          onClick={() => {
                            if (!customDateTime) return;
                            const html = editor.getHTML();
                            const text = editor.getText().trim();
                            if (!text) return;
                            onSubmit(html, new Date(customDateTime).toISOString());
                            editor.commands.clearContent();
                            setShowScheduleMenu(false);
                            setShowCustomPicker(false);
                            setCustomDateTime('');
                          }}
                          className="w-full text-xs bg-[#0071e3] text-white px-3 py-1.5 rounded-lg hover:bg-[#0077ED] transition font-medium"
                        >
                          Schedule
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
