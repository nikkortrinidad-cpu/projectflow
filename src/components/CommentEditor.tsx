import { useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

interface Props {
  onSubmit: (html: string) => void;
}

const EMOJI_LIST = [
  '😀','😂','😍','🥰','😎','🤔','👍','👎','❤️','🔥',
  '🎉','✅','⭐','💯','🚀','👀','💬','📌','⚡','✨',
  '😊','😢','😡','🤝','👏','🙏','💪','🎯','📝','🏆',
];

export function CommentEditor({ onSubmit }: Props) {
  const [showToolbar, setShowToolbar] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline hover:text-primary-dark' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'max-w-full rounded my-1' },
      }),
      Placeholder.configure({
        placeholder: 'Write a comment...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'outline-none text-xs text-slate-600 dark:text-slate-300 leading-relaxed min-h-[40px] max-h-[120px] overflow-y-auto px-3 py-2',
      },
    },
  });

  if (!editor) return null;

  const handleSubmit = () => {
    const html = editor.getHTML();
    const text = editor.getText().trim();
    if (!text) return;
    onSubmit(html);
    editor.commands.clearContent();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toolBtn = (active: boolean) =>
    `p-1.5 rounded transition ${active ? 'bg-primary/15 text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'}`;

  const actionBtn = (active: boolean = false) =>
    `p-1.5 rounded-lg transition ${active ? 'bg-primary/15 text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`;

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
    <div onKeyDown={handleKeyDown} className="relative">
      {/* Formatting toolbar — shown/hidden via toggle */}
      {showToolbar && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 dark:border-slate-700 flex-wrap bg-slate-50 dark:bg-slate-800/80">
          {/* Bold */}
          <button onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold" className={toolBtn(editor.isActive('bold'))}>
            <span className="text-[11px] font-bold leading-none w-4 h-4 flex items-center justify-center">B</span>
          </button>

          {/* Italic */}
          <button onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic" className={toolBtn(editor.isActive('italic'))}>
            <span className="text-[11px] font-bold italic leading-none w-4 h-4 flex items-center justify-center">I</span>
          </button>

          {/* Underline */}
          <button onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline" className={toolBtn(editor.isActive('underline'))}>
            <span className="text-[11px] font-bold underline leading-none w-4 h-4 flex items-center justify-center">U</span>
          </button>

          {/* Strikethrough */}
          <button onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough" className={toolBtn(editor.isActive('strike'))}>
            <span className="text-[11px] font-bold line-through leading-none w-4 h-4 flex items-center justify-center">S</span>
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />

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

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />

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
      <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-100 dark:border-slate-700">
        {/* Left: action buttons */}
        <div className="flex items-center gap-0.5">
          {/* Formatting toggle */}
          <button
            onClick={() => { setShowToolbar(!showToolbar); setShowEmojiPicker(false); setShowGifPicker(false); }}
            title="Formatting options"
            className={actionBtn(showToolbar)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" /></svg>
          </button>

          {/* Emoji */}
          <div className="relative">
            <button
              onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); setShowToolbar(false); }}
              title="Add emoji"
              className={actionBtn(showEmojiPicker)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            {showEmojiPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl z-20 p-2 w-[220px]">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5 px-1">Emoji</p>
                  <div className="grid grid-cols-10 gap-0.5">
                    {EMOJI_LIST.map(emoji => (
                      <button key={emoji} onClick={() => insertEmoji(emoji)}
                        className="w-6 h-6 flex items-center justify-center text-sm hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition">
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* GIF / Sticker */}
          <div className="relative">
            <button
              onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); setShowToolbar(false); }}
              title="Add GIF or sticker"
              className={actionBtn(showGifPicker)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
            </button>
            {showGifPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowGifPicker(false)} />
                <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl z-20 p-3 w-[240px]">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2 px-0.5">GIF & Stickers</p>
                  <input
                    placeholder="Search GIFs..."
                    className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-slate-50 dark:bg-slate-700 dark:text-slate-200 mb-2"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    {['👋','🎊','🤩','💥','🌟','😂','🥳','❤️‍🔥','🫡'].map((s, i) => (
                      <button key={i} onClick={() => { editor.chain().focus().insertContent(s).run(); setShowGifPicker(false); }}
                        className="aspect-square bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition">
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center mt-2">GIF integration coming soon</p>
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

        {/* Right: Send button */}
        <button onClick={handleSubmit}
          title="Send (⌘+Enter)"
          className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-dark transition font-medium shrink-0">
          Send
        </button>
      </div>
    </div>
  );
}
