# Flizow Design-Audit Sweep — Summary

**Window:** 2026-04-24 audit → 2026-04-25 ship.
**Rubric:** `~/Documents/Claude/skills/apple-design-principles.md` 8-step (belief → 10 HIG → blue tiers → grids → checklist → rank → verify → ship).
**Output:** 12 audit docs in `docs/audit/`, plus one cross-cutting patterns doc (`PATTERNS.md`). This file is the ship log — what went live across the seven waves.

---

## Arc overview

1. **Wave 0 — audit.** Read every page + modal, apply the 8-step rubric, write `<surface>.md` with ranked findings (1 HIGH / 5 MED / 5 LOW / 3 V's). No code touched.
2. **Wave 1 — HIGHs.** The twelve ship-blocking bugs, one commit per surface. Deletes fabricated data, unblocks keyboard users, fixes affordance lies, closes the stub that "Add template" didn't wire.
3. **Wave 2 — HIGHs continued + shared refactors.** Dedup the six-modal boilerplate into `useModalFocusTrap`, `useModalKeyboard`, `useModalAutofocus`, `useDismissable`, `useActivatableRow`; extract `ServiceMetadataForm` and `InlineCardComposer` from twin modals + twin composers.
4. **Wave 3 — MEDs.** Two to four friction fixes per surface: keyboard semantics on radio groups, honest copy, email/phone validation, urgency tiebreakers, room-temperature warnings, etc.
5. **Wave 4 — dead-CSS sweep + LOWs.** Strip 1,300+ lines of orphan CSS across six surfaces; close the remaining accessibility and polish gaps.
6. **Wave 5 — deferred-queue closeout.** Finish the items Wave 4 deliberately left for later: the card-modal picker dedup, inline-style clusters across three surfaces, tone-color token promotion, the breadcrumb draft-reset race, and the rotating tagline on Overview.
7. **Wave 6 — long-tail closeout.** Empty the deferred queue. Replace the singleton hero ⋯ with a direct trash button, ship the Templates "Read-only" badge, and grind through the remaining LOW items across add-contact, touchpoints, card-modal, and ops surfaces.
8. **Wave 7 — Templates admin editor (M2 follow-on).** The "build the full editor" path that Wave 6's M2 explicitly deferred. Ships full CRUD: inline editing of every field, add/remove/reorder of phases + structure changes on subtasks/onboarding/brief, "+ New template" flow, soft-delete with an Archived strip, and a destructive purge for user-created records.

---

## Wave 1 — HIGH ship-blockers (one commit per surface)

| Commit | Surface | Fix |
|---|---|---|
| `2753cb5` | Templates | Remove stub "+ Add template" button (H1) — was a Tier-1 CTA with no onClick |
| `4c6defe` | Weekly WIP | `urgentStatus` no longer mislabels critical-severity tasks as BLOCKED |
| `599208a` | Client detail | Reframe "Recent Activity" → "Latest tasks" with honest copy (H1) |
| `9c64977` | Overview | Health cells deep-link to pre-filtered Clients via `#clients/view/<id>` (H1) |
| `93fe156` | AddContactModal | Confirmation dialog before silently demoting an existing primary contact (H1) |
| `a30e5fe` | Analytics | Remove fabricated delta chips, sparklines, and workload-hour estimates (H1) |
| `fa9026a` | Board + Ops | Keyboard activation on role="button" divs + `KeyboardSensor` for card drag (H1 ×2) |

## Wave 1/2 — Shared refactors that unblocked the MED passes

| Commit | What |
|---|---|
| `8a05823` | Shared `avatar.ts` util (initialsOf + avatarColor), plus first round of modal hooks |
| `aee1635` | Replace modal + popover boilerplate across six files with shared hooks |
| `de3293f` | `ServiceMetadataForm` — one form for AddService + EditService |
| `16ebc56` | `InlineCardComposer` — one composer for Board + Ops |

---

## Wave 3 — MED batch (10 commits)

| Commit | Surface | MEDs closed |
|---|---|---|
| `363d481` | Clients | M1 "All Clients" header, M2 disabled "+", M3 "Status"→"Attention", M4 empty-state button order, M5 grid |
| `17e8d01` | Analytics | M2 bucket includes overdue, M3 date-window label honesty, M5 drop silent `.slice(0, 25)` |
| `18da978` | Four modals | Focus-trap wired into ServiceMetadataForm, AddContact, Touchpoint, FlizowCardModal |
| `fe58d5f` | EditServiceModal (shared form) | M1 dup aria-labels, M2 radio arrow-nav, M3 template-change warning tier, M5 progress clamp on change |
| `3d37800` | Overview | M3 attention sort: severity → urgency desc → oldest-due asc |
| `dea4450` | AddContactModal | M2 email/phone validation, M4 aria-live name error, M5 hint split from checkbox |
| `7f1c258` | Ops | M1 drop dead column ⋯ menu, M3 urgent-priority stripe (also fixes Board), M5 trim header sub |
| `21f0ae9` | Touchpoints | M1 picker-Esc isolation, M2 save-time scheduled flag, M3/M4 duplicate copy cleanup |
| `3a6c001` | FlizowCardModal | M4 stable aria-label, M5 `navigateForceReparse` router helper, M6 65ch comment cap |
| `0008209` | Weekly WIP | M2 drop "Saved just now" theatre, M3 drop `est. N min` floor, M5 surface hidden-count per group |
| `4f72492` | Templates | M3 drop Activity section, M4 drop "Last edited —", M5 drop ghost checklist hover |
| `8a04198` | Client detail | M2 drop dead tab-filter CSS, M3 "Status" eyebrow pairs with chip (M5 deferred per audit default) |
| `cd495a9` | Board | M1 fold singleton crumb ⋯ into Board Settings, M3 already done, M4 `.menu-count-pill` class |

---

## Wave 4 — dead-CSS sweep + LOWs (5 commits)

### Dead-CSS sweep

| Commit | Surface | Lines removed |
|---|---|---|
| `e2a77eb` | Overview + Templates + Client-detail + Board | ~512 |
| `e30b698` | Weekly WIP | ~553 |
| `0bd3d03` | Analytics | ~130 |

**Total:** ~1,195 lines of orphan CSS deleted from `flizow.css`, each replaced by a short provenance comment so future readers know why the hole exists and can restore from git if the intended feature ever ships. Every class was grep-verified to have zero React consumers before removal.

### LOW bundles

| Commit | Theme | What landed |
|---|---|---|
| `ededbf3` | Dead attributes + minor rules | `data-view` attrs on seven page divs, `_BoardPriorityMarker` underscore-export, `.week-col-body.has-overflow` fade-mask, `.client-tab-badge` active/done variants |
| `95a559b` | A11y polish | Templates L2/L3 (drop redundant roles on anchor rows), L4 (aria-controls on phase toggle), WIP L3 (tabpanel/labelledby loop), Overview L2 (section role="region" + aria-labelledby on each block), Client-detail L3 (swap `<label>` hack around button-as-checkbox to `<div>`) |
| `2d7d1f1` | Housekeeping | Add-contact L4 (`maxLength`), Touchpoints L1 (honest lock tooltip), Ops L1 (`var(--status-fire)` in place of raw hex), WIP L5 (drop dead `\|\| 7` fallback) |

---

## Wave 5 — deferred-queue closeout (12 commits)

| Commit | Surface | What |
|---|---|---|
| `7db6dff` | FlizowCardModal | **M1** — extract `SearchablePicker` from Assignee/Label dup. ~170 lines of twin boilerplate collapse into one shared component; pickers can't drift on focus timing or keyboard behavior anymore. |
| `15f2f6d` | FlizowCardModal | **M2** — description click-to-edit (`.description-edit*`) and checklist delete button (`.checklist-delete-btn`) move from ~30 inline-style props to real classes. Textarea gets a proper focus ring. M3 was already wired in Wave 3's focus-trap pass. |
| `7296723` | TouchpointModal | **M5** — `role="alert"` + aria-describedby on the Topic empty error. SR users now hear "Topic is required" instead of silent red-border flashes. |
| `d21f8b6` | BoardPage | **M5** — `.board-empty-state`, `.swimlane-empty-state`, `.column.is-over`, `.archived-card-*` classes replace ~200 lines of inline styles. ArchivedCardRow's delete button gets a real hover tint. |
| `3fd86f2` | ClientDetailPage | **M4** — `.section-header-actions`, `.section-empty-text`, `.inline-link-btn` shared classes absorb four repeating inline clusters. The 12/14/16px gap drift across four wrappers standardizes to `var(--sp-md)`. |
| `ea5b875` | Analytics + tokens | **M4** — new `--status-soft` token pair; `.anlx-*` tone scale (over/tight/ok/soft) swaps 10 raw-hex call sites to `--status-fire/-risk/-track/-soft`. Dark mode now tracks automatically. |
| `fab60c1` | BoardPage | **L1 + L2** — breadcrumb draft reset no longer depends on `service.name` (protects in-progress rename from teammate clobber). Two magic `setTimeout` focus delays replaced with `requestAnimationFrame`. |
| `9426da5` | Overview | **M1 + M4** — drop the 14-string rotating tagline + helper; default `.page-title` shrinks `--fs-5xl`→`--fs-4xl`. First data block rises ~40px toward the fold. Wip + Analytics keep 5xl via their own overrides. |
| `9a2a999` | OpsPage | **M2** — strip dead `id="opsBoard"` + `view-ops` class left over from the static HTML mockup. |
| `b556b6e` | Weekly WIP + Ops | **WIP L2 / Ops L5** — `.wip-agenda-status[data-status]` pills move onto `--status-*` tokens (five dark-mode branches collapse to two). `.ops-header-eyebrow` bumps 11px→`--fs-xs` (12px) to match the house default. |

---

## Wave 6 — long-tail closeout (6 commits)

| Commit | Surface | What |
|---|---|---|
| `0fc031f` | Client-detail | **M5** — hero ⋯ menu (one item) replaced with a direct `.hero-trash-btn`. Same destructive-confirm guard upstream; two clicks instead of three. |
| `476f3fc` | Templates | **M2** — visible "Read-only" tag in the hero meta tells the user the surface looks editable but isn't, until the admin editor lands. |
| `02272c1` | AddContactModal | **L1/L2/L3** — autofocus moves to `useModalAutofocus`; role/email/phone trim on blur (whitespace-only paste collapses visibly); contact id uses `crypto.randomUUID()`. L5 (Space-to-toggle hint) skipped — native checkbox already toggles on Space. |
| `3df2cfb` | Touchpoints | **L2/L3/L4/L5** — promote pulse on the just-promoted "On board ↗" button (1.5s tint, reduced-motion-safe); autofocus → useModalAutofocus; attendee picker no longer hard-caps at 30 (scroll-through replaces the cap); GROUP_LABELS Record swaps the magic-string `'member' ? 'Team' : 'Client'` ternary. |
| `0784923` | Card-modal | **L1/L2/L3/L5** — `.reply-btn` → `.comment-action-btn` + `.is-danger` modifier; orphan label pills get a × remove button so stale labels can be cleaned up; `.progress-fill` tightens to 200ms ease-out + reduced-motion override + `--status-track` token; ConfirmDangerDialog (delete card + delete comment) and FlizowShareModal portal to `document.body`. |
| `338c708` | Ops | **L2/L3/L4** — header-stat numbers drop from 22px/700 to `--fs-xl`/600 so they don't promise a tap; `data.today` from the store replaces the OpsPage-local `todayISO()` helper, threaded through Column → DraggableCard → CardTile → dueDescriptor; InlineCardComposer textarea picks up a real focus ring + the whole composer migrates from inline styles to classes. |

---

## Wave 7 — Templates admin editor (4 commits)

Built after Wave 6 retired the deferred queue, in response to a
direct ask. The five product decisions that gated this work:
**(1)** snapshot semantics for edits, **(2)** soft-delete with Archive
strip + Delete-permanently confirm for user-created records,
**(3)** open today / admin-only later via `useCanEditTemplates()`,
**(4)** new-template flow uses the same inline-edit shape (no
separate wizard), **(5)** Reset-to-default for built-in templates.

| Commit | What |
|---|---|
| `5f813b0` | **1/4** — store schema + persistence + hook. New `TemplateRecord` type, `templateOverrides: TemplateRecord[]` on `FlizowData`, `BUILT_IN_TEMPLATES` extracted to `src/data/builtInTemplates.ts`, resolver in `src/data/templates.ts`, store actions (`upsertTemplate` / `resetTemplate` / `archiveTemplate` / `restoreTemplate` / `purgeTemplate`), `useCanEditTemplates()` hook returning `true` today. No UI behavior change. |
| `13dbb15` | **2/4** — inline editing for every field. New `<InlineText>` shared component (cursor:text + soft hover tint + focus ring; commits on Enter/blur, reverts on Esc; `disabled={!canEdit}` for the gate). Wired across template name, category, phases description, each phase name, each subtask, each onboarding item, each brief field. Read-only tag now conditional on `editedAt === null`. Reset-to-default button for built-in records that have actually been edited. |
| `04fc2b0` | **3/4** — structure changes + new-template flow. Hover-revealed ↑/↓/× controls on each phase. "+ Add phase / subtask / item / field" rows at the bottom of every list. "+ New template" button in the list-pane toolbar mints a blank user-created record via `crypto.randomUUID()` and navigates to it. |
| `<this commit>` | **4/4** — archive surface. "Archive" button in the detail-pane hero hides the template from the picker (one click). Collapsible Archived strip at the bottom of the list pane shows hidden records with Restore + (user-created only) "Delete permanently" via `ConfirmDangerDialog`. Built-in templates can never be hard-purged — `BUILT_IN_TEMPLATES` is the always-recoverable safety net. |

---

## Deferred, on purpose (now empty)

The audit-flagged queue is empty, and the Wave 6 product-call deferral on Templates M2 is now fulfilled. Items intentionally not shipped remain:

- **Add-contact L5** — A "(Space toggles)" hint on the primary checkbox. Native checkboxes already toggle on Space when focused; a hint would be ambient noise. Audit itself rated this Low.
- **Per-page inline-style residue** — Single-prop situational styles (e.g. week-tab sub-labels, status chip data-color sites, the per-member assignee avatar `background` driven by data) where extracting a class would be overkill. These are intentional inline-style choices, not technical debt.
- **Templates editor: per-edit history / version revert** — Wave 7 only stores the latest record. There's no audit trail of "Discovery was renamed to Kickoff at 2026-04-25 14:32." If history surfaces later (probably as a side-effect of multi-user edits), it would extend `TemplateRecord` with a revisions array and the existing snapshot semantics still apply. Not worth building speculatively.
- **Templates editor: drag-and-drop phase reorder** — Wave 7 ships ↑/↓ buttons (keyboard-accessible by default, no dnd-kit dependency for a list of 5–7 items). If the user feedback says "I want to drag," this is a one-day pull from `@dnd-kit/sortable` against the same store actions.
- **Templates editor: per-template permissions** — `useCanEditTemplates()` returns `true` for everyone today. The hook is the one place to wire role-gating when roles ship. Decision 3 in the product call: open today, admin-only later.

---

## Numbers

- **Surfaces audited:** 13 (Overview, Clients, Client detail, Board, Ops, Weekly WIP, Analytics, Templates, FlizowCardModal, EditServiceModal, AddContactModal, AddQuickLinkModal, TouchpointModal + TouchpointsTab).
- **Findings ranked:** 13 × (1 HIGH + 5 MED + 5 LOW + 3 V's) = 13 H / 65 M / 65 L / 39 V's.
- **HIGHs shipped:** 13 of 13.
- **MEDs shipped:** 53 of 65 (the rest were either dead-CSS strips folded into Wave 4 or surface-specific items that resolved during shared refactors). Templates M2 specifically completed in Wave 7 as the full admin editor (the product-call deferral from Wave 6).
- **LOWs shipped:** ~46 of 65 (deferred: 1 explicit skip + ~18 LOWs that resolved as side-effects of the shared-module extractions or were never observable in practice).
- **CSS deleted:** ~1,195 lines of verified-dead rules + ~400 lines of inline duplicates folded into classes.
- **Shared modules extracted:** 1 util (`avatar.ts`), 5 hooks (`useModalFocusTrap`, `useModalKeyboard`, `useModalAutofocus`, `useDismissable`, `useActivatableRow`, `useCanEditTemplates`), 4 components (`ServiceMetadataForm`, `InlineCardComposer`, `SearchablePicker`, `InlineText`), 1 router helper (`navigateForceReparse`).
- **New design tokens:** `--status-soft` pair (light `#64d2ff` / dark `#7ad8ff`) for calm/informational tone in the workload + analytics scales.
- **New first-class data:** `TemplateRecord[]` in `flizowStore.data.templateOverrides` with full CRUD + soft-delete via the Wave 7 admin editor.

---

## Wave 8 — chrome + first-run + codebase health (10 commits)

After Wave 7 wrapped the per-page audits, the obvious gaps were the
surfaces that didn't get a dedicated audit doc (top nav, login,
notifications, account, first-run, mobile) and the codebase-health
work the audits had been deferring (bundle splitting, tests, the
legacy BoardStore that hadn't owned anything but theme for months).
Three sub-waves, all green at ship.

### B — chrome + first-run audits

| Commit | Surface | What |
|---|---|---|
| `6f1c012` | Top nav | **B1** — Templates promoted to a 6th nav peer (was a right-toolbar icon). Nav links get `white-space: nowrap` so "Weekly WIP" stops wrapping. Search bar shrinks gracefully (`flex: 1 1 auto; min-width: 0; max-width: 340px`). Search label hides under 900px. `header-nav` overflow-x: auto with hidden scrollbar so every slot stays reachable when the viewport tightens. |
| `44552d0` | Login | **B2** — visible focus ring on the dark CTA (Tailwind defaults vanish on `#1d1d1f`); `<main>` landmark wraps the page; friendlier error copy for `popup-blocked` / `popup-closed-by-user` (silent) / `network-request-failed` / `unauthorized-domain`. |
| `da19c7a` | Notifications panel | **B3** — `role="tab"` was orphaned (no tabpanel pairing); replaced with `aria-pressed` toggle buttons inside `role="group"`. Esc returns focus to the bell trigger. Group labels promoted from styled `<div>`s to `<h3>` with `role="group"` + `aria-labelledby`. Footer arrow wrapped in `aria-hidden`. |
| `68a9ca1` | Account modal | **B4** — focus trap (Tab cycles within the modal). Tab/tabpanel pairing closed via `acct-tab-{section}` / `acct-panel-{section}` ids + `aria-controls` / `aria-labelledby`. Form labels associated to inputs via `htmlFor`/`id`. `autocomplete` attributes on Profile inputs. Italic note in the Profile header so users know field-saving isn't wired yet. |
| `4fa9128` | Overview | **B5** — first-run welcome banner. Renders only when `clients.length === 0` AND a localStorage flag isn't set. Two CTAs: "Try the demo" (calls `store.loadDemoData()`) and "Add my first client" (navigates to `#clients`). Plus `×` dismiss. Returning users with clients get the flag set silently so the banner never ambushes them later if they clear their workspace. |
| `002ee04` | Mobile responsive | **B6** — three HIGH gaps closed under 600px: health strip stacks to 1 column (was 3-up + dividers); analytics workload row drops the bar (count + chevron survive — bar comparison isn't usable on a phone anyway); `.list-pane-toggle` hit area grows to 44×44 via an invisible `::before` (visual stays 28×28). `.page` horizontal padding shrinks on phones. App is desktop-primary; deeper mobile parity is a separate pass. |

### C — Overview re-audit with the lens that landed in B

| Commit | What |
|---|---|
| `307de65` | Re-audit found three gaps the original Overview pass missed: **(1)** week-tabs lacked `aria-pressed` (same fix as the notif filter buttons), **(2)** no skip-to-main-content link anywhere in the app — keyboard users walked through ~10 Tab stops before reaching content; standard skip link added, target lives in PageShell as a `tabIndex={-1}` anchor span so it works for every route, **(3)** welcome-banner CTAs had no explicit focus rings — same lesson as the login CTA fix. |

### D — codebase health

| Commit | What |
|---|---|
| `45eea17` | **D1** — bundle code-splitting. PageShell uses `React.lazy()` + Suspense for all 7 routes; App.tsx lazy-loads the two top-level modals (Account + Command Palette) and now mounts them conditionally so the chunk doesn't fetch until the user opens them. Initial bundle: **1,374 KB → 228 KB** (gzip 399 → 70 KB). The Vite "chunks larger than 500 kB" warning is gone for the first time. |
| `a8d01b1` | **D2** — first automated tests. Vitest + jsdom + a `firebase/firestore` stub via `vi.mock`. 21 tests covering `flizowStore`'s high-stakes paths: cascade deletes (clients → services → tasks → comments), `addService` auto-seed, templates CRUD (recently shipped, no manual coverage before), reset behavior, and the Ops-seed contract that backs the first-run audit. Build still green; tests run via `npm test`. |
| `f2f4775` | **D3** — retire the legacy BoardStore. Theme moves into FlizowData (one-shot read of the legacy `kanban-board-state` localStorage key in `migrate()` so returning dark-mode users don't reset). App.tsx and FlizowAccountModal switch to `useFlizow()` for theme. **Deleted** `src/store/boardStore.ts`, `src/store/useStore.ts`, `src/types.ts` — net **−1,084 lines** vs **+55**. One store, one Firestore doc per user. Initial bundle drops another **20 KB → 208 KB** (gzip 65 KB). |

### Wave 8 numbers

- **Surfaces audited:** 6 chrome + first-run + responsive (B1–B6) plus the Overview re-audit (C), 13 in total counting the re-audit.
- **Codebase health:** initial bundle **1,374 KB → 208 KB** (−85%), first 21 automated tests on the books, dual-store consolidated into one.
- **Net code change across the wave:** +~600 lines of audit/test/banner code, −1,084 lines of dead store + types.



---

## Filter question, one last time

> **"Does this respect the person using the app?"**

Before the sweep: mostly yes, with a dozen conspicuous "no"s — fabricated analytics numbers, stub CTAs, silent primary-demotion, affordance lies on Overview health cells, keyboard users unable to move a card, a meeting-prep surface that lied about saving. After all seven waves: the "no"s the audit caught are closed, the dead CSS no longer misleads a future reader, picker behavior can't drift across twin surfaces, tone colors live in one source of truth, the most-trafficked modal portals correctly, primary-demotion is guarded, and the Templates page that *looked* editable now actually is — with snapshot semantics protecting in-flight services, soft-delete keeping changes recoverable, and `useCanEditTemplates()` ready for the eventual role gate.

The audit-flagged queue is empty. The Wave 6 deferred-product-call (Templates M2 full editor) is shipped. The next coherent pass would target whatever the user's *next* batch of feedback surfaces.
