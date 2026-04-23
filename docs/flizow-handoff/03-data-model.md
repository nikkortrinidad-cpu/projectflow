# Data Model

The entire data layer is synthesized at page load into `window.FLIZOW_DATA`. Open the live mockup, run `console.log(window.FLIZOW_DATA)`, and you'll see the exact shape described below. Use this as the source of truth for your schema.

## Top-level shape

```js
window.FLIZOW_DATA = {
  clients: [...],          // 50
  services: [...],         // ~150 (1–4 per client)
  tasks: [...],            // ~1000 (5–8 per service)
  members: [...],          // 5 operators (OPS_TEAM)
  integrations: [...],     // 2–4 per client
  today: Date,             // local midnight of current day
  scheduleTaskMap: {...}   // taskId → serviceId lookup
}
```

## Client

```js
{
  id: "acme-corp",
  name: "Acme Corporation",
  initials: "AC",
  logoClass: "logo-acme",          // maps to a CSS class for the avatar swatch
  status: "track",                 // 'fire' | 'risk' | 'track' | 'onboard' | 'paused'
  industry: "B2B SaaS",
  industryCategory: "demandgen",   // internal grouping key → drives service templates
  amId: "nt",                      // account manager member ID (nullable)
  mrr: 12500,                      // monthly recurring revenue (USD)
  renewsAt: "2026-08-15",          // ISO date
  startedAt: "2024-03-10",         // ISO date
  serviceIds: ["acme-corp-svc-0", "acme-corp-svc-1"]
}
```

**Status values and meaning:**
- `fire` — Critical issue, immediate attention needed.
- `risk` — At risk, has warnings.
- `track` — Healthy, on track.
- `onboard` — Currently in onboarding (usually paired with a progress %).
- `paused` — Account paused, no active work.

## Service

```js
{
  id: "acme-corp-svc-0",
  clientId: "acme-corp",
  name: "Demand Gen Retainer",
  type: "retainer",                // 'retainer' | 'project'
  templateKey: "demandgen",        // internal — maps to the task pool used to seed this service
  progress: 62,                    // 0–100, numeric percentage
  nextDeliverableAt: "2026-05-01",
  taskIds: ["acme-corp-svc-0-t0", "acme-corp-svc-0-t1", ...]
}
```

**Future fields (not in v1, but reserve room):**
- `lifecyclePhase: string | null` — from the 12-phase lifecycle taxonomy, pending placement decision.
- `category: string` — once Internal Operations services are added.

## Task

```js
{
  id: "acme-corp-svc-0-t0",
  serviceId: "acme-corp-svc-0",
  clientId: "acme-corp",           // denormalized for convenience
  title: "LinkedIn ad creative refresh for pricing audience",
  columnId: "inprogress",          // 'todo' | 'inprogress' | 'blocked' | 'review' | 'done'
  priority: "high",                // 'low' | 'medium' | 'high' | 'urgent'
  assigneeId: "nt",                // member ID (nullable)
  labels: [],                      // string array (reserved; not used in v1)
  dueDate: "2026-04-24",
  createdAt: "2026-02-18",

  // Optional — only present on a subset of tasks:
  severity: "warning",             // 'critical' | 'warning'. Surfaces in Attention queue.
  blockerReason: "...",            // string. Only when columnId='blocked' AND severity='critical'.

  // Optional — only on tasks that appear in the schedule grid:
  _schedule: {
    tag: "deadline",               // 'deadline' | 'meeting' | 'milestone'
    meta: "2:00 PM · Harvey San Juan presenting",
    done: false
  }
}
```

**Severity vs priority:** priority is the task's intrinsic urgency. Severity is an escalation flag — `warning` means the task is off-track; `critical` means it needs human intervention now (these are the ones that appear in the Overview "Needs Your Attention" queue).

## Member

```js
{
  id: "rc",
  initials: "RC",
  name: "Roxy Calinga",
  role: "Operations Manager",      // human-readable job title
  color: "#4f46e5",                // avatar foreground
  bg: "#e0e7ff",                   // avatar background
  type: "operator"                 // 'operator' for the internal OPS_TEAM
}
```

The mockup ships with five operators (`OPS_TEAM` constant). Account Managers for clients are also pulled from this roster via `client.amId`.

**Current OPS_TEAM roster:**

| ID | Name | Role |
|---|---|---|
| `rc` | Roxy Calinga | Operations Manager |
| `cc` | Chris Castellano | Senior Growth & SEO Manager |
| `kl` | Kate Lawrence | Account Manager |
| `hs` | Harvey San Juan | Web Designer |
| `mp` | Michael Potts | Paid Social Manager |

In production this will be replaced by whatever user table you set up — but the shape (id, initials, name, role, color pair) should be preserved so all the UI keeps rendering correctly.

## Integration

```js
{
  clientId: "acme-corp",
  name: "Google Analytics",
  status: "connected"              // 'connected' | 'error'
}
```

Integrations are shown on the Client Detail page. In v1 this is display-only — wiring up real OAuth flows is out of scope.

## Runtime helpers

### `today`

A `Date` object representing local midnight of the current day. Used as the anchor for all relative dates in the schedule grid and the "X days overdue" copy. The mockup computes this once on page load.

### `scheduleTaskMap`

A simple lookup that maps every task that appears in the schedule grid to its service ID:

```js
{ "acme-corp-svc-0-t0": "acme-corp-svc-0", ... }
```

This exists so that clicking a task card in the schedule can route to the correct board without iterating the full tasks array. You can probably compute this on the fly in your framework's state layer.

## Relationships diagram

```
Client ───owns── Service ───owns── Task
   │                │                │
   │                └──────── belongs to ◄── AccountManager (Member)
   │
   └── has many ──► Integration
```

- A client has many services, services, integrations.
- A service belongs to one client and has many tasks.
- A task belongs to one service (and inherits the client).
- A member can be assigned as AM on many clients, and as assignee on many tasks.

## Persistence keys (mockup only)

The mockup uses `localStorage`. Your production app should replace these with proper server-side persistence:

| Key | What it stores |
|---|---|
| `flizow-favorite-boards` | Array of service IDs the current user has favorited. |
| `overview-block-order` | Array of block IDs in the user's preferred render order. |
| `refined-theme` | `'dark'` or `'light'`. |

All three should become per-user settings in production.
