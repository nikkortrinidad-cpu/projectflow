import { useState, useRef, useEffect } from 'react';
import type { Card, Priority } from '../types';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';
import { ColorPicker } from './ColorPicker';
import { MarkdownEditor } from './MarkdownEditor';
import { CommentEditor } from './CommentEditor';

interface Props {
  card: Card;
  onClose: () => void;
}

export function CardDetailPanel({ card, onClose }: Props) {
  const { state } = useBoard();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [commentText, setCommentText] = useState('');
  const [priority, setPriority] = useState<Priority>(card.priority);
  const [startDate, setStartDate] = useState(card.startDate || '');
  const [dueDate, setDueDate] = useState(card.dueDate || '');
  const [assigneeId, setAssigneeId] = useState(card.assigneeId || '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>(card.labels);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#6366f1');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [showLabelsDropdown, setShowLabelsDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [checklistAssigneeDropdown, setChecklistAssigneeDropdown] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCardMenu, setShowCardMenu] = useState(false);
  const [activityTab, setActivityTab] = useState<'comments' | 'activity'>('comments');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [collapsedComments, setCollapsedComments] = useState<Set<string>>(
    () => new Set(card.comments.filter(c => c.replies && c.replies.length > 0).map(c => c.id))
  );

  const toggleCollapse = (commentId: string) => {
    setCollapsedComments(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const countAllReplies = (replies: typeof card.comments): number => {
    let count = 0;
    for (const r of replies) {
      count++;
      if (r.replies) count += countAllReplies(r.replies);
    }
    return count;
  };
  const [shareInviteEmail, setShareInviteEmail] = useState('');
  const [sharePublicLink, setSharePublicLink] = useState(false);
  const [sharePermission, setSharePermission] = useState<'full_edit' | 'can_comment' | 'view_only'>('full_edit');
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [sharedInvites, setSharedInvites] = useState<{ name: string; permission: string }[]>([]);
  const [shareInviteError, setShareInviteError] = useState('');

  /* Hidden Attachment state — available if needed */

  // Refs for scrolling
  const checklistRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggleLabel = (labelId: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelId) ? prev.filter(l => l !== labelId) : [...prev, labelId]
    );
  };

  const handleCreateLabel = () => {
    if (newLabelName.trim()) {
      const label = store.addLabel(newLabelName.trim(), newLabelColor);
      setSelectedLabels(prev => [...prev, label.id]);
      setNewLabelName('');
      setNewLabelColor('#6366f1');
    }
  };

  const handleEditLabel = (id: string) => {
    if (editLabelName.trim()) {
      const label = state.labels.find(l => l.id === id);
      if (label) {
        store.deleteLabel(id);
        const updated = store.addLabel(editLabelName.trim(), editLabelColor);
        setSelectedLabels(prev => prev.map(l => l === id ? updated.id : l));
      }
      setEditingLabelId(null);
    }
  };

  const handleDeleteLabel = (id: string) => {
    const label = state.labels.find(l => l.id === id);
    if (confirm(`Are you sure you want to delete the label "${label?.name}"? This will remove it from all cards.`)) {
      store.deleteLabel(id);
      setSelectedLabels(prev => prev.filter(l => l !== id));
    }
  };


  const handleAddComment = (html?: string, scheduledAt?: string) => {
    const text = html || commentText.trim();
    if (text) {
      store.addComment(card.id, text, scheduledAt);
      setCommentText('');
    }
  };


  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const initialDescription = useRef(card.description);
  const firstUpdate = useRef(true);

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    // Skip the first update from TipTap initialization (HTML normalization)
    if (firstUpdate.current) {
      firstUpdate.current = false;
      initialDescription.current = val;
      return;
    }
    setDescriptionDirty(val !== initialDescription.current);
  };

  const handleSaveDescription = () => {
    store.updateCard(card.id, { description });
    initialDescription.current = description;
    setDescriptionDirty(false);
    setDescriptionEditing(false);
  };

  const handleCancelDescription = () => {
    setDescription(initialDescription.current);
    setDescriptionDirty(false);
    setDescriptionEditing(false);
  };

  const column = state.columns.find(c => c.id === card.columnId);
  const activities = state.activityLog.filter(a => a.cardId === card.id).slice(0, 20);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl h-[98vh] bg-white dark:bg-[#1c1c1e] shadow-2xl shadow-black/20 rounded-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Title bar */}
        <div className="shrink-0 flex items-center justify-end gap-1 px-6 py-1.5 border-b border-[#e8e8ed] dark:border-[#38383a] bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl">
          <span className="flex items-center gap-1.5 text-[11px] text-[#86868b] dark:text-[#86868b] mr-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Created {new Date(card.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={() => setShowShareModal(true)} className="shrink-0 flex items-center gap-1.5 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] px-2.5 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition text-xs font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>

          {/* 3-dot settings menu */}
          <div className="relative">
            <button onClick={() => setShowCardMenu(!showCardMenu)} className="shrink-0 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            {showCardMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowCardMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-40 py-1.5 w-48">
                  {/* Duplicate */}
                  <button
                    onClick={() => {
                      store.addCard({ title: card.title + ' (copy)', columnId: card.columnId, swimlaneId: card.swimlaneId });
                      setShowCardMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#6e6e73] dark:text-[#aeaeb2] hover:bg-black/5 dark:hover:bg-white/10 transition"
                  >
                    <svg className="w-3.5 h-3.5 text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Duplicate card
                  </button>

                  {/* Copy link */}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}?card=${card.id}`);
                      setShowCardMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#6e6e73] dark:text-[#aeaeb2] hover:bg-black/5 dark:hover:bg-white/10 transition"
                  >
                    <svg className="w-3.5 h-3.5 text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    Copy link
                  </button>

                  <div className="border-t border-[#e8e8ed] dark:border-[#38383a] my-1" />

                  {/* Archive */}
                  <button
                    onClick={() => {
                      store.archiveCard(card.id);
                      setShowCardMenu(false);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#6e6e73] dark:text-[#aeaeb2] hover:bg-black/5 dark:hover:bg-white/10 transition"
                  >
                    <svg className="w-3.5 h-3.5 text-[#ff9f0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                    Archive card
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      store.deleteCard(card.id);
                      setShowCardMenu(false);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#ff3b30] hover:bg-[#ff3b30]/5 dark:hover:bg-[#ff3b30]/10 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete card
                  </button>
                </div>
              </>
            )}
          </div>

          <button onClick={onClose} className="shrink-0 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Share Modal */}
        {showShareModal && (
          <>
            <div className="fixed inset-0 z-[60] bg-black/30" onClick={() => setShowShareModal(false)} />
            <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto w-full max-w-md bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl shadow-black/20 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-2">
                  <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Share this task</h3>
                  <button onClick={() => setShowShareModal(false)} className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <p className="px-5 text-xs text-[#86868b] dark:text-[#86868b] mb-4">
                  Sharing task <span className="inline-block w-2 h-2 rounded-sm mx-1" style={{ backgroundColor: column?.color }} /> <span className="font-semibold text-[#1d1d1f] dark:text-[#e5e5ea]">{title}</span>
                </p>

                {/* Invite */}
                <div className="px-5 mb-4">
                  <div className="flex gap-2">
                    <input
                      value={shareInviteEmail}
                      onChange={e => { setShareInviteEmail(e.target.value); setShareInviteError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click(); }}
                      placeholder="Invite by name or email"
                      className={`flex-1 text-sm border rounded-lg px-3 py-2 outline-none bg-white dark:bg-[#2c2c2e] dark:text-[#e5e5ea] ${shareInviteError ? 'border-[#ff3b30]/50 focus:border-[#ff3b30]' : 'border-[#d2d2d7] dark:border-[#424245] focus:border-primary'}`}
                    />
                    <button
                      onClick={() => {
                        const val = shareInviteEmail.trim();
                        if (!val) {
                          setShareInviteError('Please enter a name or email');
                          return;
                        }
                        if (sharedInvites.some(s => s.name.toLowerCase() === val.toLowerCase())) {
                          setShareInviteError('Already invited');
                          return;
                        }
                        setSharedInvites([...sharedInvites, { name: val, permission: sharePermission === 'full_edit' ? 'Full edit' : sharePermission === 'can_comment' ? 'Can comment' : 'View only' }]);
                        setShareInviteEmail('');
                        setShareInviteError('');
                      }}
                      className="text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition font-medium shrink-0"
                    >
                      Invite
                    </button>
                  </div>
                  {shareInviteError && (
                    <p className="text-xs text-[#ff3b30] mt-1.5">{shareInviteError}</p>
                  )}
                  {/* Invited members list */}
                  {sharedInvites.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {sharedInvites.map((inv, i) => (
                        <div key={i} className="flex items-center justify-between bg-[#f5f5f7] dark:bg-[#2c2c2e]/60 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#0071e3]/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                              {inv.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-[#1d1d1f] dark:text-[#e5e5ea]">{inv.name}</p>
                              <p className="text-[10px] text-[#86868b] dark:text-[#86868b]">Invited · {inv.permission}</p>
                            </div>
                          </div>
                          <button onClick={() => setSharedInvites(sharedInvites.filter((_, j) => j !== i))}
                            className="text-[#86868b] hover:text-[#ff3b30] transition p-0.5" title="Remove">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Options */}
                <div className="px-5 space-y-3 mb-4">
                  {/* Share link with anyone */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-[#86868b] dark:text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                      <span className="text-sm font-medium text-[#1d1d1f] dark:text-[#e5e5ea]">Share link with anyone</span>
                    </div>
                    <button
                      onClick={() => setSharePublicLink(!sharePublicLink)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${sharePublicLink ? 'bg-primary' : 'bg-[#d2d2d7] dark:bg-[#3a3a3c]'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sharePublicLink ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Private link */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-[#86868b] dark:text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                      <span className="text-sm font-medium text-[#1d1d1f] dark:text-[#e5e5ea]">Private link</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href + '?card=' + card.id);
                        setShareLinkCopied(true);
                        setTimeout(() => setShareLinkCopied(false), 2000);
                      }}
                      className="text-xs font-medium border border-[#d2d2d7] dark:border-[#424245] text-[#6e6e73] dark:text-[#aeaeb2] px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
                    >
                      {shareLinkCopied ? 'Copied!' : 'Copy link'}
                    </button>
                  </div>

                  {/* Default permission */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-[#86868b] dark:text-[#86868b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      <span className="text-sm font-medium text-[#1d1d1f] dark:text-[#e5e5ea]">Default permission</span>
                    </div>
                    <select
                      value={sharePermission}
                      onChange={e => setSharePermission(e.target.value as typeof sharePermission)}
                      className="text-xs font-medium border border-[#d2d2d7] dark:border-[#424245] text-[#6e6e73] dark:text-[#aeaeb2] bg-white dark:bg-[#2c2c2e] px-3 py-1.5 rounded-lg outline-none cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 transition"
                    >
                      <option value="full_edit">Full edit</option>
                      <option value="can_comment">Can comment</option>
                      <option value="view_only">View only</option>
                    </select>
                  </div>
                </div>

                {/* Shared members */}
                {(() => {
                  const cardAssignee = state.members.find(m => m.id === card.assigneeId);
                  const creator = state.members.find(m => m.id === 'user-1');
                  const sharedMembers = [creator, cardAssignee].filter((m, i, arr) => m && arr.findIndex(a => a?.id === m.id) === i) as typeof state.members;
                  return sharedMembers.length > 0 ? (
                    <div className="px-5 py-3 border-t border-[#e8e8ed] dark:border-[#38383a]">
                      <div className="flex items-center justify-between">
                        <div className="flex -space-x-1.5">
                          {sharedMembers.map(m => (
                            <div key={m.id} className="w-7 h-7 rounded-full bg-[#0071e3]/10 text-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#1c1c1e]" title={m.id === store.getCurrentMemberId() ? `${m.name} (You)` : m.name}>
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px] text-[#86868b] dark:text-[#86868b]">{sharedMembers.length} member{sharedMembers.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Make Private */}
                <div className="px-5 py-4 border-t border-[#e8e8ed] dark:border-[#38383a]">
                  {sharedInvites.length === 0 && !sharePublicLink ? (
                    <div className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[#30d158] dark:text-[#30d158]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                      This task is private
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setSharedInvites([]);
                        setSharePublicLink(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#d2d2d7] dark:border-[#424245] text-sm font-medium text-[#6e6e73] dark:text-[#aeaeb2] hover:bg-[#ff3b30]/5 hover:border-[#ff3b30]/30 hover:text-[#ff3b30] dark:hover:bg-[#ff3b30]/10 dark:hover:border-[#ff3b30]/30 dark:hover:text-[#ff3b30] transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      Make Private
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Body: left content + right sidebar */}
        <div className="flex-1 flex overflow-hidden">
        {/* Left: Card content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-7">
            <div className="relative group/title ml-5">
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full text-2xl font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] border border-transparent outline-none bg-transparent rounded-lg px-2 py-1 -ml-2 hover:border-[#d2d2d7] dark:hover:border-[#424245] focus:border-primary focus:bg-[#0071e3]/[0.03] dark:focus:bg-white/5 transition" />
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aeaeb2] dark:text-[#6e6e73] opacity-0 group-hover/title:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>

            {/* Two-column fields */}
            <div className="ml-5 grid grid-cols-2 gap-0 border border-[#d2d2d7] dark:border-[#38383a] rounded-xl bg-[#f5f5f7]/50 dark:bg-[#2c2c2e]/30">
              {/* Status */}
              <div className="relative flex items-center gap-2 px-3 py-2.5 border-b border-r border-[#d2d2d7] dark:border-[#38383a] min-w-0">
                <span className="flex items-center gap-1.5 text-xs text-[#86868b] dark:text-[#86868b] shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Status
                </span>
                <button onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: column?.color }} />
                  <span className="text-[#1d1d1f] dark:text-[#e5e5ea]">{column?.title || 'Status'}</span>
                </button>
                {showStatusDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-20 w-48 overflow-hidden">
                      <div className="p-1.5 space-y-0.5">
                        {[...state.columns].sort((a, b) => a.order - b.order).map(c => (
                          <button key={c.id}
                            onClick={() => { store.moveCard(card.id, c.id, card.swimlaneId, 0); setShowStatusDropdown(false); }}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10 ${
                              card.columnId === c.id ? 'bg-[#f5f5f7] dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7]' : 'text-[#6e6e73] dark:text-[#aeaeb2]'
                            }`}>
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                            {c.title}
                            {card.columnId === c.id && (
                              <svg className="w-3.5 h-3.5 ml-auto text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Assignees */}
              <div className="relative flex items-center gap-2 px-3 py-2.5 border-b border-[#d2d2d7] dark:border-[#38383a] min-w-0">
                <span className="flex items-center gap-1.5 text-xs text-[#86868b] dark:text-[#86868b] shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  Assignees
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(() => {
                    const assignee = state.members.find(m => m.id === assigneeId);
                    if (assignee) {
                      return (
                        <div className="flex items-center gap-1.5 bg-[#e8e8ed] dark:bg-[#3a3a3c] rounded-full pl-0.5 pr-2 py-0.5">
                          <div className="w-5 h-5 rounded-full bg-[#0071e3]/10 text-primary text-[9px] font-bold flex items-center justify-center">
                            {assignee.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[11px] font-medium text-[#6e6e73] dark:text-[#aeaeb2]">{assignee.name}{assignee.id === store.getCurrentMemberId() && <span className="text-[10px] text-[#86868b] ml-1">(You)</span>}</span>
                          <button onClick={() => setAssigneeId('')} className="text-[#86868b] hover:text-[#ff3b30] transition">
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div className="relative group/member">
                    <button className="w-5 h-5 rounded-full border border-dashed border-[#d2d2d7] dark:border-[#48484a] flex items-center justify-center text-[#86868b] hover:border-primary hover:text-primary transition">
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-20 py-1 w-40 opacity-0 invisible group-hover/member:opacity-100 group-hover/member:visible transition-all">
                      {state.members.filter(m => m.id !== assigneeId).map(m => (
                        <button key={m.id} onClick={() => setAssigneeId(m.id)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#6e6e73] dark:text-[#aeaeb2] hover:bg-black/5 dark:hover:bg-white/10 transition">
                          <div className="w-4 h-4 rounded-full bg-[#0071e3]/10 text-primary text-[8px] font-bold flex items-center justify-center">{m.name.charAt(0).toUpperCase()}</div>
                          {m.name}{m.id === store.getCurrentMemberId() && <span className="text-[10px] text-[#86868b] ml-1">(You)</span>}
                        </button>
                      ))}
                      {state.members.filter(m => m.id !== assigneeId).length === 0 && (
                        <p className="px-3 py-1.5 text-[10px] text-[#86868b] italic">No other members</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Start Date */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-r border-[#d2d2d7] dark:border-[#38383a] min-w-0">
                <span className="flex items-center gap-1.5 text-xs text-[#86868b] dark:text-[#86868b] shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Start date
                </span>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="text-xs font-medium text-[#1d1d1f] dark:text-[#e5e5ea] bg-transparent outline-none hover:bg-black/5 dark:hover:bg-white/10 rounded-md px-1 py-1 transition cursor-pointer min-w-0 max-w-[120px]" />
                {!startDate && <span className="text-[10px] text-[#86868b] dark:text-[#86868b]">Empty</span>}
              </div>

              {/* Priority */}
              <div className="relative flex items-center gap-2 px-3 py-2.5 border-b border-[#d2d2d7] dark:border-[#38383a] min-w-0">
                <span className="flex items-center gap-1.5 text-xs text-[#86868b] dark:text-[#86868b] shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
                  Priority
                </span>
                <button onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                  className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition">
                  <span className={`w-2 h-2 rounded-full ${
                    priority === 'low' ? 'bg-blue-400' : priority === 'medium' ? 'bg-yellow-400' : priority === 'high' ? 'bg-orange-400' : 'bg-[#ff3b30]'
                  }`} />
                  <span className="text-[#1d1d1f] dark:text-[#e5e5ea] capitalize">{priority}</span>
                </button>
                {showPriorityDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPriorityDropdown(false)} />
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-20 w-44 overflow-hidden">
                      <div className="p-1.5 space-y-0.5">
                        {([
                          { value: 'low', label: 'Low', dot: 'bg-blue-400' },
                          { value: 'medium', label: 'Medium', dot: 'bg-yellow-400' },
                          { value: 'high', label: 'High', dot: 'bg-orange-400' },
                          { value: 'urgent', label: 'Urgent', dot: 'bg-[#ff3b30]' },
                        ] as const).map(p => (
                          <button key={p.value}
                            onClick={() => { setPriority(p.value); setShowPriorityDropdown(false); }}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10 ${
                              priority === p.value ? 'bg-[#f5f5f7] dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7]' : 'text-[#6e6e73] dark:text-[#aeaeb2]'
                            }`}>
                            <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                            {p.label}
                            {priority === p.value && (
                              <svg className="w-3.5 h-3.5 ml-auto text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Due Date */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-r border-[#d2d2d7] dark:border-[#38383a] min-w-0 overflow-hidden">
                <span className="flex items-center gap-1.5 text-xs text-[#86868b] dark:text-[#86868b] shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Due date
                </span>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className={`text-xs font-medium bg-transparent outline-none hover:bg-black/5 dark:hover:bg-white/10 rounded-md px-1 py-1 transition cursor-pointer min-w-0 max-w-[120px] ${
                      dueDate && new Date(dueDate) < new Date() ? 'text-[#ff3b30]' : 'text-[#1d1d1f] dark:text-[#e5e5ea]'
                    }`} />
                  {!dueDate && <span className="text-[10px] text-[#86868b] dark:text-[#86868b]">Empty</span>}
                  {dueDate && new Date(dueDate) < new Date() && (
                    <span className="text-[9px] font-semibold text-[#ff3b30] bg-[#ff3b30]/5 dark:bg-[#ff3b30]/10 px-1 py-0.5 rounded">Overdue</span>
                  )}
                </div>
              </div>

              {/* Labels */}
              <div className="relative flex items-center gap-2 px-3 py-2.5 min-w-0">
                <span className="flex items-center gap-1.5 text-xs text-[#86868b] dark:text-[#86868b] shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  Labels
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedLabels.length > 0 ? (
                    state.labels.filter(l => selectedLabels.includes(l.id)).map(l => (
                      <span key={l.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
                        style={{ backgroundColor: l.color }}>{l.name}</span>
                    ))
                  ) : (
                    <span className="text-xs text-[#86868b] dark:text-[#86868b]">Empty</span>
                  )}
                  <button onClick={() => setShowLabelsDropdown(!showLabelsDropdown)}
                    className="w-5 h-5 rounded-full border border-dashed border-[#d2d2d7] dark:border-[#48484a] flex items-center justify-center text-[#86868b] hover:border-primary hover:text-primary transition ml-0.5">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
                {showLabelsDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setShowLabelsDropdown(false); setShowLabelManager(false); }} />
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-20 w-64 overflow-hidden">
                      <div className="px-3 py-2 border-b border-[#e8e8ed] dark:border-[#38383a] flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#86868b] dark:text-[#86868b] uppercase">Labels</span>
                        <button onClick={() => setShowLabelManager(!showLabelManager)}
                          className="text-[10px] text-primary hover:text-primary-dark font-medium transition">
                          {showLabelManager ? 'Done' : 'Manage'}
                        </button>
                      </div>
                      <div className="p-2 max-h-60 overflow-y-auto space-y-1">
                        {!showLabelManager ? (
                          state.labels.map(l => (
                            <button key={l.id} onClick={() => toggleLabel(l.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-black/5 dark:hover:bg-white/10 transition">
                              <div className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition ${
                                selectedLabels.includes(l.id) ? 'bg-primary border-primary text-white' : 'border-[#d2d2d7] dark:border-[#48484a]'
                              }`}>
                                {selectedLabels.includes(l.id) && (
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                )}
                              </div>
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                              <span className="text-[#6e6e73] dark:text-[#aeaeb2] font-medium">{l.name}</span>
                            </button>
                          ))
                        ) : (
                          <>
                            {state.labels.map(l => (
                              <div key={l.id} className="flex items-center gap-2 py-1">
                                {editingLabelId === l.id ? (
                                  <>
                                    <ColorPicker value={editLabelColor} onChange={setEditLabelColor} />
                                    <input value={editLabelName} onChange={e => setEditLabelName(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleEditLabel(l.id); if (e.key === 'Escape') setEditingLabelId(null); }}
                                      className="flex-1 text-xs bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded px-2 py-1 outline-none focus:border-primary dark:text-[#e5e5ea]" />
                                    <button onClick={() => handleEditLabel(l.id)} className="text-[10px] text-primary hover:text-primary-dark font-medium">Save</button>
                                    <button onClick={() => setEditingLabelId(null)} className="text-[10px] text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]">✕</button>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                                    <span className="flex-1 text-xs font-medium text-[#6e6e73] dark:text-[#aeaeb2]">{l.name}</span>
                                    <button onClick={() => { setEditingLabelId(l.id); setEditLabelName(l.name); setEditLabelColor(l.color); }}
                                      className="text-[10px] text-[#86868b] hover:text-primary transition">Edit</button>
                                    <button onClick={() => handleDeleteLabel(l.id)}
                                      className="text-[10px] text-[#86868b] hover:text-[#ff3b30] transition">✕</button>
                                  </>
                                )}
                              </div>
                            ))}
                            <div className="flex items-center gap-2 pt-2 border-t border-[#d2d2d7] dark:border-[#424245] mt-1">
                              <ColorPicker value={newLabelColor} onChange={setNewLabelColor} />
                              <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateLabel(); }}
                                placeholder="New label..."
                                className="flex-1 text-xs bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded px-2 py-1 outline-none focus:border-primary dark:text-[#e5e5ea]" />
                              <button onClick={handleCreateLabel}
                                className="text-[10px] bg-primary text-white px-2 py-1 rounded font-medium hover:bg-primary-dark transition">Add</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <MarkdownEditor
              value={description}
              onChange={handleDescriptionChange}
              maxLength={2000}
              placeholder="Add a description... (supports markdown)"
              editing={descriptionEditing}
              onEditStart={() => setDescriptionEditing(true)}
              headerRight={descriptionEditing ? (
                <div className={`flex items-center gap-1.5 text-[11px] font-medium px-1 py-0.5 rounded-md transition-all ${
                  descriptionDirty
                    ? 'text-amber-600 dark:text-[#ff9f0a]'
                    : 'text-[#30d158] dark:text-[#30d158]'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    descriptionDirty ? 'bg-amber-500' : 'bg-green-500'
                  }`} />
                  {descriptionDirty ? 'Unsaved changes' : 'All changes saved'}
                </div>
              ) : undefined}
              footerLeft={descriptionEditing ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveDescription}
                    disabled={!descriptionDirty}
                    className={`text-xs text-white px-3 py-1 rounded-lg transition font-medium ${
                      descriptionDirty ? 'bg-primary hover:bg-primary-dark' : 'bg-primary/40 cursor-not-allowed'
                    }`}
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelDescription}
                    className="text-xs text-[#86868b] dark:text-[#86868b] px-3 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ) : undefined}
            />

            {/* Progress bar section */}
            {(card.checklist || []).length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-[#86868b] dark:text-[#86868b] uppercase tracking-wide flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Progress
                  </label>
                  <span className="text-[11px] font-medium text-[#6e6e73] dark:text-[#aeaeb2]">
                    {Math.round(((card.checklist || []).filter(i => i.checked).length / (card.checklist || []).length) * 100)}%
                  </span>
                </div>
                <div className="ml-5 w-auto h-2 bg-[#e8e8ed] dark:bg-[#3a3a3c] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${((card.checklist || []).filter(i => i.checked).length / (card.checklist || []).length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Checklist section — table layout */}
            <div ref={checklistRef}>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-[#86868b] dark:text-[#86868b] uppercase tracking-wide flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Checklist
                </label>
                {(card.checklist || []).length > 0 && (
                  <span className="text-[11px] font-medium text-[#6e6e73] dark:text-[#aeaeb2]">
                    {(card.checklist || []).filter(i => i.checked).length}/{(card.checklist || []).length} done
                  </span>
                )}
              </div>

              {/* Table */}
              <div className="ml-5 border border-[#d2d2d7] dark:border-[#38383a] rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="flex items-center bg-[#f5f5f7] dark:bg-[#2c2c2e]/60 border-b border-[#d2d2d7] dark:border-[#38383a] px-6 py-2">
                  <span className="flex-1 text-[11px] font-semibold text-[#86868b] dark:text-[#86868b] uppercase tracking-wide">Name</span>
                  <span className="w-44 text-left pl-2 text-[11px] font-semibold text-[#86868b] dark:text-[#86868b] uppercase tracking-wide">Assignee</span>
                </div>

                {/* Table rows */}
                {(card.checklist || []).map(item => (
                  <div key={item.id} className="flex items-center px-6 py-2 border-b border-[#e8e8ed] dark:border-[#38383a]/50 last:border-b-0 hover:bg-black/5 dark:hover:bg-white/5 group/check transition">
                    {/* Checkbox + Name */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <button
                        onClick={() => store.toggleChecklistItem(card.id, item.id)}
                        className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition ${
                          item.checked
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-[#d2d2d7] dark:border-[#48484a] hover:border-green-400'
                        }`}
                      >
                        {item.checked && (
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={`text-sm truncate ${item.checked ? 'line-through text-[#86868b] dark:text-[#86868b]' : 'text-[#1d1d1f] dark:text-[#e5e5ea]'}`}>
                        {item.text}
                      </span>
                      <button
                        onClick={() => store.deleteChecklistItem(card.id, item.id)}
                        className="text-[#aeaeb2] dark:text-[#6e6e73] hover:text-[#ff3b30] opacity-0 group-hover/check:opacity-100 transition shrink-0 ml-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Assignee */}
                    <div className="relative w-44 flex justify-start pl-2">
                      {(() => {
                        const itemAssignee = state.members.find(m => m.id === item.assigneeId);
                        return (
                          <button
                            onClick={() => setChecklistAssigneeDropdown(checklistAssigneeDropdown === item.id ? null : item.id)}
                            className="flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-md px-1.5 py-1 transition"
                          >
                            {itemAssignee ? (
                              <>
                                <div className="w-5 h-5 rounded-full bg-[#0071e3]/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                                  {itemAssignee.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-[11px] font-medium text-[#6e6e73] dark:text-[#aeaeb2] truncate max-w-[80px]">{itemAssignee.name}{itemAssignee.id === store.getCurrentMemberId() ? ' (You)' : ''}</span>
                              </>
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-dashed border-[#d2d2d7] dark:border-[#48484a] flex items-center justify-center text-[#86868b]">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              </div>
                            )}
                          </button>
                        );
                      })()}
                      {checklistAssigneeDropdown === item.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setChecklistAssigneeDropdown(null)} />
                          <div className="absolute top-full right-0 mt-1 bg-white dark:bg-[#1c1c1e] border border-[#d2d2d7] dark:border-[#424245] rounded-xl shadow-lg shadow-black/10 z-20 py-1 w-44">
                            {/* Unassign option */}
                            {item.assigneeId && (
                              <button
                                onClick={() => { store.updateChecklistItemAssignee(card.id, item.id, null); setChecklistAssigneeDropdown(null); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#86868b] hover:bg-black/5 dark:hover:bg-white/10 transition"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                Unassign
                              </button>
                            )}
                            {state.members.map(m => (
                              <button key={m.id}
                                onClick={() => { store.updateChecklistItemAssignee(card.id, item.id, m.id); setChecklistAssigneeDropdown(null); }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${
                                  item.assigneeId === m.id ? 'text-primary font-medium' : 'text-[#6e6e73] dark:text-[#aeaeb2]'
                                }`}
                              >
                                <div className="w-5 h-5 rounded-full bg-[#0071e3]/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                                  {m.name.charAt(0).toUpperCase()}
                                </div>
                                {m.name}{m.id === store.getCurrentMemberId() && <span className="text-[10px] text-[#86868b] ml-1">(You)</span>}
                                {item.assigneeId === m.id && (
                                  <svg className="w-3.5 h-3.5 ml-auto text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add task row */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#1c1c1e]/50">
                  <svg className="w-3.5 h-3.5 text-[#86868b] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <input
                    value={newChecklistItem}
                    onChange={e => setNewChecklistItem(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newChecklistItem.trim()) {
                        store.addChecklistItem(card.id, newChecklistItem.trim());
                        setNewChecklistItem('');
                      }
                    }}
                    placeholder="Add Task"
                    className="flex-1 text-sm bg-transparent outline-none text-[#6e6e73] dark:text-[#aeaeb2] placeholder:text-[#86868b] dark:placeholder:text-[#86868b]"
                  />
                </div>
              </div>
            </div>

            {/* Hidden Attachment section — available in store if needed */}


          </div>
        </div>

        {/* Right: Activity sidebar */}
        <div className="w-[420px] shrink-0 border-l border-[#e8e8ed] dark:border-[#38383a] flex flex-col bg-[#f5f5f7] dark:bg-[#1c1c1e]/50">
          {/* Toggle header */}
          <div className="shrink-0 px-4 py-2.5 border-b border-[#e8e8ed] dark:border-[#38383a] flex items-center gap-1 bg-white dark:bg-[#1c1c1e]">
            <button
              onClick={() => setActivityTab('comments')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                activityTab === 'comments'
                  ? 'bg-[#0071e3]/8 text-primary'
                  : 'text-[#86868b] dark:text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              Comments
              {card.comments.length > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  activityTab === 'comments' ? 'bg-[#0071e3]/10 text-primary' : 'bg-[#e8e8ed] dark:bg-[#3a3a3c] text-[#86868b] dark:text-[#86868b]'
                }`}>{card.comments.length}</span>
              )}
            </button>
            <button
              onClick={() => setActivityTab('activity')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                activityTab === 'activity'
                  ? 'bg-[#0071e3]/8 text-primary'
                  : 'text-[#86868b] dark:text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              Activity Log
              {activities.length > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  activityTab === 'activity' ? 'bg-[#0071e3]/10 text-primary' : 'bg-[#e8e8ed] dark:bg-[#3a3a3c] text-[#86868b] dark:text-[#86868b]'
                }`}>{activities.length}</span>
              )}
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-3">
              {activityTab === 'comments' ? (
                <>
                  {card.comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-[#86868b] dark:text-[#86868b]">
                      <svg className="w-8 h-8 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <p className="text-xs font-medium">No comments yet</p>
                      <p className="text-[10px] mt-0.5">Start the conversation below</p>
                    </div>
                  ) : (
                    [...card.comments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((c) => {
                      const author = state.members.find(m => m.id === c.authorId);
                      const totalReplies = countAllReplies(c.replies || []);
                      const isCollapsed = collapsedComments.has(c.id);

                      const renderReplies = (replies: typeof card.comments, depth: number = 1) => (
                        <div className={`mt-2 space-y-2 ${depth === 1 ? 'ml-2' : 'ml-3'}`}>
                          {replies.map(reply => {
                            const replyAuthor = state.members.find(m => m.id === reply.authorId);
                            return (
                              <div key={`reply-${reply.id}`}>
                                <div className="relative pl-5">
                                  <div className="absolute left-0 top-0.5 w-[14px] h-[14px] rounded-full bg-[#e8e8ed] dark:bg-[#3a3a3c] text-[#86868b] dark:text-[#86868b] text-[7px] font-bold flex items-center justify-center">
                                    {(replyAuthor?.name || '?').charAt(0)}
                                  </div>
                                  <div className="bg-[#f5f5f7] dark:bg-[#3a3a3c]/50 rounded-lg p-2 shadow-sm">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#e5e5ea]">{replyAuthor?.name || 'Unknown'}{replyAuthor?.id === store.getCurrentMemberId() && <span className="text-[10px] text-[#86868b] font-normal ml-1">(You)</span>}</span>
                                    </div>
                                    <div className="text-[11px] text-[#6e6e73] dark:text-[#aeaeb2] leading-relaxed prose-comment" dangerouslySetInnerHTML={{ __html: reply.text }} />
                                    <div className="flex items-center gap-3 mt-1">
                                      <p className="text-[9px] text-[#86868b] dark:text-[#86868b]">
                                        {new Date(reply.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                      <button
                                        onClick={() => setReplyingTo(replyingTo === reply.id ? null : reply.id)}
                                        className="text-[9px] font-medium text-[#86868b] hover:text-primary transition"
                                      >
                                        Reply
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Nested replies */}
                                {(reply.replies || []).length > 0 && renderReplies(reply.replies!, depth + 1)}

                                {/* Reply input for this reply */}
                                {replyingTo === reply.id && (
                                  <div className="mt-2 ml-5">
                                    <CommentEditor
                                      onSubmit={(html) => {
                                        if (html) {
                                          store.addReply(card.id, reply.id, html);
                                          setReplyingTo(null);
                                        }
                                      }}
                                      placeholder="Write a reply..."
                                      compact
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );

                      return (
                        <div key={`comment-${c.id}`} className="relative pl-6">
                          <div className="absolute left-0 top-0.5 w-[18px] h-[18px] rounded-full bg-[#0071e3]/10 text-primary text-[9px] font-bold flex items-center justify-center">
                            {(author?.name || '?').charAt(0)}
                          </div>
                          <div className="bg-white dark:bg-[#2c2c2e] rounded-lg p-2.5 shadow-sm">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs font-medium text-[#1d1d1f] dark:text-[#e5e5ea]">{author?.name || 'Unknown'}{author?.id === store.getCurrentMemberId() && <span className="text-[10px] text-[#86868b] font-normal ml-1">(You)</span>}</span>
                            </div>
                            <div className="text-xs text-[#6e6e73] dark:text-[#aeaeb2] leading-relaxed prose-comment" dangerouslySetInnerHTML={{ __html: c.text }} />
                            <div className="flex items-center gap-3 mt-1.5">
                              <p className="text-[10px] text-[#86868b] dark:text-[#86868b]">
                                {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {c.scheduledAt && new Date(c.scheduledAt) > new Date() && (
                                <span className="text-[9px] font-medium text-amber-500 dark:text-[#ff9f0a] flex items-center gap-0.5">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Scheduled {new Date(c.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                              <button
                                onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                                className="text-[10px] font-medium text-[#86868b] hover:text-primary transition"
                              >
                                Reply
                              </button>
                              {totalReplies > 0 && (
                                <button
                                  onClick={() => toggleCollapse(c.id)}
                                  className="text-[10px] font-medium text-primary hover:text-primary-dark transition flex items-center gap-0.5"
                                >
                                  <svg className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                  {totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Replies — collapsible */}
                          {!isCollapsed && (c.replies || []).length > 0 && renderReplies(c.replies!)}

                          {/* Reply input */}
                          {replyingTo === c.id && (
                            <div className="mt-2 ml-2">
                              <CommentEditor
                                onSubmit={(html) => {
                                  if (html) {
                                    store.addReply(card.id, c.id, html);
                                    setReplyingTo(null);
                                  }
                                }}
                                placeholder="Write a reply..."
                                compact
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </>
              ) : (
                <>
                  {activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-[#86868b] dark:text-[#86868b]">
                      <svg className="w-8 h-8 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs font-medium">No activity yet</p>
                      <p className="text-[10px] mt-0.5">Actions on this card will appear here</p>
                    </div>
                  ) : (
                    activities.map((a, i) => (
                      <div key={`activity-${a.id}`} className="relative pl-6">
                        {i < activities.length - 1 && (
                          <div className="absolute left-[9px] top-4 bottom-[-12px] w-px bg-[#e8e8ed] dark:bg-[#3a3a3c]" />
                        )}
                        <div className="absolute left-[5px] top-1 w-2 h-2 rounded-full bg-[#d2d2d7] dark:bg-[#48484a] ring-2 ring-[#f5f5f7] dark:ring-[#1c1c1e]" />
                        <p className="text-xs text-[#86868b] dark:text-[#86868b]">{a.detail}</p>
                        <p className="text-[10px] text-[#86868b] dark:text-[#86868b] mt-0.5">
                          {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>

          {/* Comment input pinned at bottom — only show on comments tab */}
          {activityTab === 'comments' && (
            <div className="shrink-0 border-t border-[#d2d2d7] dark:border-[#38383a] bg-white dark:bg-[#1c1c1e]">
              <CommentEditor onSubmit={(html, scheduledAt) => handleAddComment(html, scheduledAt)} />
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
