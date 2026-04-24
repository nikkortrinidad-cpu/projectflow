# Audit — Ops page (`#ops`)

Scope: `src/pages/OpsPage.tsx` (606 lines) and its dedicated CSS block
in `src/styles/flizow.css` (`.ops-header-*`, lines 10158-10209). The
page reuses `.board`, `.column`, `.card`, `.filters-bar`, `.filter-search`
from the Board page — those are covered in `docs/audit/board.md` and not
re-audited here unless the shared rule surfaces an Ops-specific issue.
`FlizowCardModal`, `BoardFilters` link out and are audited separately.

Rubric: `~/Documents/Claude/skills/apple-design-principles.md`
(belief → 10 HIG → blue tiers → grids → checklist → ranked findings →
verify → ship).

---

## 1. Core belief

**Ops is where the partners track the business's work on itself.**
Hiring, finance, brand, legal, process, tooling — things that don't
belong to a client but still need moving. The user opens Ops to see
what the team's carrying internally, drag a card forward, or add a
new internal to-do. Same verb as the Board page (*move work forward*),
different noun (*us* instead of *them*).

---

## 2. The 10 HIG principles against this page

1. **Clarity.** Header eyebrow *Internal work*, title *Ops board*,
   sub explicitly says "Work the team is doing for the business
   itself — hiring, finance, process, tooling. Client deliverables
   stay inside each client profile." Leaves no ambiguity about what
   this page is for. Maybe over-explains (M5).
2. **Deference.** Column chrome recedes, cards lead, filter bar is
   muted. Consistent with Board.
3. **Direct manipulation.** Drag-and-drop between columns works.
   Inline rename does not exist on ops tasks — the title opens the
   modal for all edits. Reasonable for a simpler surface.
4. **Feedback.** Same `borderColor: var(--hover-blue)` isOver tint,
   drag overlay shadow, filter chips tint. Matches Board.
5. **Forgiveness.** Soft-archive via modal, same as Board. Add-card
   editor Esc aborts. No undo toast on drag (cross-app gap, same as
   Board).
6. **Consistency.** Reuses `.board`/`.column`/`.card` — excellent
   cross-page consistency. Diverges from Board in two deliberate
   places: the Blocked column always renders (V2 below), and a
   column ⋯ menu button *exists but is permanently disabled* (M1).
   The disabled state breaks the consistency contract — Board's
   column ⋯ does something; Ops's looks the same but doesn't.
7. **Hierarchy.** Header title is 26px/700, stats numbers 22px/700,
   eyebrow 11px uppercase. Clear. The sub is 13px with 1.45 line
   height and a 560px max-width — on the grid.
8. **Motion.** None of consequence — same as Board.
9. **Accessibility.** **Same keyboard-drag gap as Board (H1 below).**
   DraggableCard *does* wire Enter/Space to open the card (line
   444-452) — a small win over Board's DraggableCard which relies
   on dnd-kit's default attribute bag. But drag-to-move is still
   pointer-only.
10. **Speed.** Memoized filters, bucketed columns, derived assignee
    pool. Fine.

---

## 3. Blue-highlight tier check

- **Solid CTA** — only the inline-styled *Add card* submit button
  when title is non-empty (lines 400-404, inline `background:
  title.trim() ? 'var(--highlight)' : 'var(--bg-soft)'`). Correct
  tier for a single commit action.
- **Ring** — filter-search input's focus state via `.filter-search:
  focus-within` (shared CSS). Honored.
- **Tint** — column isOver drop target, same inline style as Board.
- **Text-only** — no inline text links on this page; N/A.

Tier honored. Implementation note same as Board: the isOver tint is
inline rather than classed (shared gap, not Ops-specific).

---

## 4. Grid / layout audit

- Header padding `28px 40px 20px` — the 28/40/20 trio is on the
  app's broader layout rhythm (40px horizontal matches the board's
  `--sp-4xl` gutter; 28 and 20 are specific spacing choices).
  Acceptable. At <720px it collapses to `20px 24px 16px` via
  `@media`.
- `.ops-header-stats` uses `gap: 28px`, `align-items: baseline`.
  The baseline alignment is right — keeps the 22px numbers sitting
  next to the 12px labels cleanly.
- Inline-style composer (AddOpsCardInline, lines 353-410) breaks
  the grid the same way Board's composer does. Folded into M4.

---

## 5. Ten-question review

1. **Purpose.** Yes — header subtitle explicitly names what belongs
   here vs. on a client board. 5-second test passes. Copy may
   over-explain (M5).
2. **Hierarchy.** Yes — title dominates, stats secondary, columns
   below. Clear reading order.
3. **Clarity.** Two problem spots: the disabled column ⋯ button
   (M1) and the stats that look tappable but aren't (L2).
4. **Feedback.** Pass (pointer users).
5. **Forgiveness.** Pass.
6. **Consistency.** Mostly — reuses shared kanban primitives. One
   deliberate divergence (always-on Blocked column, V2) is
   documented in code and makes sense for the smaller board. One
   inconsistency is the disabled ⋯ (M1) and dead hooks (M2).
7. **Accessibility.** Fails same test as Board (H1). Enter/Space
   to open is wired; arrow-key drag is not.
8. **Speed.** Pass.
9. **Respect.** Mostly yes. The disabled ⋯ button is the one spot
   the page makes the user work (or at least squint) for nothing
   in return.
10. **The belief.** Matches for pointer users.

---

## 6. Ranked findings

### HIGH (1)

- **H1 — Keyboard users can't move ops cards (repeat of Board H1).**
  - `OpsPage.tsx:56-58` — same pointer-only sensor setup as Board.
    `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))`.
  - `DraggableCard` (lines 444-452) *does* wire Enter/Space to
    open the modal and sets `role="button" tabIndex={0}`
    explicitly. Better accessibility posture than Board's
    DraggableCard in that respect — a keyboard user can at least
    open a card. But they still can't drag it across columns.
  - Fix shape is the same as Board: register `KeyboardSensor` with
    `sortableKeyboardCoordinates`. Also adds a "Move to…" action
    inside the card modal so a keyboard user who lands in the
    modal via Enter has a no-drag escape hatch.
  - Ranking this HIGH separately (not "see Board H1") because each
    page wires its own sensors — this is a page-local fix that
    stands on its own.

### MEDIUM (5)

- **M1 — Permanently disabled column ⋯ menu button.**
  - `OpsPage.tsx:287-289`:
    ```tsx
    <div className="column-menu-wrap">
      <button className="column-menu" aria-label="List options" disabled>⋯</button>
    </div>
    ```
  - The button exists but is `disabled` with no aria-description
    explaining why. Users hover, expect a menu, get nothing. This
    is the inverse of the Board page's column ⋯ which pops a WIP
    limit editor — so cross-page consistency is broken too (same
    pixel, different behavior).
  - Fix: either wire it up (Ops doesn't have per-column WIP limits
    today, but could) or remove the button entirely. The column
    header reads cleaner without a dead control. Prefer removal
    unless there's a near-term reason to keep the hook.

- **M2 — Dead layout hooks: `id="opsBoard"`, `view-ops` class,
  `data-view="ops"` attribute.**
  - `OpsPage.tsx:134` sets `className="view view-ops active"
    data-view="ops"`; `OpsPage.tsx:150` sets `id="opsBoard"` on
    the board div.
  - `rg view-ops src/styles` → zero matches. `rg opsBoard src`
    shows only `public/flizow-test.html` (the legacy static
    mockup) consuming it via `document.getElementById('opsBoard')`.
  - All three are leftovers from the pre-React HTML mockup that
    got copied into the React page without consumers. Safe to
    delete.

- **M3 — Urgent-priority cards have no visual priority indicator.**
  - `src/styles/flizow.css:1712-1721`:
    ```css
    .card::before { content: ''; position: absolute; top: 10px; bottom: 10px; left: 0; width: 2px; }
    .card[data-priority="high"]::before   { background: var(--accent); }
    .card[data-priority="medium"]::before { background: #ff9f0a; }
    ```
  - Rules exist for `high` and `medium` only. `urgent` and `low`
    both render transparent stripes. Low-priority being invisible
    is intentional (low = no weight); **urgent being invisible is
    a bug** — `urgent` is the most important priority in
    `types/flizow.ts` and `demoData.ts` seeds real urgent cards
    (`seo-audit`, `vertex-scope`, `acme-launch`).
  - Urgent cards currently read as low-priority cards. Surfaces
    first on the Ops audit because Ops task priorities start at
    `medium` on add and only escalate via the modal, so the gap
    is less obvious — but it's a cross-page bug that also affects
    Board.
  - Fix: add `.card[data-priority="urgent"]::before { background: var(--accent); width: 3px; }`
    (or a new `--urgent` color token) so urgent cards carry more
    visual weight than high. Document the intended scale:
    invisible (low) → amber 2px (medium) → red 2px (high) → red 3px
    or red-magenta (urgent).

- **M4 — AddOpsCardInline is a copy-paste of BoardPage.AddCardInline.**
  - `OpsPage.tsx:315-411` and `BoardPage.tsx:1563-1669` — same
    ~55-line inline-styled composer, two separate sites. Outer
    div, textarea, footer buttons, disabled-state style logic
    all duplicated. The only semantic difference is that
    BoardPage.AddCardInline takes `serviceId`/`clientId`/`seed`
    and Ops has no service/client coupling.
  - Extract `<InlineCardComposer onSubmit={(title) => …} />`. The
    two call sites differ only in what they pass `onSubmit` to
    do (`store.addTask` vs. `flizowStore.addOpsTask`).
  - Delete burden reduces; future focus-ring / validation fixes
    land once.

- **M5 — Header bar occupies ~110px for static explanation copy.**
  - `ops-header-bar` padding `28px 40px 20px` + h1 (`line-height:
    1.15` at 26px ≈ 30px) + eyebrow 11px + sub 13px × ~2 lines ≈
    110px.
  - Sub reads: *"Work the team is doing for the business itself —
    hiring, finance, process, tooling. Client deliverables stay
    inside each client profile."* A crucial explanation on first
    visit; noise on the next 300 visits.
  - Fix options (pick one):
    (a) Trim sub to one line: *"Hiring, finance, process,
        tooling — work the team does for itself."*
    (b) Dismiss-once banner pattern — show full copy on first
        visit, collapse to a single-line "What goes here? ⓘ"
        tooltip trigger afterwards.
    (c) Move the explanation into a `?` icon next to the title.
  - Prefer (a) — keeps a flat header on every visit, no state
    plumbing. Regain ~40px for cards.

### LOW (5)

- **L1 — Blocked stat uses raw hex instead of `--status-fire`.**
  - `flizow.css:10204-10205` — `#c92a1e` (light), `#ff6961` (dark).
  - `--status-fire` token (line 6834) and `--accent` (line 14)
    already carry the app's canonical red/coral. Use
    `color: var(--status-fire);` (or promote the notification
    overdue color to a token and reuse). Small, but this is the
    kind of drift that accumulates.

- **L2 — Header stats look clickable but aren't.**
  - `.ops-header-stat strong` is 22px/700 — the same weight used
    for primary metrics elsewhere in the app that *are*
    interactive. The hover isn't wired and there's no affordance.
  - Two fixes of different shapes: (a) wire clicks so *N in
    progress* filters the board to `inprogress`, *N blocked* to
    `blocked`; (b) drop the weight to match the eyebrow (a
    purely informational stat doesn't need 22px/700). Prefer (a)
    — matches user intent ("how many in progress → show me").

- **L3 — `todayISO()` helper inlined in OpsPage.**
  - `OpsPage.tsx:554-560` re-implements today-date calculation
    inside the page. BoardPage reads `todayISO` from `data.today`
    on the store. Two sources for the same computed value.
  - Fix: read `data.today` from `useFlizow()` and pass down. Lets
    the demo-mode date override (if it exists in the store)
    apply here too.

- **L4 — AddOpsCardInline textarea has `outline: 'none'` with no
  replacement.**
  - `OpsPage.tsx:384`. Tab-focus on the textarea shows no focus
    indicator. Same as Board's L3. Same fix (focus-visible class
    with the 3px highlight ring).

- **L5 — Eyebrow "Internal work" is 11px.**
  - `flizow.css:10169`. WCAG AA doesn't strictly fail at 11px
    (uppercase labels are excluded from small-text rules in
    practice), but 12px is the house default. Bump to 12 and
    tighten letter-spacing if the wider characters feel loose.

---

## 7. Verify (positives worth preserving)

- **V1 — DraggableCard wires Enter/Space + role + tabIndex
  explicitly.** `OpsPage.tsx:444-452` — unlike BoardPage's
  DraggableCard which leans on dnd-kit's default `attributes`
  bag, Ops explicitly adds `onKeyDown` for Enter/Space and
  marks `role="button" tabIndex={0}`. Keyboard users can open
  cards. Backport this pattern into BoardPage's DraggableCard
  when H1 lands, so the two pages match.

- **V2 — Always-render the Blocked column.** `OpsPage.tsx:32-35`
  comment: *"We used to hide Blocked when empty, but the missing
  column read as a bug … more often than it read as calm.
  Predictable layout wins over empty-state trimming on a board
  this small."* Deliberate divergence from Board's `emptyHide`
  with reasoning attached in code. Keep.

- **V3 — Blocked stat hidden when count is zero.**
  `OpsPage.tsx:202` — `{stats.blocked > 0 && …}` avoids the dead
  "0 blocked" state and prevents the red-tinted number from
  appearing on happy boards. Small UX win that keeps the header
  calm most of the time.

---

## 8. Ship

**Nothing changes yet.** Queue, pending approval:

1. M3 — add `.card[data-priority="urgent"]::before` rule.
   Smallest patch, affects both Board and Ops.
2. M2 — delete dead layout hooks (`id="opsBoard"`, `view-ops`,
   `data-view="ops"`). One-line changes × 3.
3. M1 — remove the disabled column ⋯ button.
4. H1 — register `KeyboardSensor`. Could be a shared helper that
   both BoardPage and OpsPage consume.
5. M4 — extract `<InlineCardComposer>`. Requires touching both
   pages in the same commit so the shape stays aligned.
6. M5 — trim the header sub to one line (option a).
7. LOW — bundle.

Waiting on approval before touching code.

---

*Audit date: 2026-04-24. Auditor: Claude (session). Method: read
`OpsPage.tsx` end-to-end + ops-specific CSS, cross-reference shared
kanban primitives with the Board audit, apply the 8-step rubric.*
