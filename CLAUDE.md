# CLAUDE.md — Kanban Website Project Reference

## Project Overview

A kanban-style project management tool built with React, TypeScript, and Tailwind CSS. Deployed on GitHub Pages with Firebase as the cloud backend. The user (Nikko) does not code — all development is done through Claude.

**Live URL:** Deployed via GitHub Pages at `https://nikkortrinidad-cpu.github.io/flizow/`
**Repository:** `https://github.com/nikkortrinidad-cpu/flizow`

---

## Tech Stack

- **Framework:** React 19 with TypeScript (~5.9)
- **Build Tool:** Vite 8 (base path: `/flizow/`)
- **Styling:** Tailwind CSS v4 with class-based dark mode (`@custom-variant dark`)
- **Backend:** Firebase (Firestore for cloud sync, Google Auth for login)
- **Rich Text:** TipTap editor (StarterKit, Link, Image, Placeholder extensions)
- **Drag & Drop:** @dnd-kit/core + @dnd-kit/sortable
- **Charts:** Recharts (bar charts, pie charts in analytics)
- **Utilities:** uuid, date-fns, marked, dompurify
- **Deployment:** GitHub Actions workflow (`.github/workflows/deploy.yml`) — auto-deploys `dist/` on push to `main`
- **npm path:** `/Users/nikko/local/node/bin`

---

## Folder Structure

```
kanban-website/
├── .github/workflows/deploy.yml    # GitHub Pages CI/CD
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── main.tsx                     # App entry point, wraps with AuthProvider
│   ├── App.tsx                      # Root layout: header, filters bar, board, modals
│   ├── index.css                    # Global styles, TipTap editor CSS, dark mode overrides
│   ├── types.ts                     # All TypeScript interfaces and types
│   ├── contexts/
│   │   └── AuthContext.tsx          # Firebase Google Auth context provider
│   ├── lib/
│   │   └── firebase.ts             # Firebase app init, auth, Firestore exports
│   ├── store/
│   │   ├── boardStore.ts           # Central state store (BoardStore class)
│   │   └── useStore.ts             # React hook via useSyncExternalStore
│   ├── components/
│   │   ├── KanbanBoard.tsx          # Main board with drag-and-drop, swimlanes, column sorting
│   │   ├── KanbanColumn.tsx         # Individual column with cards, add card, column settings
│   │   ├── KanbanCard.tsx           # Card preview tile on the board
│   │   ├── CardDetailPanel.tsx      # Full card detail modal (main panel + comments sidebar)
│   │   ├── MarkdownEditor.tsx       # TipTap description editor with toolbar
│   │   ├── CommentEditor.tsx        # TipTap comment editor with send/schedule send
│   │   ├── Filters.tsx              # Search and filter bar (assignees, labels, priorities)
│   │   ├── Analytics.tsx            # Analytics modal with charts
│   │   ├── BoardSettings.tsx        # Settings modal (general, lists, swimlanes, labels, members, archive, trash)
│   │   ├── ColorPicker.tsx          # Reusable color picker with saved colors
│   │   ├── LoginPage.tsx            # Google Sign-In page
│   │   └── NotificationsPanel.tsx   # Notifications dropdown
│   └── utils/
│       └── markdownInsert.ts        # Markdown insertion utilities
├── index.html
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── eslint.config.js
├── package.json
├── dev-server.mjs
└── start-dev.sh
```

---

## Key Files in Detail

### `src/types.ts`
Central type definitions:
- **Card:** id, title, description, assigneeId, startDate, dueDate, priority, labels, comments, attachments, checklist, columnId, swimlaneId, order, createdAt, updatedAt
- **Comment:** id, authorId, text, createdAt, replies (recursive), scheduledAt (optional)
- **ChecklistItem:** id, text, checked, assigneeId
- **Column:** id, title, wipLimit, order, color
- **Swimlane:** id, title, order, collapsed
- **TeamMember:** id, name, email, avatar, role (admin/manager/member/viewer)
- **Priority:** 'low' | 'medium' | 'high' | 'urgent'
- **TrashItem / ArchiveItem:** soft-delete with associated cards for columns
- **BoardState:** columns, swimlanes, cards, labels, members, notifications, activityLog, filters, savedColors, theme, trash, archive

### `src/store/boardStore.ts`
Singleton `BoardStore` class — the heart of the app:
- **State management:** Custom store pattern with `useSyncExternalStore` (no Redux/Zustand)
- **Persistence:** Dual-write to `localStorage` (key: `kanban-board-state`) and Firestore (debounced 1s)
- **Firebase sync:** Real-time `onSnapshot` listener per user; filters and theme are local-only
- **Key methods:** addCard, updateCard, deleteCard, moveCard, addComment, addReply, addChecklistItem, toggleChecklistItem, archiveCard, archiveColumn, restoreFromArchive, restoreFromTrash, etc.
- **getCurrentMemberId():** Returns `'user-1'` (used for "(You)" indicators)
- **Activity log:** Auto-logged for card CRUD, moves, comments; capped at 500 entries
- **Notifications:** Auto-generated; capped at 100; includes WIP limit warnings
- **Trash:** Auto-cleanup after 30 days

### `src/store/useStore.ts`
Simple hook wrapper: `useBoard()` returns `{ state, store }` via `useSyncExternalStore`.

### `src/components/CardDetailPanel.tsx`
The largest and most complex component. Split into two panels:

**Left side (main content):**
- Card title (inline editable)
- Two-column metadata table: Status, Assignees, Priority, Labels, Start Date, Due Date — all aligned with `ml-5`
- Description (TipTap rich text editor via MarkdownEditor) — read-only by default, click-to-edit with hover indicator, save/cancel buttons appear during editing, also indented with `ml-5`
- Progress bar (separate section between description and checklist)
- Checklist with assignee per item, drag handle, done counter

**Right sidebar (`w-[420px]`):**
- Toggle between Comments and Activity Log tabs (defaults to Comments)
- Comment system with TipTap-powered CommentEditor
- Recursive reply system (replies can have replies, infinite nesting)
- Replies collapsed by default when opening card
- Scheduled comment badge (amber clock icon)
- @mention support

**Title bar (top):**
- Creation date indicator
- Share button with modal (invite by email, permissions, public/private link)
- 3-dot settings menu: Duplicate card, Copy link, Archive card, Delete card
- Close button
- Reduced padding (`py-1.5`)

**Keyboard:** Escape key closes the card.

### `src/components/MarkdownEditor.tsx`
TipTap-based description editor:
- Toolbar: Heading dropdown (H1-H5 + plain text with keyboard shortcuts), Bold, Italic, Underline, Strikethrough, Code, Bullet List, Ordered List, Link, Image, Horizontal Rule
- Enlarged toolbar icons: buttons `w-8 h-8`, text labels `14px`, SVG icons `w-4.5 h-4.5`, dividers `h-5`
- Min-height: `250px`
- Character counter with color-coded warnings
- Read-only mode with hover "Click to edit" indicator
- Save/cancel buttons via `footerLeft` prop
- `headerRight` prop for injecting save status indicator
- Content indented with `ml-5`

### `src/components/CommentEditor.tsx`
TipTap-based comment editor with:
- Bottom action bar: Formatting toggle, @mention, emoji picker, GIF/sticker picker, file upload
- Send button: Paper plane icon (rotated right), disabled when empty
- Schedule send: Chevron button attached to send (same height `h-8`), dropdown with "In 20 minutes", "In 2 hours", "Tomorrow at 9:00 AM", and custom datetime picker
- Both send and schedule buttons disabled until at least one character is typed
- Compact mode for reply editors (smaller min/max height)
- `isEmpty` state tracked via TipTap's `onUpdate` callback

### `src/components/BoardSettings.tsx`
Settings modal with tabs:
- **General:** Board name, theme toggle, danger zone (reset board)
- **Lists** (renamed from "Columns"): Drag-to-reorder, color picker, WIP limit, archive button (amber), delete button; placeholder "New list name"
- **Swimlanes:** Add/edit/delete
- **Labels:** CRUD with color picker
- **Members:** Add/remove, role management, "(You)" indicator
- **Archive** (before Trash in tab order): Restore or permanently delete archived items
- **Trash:** Restore or permanently delete, empty trash

### `src/components/KanbanBoard.tsx`
- DndContext with drag-and-drop for cards and columns
- SortableContext for column reordering (horizontal)
- Swimlane rows with collapsible sections
- "Add list" button at the end
- Card click opens CardDetailPanel

### `src/components/KanbanColumn.tsx`
- Droppable zone for cards
- Column header with drag handle, title, card count, WIP limit indicator
- Column menu: List settings (title, WIP limit, color), Archive list, Delete list
- "Archive list" calls `store.archiveColumn()` (not deleteColumn)
- Add card form at bottom

### `src/components/KanbanCard.tsx`
- Compact card tile with: labels, title, priority badge, assignee avatar, due date, comment count, checklist progress
- Mark complete button (moves to last column)
- Assignee avatar tooltip shows "(You)" for current user

### `src/App.tsx`
Root layout:
- Header: Kanban Board logo/title, Analytics icon button, Settings icon button (words removed, icon-only), Notifications bell, User avatar with dropdown (sign out)
- Filters bar
- KanbanBoard
- Modals: Analytics, BoardSettings

---

## Design Choices

### Colors (defined in `index.css` @theme)
- **Primary:** `#6366f1` (Indigo) — used for buttons, links, active states
- **Primary Dark:** `#4f46e5` — hover states
- **Primary Light:** `#818cf8` — dark mode accents
- **Danger:** `#ef4444` (Red)
- **Warning:** `#f59e0b` (Amber)
- **Success:** `#10b981` (Emerald)
- **Info:** `#3b82f6` (Blue)
- **Surface:** `#f8fafc` / `#f1f5f9`
- **Border:** `#e2e8f0`

### Typography
- **Font:** 'Inter', system-ui, -apple-system, sans-serif
- **Code font:** 'SF Mono', Monaco, monospace

### Layout
- Card detail modal: `max-w-6xl`, `h-[98vh]`, rounded-2xl
- Comments sidebar: `w-[420px]`
- Content sections spacing: `space-y-7`
- Content indentation: `ml-5` (description, metadata table, progress bar, checklist — aligned with the "D" in "Description")
- Card title also indented with `ml-5`
- Title bar padding: `py-1.5` (trimmed)

### Dark Mode
- Class-based toggling on `<html>` element
- Full dark mode support across all components
- Dark backgrounds: `bg-gray-900`, `bg-gray-800`, `bg-slate-800`, `bg-slate-700`
- Scrollbar colors adapt to dark mode

### UI/UX Patterns
- Hover-to-reveal edit indicators
- Click-to-edit description (read-only by default)
- Inline editing for card titles
- Dropdown menus with backdrop overlay for closing
- Slide-in animations for panels
- Custom scrollbar styling (6px width)
- Horizontal rule in editor: 75% width, left-aligned
- "(You)" indicator on all assignee displays across 5+ components
- Escape key closes card detail panel

### Comment System
- Recursive replies (infinite nesting depth)
- Replies collapsed by default when opening cards
- Collapse/expand toggle with reply count
- @mention with member search dropdown
- Schedule send with preset times + custom datetime picker
- Send button: Paper plane icon pointing right
- Buttons disabled until content is typed

### Horizontal Rule
- `border-top: 2px solid #cbd5e1; margin: 1em 0; width: 75%;`
- Dark mode: `border-top-color: #475569`

### @Mention Styling
- Background: `rgba(99,102,241,0.1)`, color: primary, font-weight: 600
- No underline, no pointer events (display-only after insertion)

---

## User Preferences

- Does not know how to code — all changes made through Claude
- Wants changes committed and pushed to GitHub after each modification
- Prefers incremental changes with immediate visual feedback
- Values clean spacing and readability
- Prefers icon-only buttons for header actions (Analytics, Settings)
- Likes subtle hover indicators ("Click to edit")
- Wants disabled states for buttons until input is provided
- Prefers descriptions to be non-editable by default (click to edit)
- Wants save/cancel buttons for description edits (not auto-save)
- Appreciates "(You)" identity indicators throughout the UI

---

## Build & Development

```bash
# Start dev server
cd /Users/nikko/Downloads/Claude/Code/kanban-website
PATH="/Users/nikko/local/node/bin:$PATH" npm run dev

# Build for production
PATH="/Users/nikko/local/node/bin:$PATH" npm run build

# Deploy: Push to main branch triggers GitHub Actions
git push origin main
```

---

## Firebase Configuration

- **Project:** kanban-5f0f4
- **Auth:** Google Sign-In (popup flow)
- **Firestore:** Document per user at `boards/{userId}`, stores serialized BoardState
- **Sync:** Real-time via `onSnapshot`, debounced writes (1s), filters/theme excluded from cloud sync

---

## Default Board Configuration

- **Columns:** Backlog (#94a3b8), To Do (#6366f1), In Progress (#f59e0b), Review (#8b5cf6), Done (#10b981)
- **Swimlanes:** Default (single swimlane)
- **Labels:** Bug (red), Feature (blue), Improvement (green), Urgent (orange), Design (pink), Research (purple)
- **Saved Colors:** 8 preset colors for color pickers
- **Default Member:** user-1 (You) with admin role

---

## Design Standards

Before creating or modifying any UI layout, mockup, or component, always read and follow the design skill file:
- **`~/Documents/Claude/skills/grids-and-layout-design.md`** — Grid systems, typography, composition (Golden Ratio, Rule of Thirds, Gestalt principles), line length rules (45–70 cpl), spacing, and a pre-flight checklist.
- **`~/Documents/Claude/skills/coding-best-practices.md`** — Code quality, readability, and maintainability standards.

## Copywriting & Voice

Before writing any copy, content, or text on behalf of Nikko, always read and follow:
- **`~/Documents/Claude/about me/About Me - Nikko Trinidad.md`** — Background, context, and personal details to inform tone and content.
- **`~/Documents/Claude/about me/Anti AI Writing Style.md`** — Writing style guidelines to ensure copy sounds natural and human, not AI-generated.

---

## Known Patterns & Conventions

- All state mutations go through `BoardStore` methods which call `this.save()` (localStorage + Firestore)
- Components access state via `useBoard()` hook
- Modals use `fixed inset-0 z-50` with backdrop blur overlay
- Dropdown menus: positioned absolutely with `fixed inset-0 z-N` backdrop for click-outside closing
- SVG icons are inline (not from an icon library)
- Tailwind classes are written directly (no component abstractions / design system)
- TipTap extensions configured per editor instance (StarterKit, Link, Image, Placeholder)
