# Technical Reference

A catalog of how the mockup is wired so you can find the reference implementation for any piece you're rebuilding.

All line numbers refer to `public/flizow-test.html`.

## Routing

Hash-based routing. No framework router — raw `hashchange` listener.

| Hash | View | Notes |
|---|---|---|
| `#overview` (or empty) | `.view-overview` | Default landing. |
| `#clients` | `.view-clients` | Directory table with split-pane detail. |
| `#clients/<clientId>` | `.view-client-detail` | Renders inside the split pane. |
| `#board` | `.view-board` | Board for the default service. |
| `#board/<serviceId>` | `.view-board` | Board for a specific service. |
| `#card-<taskId>` | (card modal) | Opens a card detail panel over the current view. |

**Key functions:**
- `parseHash()` — line ~14724. Returns `{ view, id }`.
- `routeToView(target, id)` — line ~14676. Switches `.view` display.
- Nav-link click handler — line ~14736. Intercepts `data-view-target` clicks, updates history, calls `routeToView`.
- `hashchange` listener — line ~14781.

## Views inventory

| Selector | What it is |
|---|---|
| `.view-overview` | Dashboard: Portfolio Health, Needs Your Attention, Schedule, My Boards. |
| `.view-clients` | Clients directory with split-pane detail, saved views, search. |
| `.view-client-detail` | Client detail page (services list, integrations, onboarding, team, activity). |
| `.view-board` | Kanban board for a service. |

Views are shown/hidden via `display` — only one is active at a time. The Clients split view is a special case: the client detail renders inside `.clients-split-wrapper` so both are visible side-by-side on that route.

## Taxonomies

**Client status** (`client.status`):
- `fire` — On Fire (critical).
- `risk` — At Risk (warnings).
- `track` — On Track (healthy).
- `onboard` — Onboarding (with progress %).
- `paused` — Paused.

**Kanban columns** (`task.columnId`):
- `todo` — To Do
- `inprogress` — In Progress
- `blocked` — Blocked
- `review` — Needs Review
- `done` — Done

**Service type** (`service.type`):
- `retainer` — Ongoing monthly service.
- `project` — Fixed-scope project.

**Priority** (`task.priority`):
- `low`, `medium`, `high`, `urgent`

**Severity** (`task.severity`, optional):
- `critical`, `warning` (or absent for normal tasks)

**Schedule tag** (`task._schedule.tag`, optional):
- `deadline`, `meeting`, `milestone`

## Feature catalog

### Cmd+K global search

- Trigger: `⌘K` / `Ctrl+K` or click `.cmdk-trigger`.
- Function: `openCmdK()` (line ~9107), `closeCmdK()` (line ~9123).
- Modal: `#cmdkOverlay` (line ~6803).
- Search implementation: the IIFE starting at line ~16117. Builds five result groups: Commands, Clients, Boards (services), Tasks, People (members).
- Routing: Enter or click on a result calls `activate(it)` which either sets `location.hash` (most types) or navigates to the board and opens the card panel (tasks).

### Favorites (pinned boards)

- Storage: `localStorage['flizow-favorite-boards']` — array of service IDs.
- Max pinned: `MAX_PINNED = 8`.
- Defaults: `['acme-corp-svc-0', 'bloom-retail-svc-0', 'techstart-inc-svc-0']`.
- Toggle UI: `.service-star` on service cards (delegated click handler, line ~15642).
- Renderers: `renderPinnedStrip()` fans out to every `.pinned-strip` on the page (one on Overview, one on Clients). Favoriting anywhere updates both.

### Block drag-to-reorder (Overview)

- Storage: `localStorage['overview-block-order']` — array of `data-block-id` values.
- IIFE: starts line ~14471.
- Drag handle: `.block-drag-handle` inside each `.block`.
- On restore: applies saved order but appends any unknown/new blocks at the end (so newly-added blocks don't get stranded at the top).

### Schedule grid

- Container: `#weekBoard` inside `[data-block-id="schedule"]`.
- Tabs: `.week-tab[data-target="current|next"]`.
- Renderer: `renderSchedule()` (line ~14276).
- Day anchor: `applyToday()` (line ~14366) — computes Mon–Fri of the current week.
- Tasks shown have `_schedule` metadata on them; `scheduleTaskMap` provides the taskId → serviceId lookup so clicks route to the right board.
- Next-week columns render at `opacity: 0.45` (dimmed but readable).

### Clients saved views

- Object: `SAVED_VIEWS` (line ~15379). Each entry is a predicate function on a client row.
- Entries: `all`, `mine`, `fire`, `risk`, `track`, `onboard`, `paused`.
- `mine` filters by AM initials — currently hardcoded to `'NT'` (Nikko). In production, bind this to the logged-in user.

### Service cards → board routing

- Selector: `.service-card[data-service-id]`.
- Click handler: line ~14771. Any click (except on nested buttons/links) navigates to `#board/<serviceId>`.
- Keyboard: Enter or Space on a focused card triggers the same navigation.

### Card detail modal

- Trigger: click any card on a Kanban board.
- Function: `openCardPanel(cardEl)` (line ~9259).
- Close: `closeCardPanel()` (line ~9695), or Escape.
- Tabs: Description, Comments, Activity.

### Theme toggle

- Function: `toggleTheme()` (lines ~9097 and ~13791).
- Persistence: `localStorage['refined-theme']`.
- Applied via: `data-theme` attribute on `<html>`.

## Keyboard shortcuts

| Key | Context | Action |
|---|---|---|
| `⌘K` / `Ctrl+K` | Anywhere | Open Cmd+K search |
| `Esc` | Cmd+K open | Close search |
| `Esc` | Card modal open | Close card |
| `Esc` | Description editor | Cancel edit |
| `Enter` | Cmd+K | Activate highlighted result |
| `Arrow Up/Down` | Cmd+K | Navigate results |
| `Enter` | Card add field | Submit |
| `⌘F` / `Ctrl+F` | Board view | Search cards within board |

## localStorage keys (canonical list)

| Key | Shape | Notes |
|---|---|---|
| `refined-theme` | `'dark'` \| `'light'` | User theme preference. |
| `flizow-favorite-boards` | `string[]` of service IDs | Max 8 entries. |
| `overview-block-order` | `string[]` of block IDs | Persists Overview block order. |
| `_TEST_COMMENTS_KEY` | JSON array | Mockup-only — test comments for the card panel. |
| `_SEED_MUT_KEY` | JSON | Mockup-only — tracks which seed cards have been mutated. |
| `_DRAFT_KEY` | string | Mockup-only — in-progress card description draft. |
| `GIPHY_KEY_STORAGE` | string | Mockup-only — Giphy API key for comment editor. |

The first three (`refined-theme`, `flizow-favorite-boards`, `overview-block-order`) are real user preferences — move these to per-user server-side storage in production. The rest are mockup scaffolding and can be dropped.

## Block IDs (Overview)

Each draggable section on Overview has a stable `data-block-id`:
- `health` — Portfolio Health
- `attention` — Needs Your Attention
- `schedule` — Schedule
- `myboards` — My Boards

Use these as stable keys for the block-order preference.

## Build / run (mockup)

No build required. Open `public/flizow-test.html` in any modern browser. To serve locally:

```bash
cd kanban-website
PATH="/Users/nikko/local/node/bin:$PATH" npm run dev
# then open http://localhost:5173/kanban-website/flizow-test.html
```

## Known rough edges in the mockup

Flagging these so you don't mistake them for intentional behavior:

- **`mine` saved view hardcodes `'NT'`** — replace with logged-in user's AM ID.
- **Onboarding progress bars** — hardcoded in the mockup, should read from a real service progress field in production.
- **Activity log on client detail** — placeholder entries, not wired to a real event stream.
- **Templates button** in the header — opens an empty `openTemplates()` modal. Templates are planned but not designed.
- **Notifications bell** — has a red dot but no list renders. Real notifications are v1+ scope.

## What you'll rebuild vs reuse

You will **rebuild**: every component, in whatever framework the team picks. The mockup's DOM is not meant to be copied.

You will **reuse**: the data shape (`FLIZOW_DATA`), the interaction patterns (favorite sync, block reorder, Cmd+K), the copy, the visual language (colors, spacing, typography), and the view-to-route mapping.

If anything in this doc contradicts what you see in the running mockup, the mockup is authoritative — flag the doc for update.
