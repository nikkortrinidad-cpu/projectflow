# Audit — Board page (`#board/{serviceId}`)

Scope: `src/pages/BoardPage.tsx` (2258 lines) plus the board-scoped rules in
`src/styles/flizow.css` (`.board`, `.column*`, `.card*`, `.breadcrumb*`,
`.swimlane*`, `.wip-limit-*`, `.board-members-*`, `.filters-bar`,
`.filter-search`, `.add-card-btn`). Child modals (`FlizowCardModal`,
`EditServiceModal`, `BoardFilters`, `AddCardComposer`, `ConfirmDangerDialog`)
are linked but audited separately — this pass stays on the board surface.

Rubric: `~/Documents/Claude/skills/apple-design-principles.md` (8 steps:
belief → 10 HIG → blue tiers → grids → checklist → ranked findings → verify →
ship).

---

## 1. Core belief

**A Flizow operator opens the board to move today's work forward.** They come
in with a service in mind and a small set of questions: *what's stuck, what's
due, what's mine, what's next?* The board has to answer all four inside one
glance and absorb every mistake. Every pixel and every millisecond either
serves that loop or gets in the way.

---

## 2. The 10 HIG principles against this page

1. **Clarity beats cleverness.** Column dots are plain semantic colors,
   card titles carry the weight, "+ Add Card" only appears in To Do.
   Plain-English labels throughout (*Archived cards*, *Members*,
   *Board Settings*). Good.
2. **The interface defers to the content.** Breadcrumb is quiet text;
   board chrome recedes to hairlines; cards are the anchor. Filters bar
   is muted. Deference is honored.
3. **Direct manipulation.** Strong on this page. Cards drag. Dropping a
   card onto a new swimlane patches the grouping field
   (`patchForLaneChange`) — a single gesture moves both column *and*
   priority/assignee/label. This is a real design win (flagged in V1).
   Inline rename on the breadcrumb crumb for the service name. No
   "Edit" button where a click-to-edit would do.
4. **Every action gets feedback.** Drag shows a tilted shadow overlay,
   drop target gets `borderColor: var(--hover-blue)`, WIP overflow tints
   the count amber, isOver state animates. Comment count hides at zero
   instead of showing a dead "0" (see `CardTile` comment). Good.
5. **Forgiveness.** Archive is soft — archived cards live in a dedicated
   modal with restore + permanent delete. Service delete is behind a
   `ConfirmDangerDialog` with cascade count. Undo via rename Esc resets
   draft. Good at the action level; missing an undo *toast* after a
   drag (L1 on Clients covered this; same absence here).
6. **Consistency.** Breadcrumb rename mirrors Client detail hero rename
   (cursor:text + hover tint + focus ring, no pencil icon). Board
   Settings ⋯ menu uses the same `tb-menu` + `tb-menu-item` pattern as
   Client detail's service menu. Members popover echoes the Client
   About → Team layout. Strong consistency (V2).
7. **Hierarchy through typography.** Column title is an all-caps
   12px `--fs-md` soft-muted label; card title 14px regular; card
   meta 11px faint. Clear hierarchy. Service name in the breadcrumb
   however reads the same weight as the client crumb above it — two
   things at the same visual weight compete for "you are here" (noted
   under L4).
8. **Motion explains, it doesn't decorate.** Drag overlay is
   `dropAnimation={null}` — snappy, no lingering. Swimlane chevron
   rotates on collapse. Everything else is cut.
9. **Accessibility is a layer.** **This is the page's biggest gap.**
   `useSensors(useSensor(PointerSensor))` registers a pointer sensor
   only — no `KeyboardSensor`, no `sortableKeyboardCoordinates`, no
   announcements hook. Cards are focusable via Tab (dnd-kit sets
   `role="button"` + `tabIndex=0` via `attributes`), Enter opens the
   detail modal, but a keyboard-only user **cannot move a card across
   columns** at all. The board's defining interaction is pointer-only.
   See H1.
10. **Speed.** Filters memoized, `commentCountByTask` is O(n+m) instead
    of O(n·m), `tasksByColumn` bucketed once per render, swimlanes
    computed only when `groupBy !== 'none'`. Deep-link + sessionStorage
    auto-open is one-shot (key cleared immediately). Performance
    posture is good.

---

## 3. Blue-highlight tier check

- **Solid CTA** — reserved for unambiguous primary actions. On this
  page only the column's *Save* WIP-limit button uses solid blue
  (`background: var(--hover-blue); color: #fff`, line 1524). Correct
  call — it's the one "commit this change" primary in the pop.
- **Ring** — focus ring on `breadcrumb-rename-input` (2px solid
  `--highlight`) and inputs in WipLimitEditor (2px box-shadow). Tier
  honored.
- **Tint** — `isOver` highlights the drop column via
  `borderColor: var(--hover-blue)` (inline style, line 1300). Hover
  tint on breadcrumb menu button, `.breadcrumb-rename:hover`. Good,
  though the tint is implemented inline rather than as a class (M5).
- **Text-only** — breadcrumb links, "Manage team in client profile →"
  footer. Honored.

No tier violations. One implementation inconsistency (tint applied
inline vs. via class) folded into M5.

---

## 4. Grid / layout audit

- `.board` uses `gap: var(--sp-2xl)` + `padding: var(--sp-4xl)` — on
  the token grid.
- `.column` is fixed 320×320 min/max width, 16px radius, 1px hairline.
  Consistent with design tokens.
- `.breadcrumb-bar` padding `12px 32px` — the 12 is a magic number (not
  in the `--sp-*` scale), though it matches other top-nav bars so the
  inconsistency is already system-wide. Not flagged here; it's a
  global tokens issue.
- Inline-styled blocks break grid discipline in three spots:
  `EmptyState` (lines 347-369), `AddCardInline` composer (1612-1668),
  `SwimlaneEmptyState` (1731-1746), `ArchivedCardRow` (2103-2236),
  archived count pill (988-1000). All use raw pixel values that don't
  reference `--sp-*` tokens. Folded into M5.

---

## 5. Ten-question review

1. **Purpose.** Yes — breadcrumb tells you where you are, columns show
   the work, filters bar lets you narrow. 5-second test passes.
2. **Hierarchy.** Mostly yes. The service name (the page's "you are
   here") reads at the same weight as the client crumb above it,
   losing a beat of page-identity (L4).
3. **Clarity.** Every control has an obvious job. One copy-paste
   issue: *Edit service details…* is the **only** item in the
   service-crumb overflow menu, and the *same string* lives in Board
   Settings. Two paths to one modal with identical wording (M1).
4. **Feedback.** Drag overlay, column border tint, WIP amber, hover
   tints — all within 100ms. Good.
5. **Forgiveness.** Archive is soft; delete is confirmed; Esc aborts
   rename. Drag has no undo toast, but that's a global pattern gap,
   not board-specific.
6. **Consistency.** Breadcrumb rename, `tb-menu`, members popover,
   `btn-sm` all match the rest of the app. The three
   outside-click + Esc useEffects in Breadcrumb are copy-pastes of
   the same pattern (M3).
7. **Accessibility.** **Fails.** Keyboard users cannot drag. No
   KeyboardSensor. See H1.
8. **Speed.** Passes.
9. **Respect.** Mostly yes — the board trusts the user with direct
   manipulation and soft delete. Respect breaks down only at the
   keyboard-only edge (H1) and in the moments where the UI
   duplicates itself (M1).
10. **The belief.** Matches for pointer users. Half-matches for
    keyboard users — they can see everything but can't "move the
    work forward."

---

## 6. Ranked findings

### HIGH (1)

- **H1 — Keyboard-only users can't move cards.**
  - `BoardPage.tsx:446-451` — `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))`.
  - No `KeyboardSensor`, no `sortableKeyboardCoordinates`, no
    `DndContext` `accessibility` prop, no announcements.
  - `DraggableCard` spreads `{...attributes} {...listeners}` (lines
    1481-1482). dnd-kit's default attributes mark the card
    `role="button"` + `tabIndex=0`, so a screen-reader user reaches
    the card and hears "button." Pressing Enter fires the click
    handler → opens the detail modal (OK). Pressing Space does
    nothing. There is no keyboard gesture that moves a card between
    columns.
  - Moving a card across columns is the board's defining verb.
    Pointer-only parity makes the primary interaction inaccessible
    to keyboard and screen-reader users.
  - Fix shape (two parts):
    1. Register a `KeyboardSensor` with
       `sortableKeyboardCoordinates`. dnd-kit's built-in keyboard
       flow is Space/Enter to pick up, arrow keys to move between
       droppables, Space/Enter to drop, Esc to cancel.
    2. Provide a fallback affordance inside the card detail modal
       (a "Move to…" dropdown) so users who land in the modal via
       Enter can still change column without re-entering the drag
       gesture. (Requires the card-modal audit pass.)
  - Accept both; keyboard sensor alone is enough to unblock the
    board; the card-modal dropdown is the belt on the suspenders.

### MEDIUM (5)

- **M1 — "Edit service details…" has two identical entry points.**
  - `BoardPage.tsx:901-917` — inside the service-crumb overflow
    menu (`.breadcrumb-menu-wrap .tb-menu`), the **only** item is
    *Edit service details…*. Identical wording, same modal, in
    `BoardPage.tsx:958-970` — Board Settings menu item
    *Edit service details…*.
  - Two places, same action, same label. Violates Consistency
    (same action should live in one place) and Clarity (a kebab
    with one item is a drawer with nothing inside).
  - Repeat of a pattern flagged in the Client detail audit (M5:
    hero overflow menu with one item). Same fix shape: fold the
    one item into the larger surrounding menu and drop the
    singleton kebab, OR keep the kebab and put enough items in it
    to earn its existence (service settings, duplicate, archive).
    Pick the first option — Board Settings is already the parent
    surface for per-board actions; the crumb overflow is redundant.
  - After merge, the breadcrumb gets one less control, the
    rename affordance stands alone as intended, and the user has
    one deterministic path per action.

- **M2 — ~200 lines of dead board CSS.**
  Orphan rules in `src/styles/flizow.css` with no React consumer:
  - `.column.collapsed[data-dot="..."]` (lines 1454-1458, 5 rules)
    — no React code adds `collapsed` class to a column.
  - `.column.collapsed .column-menu-wrap`,
    `.column.collapsed .column-cards` (lines 1633-1634) — same.
  - `.card-assignees` / `.card-assignee.is-overflow` (lines
    1789-1803) — `CardTile` renders one assignee only.
  - `.card.is-new` (lines 1809-1812) — no React adds `is-new`.
  - `.card.dragging` (lines 4890-4893) — `DraggableCard` controls
    drag appearance via inline `opacity`/`style`, not class name.
  - `.card-drop-indicator` (lines 4900+) — no React consumer.
  - `.column-cards.drag-over` (lines 4894-4898) — drag-over
    feedback is applied to `.column` via inline `borderColor`, not
    `.column-cards`.
  - `.add-column` (lines 1918+) — board has no "add column" UI.
  - `.swimlane[data-swimlane-id="this-month"]`,
    `.swimlane[data-swimlane-id="backlog"]` (lines 1892-1897) —
    legacy named-swimlane colors from before dynamic groupBy.
    Current keys are priority/assignee/label values; `this-month`
    and `backlog` never appear.
  - Fix: delete all of it. Safe drop.

- **M3 — Three copy-paste outside-click + Esc useEffects in one
  component.**
  - `BoardPage.tsx:751-767` (menuOpen),
    `BoardPage.tsx:770-786` (membersOpen),
    `BoardPage.tsx:792-808` (settingsOpen) — same 15-line pattern
    three times.
  - Same shape appears a fourth time in `WipLimitEditor`
    (lines 1380-1394) and repeatedly across the app (Clients,
    Client detail, top nav).
  - Extract `useDismissable(ref, open, onClose)` hook and use it
    once per popover. Reduces Breadcrumb by ~45 lines and removes
    a high-churn copy-paste site. This isn't a user-visible bug,
    but it inflates the file and makes future focus-trap /
    aria-expanded changes land in four places instead of one.

- **M4 — Archived-cards count pill is inline-styled instead of
  reusing the existing class.**
  - `BoardPage.tsx:987-1000` — inline
    `{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', background: 'var(--bg-faint)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }`.
  - `.members-count-pill` (in flizow.css) already does this exact
    shape on the Members button next to it. The inline pill
    reinvents the wheel and drifts visually by 1-2px from the
    members pill (same spec, different implementation).
  - Fix: replace with `<span className="menu-count-pill">` and
    promote the pill to a shared class, or reuse
    `.members-count-pill`. Keeps the two adjacent counts
    pixel-identical.

- **M5 — Inline-style clusters in five board locations.**
  - `EmptyState` (lines 347-369) — every element is inline-styled;
    raw pixel values (`padding: '64px 32px'`, `maxWidth: 640`,
    `fontSize: 28`) that don't hit any `--sp-*` or `--fs-*` token.
  - `AddCardInline` composer open state (lines 1612-1668) — outer
    div, textarea, footer buttons all inline-styled. The textarea
    sets `outline: 'none'` with no focus-ring replacement (L3).
  - `SwimlaneEmptyState` (lines 1731-1746) — entire empty-state
    card inline-styled, borrowed tokens (`--hairline-soft`,
    `--bg-elev`) but raw pixel paddings.
  - `ArchivedCardRow` (lines 2103-2236) — avatar, title button,
    delete button all inline-styled (~130 lines).
  - `Column` isOver (line 1300) — `style={{ borderColor: 'var(--hover-blue)' }}`
    where a `.column.is-over` class would centralize the rule.
  - Fix: migrate each cluster to a matching class
    (`.empty-state-card`, `.add-card-composer`, `.archived-card-row`,
    `.swimlane-empty`, `.column.is-over`). Halves the file's
    inline-style count and makes theming discoverable.

### LOW (5)

- **L1 — Breadcrumb draft silently resets on external rename.**
  - `BoardPage.tsx:733-739` — `useEffect` on `[service.id, service.name]`
    resets `draft` and closes editing state whenever `service.name`
    changes. If a teammate renames the same service during an
    active edit here, the typed draft vanishes without a toast.
    Rare, but silent data loss trips Forgiveness. Guard by only
    resetting draft when `service.id` changes (new board navigation),
    not when `service.name` changes mid-edit. If a mid-edit
    conflict arises, show a conflict toast ("teammate renamed to
    *X* — keep yours or theirs?").

- **L2 — Magic setTimeout values for focus.**
  - `BoardPage.tsx:743` — `setTimeout(() => inputRef.current?.focus(), 20)`.
  - `BoardPage.tsx:1376` — `setTimeout(() => inputRef.current?.select(), 60)`.
  - Same smell called out in Client detail L4. These numbers
    aren't documented and there's no shared helper. Adopt a
    `useAutoFocusOnMount(ref)` hook that uses `requestAnimationFrame`
    + `queueMicrotask` instead of raw timers.

- **L3 — AddCardInline textarea loses its focus ring.**
  - `BoardPage.tsx:1642` — `outline: 'none'` on the textarea,
    no replacement. Tab-focus on the textarea shows nothing. Minor
    accessibility drift (principle 9), rolled low because the
    component is rarely entered by keyboard. Fix: replace
    `outline: 'none'` with a focus-visible class that renders the
    standard 3px ring.

- **L4 — Breadcrumb crumb weights compete.**
  - The current-page crumb (`aria-current="page"`) uses
    `color: var(--text); font-weight: 500` — identical weight to
    the parent client link above it. Convention on this app is
    that the current page reads heavier. Bump to 600 or promote
    it into a page heading treatment. Minor, but "you are here"
    should be the strongest cue.

- **L5 — Dead prop `Priority` re-export marker.**
  - `BoardPage.tsx:2256-2258` —
    `export type _BoardPriorityMarker = Priority;` with a comment
    explaining "Unused underscore marker so Priority isn't an
    unused import." This is a stale import that's been papered
    over with a type re-export. Delete the import; delete the
    marker.

---

## 7. Verify (positives worth preserving)

- **V1 — Direct manipulation on swimlane drops.** Dragging a card
  across a priority lane boundary *edits the priority field* via
  `patchForLaneChange`. One gesture → two state changes, in the
  user's frame. This is HIG principle 3 executed cleanly. The
  same helper handles assignee and label grouping. Keep.
- **V2 — Breadcrumb rename mirrors Client detail hero rename.**
  Same cursor, same hover tint, same ring on focus, no pencil
  icon. Cross-page consistency. Keep the pattern; extract it
  into a shared `<InlineRename>` component so a third surface
  (e.g. template name in Templates) doesn't copy the CSS a third
  time.
- **V3 — Deep-link card opening via
  `#board/{svcId}/card/{cardId}` + sessionStorage fallback.** URL
  survives new-tab open; sessionStorage survives in-app nav.
  One-shot read (key cleared immediately) prevents refresh
  loops. Thoughtful URL design — keeps the board a
  addressable resource.

---

## 8. Ship

**Nothing changes yet.** Findings only. The queue, if/when approved:

1. H1 — register `KeyboardSensor`. One file, probably <20 LoC
   delta. High user-impact.
2. M2 — delete the ~200 lines of dead board CSS. Safe drop,
   verifies by `rg` showing zero consumers.
3. M1 — fold the singleton service-crumb overflow menu into the
   Board Settings menu, drop the kebab. Matches the Client detail
   M5 cleanup.
4. M3 — extract `useDismissable` hook. Replaces four copy-pastes.
5. M4 — promote `.members-count-pill` to `.menu-count-pill`
   (or similar); replace the inline pill.
6. M5 — migrate inline-style clusters to classes. Ordered by
   size: `ArchivedCardRow`, `AddCardInline`, `EmptyState`,
   `SwimlaneEmptyState`, `Column isOver`.
7. LOW — L1 guard, L2 hook, L3 focus ring, L4 crumb weight, L5
   dead marker. Bundleable.

Waiting on approval before touching code.

---

*Audit date: 2026-04-24. Auditor: Claude (session). Method: read
`BoardPage.tsx` + board-scoped CSS, grep-verify every CSS selector
against React consumers, apply the 8-step rubric.*
