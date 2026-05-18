# Clients page · QA Round 7

**Date:** 2026-05-18
**Counts:** 1 HIGH · 6 MED · 1 LOW · 0 INFO (8 findings)

Mark said all Round 6 items shipped. Round 7 verifies each one against the
live portal at `dev.portal.121group.io/projects-v2/`. The headline finding
is the **Edit client details modal Account Manager dropdown** — it lists
exactly one option (the placeholder), so an account manager can no longer
be assigned through the modal at all. Six Round-6 items are still unfixed:
the sub-header chip inline-edit, the service-pill client-name prefix, the
sticky letter headers, the Add contact modal layout, the Notes empty-state
button, and the Project Team list layout. One new spec gap surfaces this
round — the Client since date picker has no `max` attribute, so future
dates can be entered. Two new findings + six carry-overs.

---

## Functional · HIGH severity

### 1. Edit client details modal Account Manager picker is empty

`HIGH` · `NEW`

**Where to see:** Open any client → click the kebab menu at the top-right
of the client header card → "Edit client details…" → click the Account
Manager dropdown.

**Portal (today):** The Account Manager `<select>` contains one option
only: the placeholder text "Choose an Account Manager…". Zero actual
people in the list. The field is marked required (red `*`), so a client
cannot be saved with an account manager assigned through this modal.
Probed live on the Acme Corp (For Internal Testing) client.

**Original (source build):** The same dropdown lists the placeholder plus
seven people (Nikko Trinidad, Kate Chen, Marcus Aldrin, Diana Reyes,
Jordan Park, Kate Lawrence, Nikko Trinidad). Note: the original also has
a duplicate entry ("Nikko Trinidad" twice) — that's a separate
pre-existing dedup bug worth fixing at the same time.

**How to ship:** The filter is most likely still checking against the
legacy `'editor'` role string. In the new 4-tier RBAC the editor tier was
renamed to "Member" and `'editor'` no longer exists in the role enum, so
the filter matches nobody. Update the filter to include anyone with edit
privileges — `accessLevel in ('owner', 'admin', 'member')`, exclude
Viewers. While you're in there, dedupe the list by member id at render
time so the duplicates don't surface either.

---

## Functional · MED severity

### 2. Sub-header chips (Industry / Manager / Client since) are inline-editable on portal

`MED` · `FROM PREVIOUS QA`

**Where to see:** On any client's detail page, look at the three chips
directly under the company name: `Retail ×`, `Manager: None assigned ×`,
`Client since May 2026 ×`. Click any of them.

**Portal (today):** Clicking the chip turns it into an inline editor — the
Client since chip becomes a `<input type="date">` field, the Manager chip
becomes a `<select>`. Each chip also carries an `×` button that clears
the value directly. The portal exposes two parallel ways to edit the same
fields: inline on the chip, and via the Edit client details modal (kebab
menu → Edit). Both paths exist; both must be maintained.

**Original (source build):** The same fields render as display-only
labels (`Healthcare / Wellness  ·  MANAGER: KC Kate Chen  ·  CLIENT SINCE
Feb 2025`). No `×` buttons, no inline editor. The only way to edit these
fields is through the Edit client details modal — single source of truth.

**How to ship:** Drop the inline-edit affordances and the `×` clear
buttons. Make the chips display-only. Route every edit through the
existing Edit client details modal that the portal already has. Two
consequences: (a) the `×` clear behaviour goes away, but those fields are
required on the original anyway so clearing-to-empty shouldn't be a
supported state; (b) you remove the divergence between the two edit
paths and the maintenance cost of keeping both in sync.

### 3. Client since date picker accepts future dates (no `max` attribute)

`MED` · `NEW`

**Where to see:** Click the Client since chip on the client header, or
open the Edit client details modal → Client since field. The native
date picker appears.

**Portal (today):** The `<input type="date">` has neither `min` nor
`max` set (both attributes return empty strings on probe). You can pick
2099 and save. The chip then renders "Client since May 2099" — garbage
data with no validation guard.

**Original (source build):** Same spec gap — the source build also has
no `max` set, so this isn't a portal-only regression. Calling it out
here because the rule belongs in both codebases.

**How to ship:** Add `max={todayISOString()}` to the Client since date
input on both the portal and the original. Apply the same fix on the
inline chip-as-editor and on the modal field. Worth a peer sweep for any
other date inputs (service start date, card due dates) where a
future-date guard would also make sense.

---

## Cosmetic · MED severity

### 4. Service pill labels still carry the `${clientName} -` prefix in the sidebar

`MED` · `FROM PREVIOUS QA`

**Where to see:** Look at any client row in the clients sidebar. Below
the client name sits a row of service pills.

**Portal (today):** Each service pill renders as `${clientName} -
${serviceName}` — examples from the Atlas Paving row: "Atlas Paving -
April 2026 Retainer", "Atlas Paving - Development - Block 10", "Atlas
Paving - March 2026 Retainer". The client name takes roughly half the
visible pill width, so the service name truncates much earlier than
necessary.

**Original (source build):** Service pills render just the service name
— "Reputation Rebuild", "Local SEO & Reviews", "Patient Acquisition". No
client-name prefix. The client name appears once on the row above and
isn't repeated on every pill.

**How to ship:** Strip the `${client.name} - ` prefix from the displayed
pill text. The underlying data probably stores `${client.name} -
${service.name}` as the service name itself (a legacy import quirk) — if
so, the cleanest fix is to derive the display string at render time
(`service.name.replace(new RegExp('^' + escapeRegex(client.name) + ' - '),
'')`) so the underlying record isn't rewritten. The trailing IDs were
stripped in Round 6; the prefix is the last piece.

### 5. Sticky letter headers (A, B, C…) missing in clients sidebar

`MED` · `FROM PREVIOUS QA`

**Where to see:** Open the Clients page and scroll the sidebar.

**Portal (today):** Clients are sorted alphabetically (the sort shipped
in Round 6) but there are no letter dividers between buckets. The
sidebar jumps from "121 Group" straight into "Acme", "Atlas", "Belle",
"Berg", "BidsOnline" with nothing to anchor the eye.

**Original (source build):** A capital-letter heading sits at the top of
each alphabetical bucket — `A` before Acme + Apex + Atlas, `B` before
Basalt + Beacon, `C` before the next group, and so on. The heading stays
pinned to the top of the sidebar as you scroll past its bucket (sticky
position).

**How to ship:** Group the sorted client list by
`client.name[0].toUpperCase()` and render a sticky
`<li class="clients-list-letter">` divider above each bucket. CSS for
`.clients-list-letter` already lives in the source build's `flizow.css`
from the Round 6 fix — port that selector across. For the one client
that starts with a number ("121 Group"), either bucket under a `#`
heading or merge it with the `A` bucket. The original puts
numeric-prefix clients first under no header, which also works.

### 6. Add contact modal still deviates from the original build (seven differences)

`MED` · `FROM PREVIOUS QA`

**Where to see:** Open any client → About tab → Client Contacts section
→ click "+ Add contact".

**Portal (today):** The modal is missing the `×` close button in the
header, uses placeholder-only inputs (no labels above), names the fields
"Full name" / "Position / Role" / "Email address" / "Mobile number
(optional)", stacks every field full-width vertically, omits the
primary-contact helper text, and renders anchored to the upper half of
the viewport rather than centered.

**Original (source build):** Modal has the `×` close button in the
header. Each input has a label above ("Name", "Role", "Email", "Phone").
Email and Phone share a single row at 50/50 width. The "Set as primary
contact" checkbox shows helper text underneath ("Replaces James Oduya as
primary.") when toggling will displace the current primary. Modal is
centered. Title carries a person-plus icon.

**How to ship:** Match the original modal end to end. Specific items:

1. Add the `×` close button in the modal header.
2. Render visible labels above each input; demote current placeholders
   to example text ("e.g. Jamie Chen").
3. Rename fields: "Full name" → "Name"; "Position / Role" → "Role";
   "Email address" → "Email"; "Mobile number (optional)" → "Phone".
4. Lay Email + Phone in a single 50/50 row.
5. Add helper text under the primary-contact checkbox showing who will
   be replaced.
6. Centre the modal in the viewport.
7. Add the person-plus icon to the title.

### 7. Project Team list is vertical on portal; original lays out horizontally

`MED` · `NEW`

**Where to see:** Open any client with multiple operators (e.g. 121
Group, For Internal Testing) → About tab → scroll to the Team panel →
Project Team section.

**Portal (today):** Each project-team member renders as a full-width
stacked row — avatar on the left, name + role on the right, one member
per row. With 17 operators on the 121 Group client, the list runs 17
rows tall and the Team panel dwarfs everything else on the About tab.

**Original (source build):** Project-team members render in a horizontal
row layout. The container is `team-group-row` with `display: flex;
flex-direction: row` (probed live via computed style). Members flow
left-to-right and wrap as the container fills, so a 17-operator team
takes 3–4 lines instead of 17.

**How to ship:** Match the original's `team-group-row` pattern —
`display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px` (or
whatever the design token is). Each member card becomes a fixed-width
tile that flows. The Account Manager row above stays as a single
full-width card; only the Project Team grid switches to horizontal flow.

---

## Cosmetic · LOW severity

### 8. Notes empty-state "+ New note" button is oversized on portal

`LOW` · `FROM PREVIOUS QA`

**Where to see:** Open any client that has no notes (e.g. Acme Corp For
Internal Testing) → Notes tab → look at the centred empty state.

**Portal (today):** The "+ New note" button in the empty state is
rendered at roughly 1.5–2× the height + padding of the original's
button. The headline ("No notes yet"), subline ("Add your first note to
start."), and pencil icon all match; only the button is overweight.
The empty-state side rail also stays blank below the search input.

**Original (source build):** The "+ New note" empty-state button matches
the standard primary-button height used elsewhere in the app (around 36
pixels tall). The empty-state side rail shows a small helper line under
the search input ("No notes yet. Press New note to start one.").

**How to ship:** Match the standard primary-button height on the
empty-state CTA — same class as the "+ Add client" / "+ Add service"
buttons used elsewhere. Add the small helper line under the rail's
search input.
