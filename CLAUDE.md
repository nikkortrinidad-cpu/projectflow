# CLAUDE.md — Flizow Project Reference

## Project Overview

**Flizow** is an agency project-management web app — clients, services, kanban boards per service, weekly meeting flow, capacity heatmap, ops board, and (as of late April 2026) a full time-off + holidays + role-based-access system. Built with React 19 + TypeScript + Vite, deployed on GitHub Pages, Firebase as the cloud backend.

The user (Nikko) does not code — all development is done through Claude.

- **Live URL:** `https://nikkortrinidad-cpu.github.io/flizow/`
- **Repository:** `https://github.com/nikkortrinidad-cpu/flizow`
- **Repo path locally:** `/Users/nikko/Downloads/Claude/Code/kanban-website` (folder name is historical; the product is Flizow)

> **Note on naming:** The repo started life as a generic kanban tool and got renamed/repurposed into Flizow. The folder name (`kanban-website`) and the package.json `"name": "kanban-website"` haven't been changed. Inside the codebase, everything is "Flizow." When CLAUDE.md says "the project" or "the app," it means Flizow.

---

## Tech Stack

- **Framework:** React 19 with TypeScript (~5.9)
- **Build tool:** Vite (base path: `/flizow/` for GitHub Pages)
- **Styling:** Custom CSS in `src/styles/flizow.css` — no Tailwind, no CSS-in-JS. Token-driven (CSS custom properties) — see Design System below.
- **Backend:** Firebase
  - **Auth:** Google Sign-In (popup flow)
  - **Firestore:** Multi-tenant workspaces at `workspaces/{wsId}` + per-user lookup at `users/{uid}`
  - **Storage:** Workspace logos at `workspaces/{wsId}/logo`
- **Rich text:** TipTap (StarterKit + Link + Image + Placeholder)
- **Drag & drop:** @dnd-kit/core + @dnd-kit/sortable
- **Icons:** @heroicons/react/24/outline (used selectively — see Conventions)
- **Charts:** Recharts (analytics)
- **Date utilities:** custom helpers in `src/utils/dateFormat.ts` — no date-fns
- **Testing:** Vitest, JSDOM env, no React-renderer (pure-function tests only)
- **Deployment:** GitHub Actions workflow at `.github/workflows/deploy.yml` — auto-builds + deploys on push to `main`
- **npm path:** `/Users/nikko/local/node/bin` (always prefix the PATH when running npm/npx)

---

## Folder Structure

```
kanban-website/
├── .github/workflows/deploy.yml   # GH Pages CI/CD
├── docs/                          # Operational docs (NOT product docs)
│   ├── firestore-rules.md         # Firestore + Storage security rules to paste
│   ├── portal-deployment-presentation.html / .pdf  # Leadership briefing deck
│   └── projectflow-handoff/       # Senior-dev handoff package
├── public/                        # Static assets (favicon, mark, svg)
├── src/
│   ├── main.tsx                   # Entry; wraps App in AuthProvider
│   ├── App.tsx                    # Root: TopNav + PageShell + modal layer
│   ├── router.ts                  # Hash router (parse() + useRoute() + navigate())
│   ├── pages/                     # One file per top-level route
│   │   ├── OverviewPage.tsx       # #overview — home dashboard
│   │   ├── ClientsPage.tsx        # #clients — list view
│   │   ├── ClientDetailPage.tsx   # #clients/{id} — per-client tabs
│   │   ├── ClientsSplit.tsx       # Two-pane wrapper for the clients route
│   │   ├── BoardPage.tsx          # #board/{serviceId} — kanban per service
│   │   ├── OpsPage.tsx            # #ops — internal ops board + brief + capacity + time-off schedules
│   │   ├── AnalyticsPage.tsx      # #analytics — workspace-wide charts
│   │   ├── WipPage.tsx            # #wip/agenda — weekly meeting flow
│   │   └── TemplatesPage.tsx      # #templates — service templates editor
│   ├── components/                # Cross-page surfaces
│   │   ├── TopNav.tsx             # Header + nav links + avatar dropdown
│   │   ├── PageShell.tsx          # Routes a page based on useRoute()
│   │   ├── FlizowAccountModal.tsx # The big settings modal (~3500 LOC)
│   │   ├── FlizowCardModal.tsx    # Task / ops-task detail modal
│   │   ├── FlizowCommandPalette.tsx # ⌘K palette
│   │   ├── FlizowNotificationsPanel.tsx # Bell dropdown
│   │   ├── FlizowShareModal.tsx   # Share + invite collaborators
│   │   ├── MemberProfilePanel.tsx # Click-avatar profile sheet (workspace-wide)
│   │   ├── OpsTimeOffTab.tsx      # Time-off Schedules tab inside Ops
│   │   ├── TeamCapacityHeatmap.tsx# Workspace load heatmap
│   │   ├── BoardFilters.tsx       # Search + filter bar shared by Board + Ops
│   │   ├── NotesTab.tsx           # Apple-Notes-style two-pane notes
│   │   ├── StatsTab.tsx           # Per-client stats inside Client Detail
│   │   ├── TouchpointsTab.tsx     # Per-client touchpoints log
│   │   ├── BriefModal.tsx / BriefStrip.tsx
│   │   ├── EditServiceModal.tsx
│   │   ├── ConfirmDangerDialog.tsx
│   │   ├── LoginPage.tsx          # Google sign-in
│   │   ├── ErrorBoundary.tsx      # Per-modal + per-page boundary
│   │   ├── InsertLinkDialog.tsx   # TipTap link helper
│   │   └── shared/                # Sub-components reused across modals
│   ├── store/
│   │   ├── flizowStore.ts         # FlizowStore singleton (~3800 LOC)
│   │   └── useFlizow.ts           # Hook wrapper via useSyncExternalStore
│   ├── data/
│   │   ├── demoData.ts            # "Load demo data" payload
│   │   ├── demoClientSeeds.ts     # Demo clients + services
│   │   ├── demoRosters.ts         # Demo team members
│   │   ├── opsSeed.ts             # Ops board legacy backfill
│   │   ├── onboardingTemplates.ts # Per-service-type onboarding checklists
│   │   ├── taskPools.ts           # Demo task seed
│   │   ├── templates.ts           # Built-in service templates
│   │   └── holidaySeed.ts         # PH + AU 2026/27 holiday catalog
│   ├── utils/
│   │   ├── access.ts              # can(role, action) + AccessRole helpers
│   │   ├── avatar.ts              # avatarStyle() + bestTextColor()
│   │   ├── capacity.ts            # Slot math for the heatmap
│   │   ├── clientDerived.ts       # Service-health, status helpers
│   │   ├── coverageRules.ts       # Time-off rules engine (evaluator)
│   │   ├── dateFormat.ts          # Custom date helpers (no date-fns)
│   │   ├── holidays.ts            # Holiday filter + display helpers
│   │   ├── holidayCredits.ts      # Transfer-credit balance + ledger
│   │   ├── jobTitles.ts           # JobTitle catalog helpers
│   │   ├── markdownInsert.ts      # Markdown editor utilities
│   │   ├── memberProfile.ts       # Vacation status, working-hours formatters
│   │   └── timeOff.ts             # TimeOffRequest filters + migration
│   ├── types/
│   │   └── flizow.ts              # ALL types live here (~1200 LOC)
│   ├── styles/
│   │   └── flizow.css             # Single global stylesheet (~13000 LOC)
│   ├── contexts/
│   │   ├── AuthContext.tsx        # Firebase Google Auth provider
│   │   └── MemberProfileContext.tsx # Click-avatar opens profile sheet
│   ├── lib/
│   │   └── firebase.ts            # Firebase app init
│   ├── hooks/                     # useModalAutofocus, useModalFocusTrap, etc.
│   ├── constants/
│   │   └── labels.ts              # Built-in label set for boards
│   └── test/                      # Vitest suites — pure-function tests only
└── package.json / vite.config.ts / tsconfig*.json / eslint.config.js
```

---

## Key Files in Detail

### `src/types/flizow.ts`

The single source of truth for every type the app uses. Notable shapes:

**Identity + Access**
- `AccessRole` = `'owner' | 'admin' | 'member' | 'viewer'`
- `WorkspaceMembership` — sign-in roster row: `{ uid, displayName, email, photoURL, role, joinedAt }`
- `PendingInvite` — outstanding invite link: `{ token, role, createdAt, createdByUid, note? }`
- `WorkspaceDoc` — top-level Firestore doc: `{ ownerUid, name, initials, color, logoUrl?, members[], memberUids[], memberRoles{}, pendingInvites[], data, createdAt, updatedAt }`

**Domain**
- `Client`, `Service`, `Task`, `OpsTask`, `Member`, `Contact`, `QuickLink`, `Note`, `Touchpoint`, `ActionItem`, `TaskComment`, `TaskActivity`, `MeetingCapture`, `ManualAgendaItem`, `OnboardingItem`, `MemberDayOverride`, `TemplateRecord`, `TrashEntry`

**Catalogs (Phase 2 + 6)**
- `JobTitle` + `JobTitleKind` (`'account-manager' | 'operator'`)
- `Holiday` + `HolidayCountry` + `HolidayType` + `HolidayObservationDefault`

**Time-off system (Phase 3 onwards)**
- `TimeOffRequest` — statused entries: `{ id, memberId, start, end, reason?, status, requestedAt, decidedAt?, decidedBy?, decisionNote?, useTransferCredit? }`
- `TimeOffStatus` = `'pending' | 'approved' | 'denied' | 'cancelled'`
- `HolidayObservation` — per-member holiday override: `{ id, holidayId, memberId, status, decidedAt, decidedBy }`
- `CreditExpiryPolicy` = `'end-of-year' | 'six-months' | 'twelve-months' | 'never'`

**Coverage rules (Phase 5)**
- `CoverageRule` + `CoverageRuleWho` + `CoverageRuleConstraint` + `CoverageRuleWhen`
- `RuleConflict` — diagnostic shape returned by the evaluator

**Notifications**
- `NotificationItem` + `NotificationType` (includes `'time_off'`) + `NotificationState`

**Top-level data**
- `FlizowData` — the workspace-scoped state. Every list above lives on this. Stored in `WorkspaceDoc.data`.

### `src/store/flizowStore.ts`

The singleton `FlizowStore` class — the heart of the app. About 3800 LOC.

**State management**
- Custom store via `useSyncExternalStore` (no Redux/Zustand).
- Two parallel observables: `data` (workspace content) + `workspaceMeta` (members + invites + identity), so the Members UI doesn't re-render on every card edit.

**Persistence**
- Dual-write: `localStorage` (key `flizow-data`, immediate) + Firestore (debounced 1s).
- Real-time `onSnapshot` listener per workspace; ignores its own echoes via the `ignoreNextSnapshot` flag.
- Three sync errors surface to a banner: permission denied, offline, write quota.

**Migrations on workspace load**
The snapshot handler runs three pure migrations before mounting the doc:
1. `migrate(parsed)` — backfills new FlizowData fields (theme, opsSeeded, trash, jobTitles, holidays, etc.)
2. `migrateWorkspaceAccessRoles(ws)` — translates legacy `'editor'` → `'member'`, forces `ownerUid` to `'owner'`, rebuilds `memberRoles` map when drift detected
3. `migrateMembersToJobTitles(...)` — assigns `jobTitleId` to legacy members based on free-text `role` or `MemberType`
4. `migrateLegacyTimeOff(...)` — moves `Member.timeOff[]` entries into `data.timeOffRequests[]` as approved

Owner-only persists the migrated doc back via `persistMigratedRoles` so subsequent reads are clean.

**Key method areas (grouped by section comment in the file)**
- Auth + workspace lifecycle: `setUser`, `resolveWorkspaceId`, `acceptPendingJoin`, `upsertOwnMember`
- Workspace identity: `updateWorkspaceIdentity`, `uploadWorkspaceLogo`, `removeWorkspaceLogo`
- Members + invites: `createInvite`, `revokeInvite`, `removeWorkspaceMember`, `changeMemberRole` (maintains `memberRoles` in lockstep)
- Job titles: `addJobTitle`, `updateJobTitle`, `archiveJobTitle`, `deleteJobTitle`
- Time-off: `submitTimeOffRequest`, `approveTimeOffRequest`, `denyTimeOffRequest`, `cancelTimeOffRequest`, `updateTimeOffRequest`, `deleteTimeOffRequest`
- Coverage rules: `addCoverageRule`, `updateCoverageRule`, `archiveCoverageRule`, `deleteCoverageRule`
- Holidays: `addHoliday`, `updateHoliday`, `archiveHoliday`, `deleteHoliday`, `setHolidayObservation`, `clearHolidayObservation`, `setCreditExpiryPolicy`
- Domain CRUD: `addClient` / `updateClient` / `archiveClient`, `addService` / ..., `addTask` / `moveTask` / ..., comments, checklist items, etc.
- Trash: `deleteX` methods for every soft-deletable kind, `restoreFromTrash`, `purgeFromTrash`, `emptyTrash`. 90-day auto-prune.

**`getCurrentMemberId()`** returns the signed-in user's UID (or null pre-auth) — the canonical "who am I" lookup used by every component.

### `src/router.ts`

Hash-based router. Routes:
- `#overview` (default)
- `#clients` / `#clients/view/<view>` / `#clients/<clientId>`
- `#board/<serviceId>` / `#board/<serviceId>/card/<cardId>`
- `#ops` / `#ops/<sub-tab>` / `#ops/timeoff?focus=<requestId>`
- `#analytics`
- `#wip/agenda`
- `#templates` / `#templates/<id>`
- `#account/<section>?focus=<id>` — synthetic route, App.tsx catches it to open the Account modal at the requested section, then navigates to `#overview` to clear the hash

`?key=value&...` query strings on any hash get parsed and merged into `route.params`.

`__parseHashForTest` is exported for unit tests.

### `src/components/FlizowAccountModal.tsx`

The big settings modal (~3500 LOC). Sidebar splits into three groups:

**My account** (every signed-in user)
- Profile — avatar color, name, role text, identity fields
- Preferences — theme, language placeholder
- Notifications — per-user prefs (urgent + digest)
- Time off — submit / track requests with status sections (Pending review, Approved, Denied, Past)

**Workspace** (Owner + Admin only — gated via `can('manage:workspace')`)
- Workspace — name, initials, color, logo
- Members — search + sort + group-by + role filter chips, with role dropdowns
- Job titles — CRUD on the workspace catalog
- Holidays — country-filtered list with per-holiday CRUD + credit-expiry policy
- Trash — restore / purge / empty

**Account** (every user)
- Sign-in — sessions + "Sign out everywhere"

The modal accepts `initialSection` + `initialFocusId` props for deep-linking from notifications.

### `src/components/OpsTimeOffTab.tsx`

The Time off Schedules surface inside Ops (Owner/Admin only). Layout:
- **Calendar** (left): 7×6 month grid. Each day cell shows avatar stack of who's approved off + red border on conflict days + holiday ribbon (country tinted) + today highlight.
- **Side rail** (right) with three sub-tabs:
  - **Approvals** — pending requests with inline conflict diff (baseline vs preview), Approve/Deny + decision-note
  - **Rules** — list with plain-language summaries + inline editor (who-kind / constraint / count / when)
  - **Conflicts** — punch list of broken rule-days
- **Day popover** — click a cell → modal with everyone off that day + per-holiday observation overrides + which rules broke

Filter chips at the top narrow the calendar's avatar stacks by job title (rule math always runs across all members so a filter can't hide a real coverage gap).

### `src/components/TopNav.tsx`

Header: brand mark + nav links (Home / Clients / Ops / Analytics / Weekly WIP / Templates) + ⌘K trigger + notifications bell + avatar dropdown.

Nav links filter through `can(role, action)` — so a Member sees fewer links than an Owner, a Viewer sees fewer still.

Avatar dropdown items: identity block (name + access pill + email), Account settings, theme toggle (Sun/Moon icon), Sign out.

### `src/components/MemberProfilePanel.tsx`

Click any member avatar app-wide → opens this slide-in sheet. Shows identity, working hours + days, country tag, vacation pill (only when on approved time off), profile photo with upload, capacity caps, skills, bio, etc.

Read-only by default. "Edit profile" button visible to self or anyone with `can('edit:any-profile')`.

---

## Design System

The Flizow design language is defined inline in `src/styles/flizow.css`. Three things to know:

### Color tokens

The brand color is **orange `#F15A24`** (`--highlight`), not Apple-default indigo. The design language doc references blue tiers but Flizow uses orange tiers throughout.

**Four-tier highlight hierarchy:**
1. **Solid orange (CTA)** — one per surface. "Request time off," "Approve," "Save."
2. **Orange ring (secondary)** — used when two actions are close in weight.
3. **Orange tint (active state)** — current tab, selected row, currently-on-vacation banner.
4. **Orange text (inline)** — links inside prose.

Other semantic colors (red for danger, green for success, amber for warning) match standard web conventions.

`bestTextColor(bg)` in `utils/avatar.ts` picks white-or-near-black for foreground text against any tinted background, using WCAG relative-luminance with threshold 0.179. Used wherever a user-picked color sits behind text (job-title pills, country tags).

### Spacing tokens

Defined as `--sp-*` custom properties in `flizow.css`:
- `--sp-hair: 1px` / `--sp-nano: 2px` / `--sp-micro: 4px`
- `--sp-xs: 6px` / `--sp-7: 7px` / `--sp-sm: 8px` / `--sp-9: 9px`
- `--sp-md: 10px` / `--sp-base: 12px` / `--sp-lg: 14px` / `--sp-xl: 16px`
- `--sp-18: 18px` / `--sp-2xl: 20px` / `--sp-22: 22px` / `--sp-3xl: 24px`
- `--sp-26: 26px` / `--sp-28: 28px` / `--sp-4xl: 32px`
- `--sp-36: 36px` / `--sp-5xl: 40px` / `--sp-6xl: 48px` / `--sp-7xl: 64px`

The codebase uses values that aren't strictly on a 4/8 grid (10, 14, 18, 22, 26) because the design language standardized on these specific increments early. Stay on the named tokens; don't invent new ones.

### Typography

- Body font: Inter, system-ui, -apple-system
- Mono: SF Mono, Monaco
- Type scale: `--fs-xs` / `--fs-sm` / `--fs-md` / `--fs-lg` / `--fs-xl` / `--fs-2xl` / `--fs-3xl`
- Body line-height: 1.5×; headlines: 1.2×

### Dark mode

Class on `<html>` toggled via `flizowStore.setTheme`. Uses `:root[data-theme="dark"] { ... }` overrides in `flizow.css`.

### Component conventions

- **No pencil icons for editable fields.** Cursor + hover tint + focus ring carry the affordance.
- **"+ Add card" only in the To Do column** of any kanban board.
- **Click-to-edit** for inline fields. Modals only for actions that span many fields, multiple entities, or destructive confirmations.
- **Kebab menu (`⋮`)** for card-level actions (duplicate, copy link, archive, delete).
- **`data-open="true"`** carries dropdown / panel open state — CSS handles the transition.
- **Splice-replace** for array mutations in the store (`{...original, ...patch}` + concat slices), never `Object.assign(arrItem, patch)` — keeps memoized consumers from caching stale data.

### Icon convention

Heroicons (24/outline) for top-nav, page-tab buttons, and quick-action surfaces. Inline custom SVG for: Account modal sidebar nav items, modal close buttons, the notification panel's `ICONS` map. The two patterns coexist — match what's around the surface you're touching.

---

## Routing

Hash-based via `src/router.ts`. `useRoute()` returns `{ name, params, hash }`. `navigate(hash)` writes the new hash + fires `hashchange`.

Pages render conditionally inside `PageShell` based on `route.name`. Modals (Account, Card, Share) are owned by `App.tsx` and opened via callback or the synthetic `#account/...` deep-link route.

Deep-link focus pulse: components that accept `focusId` apply a `data-focused="true"` attribute to the matching row for ~1.6s, scrolled into view via `requestAnimationFrame`. The `flizow-focus-pulse` keyframes paint a tinted ring + background that decays. Used by time-off notifications.

---

## Authentication & Workspaces

**Multi-tenant model.** Every signed-in user belongs to exactly one workspace.

- **Workspace doc** at `workspaces/{wsId}` — wsId is the original owner's UID.
- **Lookup doc** at `users/{uid}` mapping each user to their workspace.
- **Invite flow:** the owner generates an invite link with a pre-assigned role (`createInvite`). The invitee signs in with Google, the App reads `?join=<wsId>&token=<token>` from the URL (stashed pre-auth in sessionStorage), and `acceptPendingJoin` adds them to `members[]`, `memberUids[]`, `memberRoles[]` while consuming the pendingInvite.

Workspace owner cannot be removed; ownership-transfer is a v2 feature.

`Member` (agency-side roster) and `WorkspaceMembership` (sign-in roster) are distinct concepts. They overlap (a Member with sign-in access is also a workspace member) but a Member can exist as a record-only assignee for someone who never signs in. The two are linked by `Member.id === WorkspaceMembership.uid` for any member who has signed in. `Member.accessLevel` is a denormalized mirror of `WorkspaceMembership.role` for agency-roster surfaces.

---

## Role System (4-tier access)

| Role | Can do |
|---|---|
| **Owner** | Everything. Billing, ownership transfer, delete workspace. Exactly one per workspace; matches `WorkspaceDoc.ownerUid`. |
| **Admin** | Manages members, approves time off, edits workspace settings. No billing or ownership transfer. |
| **Member** | Edits cards they're assigned to, submits own time off. Sees Home, Clients, Analytics, Weekly WIP. |
| **Viewer** | Read-only across granted surfaces. |

**`can(role, action)`** in `utils/access.ts` is the single permission-check helper. Adding a new gated action means: extend the `Action` union, add a row to `PERMISSIONS`, write a test. Components call `can(member.accessLevel, 'manage:workspace')` etc.

**`memberRoles: { uid: role }`** on `WorkspaceDoc` is the denormalized role lookup used by Firestore rules. Maintained in lockstep with `members[]` everywhere `members[]` mutates. Backfilled by the `migrateWorkspaceAccessRoles` migration on workspace load.

**Job titles** (`JobTitle` catalog) are surface labels — separate from access roles. A workspace seeds 5 defaults (Account Manager, Designer, Strategist, Operator, Manager) with stable ids (`jt-account-manager`, etc.).

---

## Domain Concepts

### Time off

**Submit flow** (`Account → Time off`):
1. Member opens the Account modal at Time off, clicks "Request time off"
2. Picks dates + optional reason + optional "Use 1 holiday transfer credit"
3. `submitTimeOffRequest` adds an entry with `status: 'pending'`
4. The OM/Admin sees a `time_off` notification in the bell
5. They open the approval queue (Ops → Time off Schedules → Approvals), see inline conflict warnings, click Approve or Deny with optional decision note
6. The requester sees a `time_off` notification with the decision

**Status progression:** `pending → approved | denied | cancelled`. Cancelled requests are filtered out of the requester's view (their own action). Denied keeps the audit trail with the approver's note.

Pending requests don't show the vacation pill on the profile — only approved ones do.

### Coverage rules

`CoverageRule` is a declarative constraint the OM writes once. The evaluator (`utils/coverageRules.ts`) walks every (date, rule) pair in a date range and produces `RuleConflict[]`.

**Rule shape:**
- `who` — `{ kind: 'role', roleIds }` / `{ kind: 'jobTitle', jobTitleIds }` / `{ kind: 'members', memberIds }`
- `constraint` — `{ kind: 'min-present', count }` / `{ kind: 'max-out', count }`
- `when` — `'weekdays' | 'all'`

Only approved time-off counts toward conflict math. Pending / denied / cancelled are ignored. Inactive rules don't fire.

### Holidays

Pre-seeded with PH (public + special) + AU (national + major-state) for 2026 + 2027 — about 80 entries with stable ids. Owner edits via Settings → Holidays.

**Per-member observation overrides** (`HolidayObservation`) — when a member works through a holiday they would otherwise have observed, the OM flips their status in the day popover. They earn one transfer credit.

**Transfer credit ledger** computed live from holidays + observations + approved requests. Earned: `+1` per `'worked'` override. Spent: `-1` per approved request with `useTransferCredit: true`. Expired credits drop from balance per the workspace's `creditExpiryPolicy`. Surfaces inline on Account → Time off.

### Notifications

`deriveNotifications(data, memberId)` in `data/deriveNotifications.ts` produces notifications live from store state — no event log. Every notification has a stable id derived from its source row, so the read/dismissed state in localStorage persists across re-derives.

**Categories:**
1. Overdue tasks (urgent prefs)
2. Tasks due today (urgent prefs)
3. On Fire clients (urgent prefs)
4. System daily digest (digest pref)
5. **Time-off pending** (Owner/Admin only) — one per pending request, capped at 6
6. **Time-off decided** (requester) — recent (last 14 days), capped at 5

Pending notifications route to `#ops/timeoff?focus=<requestId>` (deep-link); decided to `#account/timeoff?focus=<requestId>`.

### Trash

Workspace-wide soft delete with 90-day retention. Every soft-deletable kind (note, contact, quick link, comment, touchpoint, action item, onboarding item, manual agenda item, task, ops task, service, client, time-off request, template) round-trips through `data.trash[]`. Cascade deletes (delete client → delete services → tasks → comments) bundle into a single `TrashEntry` for atomic restore.

Auto-prune runs on every `migrate()` (load) — entries older than 90 days drop silently.

---

## Build & Development

```bash
# Start dev server
cd /Users/nikko/Downloads/Claude/Code/kanban-website
PATH="/Users/nikko/local/node/bin:$PATH" npm run dev

# Build for production
PATH="/Users/nikko/local/node/bin:$PATH" npm run build

# Run tests (vitest, no watch)
PATH="/Users/nikko/local/node/bin:$PATH" npx vitest run

# Typecheck (no emit)
PATH="/Users/nikko/local/node/bin:$PATH" npx tsc --noEmit

# Deploy: push to main → GitHub Actions builds + deploys
git push origin main
```

Tests are pure-function only (no React renderer). 285+ tests across `src/test/*.test.ts`.

---

## Firestore Configuration

- **Firestore data:** `workspaces/{wsId}` + `users/{uid}` lookup + `flizow/{uid}` legacy single-user docs
- **Storage:** `workspaces/{wsId}/logo`
- **Rules:** Live at `docs/firestore-rules.md` — paste manually into the Firebase console. Rules enforce roles at the storage layer via the denormalized `memberRoles` map (since Firestore rules can't iterate `members[]`). Three update lanes: Owner+Admin (any field), Member+Viewer (`data` field only via `memberWriteScopeOk` diff helper), non-member invite acceptance (must consume an invite + can't self-promote to owner).

---

## User Preferences

- Does not know how to code — all changes made through Claude
- Wants commits + pushes after every change without asking ("Always push to live")
- Prefers incremental shipments with review between phases
- Values clean spacing and readability
- Prefers icon-only buttons for header actions
- Likes subtle hover indicators ("Click to edit")
- Wants disabled states for buttons until input is provided
- Wants save/cancel for description edits (not auto-save)
- Likes "(You)" identity indicators throughout the UI
- No emoji unless explicitly requested

---

## Design Standards

Before creating or modifying any UI layout, mockup, or component, always read and follow:

- **`~/Documents/Claude/skills/apple-design-principles.md`** — Apple HIG, UX, UI, Flizow's design language. Belief, 10 HIG principles, UX behavior, UI execution, the 4-tier highlight hierarchy, component conventions, the 8-step audit rubric. The primary design reference.
- **`~/Documents/Claude/skills/grids-and-layout-design.md`** — Grids, typography, composition, line-length rules (45–70 cpl), spacing, pre-flight checklist.
- **`~/Documents/Claude/skills/coding-best-practices.md`** — Code quality, readability, maintainability standards.
- **`~/Documents/Claude/skills/human-coding.md`** — Match scope, why-not-what comments, trust types, prefer deletion, fit house style.

Run the full 8-step audit (belief → 10 HIG → highlight tiers → grids → checklist → rank HIGH/MED/LOW → verify → ship) on every page, modal, feature, function before shipping.

---

## Copywriting & Voice

Before writing any copy on behalf of Nikko, always read:
- **`~/Documents/Claude/about me/About Me - Nikko Trinidad.md`** — background, context, personal details
- **`~/Documents/Claude/about me/Anti AI Writing Style.md`** — natural / human voice, no AI tells

**Hard rules:**
- No em dashes (HARD RULE)
- No jargon (synergy / leverage / furthermore / additionally)
- No clickbait
- Plain language, narrative arc (problem → context → resolution)
- "I'll say what's true, I'll say it clearly, and then I'll let you decide what to do with it"

---

## Known Patterns & Conventions

### Store mutations
- Every mutation goes through a FlizowStore method that calls `this.save()` (localStorage + Firestore debounced 1s)
- Splice-replace for array updates: `{...original, ...patch}` + concat, NEVER `Object.assign(arrItem, patch)`
- Methods that return `null | undefined` should fail silently on bad input (no exceptions for stale ids)

### Component access
- Read state via `useFlizow()` returning `{ data, store }`
- Read workspace meta separately via `useSyncExternalStore(store.subscribeWorkspace, store.getWorkspaceMeta)` — avoids re-rendering the Members list on every card edit
- Read auth via `useAuth()` from `AuthContext`

### Permission gates
- Every gated UI element calls `can(member?.accessLevel, 'verb:resource')` from `utils/access.ts`
- Page-level visibility is gated in `TopNav.tsx` (the nav link list filters through `can`)
- Component-level edit affordances gate via `can('edit:any-profile')`, `can('manage:members')`, etc.

### Modal lifecycle
- Backdrop is `fixed inset-0 z-N` with backdrop blur
- Always honor Escape (close) + click-outside + the close button
- Focus management via `useModalAutofocus` + `useModalFocusTrap` hooks
- Lazy-loaded via `lazy()` + `<Suspense fallback={null}>` to keep the initial bundle small

### Dropdowns
- Local state for open/closed
- Click-outside listener attached when open, removed on close
- Mousedown (not click) so the toggle button doesn't immediately close on the same click event

### Trash
- Soft-delete returns an `undo` callback alongside the trash entry
- Toast layer uses the undo callback for the "X deleted — Undo" pattern
- Hard-deletes for chatty types (checklist items, meeting captures) skip trash but still return a snapshot-restoring callback for the toast

### Tests
- Pure-function only (no React renderer)
- Vitest, JSDOM env
- Per-domain test files: `access`, `avatar`, `capacity`, `coverageRules`, `deriveNotifications`, `flizowStore`, `holidayCredits`, `holidays`, `jobTitles`, `migrateWorkspaceAccessRoles`, `router`, `timeOff`
- 285+ tests as of May 1, 2026
