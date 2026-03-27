export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type UserRole = 'admin' | 'manager' | 'member' | 'viewer';

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  cardId: string;
  userId: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  priority: Priority;
  labels: string[];
  comments: Comment[];
  attachments: string[];
  checklist: ChecklistItem[];
  columnId: string;
  swimlaneId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: string;
  title: string;
  wipLimit: number;
  order: number;
  color: string;
}

export interface Swimlane {
  id: string;
  title: string;
  order: number;
  collapsed: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  timestamp: string;
  cardId?: string;
}

export interface BoardState {
  columns: Column[];
  swimlanes: Swimlane[];
  cards: Card[];
  labels: Label[];
  members: TeamMember[];
  notifications: Notification[];
  activityLog: ActivityEntry[];
  filters: FilterState;
  savedColors: string[];
  theme: 'light' | 'dark';
}

export interface FilterState {
  search: string;
  assigneeIds: string[];
  labelIds: string[];
  priorities: Priority[];
  dueDateRange: { from: string | null; to: string | null };
}
