# Projects V2 QA Progress

Tracking every QA gap between the portal (`dev.portal.121group.io/projects-v2`) and Nikko's Flizow dev build (`nikkortrinidad-cpu.github.io/flizow`). Each batch is reviewed, triaged (some items are already implemented), and then built.

Portal: `dev.portal.121group.io/projects-v2`
Dev build (target): `nikkortrinidad-cpu.github.io/flizow`

---

# QA Batch 1: Home Page (Round 32) - COMPLETE

**Reviewed:** 2026-05-05
**Deployed:** 2026-05-05
**Commit:** `8dfbe2b` - Add Delegate button and My Boards section to V2 Home page

6 items reviewed (#1-#6). 2 genuinely missing, 4 already implemented or intentional.

### #1 - My Tasks grouped by client
**Severity:** HIGH | **Status:** No work needed

Already implemented: `buildAttentionCards()` in `overview-page.tsx` groups by client with severity pills. QA tested with tasks that had no overdue/blocked states.

**Where to find:** `/projects-v2` Home page > My Tasks section


---

### #2 - Days-overdue stamp on task cards
**Severity:** HIGH | **Status:** No work needed

Already implemented: `ageLabel` shows "N days overdue" at `overview-page.tsx:174-179`. QA tested with "No due date" tasks.

**Where to find:** `/projects-v2` Home page > My Tasks section > each card's right side


---

### #3 - Delegate button on My Tasks cards
**Severity:** HIGH | **Status:** Implemented

Added "Delegate" button alongside "Review" on each attention card. Opens a team member picker popover (position-fixed, filter input, initials + name + role). Reuses `/api/v2/team` endpoint and `PATCH /api/project-tasks/:id`.

**Where to find:** `/projects-v2` Home page > My Tasks section > click "Delegate" on any card


---

### #4 - My Boards section
**Severity:** HIGH | **Status:** Implemented

New `favorite_boards` DB table + 3 API endpoints (GET/POST/DELETE `/api/v2/favorite-boards`). My Boards section between Schedule and Projects on Home page. Empty state with star icon + "Browse clients" CTA. Star/pin toggle added to board-page.tsx breadcrumb.

**Where to find:** `/projects-v2` Home page > My Boards section (between Schedule and Projects)


---

### #5 - Subtitle count (fire-only)
**Severity:** MED | **Status:** No work needed

Already correct: `pickTagline` uses fire-only count. The "14" count QA saw reflects live data volume, not a logic error.

**Where to find:** `/projects-v2` Home page > subtitle text under "Good morning"


---

### #6 - Back arrow in TopNav
**Severity:** LOW | **Status:** No work needed

Intentional: links to `/dashboard` (outer portal shell). QA doc noted "If kept, no action needed."

**Where to find:** `/projects-v2` > top-left arrow icon in nav bar


---

### Batch 1 Files Changed
- `client/src/pages/projects-v2/overview-page.tsx` : Delegate button + popover, My Boards section
- `client/src/pages/projects-v2/board-page.tsx` : Star/pin toggle in breadcrumb
- `server/project-routes-v2.ts` : 3 favorite-boards endpoints
- `shared/schema.ts` : `favoriteBoards` table definition
- `migrations/0040_favorite_boards.sql` : New table

---

# QA Batch 2: Clients Page (Round 33) - COMPLETE

**Reviewed:** 2026-05-06
**Deployed:** 2026-05-06
**Commit:** `2f58b92` - Implement 13 Clients page QA gaps: filters, kebab menu, service layout, About tab CRUD, brief modal

18 items reviewed (#7-#24) across 6 groups (A-F). 5 already implemented, 13 built.

---

### Group A: Clients List View

### #7 - Filter tabs: "Assigned to me" + "Archived"
**Severity:** HIGH | **Status:** Implemented

Extended `FilterView` type to include `assigned` and `archived`. "Assigned to me" filters by `primary_account_lead_id === currentUser.id`. "Archived" shows clients with `crm_stage` of churned/terminated (hidden from "All" by default). All 8 chips show counts.

**Where to find:** `/projects-v2/clients` > filter chips above the client list (8 chips total)


---

### #8 - Service tag chips on client rows
**Severity:** HIGH | **Status:** Implemented

Industry/stage subtitle and timestamp already existed. Added service tag chips (Google Ads, Meta Ads, SEO, etc.) below client name using `serviceSummary` from `/api/clients` response. Shows up to 3 chips with "+N more" overflow.

**Where to find:** `/projects-v2/clients` > look at any client row > small pills below the client name


---

### Group B: Client Detail Header Card

### #9 - Status pill on header card
**Severity:** HIGH | **Status:** No work needed

Already implemented at `clients-page.tsx:625-630`: colored badge with health label.

**Where to find:** `/projects-v2/clients/{id}` > header card > colored pill next to client name (e.g. "On Track", "On Fire")


---

### #10 - Header metadata strip (industry, manager, client-since)
**Severity:** HIGH | **Status:** No work needed

Already implemented at `clients-page.tsx:634-653`: industry icon, manager avatar chip, calendar + "Client since" date.

**Where to find:** `/projects-v2/clients/{id}` > header card > row below client name with icons


---

### #11 - Kebab menu (Archive / Delete)
**Severity:** MED | **Status:** Implemented

3-dot button at top-right of hero card. Dropdown with "Archive client" (PATCH crm_stage to churned) and "Delete client..." (red, opens confirm dialog). Both redirect to client list after action.

**Where to find:** `/projects-v2/clients/{id}` > header card > 3-dot icon at top-right corner


---

### Group C: Overview Tab

### #12 - Needs Attention section
**Severity:** HIGH | **Status:** No work needed

Already implemented at `clients-page.tsx:867-899`: overdue + blocked task counts as attention chips.

**Where to find:** `/projects-v2/clients/{id}` > Overview tab > "Needs Attention" row at the top (only shows if client has overdue or blocked tasks)


---

### #13 - Active Services count breakdown
**Severity:** MED | **Status:** Implemented

"X of Y active" count line next to Active Services header. No retainer/project breakdown yet (no `is_retainer` field on projects table).

**Where to find:** `/projects-v2/clients/{id}` > Overview tab > "Active Services" header > count text to the right


---

### #14 - Edit + Add service buttons
**Severity:** HIGH | **Status:** Implemented

"Edit" link opens modal listing all services with status + archive button per service. "+ Add service" button opens creation form (name input, creates via POST `/api/projects`).

**Where to find:** `/projects-v2/clients/{id}` > Overview tab > right side of "Active Services" header > "Edit" link + blue "+ Add service" button


---

### #15 - Service card layout (vertical list)
**Severity:** MED | **Status:** Implemented

Switched from 3-column grid to vertical list. Each card is now horizontal: icon + name/status/health badges on left, due date + task count in middle, progress bar + percentage on right. Entire card clickable (removed "Open Board" link).

**Where to find:** `/projects-v2/clients/{id}` > Overview tab > service cards stacked vertically under "Active Services"


---

### #16 - Service card star (favorite for My Boards)
**Severity:** HIGH | **Status:** Implemented

Star icon on each service card. Reuses `favorite_boards` API from Round 32. Filled star when pinned, outline when not. Click toggles POST/DELETE on `/api/v2/favorite-boards`.

**Where to find:** `/projects-v2/clients/{id}` > Overview tab > star icon on the far right of each service card


---

### Group D: Onboarding Tab

### #17 - Top progress count format
**Severity:** MED | **Status:** Implemented

Updated from `{done}/{total} complete` to "X of Y services in progress . N of M items complete" format matching Flizow.

**Where to find:** `/projects-v2/clients/{id}` > Onboarding tab > right side of "Setup & Onboarding" header


---

### #18 - Per-service progress bar + items-left badge
**Severity:** MED | **Status:** No work needed

Already implemented at `onboarding-tab.tsx:291-329`: progress bar + `{doneCount}/{total}` chip + "X items left" text per service.

**Where to find:** `/projects-v2/clients/{id}` > Onboarding tab > each service card shows progress bar and count


---

### Group E: About Tab

### #19 - Add contact button
**Severity:** HIGH | **Status:** Implemented

"+ Add contact" button on Client Contacts header. Opens modal with name, role, email, phone fields. Posts to `/api/wip2/client-emails`.

**Where to find:** `/projects-v2/clients/{id}` > About tab > Client Contacts card > blue "+ Add contact" button on the right


---

### #20 - Quick Links CRUD
**Severity:** HIGH | **Status:** Implemented

New `client_quick_links` DB table + full CRUD API (GET/POST/PATCH/DELETE `/api/clients/:id/quick-links`). "+ Add link" button opens title + URL form. Each link shows globe icon, title, external-link arrow, and delete X button. Website link from client record shown automatically.

**Where to find:** `/projects-v2/clients/{id}` > About tab > Quick Links card (right column) > blue "+ Add link" button


---

### #21 - Contact card detail (role + quick actions)
**Severity:** MED | **Status:** Implemented

Contact rows now show role title on second line (instead of email). Mail and phone quick-action icons on the right side. Star indicator for primary contact. Added `role`, `phone`, `is_primary` columns to `wip2_client_emails` table.

**Where to find:** `/projects-v2/clients/{id}` > About tab > Client Contacts card > each contact row shows role + mail/phone icons


---

### #22 - Team section: Edit + Add operator
**Severity:** MED | **Status:** Partial

Count text ("1 account manager . N operators") and AM display already work correctly when `primary_account_lead_id` is set. Edit/Add operator modal deferred to a future round (needs member-picker UI).

**Where to find:** `/projects-v2/clients/{id}` > About tab > Team section (below contacts and links)


---

### #23 - About tab header eyebrow + tagline
**Severity:** LOW | **Status:** Implemented

"RELATIONSHIP" eyebrow + "Who we talk to, and where to find their stuff" tagline above the two-column layout.

**Where to find:** `/projects-v2/clients/{id}` > About tab > very top, above the contacts/links cards


---

### Group F: Modals

### #24 - Brief modal on board page
**Severity:** MED | **Status:** Implemented

"Project Brief" button in board toolbar (right side of breadcrumb bar). Opens modal with textarea (placeholder: "Write the brief: goals, audience, scope, success metrics..."). Saves to project `description` field via PATCH `/api/projects/:id`.

**Where to find:** `/projects-v2/board/{serviceId}` > breadcrumb bar > far right > "Project Brief" button


---

### Batch 2 Files Changed
- `client/src/pages/projects-v2/clients-page.tsx` : Filters, service tags, kebab menu, overview count/buttons, vertical service layout, star, About tab eyebrow + contacts + Quick Links
- `client/src/pages/projects-v2/onboarding-tab.tsx` : Progress count text format
- `client/src/pages/projects-v2/board-page.tsx` : Project Brief button + modal
- `server/client-routes.ts` : Quick Links CRUD endpoints (4 routes)
- `shared/schema.ts` : `clientQuickLinks` table + `role`/`phone`/`isPrimary` on `wip2ClientEmails`
- `migrations/0041_client_quick_links.sql` : New table + ALTER TABLE for contact columns

### Surfaces confirmed at parity (from QA doc)
- **Stats tab**: Same metrics, range selector, sync indicator, comparison footer
- **Notes tab**: Apple Notes split pane with TipTap editor, search, pin/delete
- **Touchpoints tab**: Excluded from audit

---

# QA Batch 3: Ops Page (Round 34) - COMPLETE

**Reviewed:** 2026-05-07
**Deployed:** 2026-05-07
**Commits:** `dd88491` - Implement Ops page QA parity: capacity heatmap, time-off schedules, filters, notes fix | `673e0ae` - Add role-based access control and edit/revert for time-off requests

10 items reviewed (#25-#34) across 6 groups (A-F). 1 already at parity, 9 built.

---

### Group A: Top Header

### #25 - Stats line: drop secondary "X cards" count
**Severity:** MED | **Status:** Implemented

Removed the redundant `{filtered.length} cards` span from the filter bar. The page header stats line (tasks / in progress / blocked) is now the single source of truth for Ops counts.

**Where to find:** `/projects-v2/ops` > Ops Board tab > filter bar no longer shows a card count on the right


---

### Group B: Sub-tabs

### #26 - Time off Schedules sub-tab
**Severity:** HIGH | **Status:** Implemented

Full 4th tab added to Ops page. Features: month calendar grid (42 cells, Mon-Sun), month nav (prev/next/today), avatar stacks on days with approved time off, holiday ribbons (AU + PH holidays seeded), conflict dots (red) from coverage rules engine. Side rail with 3 sub-panels: Approvals (pending requests with conflict preview, approve/deny with decision note), Rules (coverage rules CRUD with inline editor: name, applies-to, constraint kind/count, when-days, plain-language summary), Conflicts (list of broken rule-days, click to open day popover). Day popover shows holidays + who's off + broken rules for that date. New schema: `time_off_requests`, `coverage_rules`, `holidays` tables. 29 holidays seeded (AU 2026/2027, PH 2026).

**Where to find:** `/projects-v2/ops` > "Time off Schedules" tab (4th tab)


---

### #27 - Team Capacity heatmap
**Severity:** HIGH | **Status:** Implemented

Replaced "Coming soon" placeholder with full heatmap. 10-weekday grid (Mon-Fri x 2 weeks) with team members as rows (avatar + name + role). Cells show `load/soft` count with zone-colored backgrounds: green (under soft cap), amber (at soft cap), red (over max cap). Default caps: soft=6, max=8. Today column highlighted. Click any cell to open a detail modal listing all tasks stacked on that member for that day (title + "Internal Ops" label). Empty cells show "Nothing booked." Server endpoint `GET /api/ops/capacity` returns members + ops tasks + project tasks for combined load view.

**Where to find:** `/projects-v2/ops` > "Team Capacity" tab (3rd tab)


---

### Group C: Ops Board Filter Bar

### #28 - Due date filter dropdown
**Severity:** MED | **Status:** Implemented

Added due date filter with 5 buckets: Overdue, Due today, This week, Later, No date. Uses existing `due_date` field on ops tasks, compares against today's ISO date. Integrated into the existing `filtered` memo alongside search, assignee, and priority filters.

**Where to find:** `/projects-v2/ops` > Ops Board tab > filter bar > "Due date" dropdown (after Priority)


---

### #29 - Sort selector
**Severity:** MED | **Status:** Implemented

Added sort dropdown on the right side of the filter bar with 4 options: Manual (default drag-and-drop order), Due date (ascending, nulls last), Priority (urgent > high > medium > low), Newest (created_at descending). Sort applied after filtering in `tasksByColumn` memo. Clear button resets sort to Manual alongside other filters.

**Where to find:** `/projects-v2/ops` > Ops Board tab > filter bar > "Sort" dropdown (far right)


---

### Group D: Notes Sub-tab

### #30 - Notes layout: two-pane vs single-pane
**Severity:** HIGH | **Status:** Implemented

Replaced centered empty state with consistent two-pane layout. Left sidebar (260px) always shows search input + "+ New note" button, regardless of whether notes exist. Right pane shows "Select a note or create one" when empty. Layout is now identical whether there are 0 or N notes.

**Where to find:** `/projects-v2/ops` > Notes tab > observe layout when no notes exist (two-pane with sidebar)


---

### #31 - New-note button label
**Severity:** MED | **Status:** Implemented

Changed button label from "+ Add notes" to "+ New note" (singular, matches Flizow convention and all other notes surfaces in the portal).

**Where to find:** `/projects-v2/ops` > Notes tab > left sidebar > button label at top


---

### Group E: Sort and Ordering Parity

### #32 - Group selector on filter bar
**Severity:** LOW | **Status:** No work needed

Neither the dev build nor the portal has a Group selector on the Ops Board. This is intentional and already at parity.

**Where to find:** N/A (confirmed parity)


---

### Group F: Role-Based Access + Approved Request Management

### #33 - Role-based access control for time-off approvals
**Severity:** HIGH | **Status:** BUILT

Only admin and manager roles can approve/deny time-off requests, manage coverage rules, or delete requests. Non-managers can only submit requests for themselves (member dropdown hidden, auto-set to own ID). Backend enforces via `requireOpsManager` middleware on PATCH (status changes), DELETE, and coverage rules CRUD. Frontend hides approve/deny buttons, decision note, rules CRUD controls, and member dropdown for non-managers.

**Where to find:** Time off Schedules tab : Approvals rail (approve/deny buttons visible for admin/manager only), Request form (member dropdown vs static name label), Rules panel (read-only for non-managers)

### #34 - Edit/revert/remove approved time-off requests
**Severity:** MEDIUM | **Status:** BUILT

Managers can now modify approved time-off entries. Three actions available: Edit (inline date/reason form), Revert to pending (sends back to approval queue), Remove (delete with confirmation). Accessible from two places: (1) calendar day popover shows per-member Edit/Revert/Remove buttons, (2) new "Approved" section at bottom of Approvals rail lists all approved requests with the same controls. Backend PATCH expanded to accept `start_date`, `end_date`, `reason` fields alongside status changes. `offByDate` memo restructured to carry both `CapMember` and `TimeOffReq` objects so popover has request IDs for mutations.

**Where to find:** Time off Schedules tab : click any calendar day with approved time off (popover shows controls), or scroll down in Approvals rail to see "Approved" section

---

### Batch 3 Files Changed
- `client/src/pages/projects-v2/ops-page.tsx` : Filter bar enhancements (due date + sort), notes two-pane fix, button label, capacity heatmap component, time-off tab component (~1000 lines added), role-based UI gating (isManager flag, conditional approve/deny/rules/member-dropdown), approved requests list in rail with Edit/Revert/Remove, enhanced day popover with inline edit form + revert/remove controls, offByDate restructured to carry request objects
- `client/src/pages/projects-v2/styles/flizow-scoped.css` : ~400 lines of `schedules-*` CSS ported from Flizow (calendar grid, side rail, request cards, rule editor, conflict list, day popover)
- `server/ops-routes.ts` : Capacity endpoint + time-off CRUD + coverage rules CRUD + holidays GET/seed (~240 lines added), `requireOpsManager` middleware for admin/manager gating, self-only POST enforcement for non-managers, expanded PATCH to accept date/reason edits with dynamic SQL
- `shared/schema.ts` : 3 new table definitions (`timeOffRequests`, `coverageRules`, `holidays`)
- `migrations/0042_time_off.sql` : Creates all 3 tables

---

# QA Batch 4: Analytics Page (Round 35) - COMPLETE

**Reviewed:** 2026-05-07
**Deployed:** 2026-05-07

1 item reviewed (#35). 1 built. The Analytics page was mostly at parity already (header, filters, stats cards, upcoming deliverables, team workload structure all matched). The one gap was raw role IDs rendering instead of formatted titles.

---

### Group A: Team Workload + Filter Dropdown

### #35 - Job title display: raw role IDs surface instead of formatted titles
**Severity:** HIGH | **Status:** BUILT

Team Workload rows and "Anyone" filter dropdown showed raw role strings (`team_member`, `seo_specialist`, `manager`) instead of formatted labels ("Team Member", "SEO Specialist", "Manager"). Created shared `formatRoleLabel()` utility in `client/src/lib/format-role.ts` with a role-to-label map and snake_case → Title Case fallback for unknown roles. Applied across all V2 pages where raw roles were rendered: Analytics (workload table + filter), Ops (capacity heatmap + cell detail), Overview (member combo), Clients (team section), Account Settings (members list).

**Where to find:** `/projects-v2/analytics` > Team Workload table (role under each name) + Anyone filter dropdown (role under each option)

---

### Batch 4 Files Changed
- `client/src/lib/format-role.ts` : New shared utility with `ROLE_LABELS` map + `formatRoleLabel()` function
- `client/src/pages/projects-v2/analytics-page.tsx` : Import + apply to workload rows and filter dropdown
- `client/src/pages/projects-v2/ops-page.tsx` : Import + apply to capacity heatmap rows and cell detail modal
- `client/src/pages/projects-v2/overview-page.tsx` : Import + apply to member combo role display
- `client/src/pages/projects-v2/clients-page.tsx` : Import + apply to team member role in About tab
- `client/src/pages/projects-v2/account-settings-modal.tsx` : Import + apply to members list (removed CSS `textTransform: capitalize` in favor of utility)

---

# Remaining QA Batches

| Page | Status | Notes |
|------|--------|-------|
| Home page | COMPLETE | Round 32, 6 items |
| Clients page | COMPLETE | Round 33, 18 items |
| Ops page | COMPLETE | Round 34, 10 items |
| Board / Kanban page | Not started | Card modal, drag-and-drop polish, toolbar parity |
| Overview (landing) | Not started | Portfolio health dashboard, KPIs |
| Analytics page | COMPLETE | Round 35, 1 item |
| WIP page | Not started | |
| Templates page | Not started | |

---

# Schema Changes (all QA rounds)

| Migration | Round | Purpose |
|-----------|-------|---------|
| `0040_favorite_boards.sql` | 32 | `favorite_boards` table for My Boards star/pin |
| `0041_client_quick_links.sql` | 33 | `client_quick_links` table + `role`, `phone`, `is_primary` columns on `wip2_client_emails` |
| `0042_time_off.sql` | 34 | `time_off_requests`, `coverage_rules`, `holidays` tables + 29 seeded holidays (AU + PH) |
