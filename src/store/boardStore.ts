import { v4 as uuid } from 'uuid';
import type {
  BoardState, Card, Column, Swimlane, Label, TeamMember,
  Notification, FilterState, Priority, Comment
} from '../types';

const STORAGE_KEY = 'kanban-board-state';

function createDefaultState(): BoardState {
  const columns: Column[] = [
    { id: 'col-backlog', title: 'Backlog', wipLimit: 0, order: 0, color: '#94a3b8' },
    { id: 'col-todo', title: 'To Do', wipLimit: 5, order: 1, color: '#6366f1' },
    { id: 'col-progress', title: 'In Progress', wipLimit: 3, order: 2, color: '#f59e0b' },
    { id: 'col-review', title: 'Review', wipLimit: 2, order: 3, color: '#8b5cf6' },
    { id: 'col-done', title: 'Done', wipLimit: 0, order: 4, color: '#10b981' },
  ];
  const swimlanes: Swimlane[] = [
    { id: 'swim-default', title: 'Default', order: 0, collapsed: false },
  ];
  const labels: Label[] = [
    { id: 'lbl-bug', name: 'Bug', color: '#ef4444' },
    { id: 'lbl-feature', name: 'Feature', color: '#3b82f6' },
    { id: 'lbl-improvement', name: 'Improvement', color: '#10b981' },
    { id: 'lbl-urgent', name: 'Urgent', color: '#f97316' },
    { id: 'lbl-design', name: 'Design', color: '#ec4899' },
    { id: 'lbl-research', name: 'Research', color: '#8b5cf6' },
  ];
  const members: TeamMember[] = [
    { id: 'user-1', name: 'You', email: 'you@team.com', avatar: '', role: 'admin' },
  ];
  return {
    columns, swimlanes, cards: [], labels, members,
    notifications: [], activityLog: [],
    filters: { search: '', assigneeIds: [], labelIds: [], priorities: [], dueDateRange: { from: null, to: null } },
  };
}

function loadState(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return createDefaultState();
}

type Listener = () => void;

class BoardStore {
  private state: BoardState;
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.state = loadState();
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.listeners.forEach(l => l());
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getState(): BoardState { return this.state; }

  private logActivity(cardId: string, userId: string, action: string, detail: string) {
    this.state.activityLog.unshift({
      id: uuid(), cardId, userId, action, detail, timestamp: new Date().toISOString(),
    });
    if (this.state.activityLog.length > 500) this.state.activityLog.length = 500;
  }

  private addNotification(message: string, type: Notification['type'] = 'info', cardId?: string) {
    this.state.notifications.unshift({
      id: uuid(), message, type, read: false, timestamp: new Date().toISOString(), cardId,
    });
    if (this.state.notifications.length > 100) this.state.notifications.length = 100;
  }

  // --- Cards ---
  addCard(partial: Partial<Card> & { title: string; columnId: string }) {
    const card: Card = {
      id: uuid(),
      title: partial.title,
      description: partial.description || '',
      assigneeId: partial.assigneeId || null,
      dueDate: partial.dueDate || null,
      priority: partial.priority || 'medium',
      labels: partial.labels || [],
      comments: [],
      attachments: [],
      columnId: partial.columnId,
      swimlaneId: partial.swimlaneId || this.state.swimlanes[0]?.id || 'swim-default',
      order: this.state.cards.filter(c => c.columnId === partial.columnId).length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const col = this.state.columns.find(c => c.id === card.columnId);
    if (col && col.wipLimit > 0) {
      const count = this.state.cards.filter(c => c.columnId === col.id).length;
      if (count >= col.wipLimit) {
        this.addNotification(`WIP limit reached for "${col.title}" (${col.wipLimit})`, 'warning', card.id);
      }
    }

    this.state.cards.push(card);
    this.logActivity(card.id, 'user-1', 'created', `Created card "${card.title}"`);
    this.addNotification(`Card "${card.title}" created`, 'success', card.id);
    this.save();
    return card;
  }

  updateCard(cardId: string, updates: Partial<Card>) {
    const idx = this.state.cards.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const card = this.state.cards[idx];
    const oldColumnId = card.columnId;
    Object.assign(card, updates, { updatedAt: new Date().toISOString() });

    if (updates.columnId && updates.columnId !== oldColumnId) {
      const newCol = this.state.columns.find(c => c.id === updates.columnId);
      const oldCol = this.state.columns.find(c => c.id === oldColumnId);
      if (newCol && newCol.wipLimit > 0) {
        const count = this.state.cards.filter(c => c.columnId === newCol.id).length;
        if (count > newCol.wipLimit) {
          this.addNotification(`WIP limit exceeded for "${newCol.title}" (${count}/${newCol.wipLimit})`, 'warning', cardId);
        }
      }
      this.logActivity(cardId, 'user-1', 'moved', `Moved "${card.title}" from ${oldCol?.title} to ${newCol?.title}`);
    } else {
      this.logActivity(cardId, 'user-1', 'updated', `Updated "${card.title}"`);
    }
    this.save();
  }

  deleteCard(cardId: string) {
    const card = this.state.cards.find(c => c.id === cardId);
    this.state.cards = this.state.cards.filter(c => c.id !== cardId);
    if (card) {
      this.logActivity(cardId, 'user-1', 'deleted', `Deleted card "${card.title}"`);
    }
    this.save();
  }

  moveCard(cardId: string, toColumnId: string, toSwimlaneId: string, newOrder: number) {
    const card = this.state.cards.find(c => c.id === cardId);
    if (!card) return;
    const oldColumnId = card.columnId;
    card.columnId = toColumnId;
    card.swimlaneId = toSwimlaneId;
    card.order = newOrder;
    card.updatedAt = new Date().toISOString();

    // reorder cards in the target column+swimlane
    const siblings = this.state.cards
      .filter(c => c.columnId === toColumnId && c.swimlaneId === toSwimlaneId && c.id !== cardId)
      .sort((a, b) => a.order - b.order);
    siblings.splice(newOrder, 0, card);
    siblings.forEach((c, i) => { c.order = i; });

    if (oldColumnId !== toColumnId) {
      const newCol = this.state.columns.find(c => c.id === toColumnId);
      const oldCol = this.state.columns.find(c => c.id === oldColumnId);
      if (newCol && newCol.wipLimit > 0) {
        const count = this.state.cards.filter(c => c.columnId === newCol.id).length;
        if (count > newCol.wipLimit) {
          this.addNotification(`WIP limit exceeded for "${newCol.title}" (${count}/${newCol.wipLimit})`, 'warning', cardId);
        }
      }
      this.logActivity(cardId, 'user-1', 'moved', `Moved "${card.title}" from ${oldCol?.title} to ${newCol?.title}`);
    }
    this.save();
  }

  addComment(cardId: string, text: string) {
    const card = this.state.cards.find(c => c.id === cardId);
    if (!card) return;
    const comment: Comment = { id: uuid(), authorId: 'user-1', text, createdAt: new Date().toISOString() };
    card.comments.push(comment);
    this.logActivity(cardId, 'user-1', 'commented', `Commented on "${card.title}"`);
    this.save();
  }

  // --- Columns ---
  addColumn(title: string) {
    this.state.columns.push({
      id: uuid(), title, wipLimit: 0,
      order: this.state.columns.length,
      color: '#6366f1',
    });
    this.save();
  }

  updateColumn(colId: string, updates: Partial<Column>) {
    const col = this.state.columns.find(c => c.id === colId);
    if (col) { Object.assign(col, updates); this.save(); }
  }

  deleteColumn(colId: string) {
    this.state.cards = this.state.cards.filter(c => c.columnId !== colId);
    this.state.columns = this.state.columns.filter(c => c.id !== colId);
    this.save();
  }

  // --- Swimlanes ---
  addSwimlane(title: string) {
    this.state.swimlanes.push({ id: uuid(), title, order: this.state.swimlanes.length, collapsed: false });
    this.save();
  }

  updateSwimlane(id: string, updates: Partial<Swimlane>) {
    const s = this.state.swimlanes.find(sl => sl.id === id);
    if (s) { Object.assign(s, updates); this.save(); }
  }

  deleteSwimlane(id: string) {
    if (this.state.swimlanes.length <= 1) return;
    const fallback = this.state.swimlanes.find(s => s.id !== id);
    if (fallback) {
      this.state.cards.forEach(c => { if (c.swimlaneId === id) c.swimlaneId = fallback.id; });
    }
    this.state.swimlanes = this.state.swimlanes.filter(s => s.id !== id);
    this.save();
  }

  // --- Labels ---
  addLabel(name: string, color: string) {
    const label: Label = { id: uuid(), name, color };
    this.state.labels.push(label);
    this.save();
    return label;
  }

  deleteLabel(id: string) {
    this.state.labels = this.state.labels.filter(l => l.id !== id);
    this.state.cards.forEach(c => { c.labels = c.labels.filter(l => l !== id); });
    this.save();
  }

  // --- Members ---
  addMember(name: string, email: string, role: TeamMember['role'] = 'member') {
    const member: TeamMember = { id: uuid(), name, email, avatar: '', role };
    this.state.members.push(member);
    this.save();
    return member;
  }

  updateMember(id: string, updates: Partial<TeamMember>) {
    const m = this.state.members.find(mem => mem.id === id);
    if (m) { Object.assign(m, updates); this.save(); }
  }

  deleteMember(id: string) {
    this.state.members = this.state.members.filter(m => m.id !== id);
    this.state.cards.forEach(c => { if (c.assigneeId === id) c.assigneeId = null; });
    this.save();
  }

  // --- Notifications ---
  markNotificationRead(id: string) {
    const n = this.state.notifications.find(notif => notif.id === id);
    if (n) { n.read = true; this.save(); }
  }

  markAllNotificationsRead() {
    this.state.notifications.forEach(n => { n.read = true; });
    this.save();
  }

  clearNotifications() {
    this.state.notifications = [];
    this.save();
  }

  // --- Filters ---
  setFilters(filters: Partial<FilterState>) {
    Object.assign(this.state.filters, filters);
    this.save();
  }

  clearFilters() {
    this.state.filters = { search: '', assigneeIds: [], labelIds: [], priorities: [], dueDateRange: { from: null, to: null } };
    this.save();
  }

  getFilteredCards(): Card[] {
    const f = this.state.filters;
    return this.state.cards.filter(card => {
      if (f.search && !card.title.toLowerCase().includes(f.search.toLowerCase()) &&
        !card.description.toLowerCase().includes(f.search.toLowerCase())) return false;
      if (f.assigneeIds.length && (!card.assigneeId || !f.assigneeIds.includes(card.assigneeId))) return false;
      if (f.labelIds.length && !card.labels.some(l => f.labelIds.includes(l))) return false;
      if (f.priorities.length && !f.priorities.includes(card.priority)) return false;
      return true;
    });
  }

  // --- Analytics helpers ---
  getCardsPerColumn() {
    return this.state.columns.map(col => ({
      name: col.title,
      count: this.state.cards.filter(c => c.columnId === col.id).length,
      color: col.color,
    }));
  }

  getCardsByPriority() {
    const priorities: Priority[] = ['low', 'medium', 'high', 'urgent'];
    return priorities.map(p => ({
      name: p,
      count: this.state.cards.filter(c => c.priority === p).length,
    }));
  }

  getThroughput(days: number = 30) {
    const now = new Date();
    const entries = this.state.activityLog.filter(e => {
      if (e.action !== 'moved') return false;
      const doneCol = this.state.columns.find(c => c.title === 'Done');
      if (!doneCol || !e.detail.includes(doneCol.title)) return false;
      const diff = (now.getTime() - new Date(e.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      return diff <= days;
    });
    return entries.length;
  }

  resetBoard() {
    this.state = createDefaultState();
    this.save();
  }
}

export const store = new BoardStore();
