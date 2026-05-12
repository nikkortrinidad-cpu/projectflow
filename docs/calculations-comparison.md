# Calculations comparison — portal vs our build

A companion to `calculations-reference.md`. For every metric, status,
and rollup the reference doc covers, this one notes how the portal
currently calculates it (or fails to) — based on observable output
in `dev.portal.121group.io/projects-v2` checked side-by-side against
our build.

Format: each entry carries our reference rule on top and a
**Portal:** line underneath with one of three verdicts:

- **MATCH** — same rule, same output, no action needed.
- **DIVERGENT** — different rule, different output. Fix needed.
- **NOT VERIFIABLE** — couldn't observe directly (empty data,
 internal state). Verify when data lands.

The "Fix" line under each divergent entry tells the dev what to
change. Items already covered in the round 5 QA doc are
cross-referenced so nothing duplicates.

---

## 1. Status vocabulary

### Client statuses

| State | Our rule | Portal |
|---|---|---|
| `fire` | Stored on `client.status`, AM picks manually. Label: "On Fire". | Same. Filter chip reads "On Fire". |
| `risk` | Stored. Label: "At Risk". | Same. Chip reads "At Risk". |
| `track` | Stored. Label: "On Track". | Same. Chip reads "On Track". |
| `onboard` | Stored. Label: "Onboarding". | Same. Chip reads "Onboarding". |
| `paused` | Stored. Doesn't count as active. | Same. Chip reads "Paused". |
| `archived` | Separate axis, filtered out by default. | Same. |

### Service statuses

| State | Our rule | Portal |
|---|---|---|
| `fire` | Derived. Any open task overdue OR critical OR blocked. Label: "On Fire". | Derivation can't be verified externally. Output: pill reads "On Fire" with the same dot color. |
| `risk` | Derived. Any open task `warning` severity. Label: "At Risk". | Same — output matches. |
| `track` | Derived. Everything else. Label: "On Track". | Output matches. |

 **Pill style divergence** (QA round 5 item, ACTIVE SERVICES section):
- Our build renders `● ON FIRE` / `● ON TRACK` — uppercase, with a
 leading colored dot.
- Portal renders `On Fire` / `On Track` — sentence case, no dot.
- **Fix:** match casing + add leading dot. Style only, not math.

---

## 2. Per-client values

### Portfolio Health rollup (Home top cards)

Our rule: count clients where `status === 'fire' | 'risk' | 'track'`,
plus `active = total − paused`. Reconciles with the Clients filter
chip counts.

**Portal:** **MATCH.** Verified by clicking each card:
- ON FIRE 0 → `/clients?view=fire` (chip reads 0)
- AT RISK 1 → `/clients?view=risk` (chip reads 1, one client shown)
- ON TRACK 47 → `/clients?view=track` (chip reads 47)

Filter chip sum also reconciles: All 140 = 0 (fire) + 1 (risk) + 47
(track) + 86 (onboarding) + 6 (paused) + 0 (archived) = 140 .

### Subtitle below the greeting

Our rule: adaptive copy — "X clients need you now." when fire > 0,
time-of-day fallback otherwise.

**Portal:** **MATCH.** With fire = 0, portal renders "Steady
morning ahead." which is the right zero-fire copy.

### Client list row — right-hand metric

Our rule: `clientMetric()` produces a status-aware sentence:
- fire → "{n} overdue" or "Needs attention"
- risk → "{n} at risk" or "At risk"
- onboard → "{N}% setup"
- paused → "Paused"
- track → "On track"

**Portal:** **DIVERGENT.** Portal doesn't render a right-hand
metric column at all. The slot is empty on most rows; some carry a
last-activity timestamp instead (covered separately below). No "5
overdue" / "30% setup" / "On track" treatment.

**Fix:** add a status-aware metric column to each list row. Same
sentence rules as our build. Renders to the right of the service
tag chips, before the activity timestamp.

### Industry classification line

Our rule: render `categoryLabel(client.industry)` under each client
name. Source: `src/utils/clientDerived.ts:10` (`CATEGORY_LABELS`
map: saas → "SaaS / Tech", ecommerce → "E-commerce / Retail", etc.).

**Portal:** **DIVERGENT.** No industry line under the client
name. (QA round 5 finding #9.)

**Fix:** add the line under each name, above the service tag
chips. Drive from `client.industry`. Use the same canonical label
map so wording matches across surfaces (list row, detail header,
Add Client dropdown).

### Last-activity timestamp

Our rule: most recent `createdAt` across the client's tasks (demo)
or a proper `updatedAt` field on the client record (production).
Format: "Xm ago" / "Xh ago" / "Xd ago" / weekday name / short date,
anchored on the store's `today` value.

**Portal:** **PARTIAL.** Only ~10% of rows show a timestamp.
Format on the visible rows ("7 Apr", "28 Mar", "16 Mar") is the
short-date variant — the under-a-week and under-an-hour formats
weren't tested.

**Fix:** compute and render for every client. Use the same format
ladder as our build (Xd ago / weekday / date). Don't leave any row
blank — if no activity ever, fall back to `createdAt`.

---

## 3. Per-service values

### Service type

Our rule: stored on `service.type` as `'project'` or `'retainer'`.

**Portal:** **MATCH.** Visible in the ACTIVE SERVICES rows ("Project")
and the Add Service modal (Project / Retainer radio cards).

### Service health

Covered in §1 above. Pill style mismatch is the only divergence.

### Service progress

Our rule: stored on `service.progress` as 0–100, manually managed
by the service owner.

**Portal:** **MATCH.** Numbers visible on each service row
(62%, 25%, 0%, 65%). Storage model can't be externally verified,
but the values render and update — same shape.

### ACTIVE SERVICES eyebrow

Our rule:
```
total = services.length
projects = services.filter(s => s.type === 'project').length
retainers = services.filter(s => s.type === 'retainer').length
"{total} of {total} · {projects} projects, {retainers} retainers"
```

**Portal:** **DIVERGENT.** Renders only `5 projects, 0 retainers` —
missing the `X of X` prefix.

**Fix:** prepend `{total} of {total} · ` to the eyebrow string. The
prefix exists for future archived-service support but should ship
now so the shape matches.

### Service row subtitle

Our rule: `"Template: <template name> · Due <next deliverable date>"`.

**Portal:** **DIVERGENT.** Renders `"Project · 73/117 tasks"` —
service-type prefix + raw task count, no template, no due date.
(QA round 5 finding #12.)

**Fix:** swap to template name + next milestone date format. Pull
from `service.templateKey` (resolved to display name) and
`service.nextDeliverableAt`.

### Service progress label ("Progress" vs "This month")

Our rule:
- `project` → "Progress N%"
- `retainer` → "This month N%"

**Portal:** **DIVERGENT.** Every row says "Progress N%"
regardless of service type. (QA round 5 finding — same section.)

**Fix:** split the label by `service.type`. Both pull from
`service.progress`; only the label changes.

---

## 4. Per-task values

### Overdue

Our rule: `dueDate < today AND !archived AND columnId !== 'done'`.

**Portal:** **NOT VERIFIABLE** (no on-fire data in the
current portal account to inspect a populated card). But the
NEEDS ATTENTION card on Alpine Property reads "30 overdue tasks"
which suggests the same comparison runs internally — output shape
matches.

### Blocked

Our rule: `task.columnId === 'blocked'`.

**Portal:** **NOT VERIFIABLE** at this level of audit.

### Severity (`warning` / `critical`)

Our rule: manually-set field on each task. Drives service-health
derivation.

**Portal:** Likely matches based on the observable service-health
output, but the field name and storage shape aren't externally
visible.

---

## 5. MY TASKS card aggregation (Home)

Our rule: one card per fire-or-risk client, with title, blocking
reason, days-overdue stamp, Delegate + Review buttons.

**Portal:** **NOT VERIFIABLE** — portal account has 0
on-fire clients, so the section renders the empty state ("Nothing
urgent right now. Enjoy the quiet."). The fact that it shows the
*urgency-filtered* empty state (rather than a generic "no tasks")
strongly suggests the data shape changed in the right direction
(client-grouped, urgency-filtered) — but we can't verify each
card's exact composition without populated data.

**Fix:** verify against a test account with on-fire data. Spot
checks:
- Card title shape: `{N} overdue · {M} blocked` when both > 0
- Blocking-reason caption pulled from the longest blocker text
- Days-overdue stamp anchored on the *oldest* overdue task in the
 group
- Review button deep-links to `/board/<serviceId>/card/<cardId>` —
 not just the board

---

## 6. NEEDS ATTENTION (client detail Overview)

Our rule: two cards — past-due (count of `critical` or `blocked`
tasks) + at-risk (count of `warning` tasks). Timestamp "As of this
morning".

**Portal:** **PARTIAL.**
- Renders ONE card slot ("30 overdue tasks") instead of two
- Past-due card is present (the count fits the rule)
- At-risk card is missing entirely
- Timestamp reads "As of today" instead of "As of this morning"
- Card has no subtitle (vs ours: "Conversion Optimization · tap to
 open") and no click-through to the offending service

**Fix:** rebuild with two card slots, both clicking through to the
offending service. Pull subtitle from the first service name in
each bucket. (QA round 5 finding #6.)

---

## 7. Onboarding rollup (client detail Onboarding tab)

Our rule:
```
totalItems = items.length
doneItems = items.filter(i => i.done).length
openServices = groups.filter(g => g.doneCount < g.total).length

if openServices === 0:
 "All set · {doneItems} of {totalItems} items complete"
else:
 "{openServices} of {servicesCount} services in progress · {doneItems} of {totalItems} items complete"
```

Each service card subtitle: `"<Template name> · N items left"`.

**Portal:** **DIVERGENT.**
- Overall rollup eyebrow is missing entirely — nothing renders on
 the right of "SETUP & ONBOARDING"
- Per-service subtitle reads "No items yet" — looks like the
 template-driven onboarding checklist isn't populated, so there's
 no items to count

**Fix:** add the overall rollup (two stats separated by middle
dot). Per-service subtitle should be `"<Template name> · N items
left"` even when N is the total (no items checked yet) — empty
data shouldn't hide the template context.

Also: portal renders section labels as "FROM CLIENT" / "FROM US"
but our build's actual labels are "NEEDED FROM CLIENT" / "WE TAKE
CARE OF". The portal was changed to the wrong direction in round 4
(I had the labels flipped in the audit). Revert. (QA round 5
finding under Onboarding tab.)

---

## 8. Capacity / daily slot load

Our rule:
- `load = sum of (task.slots ?? 1)` for open tasks where assigneeId
 matches and dueDate matches
- `effectiveCapFor()` resolves override → standing → defaults (6/8)
- `loadZone()`: green if load ≤ soft, amber if soft < load ≤ max,
 red if load > max

**Portal:** **DIFFERENT CONCEPT.**
- Day-card badge renders 0/6 (matches our shape: load/soft cap)
- Color green at 0/6 (matches our green-zone rule)
- BUT the per-day kebab opens a "Open all tasks / Add task" menu,
 not a cap-setting popover

The portal has the *display* of capacity but not the
**cap-setting + override** model. There's no way to set a custom
soft/max cap for a single day, no way to model a PTO day as 0/0,
no "Reset to standing" path. The two numbers (soft, max) and the
three-zone color rule aren't exposed.

**Fix:** wire the cap-edit popover with two fields (Soft cap / Max
cap). Override resolution chain: per-day override → standing →
workspace defaults (6/8). Three-zone color logic on the badge.
(QA round 5 finding #8.)

---

## 9. Service tag chips on the client list row

Our rule: resolve `client.serviceIds` to service records in order,
show first 3 names, render "+N more" for overflow.

**Portal:** **MATCH.** Chips show actual service names ("Account
Management", "Belle et Blanc - Design...", "BRE - Wordpress
Websi..."). Truncation with "+N more" present. Round 4 finding
about ad-platform chips is now closed.

---

## 10. Notifications

Our rule: six categories, all computed live from store state via
`deriveNotifications(data, memberId)`. Stable ids so read/dismissed
state persists.

**Portal:** **NOT DEEP-AUDITED.** Bell icon visible in the
topnav. Notification panel content + computation rules not
inspected this round.

**Fix:** schedule a notifications-only audit. Compare each
category's count vs ours, verify deep-link routing, confirm
read/dismissed state persists.

---

## 11. External integrations (Stats tab)

Our rule: Ad Spend, Leads, Blended CPL, Email Engagement pulled
fresh from third-party APIs. Live indicator shows freshness.

**Portal:** **LOOKS BUILT.** Stats tab renders with "Live ·
Synced 3 min ago", range selector, 4 summary cards with
sparklines, 7 channel cards (Google Ads, Meta Ads, etc.). Output
shape matches ours. Field-by-field comparison wasn't done.

**Fix:** schedule a Stats-only deep audit comparing every KPI
shape, time-window behavior, drill-through behavior, and
integration tile state.

---

## Summary

11 sections covered. Quick scorecard:

| Section | Verdict |
|---|---|
| 1. Status vocabulary | Match (output) · pill style only |
| 2. Per-client — Portfolio Health rollup | Match |
| 2. Per-client — subtitle | Match |
| 2. Per-client — list row metric text | Missing |
| 2. Per-client — industry line | Missing |
| 2. Per-client — last activity | Spotty coverage |
| 3. Service — type / health / progress | Match |
| 3. Service — eyebrow X of X prefix | Missing |
| 3. Service — row subtitle | Wrong shape |
| 3. Service — Progress vs This month label | Missing variant |
| 4. Per-task values | Not verifiable externally |
| 5. MY TASKS card aggregation | Empty data — verify next |
| 6. NEEDS ATTENTION | 1 card slot vs 2 |
| 7. Onboarding rollup | Eyebrow missing + label revert needed |
| 8. Capacity / cap popover | Concept missing |
| 9. Service tag chips | Match |
| 10. Notifications | Not deep-audited |
| 11. External integrations (Stats) | Not deep-audited |

**The big themes:**

- **Rollup math is mostly right.** Portfolio Health reconciles
 across the Home cards and the Clients filter chips. Service
 health derivation produces the same outputs. Counts that should
 match, match.

- **Per-row enrichment is the gap.** Industry line, status-aware
 metric text, last-activity stamps — anything that would surface
 *per client in the list view* — is missing or partial on portal.
 None of these are math gaps; they're field-render gaps. Same
 pattern in the service rows (template + due subtitle, This-month
 variant for retainers).

- **Capacity model is the biggest structural gap.** Portal shows
 the badge but doesn't expose the cap-setting + override model.
 Until that lands, the schedule strip is decorative — it can't
 drive PTO modeling, can't reflect per-day overrides, can't
 surface the three-zone (green/amber/red) signal.

- **Onboarding tab labels reverted in the wrong direction** in
 round 4. Portal needs "NEEDED FROM CLIENT" / "WE TAKE CARE OF"
 back, plus the overall rollup eyebrow that's currently missing.

Cross-reference each entry above to the round 5 QA findings —
they all already have a "where to see" + "fix" entry in
`docs/qa-comparison/home-page-qa-round5.pdf` or
`docs/qa-comparison/client-page-qa-round5.pdf`. This doc is the
math view; those are the surface view.
