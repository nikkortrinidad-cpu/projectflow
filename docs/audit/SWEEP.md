# Flizow Design-Audit Sweep — Summary

**Window:** 2026-04-24 audit → 2026-04-25 ship.
**Rubric:** `~/Documents/Claude/skills/apple-design-principles.md` 8-step (belief → 10 HIG → blue tiers → grids → checklist → rank → verify → ship).
**Output:** 12 audit docs in `docs/audit/`, plus one cross-cutting patterns doc (`PATTERNS.md`). This file is the ship log — what went live across the four waves.

---

## Arc overview

1. **Wave 0 — audit.** Read every page + modal, apply the 8-step rubric, write `<surface>.md` with ranked findings (1 HIGH / 5 MED / 5 LOW / 3 V's). No code touched.
2. **Wave 1 — HIGHs.** The twelve ship-blocking bugs, one commit per surface. Deletes fabricated data, unblocks keyboard users, fixes affordance lies, closes the stub that "Add template" didn't wire.
3. **Wave 2 — HIGHs continued + shared refactors.** Dedup the six-modal boilerplate into `useModalFocusTrap`, `useModalKeyboard`, `useModalAutofocus`, `useDismissable`, `useActivatableRow`; extract `ServiceMetadataForm` and `InlineCardComposer` from twin modals + twin composers.
4. **Wave 3 — MEDs.** Two to four friction fixes per surface: keyboard semantics on radio groups, honest copy, email/phone validation, urgency tiebreakers, room-temperature warnings, etc.
5. **Wave 4 — dead-CSS sweep + LOWs.** Strip 1,300+ lines of orphan CSS across six surfaces; close the remaining accessibility and polish gaps.

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

## Deferred, on purpose

- **Client-detail M5** — the hero's overflow ⋯ menu with one item ("Delete client…"). Audit default recommendation was `(c) keep as-is`; the in-code comment at the declaration documents the shape as intentional future-proofing for Archive / Duplicate / Export. Revisit when any of those actions ship.
- **Card-modal M1, M2, M3** — AssigneePicker/LabelPicker duplication (~180 lines), inline-style clusters (12+ locations), missing focus trap on overlay. All three need a shaped refactor, not a sweep. Queued for the next pass.
- **Analytics M4** — tone-color duplication across TS + CSS. This is a token-introduction refactor, not a dead-CSS strip. Queued with the other color-token cleanups.
- **Board L1 / L2** — breadcrumb draft reset race, magic `setTimeout` focus delays. Covered by the broader shared-focus-hook refactor on the queue.
- **Per-page inline-style clusters** — Called out in most audit docs (Board M5, Client-detail M4, Ops M4, Card-modal M2). These are grind fixes that belong in a typed "inline-style migration" pass.

---

## Numbers

- **Surfaces audited:** 13 (Overview, Clients, Client detail, Board, Ops, Weekly WIP, Analytics, Templates, FlizowCardModal, EditServiceModal, AddContactModal, AddQuickLinkModal, TouchpointModal + TouchpointsTab).
- **Findings ranked:** 13 × (1 HIGH + 5 MED + 5 LOW + 3 V's) = 13 H / 65 M / 65 L / 39 V's.
- **HIGHs shipped:** 12 of 13 (Client-detail M5 intentionally deferred).
- **MEDs shipped in Wave 3:** 36 of 65.
- **LOWs shipped in Wave 4:** ~20 of 65.
- **CSS deleted:** ~1,195 lines of verified-dead rules + ~140 lines of inline duplicates folded into classes.
- **Shared modules extracted:** 1 util (`avatar.ts`), 5 hooks (`useModalFocusTrap`, `useModalKeyboard`, `useModalAutofocus`, `useDismissable`, `useActivatableRow`), 2 components (`ServiceMetadataForm`, `InlineCardComposer`), 1 router helper (`navigateForceReparse`).

---

## Filter question, one last time

> **"Does this respect the person using the app?"**

Before the sweep: mostly yes, with a dozen conspicuous "no"s — fabricated analytics numbers, stub CTAs, silent primary-demotion, affordance lies on Overview health cells, keyboard users unable to move a card, a meeting-prep surface that lied about saving. After the sweep: the "no"s the audit caught are closed, the dead CSS no longer misleads a future reader, and the remaining work is scoped and documented.

Next pass starts from the *Deferred, on purpose* list.
