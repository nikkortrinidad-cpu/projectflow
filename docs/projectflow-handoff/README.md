# ProjectFlow — Developer Handoff

This folder contains everything you need to start building ProjectFlow against our existing mockup. The mockup is interactive and reflects the intended product behavior — use it as the spec for layout, copy, and interactions.

## Read these in order

1. **[01-overview.md](01-overview.md)** — What ProjectFlow is, who uses it, and the live URL to click through.
2. **[02-stable-vs-iterating.md](02-stable-vs-iterating.md)** — Which features are settled and safe to build now, and which are still in flight (don't build yet).
3. **[03-data-model.md](03-data-model.md)** — Exact object shapes for clients, services, tasks, members, integrations, and the runtime helpers.
4. **[04-technical-reference.md](04-technical-reference.md)** — Routing, views, taxonomies, keyboard shortcuts, localStorage keys, interaction patterns, and where to find each in the source.

## TL;DR

- **Mockup file:** `public/projectflow-test.html` (single-file, ~16k lines, no build step). Open in any browser.
- **Live URL:** https://nikkortrinidad-cpu.github.io/kanban-website/projectflow-test.html
- **Tech in mockup:** vanilla HTML/CSS/JS only. No framework, no external deps. This is a spec, not production code — rebuild in the agreed stack.
- **Data layer:** All synthesized at runtime into `window.PROJECTFLOW_DATA` (50 clients, ~150 services, ~1000 tasks, 5 team members). Use this shape as the source of truth for your schema.
- **Build now:** Overview shell, Clients list + detail, Kanban board, favorites + Cmd+K search, status taxonomy.
- **Hold:** Analytics, Weekly WIP, lifecycle phases, Internal Operations service category, templates feature, team filter on Kanban.

## Questions for Nikko

If anything in these docs conflicts with what you see in the mockup, the mockup wins — flag it and we'll update the docs. Open questions are listed at the bottom of `02-stable-vs-iterating.md`.
