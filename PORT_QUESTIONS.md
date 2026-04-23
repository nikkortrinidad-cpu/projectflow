# Flizow Port — Open Questions

A running log of ambiguities that showed up during the mockup → React port
where guessing could cause meaningful rework. Answer inline under each item.
I'll resume once questions are resolved.

**Format:**
- **Q:** the question
- **Context:** why it matters / what's at stake
- **Options:** the forks I'm considering
- **My lean:** what I'd pick if forced to choose
- **Answer:** (you fill this in)

---

## Foundational (need answers before major page work)

### 1. Initial data: start empty vs. seed 18 demo clients?

- **Q:** When a brand-new user signs in, should the app start **empty** (zero
  clients, add-your-first-client empty state) or should it **seed** the 18
  demo clients from the mockup so the app feels populated immediately?
- **Context:** The mockup generator reads 18 hardcoded `<a class="client-row">`
  nodes from HTML, then synthesises services/tasks/schedule cards on top.
  For a production app, real users will add their own clients — so seeding
  demo data means they have to delete 18 fake ones first. But during this
  port I need _some_ data to develop every page against, or the Clients /
  Analytics / Kanban / Schedule pages all look broken.
- **Options:**
  - **A.** Ship empty. Build a dev-only "Load demo data" button (hidden behind
    an env flag or URL param) so I can still develop against populated state
    without shipping fake data to end users.
  - **B.** Seed with 18 demo clients on first login, let the user delete them.
    Matches the mockup exactly, feels alive, but is junk to most real users.
  - **C.** Seed with 3 tutorial-style clients (Acme, Bloom, TechStart) that
    demonstrate the health tiers. Smaller footprint, still illustrative,
    user still has to clean up.
- **My lean:** **A.** Production app should start empty. I'll keep the demo
  generator in `src/data/demoSeed.ts` and wire it behind a dev-only button
  in Account Settings → Danger Zone ("Load demo data / Reset"). That way you
  and I both have a one-click path to populated state while porting, but real
  users see a clean onboarding.
- **Answer:**

### 2. Do we fork the legacy Kanban board, or replace it?

- **Q:** The existing `/board` route (old kanban) uses `src/store/boardStore.ts`
  and `src/types.ts`. The new Flizow board lives on `#board/<serviceId>`
  and pulls from the Flizow store. Do we keep the old board accessible
  anywhere, or delete `boardStore.ts` / legacy `App.tsx` pieces once the
  Flizow board ships?
- **Context:** The legacy Firebase doc shape (`boards/{userId}`) is different
  from what the Flizow store will write (`flizow/{userId}`). They can
  coexist indefinitely, but `boardStore.ts` is 1.5k lines and carrying it
  around has a cost.
- **My lean:** **Replace.** Once the Flizow kanban board ships with feature
  parity (drag-drop, card detail, comments, activity log), delete the legacy
  store and types. Migrate any card data the user might have in `boards/{uid}`
  into the new Flizow store as part of the cut-over. If you never used the
  legacy board seriously, we can skip migration and just delete.
- **Answer:**

---

## Page-level

_(Populated per-page as I port.)_

---

## Deferred

_(Things that don't block current work but will need answers eventually.)_
