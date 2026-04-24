# AddContactModal — Design Audit

**File:** `src/pages/ClientDetailPage.tsx:2395-2590` (dual-mode: add + edit, 196 lines)
**Call sites:** Two inside `ClientDetailPage.tsx` — `L1648` (add mode from the "+ Add contact" button) and `L1659` (edit mode from clicking a contact row)
**Shell:** reuses `wip-modal-*` with `AddServiceModal`, `EditServiceModal`, `AddQuickLinkModal`, `TouchpointModal`, `InsertLinkDialog`
**Audit date:** 2026-04-24
**Method:** 8-step Apple-design rubric (belief → 10 HIG → blue tiers → grids → checklist → rank → verify → ship)

---

## 1. Core belief restated

> **"The user came here to record a client contact so the app can reach them later. Get out of their way and don't let them overwrite important relationships by accident."**

This modal captures people the agency works with — the human end of the client directory. The primary-contact flag has real consequences (Weekly WIP pings go to whoever is primary), so the forgiveness bar here is higher than on a metadata-only modal like EditServiceModal.

---

## 2. 10 HIG principles — applied

| # | Principle | Status | Evidence |
|---|-----------|:---:|---|
| 1 | Clarity beats cleverness | ✓ | Fields are labeled in plain words: Name, Role, Email, Phone, "Set as primary contact." Placeholders are real-shape examples ("Jamie Chen", "jamie@acme.com"). |
| 2 | Interface defers to content | ✓ | Modal shell is quiet. Focus stays on the form. |
| 3 | Direct manipulation | ✓ | All fields are inline-editable. Checkbox toggles directly. |
| 4 | Every action gets feedback | ⚠︎ | Name-empty validation flashes a red border (silent for screen readers). Save is silent on success. No toast confirming the new contact or (crucially) the primary-demotion. |
| 5 | Forgiveness is non-negotiable | ✗ | **HIGH.** Checking "Set as primary contact" while another contact is primary silently demotes them on save. The gray hint text is the only warning — no confirmation dialog, no post-save toast. |
| 6 | Consistency is the contract | ⚠︎ | Shell is consistent. **But** the same autofocus/validation/keyboard-handler boilerplate is copy-pasted across 6+ modals in the same codebase. |
| 7 | Hierarchy through typography | ✓ | Title + field labels + hint text all use `wip-field-*` / `wip-modal-*` type scale. Primary-contact hint is properly muted. |
| 8 | Motion explains | ✓ | Standard modal slide-in via `wip-modal-overlay`. Reduced-motion override in flizow.css. |
| 9 | Accessibility is a layer | ⚠︎ | `role="dialog"` + `aria-modal` + `aria-labelledby` all present. Checkbox is native. **But** name error has no `aria-live`/`role="alert"`, no focus trap on overlay, and the three-span composition inside the checkbox label can read awkwardly in a screen reader ("Set as primary contact — gets CC'd on Weekly WIP pings" is one run-on string). |
| 10 | Speed is a design decision | ✓ | Local store write. Modal closes instantly on save. |

---

## 3. Blue-tier hierarchy

- **Tier 1 (solid blue CTA):** "Add contact" / "Save changes" in footer (L2583-2585). Correct.
- **Tier 2 (ring secondary):** None in this modal.
- **Tier 3 (tint active):** None in this modal.
- **Tier 4 (text-only inline):** `Cancel` button uses `.wip-btn-ghost` (muted neutral, not blue). Correct.

**Verdict:** Blue tiers used correctly. No violations.

---

## 4. Grids and layout

- Modal `max-width: 480px` (L2491) — tighter than EditServiceModal's 520px. Works because contact has fewer fields.
- Email + Phone live in a 2-column grid (L2530-2551) — efficient use of the narrow modal.
- Primary-contact checkbox is a full-width row below the grid. Label wraps checkbox + 2 spans (label text + hint text) horizontally.
- The 3-span checkbox row at L2553-2576 pushes past the 480px modal width when the longest hint ("— this will replace the current primary") is active. On a narrow display, the hint wraps under the checkbox, breaking the single-row intent.

**Finding:** M5 (MED) — checkbox row breaks at narrow widths; three inline spans on a single line is fragile layout.

---

## 5. Review checklist (10 questions)

1. **Purpose.** Title + labels make the intent obvious in 5 seconds. ✓
2. **Hierarchy.** Name is first, email/phone grid, primary flag last (least used). ✓
3. **Clarity.** All fields obvious. Primary hint explains consequence in plain language. ✓
4. **Feedback.** Silent on save; red border on name-empty is invisible to screen readers. ⚠︎
5. **Forgiveness.** No confirmation when demoting an existing primary. Silent cascade. ✗
6. **Consistency.** Shell + keyboard patterns are shared, but the boilerplate is duplicated across 6+ modals in the codebase. ⚠︎
7. **Accessibility.** Focus trap missing. Name error announces nothing. Label-span composition reads as one run-on string. ⚠︎
8. **Speed.** Fast — pure local state. ✓
9. **Respect.** Mostly yes. But silently demoting a primary disrespects the user who didn't read the gray text. ⚠︎
10. **The belief.** Mostly yes — the modal is small, honest, and quick. The primary-demotion is the one place the belief breaks.

---

## 6. Ranked findings

### HIGH (1)

**H1 — Silent primary-contact demotion**

When `primary === true` on save AND the client already has a different primary contact, the store silently demotes the old primary (confirmed at `src/store/flizowStore.ts:1344-1358` and `:1361-1369`). The UI's only warning is gray hint text at L2566-2575:

```tsx
{isEdit && contact?.primary
  ? '— this is the primary contact'
  : hasPrimary
    ? '— this will replace the current primary'
    : '— gets CC\u2019d on Weekly WIP pings'}
```

This is a forgiveness-principle failure with real-world consequences: Weekly WIP pings get routed by primary-contact flag. A distracted user who toggles the checkbox without reading the gray hint silently changes who gets the agency's weekly client pings. The old primary has no idea they stopped receiving them. The new primary has no idea they started.

**Locations:**
- `src/pages/ClientDetailPage.tsx:2553-2576` (checkbox + inline hint)
- `src/pages/ClientDetailPage.tsx:2430-2460` (handleSave — no branch for "primary was just flipped")
- `src/store/flizowStore.ts:1344-1358`, `:1361-1369` (silent cascade)

**Fix options (ranked):**
1. **Confirmation dialog** when `primary === true && hasPrimary === true && (!isEdit || !contact.primary)`. Body copy: *"{oldPrimary.name} is currently the primary contact. Saving will make {name} primary instead. Are you sure?"* Uses existing `ConfirmDangerDialog` shell.
2. **Pale-amber callout** replacing the gray hint when the replacement condition is true. More visible than gray text but still single-click-to-save.
3. **Post-save toast** confirming the demotion so the user sees what happened ("Jamie is now primary; Alex is no longer primary"). Doesn't prevent accidents but makes them recoverable.

Option 1 is the cleanest match for the HIG forgiveness principle. Option 3 is the cheapest stopgap.

---

### MED (5)

**M1 — 6+ modals duplicate the same autofocus/validation/keyboard boilerplate**

Building on the EditServiceModal audit's H1: the duplication is actually broader than AddServiceModal ↔ EditServiceModal. Six modals in this codebase share near-identical boilerplate for:
- `setTimeout(..., 80)` autofocus effect (often with select-on-edit)
- `nameError` / `labelError` flash-for-1400ms pattern
- Escape + Cmd/Ctrl+Enter keyboard handler
- Backdrop click → close
- `wip-modal-overlay` → `wip-modal` → `wip-modal-head` → `wip-modal-body` → `wip-modal-foot` shell

**Affected files:**
- `src/pages/ClientDetailPage.tsx:2201-2391` (AddServiceModal)
- `src/pages/ClientDetailPage.tsx:2395-2590` (AddContactModal — this modal)
- `src/pages/ClientDetailPage.tsx:2603+` (AddQuickLinkModal)
- `src/components/EditServiceModal.tsx:34-277` (EditServiceModal)
- `src/components/TouchpointModal.tsx` (header comment explicitly acknowledges: *"same pattern as AddContactModal / AddQuickLinkModal"*)
- `src/components/InsertLinkDialog.tsx`

**Fix sketch:** Extract `<ModalShell>` + `useModalKeyboard()` + `useAutofocus(ref, { select: boolean })` + an `<ErrorFlashInput>` component. Collapses ~600 lines across the 6 modals to ~400. Guarantees keyboard / focus behavior can't drift.

---

**M2 — Email and phone have no real validation**

`<input type="email">` (L2533) only enforces "contains @" at form-submit time, but the modal saves via onClick not form submit — so browser validation is bypassed entirely. "j@a" or "asdf@" saves happily.

`<input type="tel">` (L2544) does nothing for format. "abc" saves.

For a client-contact DB that drives Weekly WIP pings, invalid emails are a real problem — the send queue will silently fail and the user won't know why the client never got their update.

**Locations:** `src/pages/ClientDetailPage.tsx:2533-2539, 2541-2549`

**Fix:** Add a simple regex check on save (at minimum: `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` for email). Phone is harder to validate internationally — at minimum, strip obvious garbage and warn on < 7 digits.

---

**M3 — No focus trap on modal overlay**

Same issue as every other modal in the family. Tab past the last focusable element (Save button) lands on whatever is behind the overlay in the DOM.

**Fix:** Shared `useModalFocusTrap` hook (see M1).

---

**M4 — Name error has no `aria-live`/`role="alert"` announcement**

`aria-invalid={nameError}` is set (L2515), but there's no `aria-describedby` pointing at a visible error message, and no `role="alert"` region. Screen-reader users get silence when the save button "does nothing" because of the empty-name flash.

**Location:** `src/pages/ClientDetailPage.tsx:2507-2516`

**Fix:** Add a `<span role="alert" id="contact-name-error">Name is required</span>` when `nameError === true`, and reference it via `aria-describedby="contact-name-error"` on the input.

---

**M5 — Checkbox row layout is fragile at narrow widths**

L2553-2576 stacks three elements horizontally inside a single `<label>` via inline flexbox: checkbox + "Set as primary contact" + hint text ("— this will replace the current primary"). On the 480px modal this fits on one line for the default hint but can wrap awkwardly for the longer variants. The hint text is also combined with the main label into what a screen reader reads as one run-on accessible name.

**Location:** `src/pages/ClientDetailPage.tsx:2553-2576`

**Fix:** Put the hint below the checkbox on its own line (standard form pattern), and associate it via `aria-describedby` so the screen reader gets the label first, the hint second.

---

### LOW (5)

**L1 — `setTimeout(..., 80)` magic number for autofocus (same as EditServiceModal)**

Autofocus waits for the modal transform-in animation. Arbitrary 80ms tied to CSS timing. Same fix as EditServiceModal audit's L1.

**Location:** `src/pages/ClientDetailPage.tsx:2420-2426`

---

**L2 — `.trim() || undefined` silently swallows whitespace-only fields**

If a user types "   " in the role field and saves, the trim collapses it to empty, `|| undefined` sets it to `undefined`, and the store records no role. No visual feedback. Fine for data hygiene, but surprising to the user who thought they typed something.

**Locations:** `src/pages/ClientDetailPage.tsx:2441-2444, 2452-2455`

**Fix:** On blur, if trim produces empty, clear the field visually so the user sees the field is effectively empty.

---

**L3 — Contact ID format is collision-prone at scale**

`ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` at L2447. The 4-character random tail gives ~1.7M possible values — low enough to collide once you import a few hundred contacts at once from a client migration. Not urgent for a solo tool; would bite on any kind of bulk import flow.

**Fix:** Use `crypto.randomUUID()` everywhere the app mints IDs, and drop the custom format.

---

**L4 — No character limits on name, role, email, phone**

A 500-character name won't be blocked here but will overflow the contact-row rendering elsewhere on the Clients page. `maxLength` attributes are free to add.

**Fix:** `maxLength={120}` on name, `{80}` on role, `{200}` on email, `{40}` on phone.

---

**L5 — "Set as primary" checkbox has no keyboard shortcut hint**

A power user saving 10 contacts in a row has to Tab through Name → Role → Email → Phone → checkbox before they can Cmd+Enter. The checkbox itself is toggleable via Space but the user might not know they don't have to click it. A small "(Space to toggle)" hint in the label area would help. Low priority.

---

### Verify (3 things that work well)

**V1 — Dual-mode component with clear inline reasoning**

The header comment at L2398-2401 explains why one component handles both add and edit:

> *"When provided, the modal switches to edit mode: pre-fills every field, flips the title + save button copy, and calls updateContact instead of addContact. Keeping one component for both flows means field layout + validation never drift between the two."*

This is the correct DRY move: one surface for two flows so the field order, validation, and keyboard behavior can't drift. AddQuickLinkModal uses the same pattern — visible in the `link?: QuickLink` prop at L2608.

---

**V2 — Primary-contact hint copy is conditional across 3 states**

Lines 2566-2575 handle three distinct cases:
- `isEdit && contact?.primary` → *"— this is the primary contact"* (no threat; nothing is being replaced)
- `hasPrimary` → *"— this will replace the current primary"* (the dangerous case; see H1)
- default → *"— gets CC'd on Weekly WIP pings"* (explains what primary even means for first-timers)

The copy is honest about what will happen, which is correct. The HIGH is not about the copy being wrong; it's about the copy being in the wrong visual tier.

---

**V3 — Save handler's `.trim() || undefined` keeps the store clean**

L2441-2444 treats empty-ish optional fields as absent rather than saving empty strings. Consumer code downstream (contact cards, row renderers) can check `if (contact.email)` instead of `if (contact.email && contact.email.length)`. Small but propagates correctness.

---

## 7. Scope notes (deferred — not in this audit)

- Contact avatar / profile photo — not present; contact rows render initials-from-name.
- Preferred-contact-method flag (email vs SMS vs Slack) — not modeled yet.
- Time-zone field — not present; would matter for scheduled Weekly WIP ping delivery times.
- Bulk contact import (CSV) — not present; the collision-prone ID format (L3) would bite here first.

---

## 8. Filter question

> **"Does this respect the person using the app?"**

Mostly yes — but the silent primary-demotion disrespects the user who flipped the checkbox without reading the gray text, and it disrespects the old primary who quietly stopped receiving WIP pings. That's the fix to prioritize.

---

## Summary

- **1 HIGH:** Primary-contact demotion happens silently on save; gray hint is the only warning. Fix: add confirmation dialog when replacing an existing primary (use `ConfirmDangerDialog`).
- **5 MED:** 6+ modals duplicate the same boilerplate; email/phone have no real validation; no focus trap; name error silent to screen readers; checkbox row layout fragile at narrow widths.
- **5 LOW:** Magic-number autofocus delay; `.trim() || undefined` swallows whitespace-only; collision-prone ID format; no character limits; no Space-to-toggle hint.
- **3 V's:** Dual-mode component with clear reasoning, conditional 3-state primary hint copy, clean `.trim() || undefined` optional-field handling.

Findings only — no fixes applied. Awaiting "go" to patch H1 (primary-demotion confirmation).
