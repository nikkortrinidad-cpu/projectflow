# EditServiceModal — Design Audit

**File:** `src/components/EditServiceModal.tsx` (277 lines)
**Call sites:** `src/pages/BoardPage.tsx:1069` (opened from the service "⋯" menu on the board breadcrumb)
**Paired with:** `AddServiceModal` inside `src/pages/ClientDetailPage.tsx:2201-2391` (~190 lines of nearly identical JSX)
**Audit date:** 2026-04-24
**Method:** 8-step Apple-design rubric (belief → 10 HIG → blue tiers → grids → checklist → rank → verify → ship)

---

## 1. Core belief restated

> **"The user came here to edit a service's metadata and get back to the board. Get out of their way and help them finish."**

This modal is a small, tight surface — name, type, template, progress, next-deliverable-date. It's opened from one place (the service crumb menu on the board) and its job is to save a handful of fields fast. The bar for friction is low: if the user wastes more than 10 seconds here they'll wonder why they bothered.

---

## 2. 10 HIG principles — applied

| # | Principle | Status | Evidence |
|---|-----------|:---:|---|
| 1 | Clarity beats cleverness | ✓ | Fields are labeled with plain words. Type radios include a one-line description under each option ("Ongoing monthly scope" / "Fixed deliverable, ships once"). Date label flips between "Due date" and "Next deliverable" based on type (L255). |
| 2 | Interface defers to content | ✓ | Modal shell is quiet. Focus stays on the form fields. No gratuitous chrome. |
| 3 | Direct manipulation | ✓ | Name edits in place. Type/template are one-click toggles. Progress has a slider + number you can type directly. Date is a native `<input type="date">`. |
| 4 | Every action gets feedback | ⚠︎ | Save applies + closes — no toast confirming the update. Name validation flashes a red border for 1400ms (L79), which is fine for seeing users but silent for screen readers. Progress number input silently accepts "200" until clamped at save. |
| 5 | Forgiveness is non-negotiable | ⚠︎ | Cancel discards — good. But there's no undo on save; a typo in the name is a hard overwrite. Template changes don't re-seed but the warning copy (L209-212) is subtle gray hint-text rather than a visually-distinct callout. |
| 6 | Consistency is the contract | ✗ | **HIGH.** `AddServiceModal` and `EditServiceModal` share ~80% of their JSX, effects, and keyboard handlers but are duplicated across two files. Drift risk is concrete — a fix to one will silently skip the other. |
| 7 | Hierarchy through typography | ✓ | Modal title, field labels, hint text, and body copy use the consistent `wip-field-*` type scale. Progress bar's "drives the bar on the service card" helper is appropriately muted. |
| 8 | Motion explains | ✓ | Modal slides in via the `wip-modal-overlay`/`wip-modal` transform pattern. Reduced-motion rules kill the transition (L12025-12027 in flizow.css). |
| 9 | Accessibility is a layer | ⚠︎ | Modal has `role="dialog"` + `aria-modal` + `aria-labelledby`. Radios use `role="radio"` + `aria-checked`. **But** both radio buttons are Tab stops (breaks the "only the selected radio is a tab stop" ARIA radiogroup contract), and the progress slider + number input share a duplicated `aria-label="Progress percentage"` which screen readers announce twice. |
| 10 | Speed is a design decision | ✓ | No network. Local store update. Autofocus + select on name (L68-69) so Cmd+A isn't needed to retype. |

---

## 3. Blue-tier hierarchy

- **Tier 1 (solid blue CTA):** `Save changes` button in footer (L270-272, `.wip-btn-primary`). Correct — one primary action per modal.
- **Tier 2 (ring secondary):** Type radios when selected use `2px solid var(--highlight)` (L175). Correct tier usage — this is a secondary-action ring, not a primary solid.
- **Tier 3 (tint active):** Type radio when selected uses `var(--highlight-soft)` background (L177). Correct tint for active state.
- **Tier 4 (text-only inline):** None visible in this modal; `Cancel` button uses `.wip-btn-ghost` which is muted-neutral, not blue.

**Verdict:** Blue tiers are used with restraint. No violations.

---

## 4. Grids and layout

- Modal `max-width: 520px` (L132) — within the 45-70cpl range for body copy.
- Fields stack vertically with consistent `gap: var(--sp-micro)` via `.wip-field`.
- Type radios use `display: flex; gap: 8` to split available width 50/50 (L160).
- Progress row uses `display: flex; gap: 12` with the slider on `flex: 1` and the number box at fixed width 60px (L222-249). Works on 520px modals, would need a rethink if the modal ever resized narrow.

**Finding:** L3 (LOW) — the progress number input at 60px width can't fit "100%" comfortably; the `%` sits outside the input.

---

## 5. Review checklist (10 questions)

1. **Purpose.** A user opening the modal sees the title "Edit service" and five labeled fields. ✓
2. **Hierarchy.** Name is first (most important), progress and template hints below. ✓
3. **Clarity.** Everything is labeled with plain words. ✓
4. **Feedback.** Name-validation shows a red border (silent for screen readers). Save is silent on success. ⚠︎
5. **Forgiveness.** Cancel discards cleanly. Escape closes. No undo on save. ⚠︎
6. **Consistency.** Shell reuses `wip-modal-*` classes. **But** duplicates AddServiceModal's code wholesale. ✗
7. **Accessibility.** Good: `role="dialog"`, `aria-modal`, autofocus, Esc. Weak: radio tab-stop pattern, duplicate aria-labels, no focus trap. ⚠︎
8. **Speed.** Local mutation, ~instant. ✓
9. **Respect.** Mostly yes. Template-change warning is honest. But a screen-reader user hitting the name-validation flash gets no announcement. ⚠︎
10. **The belief.** Yes — the modal gets the user in and out fast.

---

## 6. Ranked findings

### HIGH (1)

**H1 — `AddServiceModal` and `EditServiceModal` duplicate ~180 lines of near-identical code**

The two modals share the exact same:
- Autofocus effect + `nameError` timeout pattern
- Type radio buttons (identical 30-line inline-styled blocks)
- Template select + `visibleTemplates` useMemo + fit-snap useEffect
- Date field
- Escape + Cmd/Ctrl+Enter keyboard handler
- Backdrop click handler
- Modal shell (`wip-modal-overlay` → `wip-modal` → `wip-modal-head` → body → `wip-modal-foot`)

Only meaningful differences:
- `EditServiceModal` adds a Progress slider (L215-251)
- `EditServiceModal` shows a templateChanged warning hint instead of the initial seeding hint
- `AddServiceModal` navigates to the new board after save; `EditServiceModal` just closes
- Title + CTA copy differ ("Add service"/"Create service" vs "Edit service"/"Save changes")

**Locations:**
- `src/components/EditServiceModal.tsx:34-277` (the whole file)
- `src/pages/ClientDetailPage.tsx:2201-2391` (AddServiceModal)

**Drift risk (concrete):**
- EditServiceModal autofocuses AND selects the name (L69). AddServiceModal only focuses (L2227). That's already drift — whichever modal was edited most recently has the better polish.
- EditServiceModal's keyboard effect depends on `progress` in its deps (L113). AddServiceModal's doesn't include progress (it has no progress field). If someone adds a field to both, the dep array has to be updated in both files — easy to forget.

**Fix sketch:** Extract a `ServiceMetadataForm` component taking `initialValues`, `showProgress`, `ctaLabel`, `onSubmit`. Both modals render:
```tsx
<ServiceMetadataForm
  initial={{ name, type, templateKey, ... }}
  showProgress={mode === 'edit'}
  ctaLabel={mode === 'edit' ? 'Save changes' : 'Create service'}
  onSubmit={(values) => mode === 'edit' ? update(values) : create(values)}
/>
```

Cuts ~160 lines. Guarantees the two stay consistent.

---

### MED (5)

**M1 — Duplicate `aria-label="Progress percentage"` on range + number input**

Both the slider and the number input have identical `aria-label="Progress percentage"` (L230, L246). Screen readers announce both controls as "Progress percentage" — the user hears the label twice in a row while Tabbing through, with no way to distinguish the slider from the number input.

**Location:** `src/components/EditServiceModal.tsx:230, 246`

**Fix:** Give the range `aria-label="Progress percentage (slider)"` and the number `aria-label="Progress percentage (exact value)"`. Or wrap both in a `<fieldset>` with a single `<legend>Progress</legend>` and drop the duplicate aria-labels.

---

**M2 — Radio group: both buttons are tab stops; no arrow-key navigation**

The `role="radiogroup"` at L158 contains two `<button role="radio">` elements. Native HTML radios put only the selected radio in the tab order — arrow keys move between options. This custom implementation makes both buttons tab stops and provides no arrow-key handler.

**Locations:** `src/components/EditServiceModal.tsx:158-195` + mirrored at `src/pages/ClientDetailPage.tsx:2312-2349`

**Fix:** either revert to native `<input type="radio">` with a styled label (simplest), or add `tabIndex={checked ? 0 : -1}` + an `onKeyDown` that handles ArrowLeft/ArrowRight/ArrowUp/ArrowDown to move selection.

---

**M3 — Template-change warning is subtle gray hint-text, not a visually distinct callout**

At L209-212 the inline note flips between two messages:
- Default: `"Drives the POOL label on cards and the onboarding checklist."`
- When template changes: `"Changing the template relabels this service. Existing cards and onboarding items stay put."`

Both render in the same `var(--text-faint)` gray at `fs-sm`. A user who casually changes the template won't notice the copy has shifted. This is the forgiveness principle falling short — the warning is present but not visually distinct enough to interrupt a distracted save.

**Location:** `src/components/EditServiceModal.tsx:208-212`

**Fix:** When `templateChanged === true`, swap the gray hint for a pale-amber info callout (icon + 2 lines of text). Takes the warning from "hint" to "notice." Use the same treatment as the notification-panel warning copy to stay consistent.

---

**M4 — No focus trap on modal overlay**

Same issue as `FlizowCardModal`. Tab from the last focusable element (Save changes button) lands on whatever is behind the overlay in the DOM. Screen-reader users lose the modal context.

**Location:** `src/components/EditServiceModal.tsx:125-275` (entire overlay)

**Fix:** Extract the focus-trap logic once (probably as `useModalFocusTrap(overlayRef)`) and reuse across `EditServiceModal`, `FlizowCardModal`, `AddServiceModal`, `AddContactModal`, `TouchpointModal`, `InsertLinkDialog`, `FlizowShareModal`, and `ConfirmDangerDialog`.

---

**M5 — Progress number input silently accepts out-of-range values until save**

The number input at L237-247 has `min={0} max={100}`, but users can type "200" directly and the state holds "200" until clamped on save (L84). No visual feedback during the out-of-range moment. The slider stays stuck at 100 while the number reads 200, which is confusing.

**Location:** `src/components/EditServiceModal.tsx:237-247`

**Fix:** Clamp on change, not only on save:
```tsx
onChange={(e) => {
  const n = Number(e.target.value);
  setProgress(Math.max(0, Math.min(100, isNaN(n) ? 0 : n)));
}}
```

---

### LOW (5)

**L1 — `setTimeout(..., 80)` magic number for autofocus timing**

Autofocus is delayed 80ms (L67) to wait for the modal transform-in animation to finish before focusing. The number is arbitrary and tied to the modal slide-in duration. If the animation duration changes in CSS, the focus will fight the transform.

**Fix:** Listen for `transitionend` on the modal, or move autofocus to a `useLayoutEffect` after the DOM commits.

---

**L2 — `service.nextDeliverableAt.slice(0, 10)` silently accepts two shapes**

The comment at L43-44 explicitly says the store may hold either a full ISO or a bare YYYY-MM-DD. The `.slice(0, 10)` handles both. Honest, but indicates the store type isn't enforced. Long-term, the store should normalize to one shape so every reader doesn't have to re-derive it.

**Fix:** Normalize in the store on write. Readers can then trust the type.

---

**L3 — Progress number input width (60px) crowds "100%" display**

With `width: 60` and `textAlign: 'right'` (L245), three-digit values push the `%` character out of the visual alignment. The `%` span lives outside the input, so there's a gap of a few pixels between the number and the symbol.

**Fix:** Widen to 72px or move the `%` inside the input as a suffix via a wrapping `<span>` styled to look like one control.

---

**L4 — Name validation error has no aria-live announcement**

The error state flashes a red border for 1400ms (L79). Sighted users see this. Screen-reader users get nothing — `aria-invalid={nameError}` is set (L154) but there's no `aria-describedby` pointing at an error-message element, and no `role="alert"` region.

**Fix:** Add a visible error message below the name input inside a `role="alert"` element that renders only when `nameError === true`.

---

**L5 — Date input has no `min`/`max` bounds**

`<input type="date">` at L257-262 has no min or max. A user can set the next deliverable to 1900-01-01 or 2099-12-31 with no feedback. For a PM tool, both extremes are nonsense.

**Fix:** Set `min={today}` and `max={today + 10y}` to bound the realistic range.

---

### Verify (3 things that work well)

**V1 — Scope-documenting header comment (L6-27)**

The comment says exactly what the modal does AND what it deliberately does NOT do:
- Covers the same fields as AddServiceModal plus progress
- "Deliberately additive-only: it edits metadata, never triggers the template seeding"
- "Delete lives on the ClientDetailPage services strip already… so it's intentionally NOT duplicated here"

This is the kind of why-not-what comment that saves the next contributor 30 minutes of grepping. The delete-placement reasoning is especially good: *"Destructive actions should have one home; two entry points to the same cascade delete would double the chance of an accidental click."*

---

**V2 — Template fit snap-to-first-valid (L58-62)**

If the user picks a type that invalidates the currently-selected template, the effect snaps to the first visible template rather than letting the user save a mismatch:
```tsx
useEffect(() => {
  if (!visibleTemplates.some(t => t.value === templateKey) && visibleTemplates.length) {
    setTemplateKey(visibleTemplates[0].value);
  }
}, [visibleTemplates, templateKey]);
```

Forgiveness + direct-manipulation done right. The user doesn't have to re-pick when they flip type.

---

**V3 — Defensive clamp on save (L84) + Cmd/Ctrl+Enter shortcut (L98-113)**

The save handler clamps progress one more time on its way to the store, even though the slider already constrains values. Belt-and-braces for any field that might have been typed directly.

The keyboard handler covers Escape (close) and Cmd/Ctrl+Enter (save). Matches the rest of the modal family — FlizowCardModal, AddServiceModal, AddContactModal, TouchpointModal, InsertLinkDialog — so the muscle memory is the same across the app.

---

## 7. Scope notes (deferred — not in this audit)

- Attachments, custom fields, team-member assignments at the service level — not present in this modal by design (handled elsewhere).
- Archive/delete controls — deliberately NOT duplicated here (V1 explains).

---

## 8. Filter question

> **"Does this respect the person using the app?"**

Mostly yes — it's a small, honest form that knows what it's for. But the mirrored-twin-file situation with `AddServiceModal` disrespects the *next* person working on it, which is often future-you. That's the fix to prioritize.

---

## Summary

- **1 HIGH:** EditServiceModal and AddServiceModal are ~80% duplicate (~180 lines) across two files; drift already visible in autofocus-select.
- **5 MED:** Dup aria-labels on progress inputs; radio group tab pattern; template-change warning not visually distinct; no focus trap; number input accepts out-of-range values until save.
- **5 LOW:** Magic-number autofocus delay; dual-shape date string in store; number input width crowds "100%"; no aria-live on name error; no min/max on date input.
- **3 V's:** Scope-documenting comment (including why delete is NOT here), template fit snap-to-first-valid, defensive save-time clamp + shared keyboard shortcuts.

Findings only — no fixes applied. Awaiting "go" to patch H1 (extract `ServiceMetadataForm`).
