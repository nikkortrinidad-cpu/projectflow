# Stable vs Iterating — What to Build, What to Hold

This is the only doc that actively changes as Nikko finalizes design decisions. Check the date at the bottom to confirm freshness before relying on it.

## Safe to build now (specs are stable)

| Feature | Where in mockup | Notes |
|---|---|---|
| Top nav (Overview / Clients) | `.header-nav` | Hash routing, two functional tabs. |
| Cmd+K global search | `openCmdK()` | Searches commands, clients, services, tasks, members. |
| Theme toggle (dark/light) | `toggleTheme()` | Persists to `localStorage['refined-theme']`. |
| Notifications icon (UI only) | `.header-icon[aria-label="Notifications"]` | No backend behavior yet — just the UI affordance. |
| **Overview — Portfolio Health** | `[data-block-id="health"]` | Status count cards: On Fire / At Risk / On Track. |
| **Overview — Needs Your Attention** | `[data-block-id="attention"]` | List of critical/warning tasks across portfolio. |
| **Overview — Schedule (this week + next week)** | `[data-block-id="schedule"]` | Mon–Fri grid; tab to switch weeks; next week dimmed. |
| **Overview — My Boards strip** | `[data-block-id="myboards"]` | Favorited service boards. Shared store with Clients view. |
| Drag-to-reorder Overview blocks | `STORAGE_KEY = 'overview-block-order'` | Persists user's preferred block order. |
| **Clients — directory table** | `.view-clients` | 50 rows, search, AM filter, status filter. |
| **Clients — saved views** | `SAVED_VIEWS` | All / Mine / On Fire / At Risk / On Track / Onboarding / Paused. |
| **Clients — split-pane detail** | `.clients-split-wrapper` | List on left, client detail on right. |
| **Client detail page** | `.view-client-detail` | Services list, integrations, onboarding checklist, team, activity. |
| **Service card → Kanban board** | `.service-card[data-service-id]` | Click navigates to `#board/<serviceId>`. |
| **Favorites (star a board)** | `.service-star` | Adds to `localStorage['projectflow-favorite-boards']`. Synced to both Overview and Clients strips. |
| **Kanban board** | `.view-board` | Columns, cards, sidebar metadata. |
| Kanban — card detail modal | `openCardPanel()` | Title, description, comments, checklist, assignees, dates, labels. |
| Status taxonomy | See `04-technical-reference.md` § Taxonomies | Five client statuses, five Kanban columns, four priorities. |
| Data shape | `03-data-model.md` | Locked for v1. |

## Hold — still being designed

| Feature | Status | Why on hold |
|---|---|---|
| **Analytics page** | Stub nav with "Soon" pill | Scope and chart inventory undefined. |
| **Weekly WIP page** | Stub nav with "Soon" pill | Page concept exists, design hasn't started. |
| **Lifecycle phases on services** | Open question | Three placement options (a/b/c) under review. The lifecycle taxonomy comes from a CEO spreadsheet — won't go on Kanban (lifecycle is service-level, not task-level). |
| **Internal Operations service category** | Not started | Will add Sales, AM, PM, Finance, HR, Reporting as service categories. |
| **Service templates from lifecycle spreadsheet** | Not started | Auto-populate tasks per service based on phase. |
| **Team filter on Kanban** | Not started | Filter cards by assignee. |

## Recommendation for the dev

Start with the **data layer** and **Clients → Client detail → Kanban** path — that's the spine of the product and 100% locked. Build Overview blocks in this order: Portfolio Health → Attention → Schedule → My Boards (matches the current rendering order, all use the same data layer). Save Analytics, Weekly WIP, lifecycle, templates, and the Internal Ops category for after v1.

If you have spare cycles before v1 ships, the **highest-leverage prep work** for the held items is:
- Schema room for `lifecyclePhase` on the service object (string enum, nullable).
- Service category as an enum on the service object — the "Internal Operations" addition is just new enum values plus filter UI.

## Open questions for Nikko

1. Lifecycle phase placement: (a) per-service row, (b) client-level strip, (c) both?
2. Authentication / SSO requirements for the production deploy?
3. Real-time updates: do multiple users need to see each other's changes live, or is per-user state OK for v1?
4. Notifications: in-app only, or email/Slack as well?
5. Audit trail / activity log: how much history to keep?

---

*Last updated: 2026-04-20*
