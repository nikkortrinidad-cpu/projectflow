# ProjectFlow — Product Overview

## What it is

A client-services operations tool for an agency. It tracks every client account, the services delivered to each client, the tasks within each service, and the team running the work. The Kanban board sits underneath each service so day-to-day execution and portfolio-level oversight live in the same product.

## Live URL

https://nikkortrinidad-cpu.github.io/kanban-website/projectflow-test.html

Click through every view before reading the rest of this doc — the interactions tell the story faster than text can.

## Who uses it

- **Account Managers** — own client relationships, monitor health, escalate.
- **Operators** (delivery team — SEO, paid social, design, etc.) — work cards on the Kanban board.
- **Operations Manager** — portfolio view, capacity, schedule.
- **Leadership / CEO** — at-a-glance health of the entire book of business.

## The mental model

```
Client (50)
  └── Service (1–4 per client, e.g. SEO, Paid Social, Email)
        └── Task (cards on a Kanban board)
```

Every client has 1+ services. Every service has its own Kanban board. Tasks belong to one service (and inherit the client). Members are the same people across all clients.

## Top-level navigation

- **Overview** — Portfolio health dashboard. Status counts, attention queue, weekly schedule, my favorited boards.
- **Clients** — Directory of 50 clients with saved views (All / Mine / On Fire / At Risk / On Track / Onboarding / Paused), search, and a split-pane detail view.
- **Analytics** — *Placeholder. Marked "Soon".*
- **Weekly WIP** — *Placeholder. Marked "Soon".*

Kanban boards are reached by clicking a service inside a client detail page (route: `#board/<serviceId>`). They are not a top-level tab.

## What's in this mockup file

`public/projectflow-test.html` is a **single self-contained HTML file**. No build step, no external JS/CSS. All styles live in one `<style>` block; all logic lives in inline `<script>` blocks. Data is generated at page load (deterministic — same seed produces same output).

This was built as a clickable prototype for stakeholder review and to lock in the interaction model. It is **not the production code** — you'll rebuild against your stack of choice, using the data layer shape and view structure as the spec.

## What ships in production (target scope)

The mockup represents the agreed scope for v1. The "Soon" items (Analytics, Weekly WIP) are explicitly out of v1. See `02-stable-vs-iterating.md` for the full breakdown.
