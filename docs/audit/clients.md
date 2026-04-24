# Clients Page — Design Audit

**Audited:** 2026-04-24
**Rubric:** `~/Documents/Claude/skills/apple-design-principles.md` (8-step)
**Mode:** Findings only. No fixes applied. Awaiting approval before any change.

---

## Surface in scope

- `src/pages/ClientsPage.tsx` — the list pane component
- Shared styles: `.clients-page`, `.list-pane-*`, `.saved-views`, `.view-chip`, `.client-row`, `.list-empty-state`, and the split-wrapper overrides at `.clients-split-wrapper .client-row`

**Not in scope this pass** (audit separately):
- `AddClientModal` (a sub-surface invoked from this page)
- Client detail pane and split-view mechanics
- `src/utils/clientDerived.ts`

---

## Step 1 — Belief check

**Core belief:** *"The user came to move work forward. Show them what's on their plate, let them change it quickly, and stay out of the way."*

What the user came to Clients for:
- Find a specific client (search)
- Scan to see who needs attention (on fire, at risk)
- Narrow to their own assignments ("Assigned to me")
- Pick one and open their detail page

The page serves these jobs. Search, chips, and the status-dot + metric combo all push work-forward signals into the scan. Row click → detail is direct. **Belief: passing.**

One concern worth naming: the list has **no visible sort order explanation**. "Show them what's on their plate" implies urgent clients near the top. The component currently renders in array order (no sort applied), which depends entirely on whatever order `data.clients` happens to carry. Needs verification in the live app — if urgent clients already land at top, fine; if not, this is a bigger issue.

---

## Step 2 — 10 HIG principles walk

| # | Principle | Result | Notes |
|---|-----------|--------|-------|
| 1 | Clarity beats cleverness | **Pass with friction** | "All Clients" section header is redundant chrome under a page titled "Clients" with an "All" chip already active. See M1. |
| 2 | Interface defers to content | **Pass with friction** | Same as above — chrome competing with scan. |
| 3 | Depth communicates hierarchy | Pass | Add Client modal slides over backdrop; list is flat, which is correct for a flat list. |
| 4 | Direct manipulation | **Fail** | Disabled "+" button in saved-views is a dead-end affordance. See M2. |
| 5 | Immediate feedback | Pass | Search is live, chips toggle instantly, hover states on rows. |
| 6 | Forgiveness | Pass | No destructive actions on this page. Add Client modal has Escape + Cancel. |
| 7 | Consistency | Pass with question | Blue-tier usage matches house pattern. Column header labeled "Status" duplicates the status dot. See M3. |
| 8 | Metaphor and affordance | Pass | Rows look clickable (hover tint, chevron on hover), "+" icon means add. |
| 9 | User control | Pass | All chip filters reversible via "All" + clear search. |
| 10 | Aesthetic integrity | Pass | Professional, calm, consistent with CRM tone. |

---

## Step 3 — Blue-tier audit

| Element | Tier | Expected | Actual | Verdict |
|---------|------|----------|--------|---------|
| Toolbar "Add client" button | 1 (solid CTA) | 1 | 1 | ✓ |
| Saved-view chip, active | 3 (blue tint, active state) | 3 | 3 | ✓ |
| Saved-view chip, "+" new | — | remove or ghost | disabled button | ✗ See M2 |
| Empty-state "Load demo data" | 1 (solid CTA, inline style) | 1 | 1 | ✓ |
| Empty-state "Add client" | 2 or 3 (ghost / tinted) | 2 | default `.list-empty-clear` (neutral) | ✓ |
| Selected row indicator | 3 (tint) | 3 | 3 | ✓ |
| Row focus ring | 2 (ring) | 2 | 2 | ✓ |

**Two solid-blue buttons coexist only in the empty state** (Load demo + Add client's primary styling is differentiated — Load demo is tier 1, Add client is neutral/tier 3). On inspection, this is intentional and defensible. See M4 for a related Fitts's Law concern.

No other tier collisions.

---

## Step 4 — Grids and spacing

**On-grid.**
- `.clients-page` padding: `var(--sp-36) var(--sp-4xl) 96px` — token-based, trust the token.
- Modal grid columns, gaps: `gap: 12`, `gap: 8` ✓
- Logo swatches: 36×36, radius 8 ✓

**Off-grid.**
- Empty-state button container inline style: `gap: 10, marginTop: 14`. Both off the 4/8 grid. Should be `gap: 12, marginTop: 16`. See M5.

**Line length.**
- Empty-state subtitle "Load a demo workspace to explore Flizow, or add your first client." ~60 characters — within 50–75. ✓

**Typography.**
- Page title, count, chip labels — all use token sizes (no inline `font-size`). Safe.

---

## Step 5 — 10-question checklist

| # | Question | Answer |
|---|----------|--------|
| 1 | Purpose — clear in 5 seconds? | **Yes.** Title + count + list is self-explanatory. |
| 2 | Hierarchy — important thing most prominent? | **Mostly.** "All Clients" section header adds middle weight in an odd place. See M1. |
| 3 | Clarity — every button/link has one meaning? | **Mostly.** Disabled "+" button is ambiguous. See M2. |
| 4 | Feedback within 100ms? | Yes. |
| 5 | Forgiveness — can user undo? | N/A — no destructive actions on this page. |
| 6 | Consistency — matches app patterns? | Yes. |
| 7 | Accessibility — keyboard / reader / reduced motion? | Mostly. See L2. |
| 8 | Speed — under 1.5s first paint? | Expected yes; lightweight component, no heavy renders. |
| 9 | Respect — works for user or makes user work? | Mostly works for the user. Minor papercuts (see M1, M2). |
| 10 | Matches core belief? | Yes. |

---

## Step 6 — Ranked findings

### HIGH — ship-blocking

**None.** The page works. No broken core actions, no data-loss risk, no belief violations.

### MED — friction, fix soon

**M1. "All Clients" section header is redundant chrome.**
Between the toolbar and the saved-views chips there's a large section header reading "All Clients." The page title above is already "Clients," and the currently-active saved-view chip is already "All." The header duplicates both signals and adds vertical space between the toolbar and the filter chips the user actually uses.

- File: `src/pages/ClientsPage.tsx:121`
- CSS: `.clients-section-header` at `flizow.css:10676`
- Fix options: (a) delete it, (b) repurpose for section-level grouping only if/when multiple sections exist (e.g., Pinned + All Clients). Default recommendation: delete.

**M2. Disabled "+" button on saved-views is a dead-end affordance.**
The new-saved-view button is always rendered but disabled with a tooltip promising a future feature. It looks clickable, announces as a button to screen readers, and does nothing. This is user-hostile: the affordance promises action but delivers none.

- File: `src/pages/ClientsPage.tsx:143-151`
- CSS: `.view-chip.new-view`, `.view-chip.new-view:disabled` at `flizow.css:10484-10497`
- Fix options: (a) remove the button until the feature ships, (b) render as a non-interactive hint ("Custom views coming with Templates — a subtle text note, not a button shape), (c) render as a dashed placeholder card that visually reads as "not yet" instead of "disabled."
- Default recommendation: (a) remove. Rebuild the element when the Templates pass ships. Disabled buttons that never work are worse than no button.

**M3. Column header "Status" duplicates the status dot meaning.**
In the full-width (non-split) layout, the list header shows columns: *Client / Services / Account Manager / Status / Updated*. The "Status" column contains the urgency metric (e.g., "3 overdue", "At risk", "85% setup"), while the status dot on the far-left also communicates status visually. Two columns for the same concept, under the same label.

- File: `src/pages/ClientsPage.tsx:219`
- Fix: rename the column header. The metric is really an **urgency signal** or **progress signal**, not a status. Candidates: "Attention" / "Signal" / "Progress" / simply "Next".
- Note: in split-view (the primary layout — see open verification Q2 below), this column is hidden entirely, so this finding only bites in the standalone layout.

**M4. Empty-state button order may be backwards for right-handed Fitts.**
When the workspace is empty, two buttons render: `Load demo data` (solid blue, tier 1) then `Add client` (neutral, tier 2). On a left-to-right layout, the rightmost button is where the cursor naturally lands and reads as "primary" kinetically. Right now, the visually-primary button is on the left.

- File: `src/pages/ClientsPage.tsx:171-194`
- Fix options: (a) swap order so "Load demo data" is on the right, (b) reverse tier intent — make "Add client" the solid primary and "Load demo data" the ghost secondary, (c) leave as-is and accept the mild mismatch.
- Decision the user needs to make: *for a first-time user, what's the right primary action — poke around with demo data, or commit to adding a real client?*
- Default recommendation: (a) swap order, keep "Load demo data" as the visually primary because it's the lower-friction path for a first-time user.

**M5. Empty-state button container uses off-grid spacing.**
The inline style `{ display: 'flex', gap: 10, marginTop: 14, ... }` uses `gap: 10` and `marginTop: 14` — both off the 4/8 grid. Should be `gap: 12, marginTop: 16` (or `gap: 8, marginTop: 12` if tighter).

- File: `src/pages/ClientsPage.tsx:171`
- Fix: change the two numbers. Consider lifting this to a CSS class (`.list-empty-actions`) rather than inline style, since the empty state is likely to be reused.

### LOW — polish

**L1. `.metric-label` CSS appears unused.**
`.client-metric .metric-label` is styled at `flizow.css:7110` but the React component never renders a `<span className="metric-label">`. Possibly dead CSS left over from an earlier rev.

- Fix: confirm with a repo-wide grep; delete if unused.

**L2. Disabled "+" button announces its roadmap in its aria-label.**
`aria-label="Custom views arrive with the Templates pass"` — screen reader users hear the full roadmap message when they tab onto the disabled button. Functional but wordy. Shorter options: `aria-label="Custom views (coming soon)"`, or pair with `aria-disabled="true"` and a lighter label.

- Tied to M2 — if we remove the button, this becomes moot.

**L3. Inline style on "Load demo data" button would be cleaner as a CSS class.**
The primary demo-button styling (`background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)'`) is applied inline. Works, but a `.list-empty-cta-primary` class alongside the existing `.list-empty-clear` would match the file's existing style convention.

- File: `src/pages/ClientsPage.tsx:177-183`

**L4. Two "Add client" CTAs coexist in the empty state.**
The toolbar button is always rendered (line 107–118); the empty-state button also renders when there are no matches (line 187–193). Mild redundancy, generally fine — but worth a conscious review. If kept, consider making the empty-state one clearly secondary so the toolbar button carries the primary weight (already the case, so this is just a confirmation).

**L5. Status tooltip strings live inside the page component.**
`statusTooltip()` at `ClientsPage.tsx:336-345` maps each `ClientStatus` to a descriptive tooltip. Could live with the type definition or in `clientDerived.ts` so other surfaces (client detail, dashboard pills) can reuse the same strings without drift. Low priority.

---

## Open verifications

Things I can't settle from code alone. Would speed up subsequent audits if you want me to open the live app and confirm these in the next turn:

**V1. Default sort order.** What order do rows appear in right now? Does the list render fire → risk → track → onboard → paused (urgency-first), or in some other order (alphabetical, most-recently-updated)? If it's not urgency-first, that's probably a HIGH, not a MED.

**V2. Which layout do users see by default?** The CSS has two variants — standalone full-width (7 columns) and split-wrapper compact (4 fields). Which one renders when a user lands on `#clients` without a detail selected? If users always see the split-wrapper version, the standalone design is effectively dead code and M3 is a moot point. If users see the standalone version sometimes, M3 stays MED.

**V3. Chip overflow behavior.** CSS references `.saved-views-wrap.has-overflow::after` — is there a JS hook setting `has-overflow`? Does horizontal-scroll work on narrow screens? Needs a real-device check.

---

## Step 7 — Verify
N/A — no fixes applied in this pass.

## Step 8 — Ship
N/A — this pass is findings-only. Ship gate re-runs after fixes land.

---

## Filter question

**Does the Clients page respect the person using it?**

Mostly yes. The page does its job — it lets you find, scan, filter, and open clients without ceremony. The friction points above are all survivable papercuts, not belief violations. A thoughtful hour on M1–M5 would lift the page from "works" to "feels finished."

---

## Suggested next action

Pick which MEDs to fix, say "fix M1, M2, M4" (or "fix all MEDs") and I'll do the edits in a follow-up turn. LOWs and V's can be batched or deferred.
