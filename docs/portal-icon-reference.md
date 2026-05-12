# Portal icon reference

A working guide for the portal dev to migrate the Home and Clients
pages from Lucide to Heroicons.

The reference design (this repo's live site at
`nikkortrinidad-cpu.github.io/flizow`) uses **Heroicons v2 outline,
24×24** throughout. The portal currently uses Lucide for these
surfaces. This doc lists every Heroicons icon the live site uses (so
the dev knows the target), plus a Lucide-to-Heroicons mapping
cheatsheet and the actual migration steps.

---

## Section A — Icon inventory by surface

Every Heroicons icon used on the Home and Clients pages of the live
site, organized by surface so the dev can search for "MY TASKS" or
"Quick links" and find the right import.

All icons come from the same import path:

```ts
import { <IconName> } from '@heroicons/react/24/outline';
```

Sizing convention is `width={14} height={14}` for section-header icons
(14×14) and `width={12} height={12}` for sub-section labels (12×12).
Modal-title icons go to 18×18.

### Home page

| Surface | Icon component | Size |
|---|---|---|
| Portfolio Health — section header | `HeartIcon` | 14 |
| Portfolio Health — On Fire card | `FireIcon` | 14 |
| Portfolio Health — At Risk card | `ExclamationTriangleIcon` | 14 |
| Portfolio Health — On Track card | `CheckIcon` | 14 |
| My Tasks — section header | `BellAlertIcon` | 14 |
| My Schedule — section header | `CalendarDaysIcon` | 14 |
| My Boards — section header | `ViewColumnsIcon` | 14 |

### Clients page — list view (left pane)

| Surface | Icon component | Size |
|---|---|---|
| Search input — magnifying-glass prefix | `MagnifyingGlassIcon` | default |
| "+ Add client" CTA button | `PlusIcon` | default |
| Client list row — chevron-into-detail (when shown) | `ChevronRightIcon` | 14 |

### Clients page — detail view header

| Surface | Icon component | Size |
|---|---|---|
| Kebab menu (top right of header) | `EllipsisVerticalIcon` | 16 |

### Clients page — Onboarding tab

| Surface | Icon component | Size |
|---|---|---|
| Service card — expand/collapse chevron | `ChevronDownIcon` | default |
| "Needed from client" group label | `UserIcon` | 12 |
| "We take care of" group label | `WrenchScrewdriverIcon` | 12 |
| Checklist item — checked state mark | `CheckIcon` | default |

### Clients page — About tab

| Surface | Icon component | Size |
|---|---|---|
| "Relationship" section title | `ChatBubbleLeftRightIcon` | 14 |
| "Client contacts" panel label | `IdentificationIcon` | 12 |
| "Quick links" panel label | `LinkIcon` | 12 |
| "Team" section title | `UserGroupIcon` | 14 |
| "Account manager" team group label | `BriefcaseIcon` | 12 |
| "Project team" team group label | `UsersIcon` | 12 |

### Clients page — modals

| Modal | Title-bar icon | Close button |
|---|---|---|
| Add client | `BuildingOffice2Icon` (18) | `XMarkIcon` (14) |
| Add contact / Edit contact | `UserPlusIcon` (18) | `XMarkIcon` (14) |
| Add quick link / Edit quick link | `LinkIcon` (18) | `XMarkIcon` (14) |
| Add operators | `UserGroupIcon` (18) | `XMarkIcon` (14) |

---

## Section B — Lucide → Heroicons cheatsheet

When the dev encounters a Lucide icon in the portal code, they'll
swap to the Heroicons component below. Component names always end in
`Icon`.

### Direct one-to-one swaps

| Lucide name | Heroicons name |
|---|---|
| `Bell` | `BellIcon` |
| `BellRing` | **`BellAlertIcon`** |
| `Heart` | `HeartIcon` |
| `Calendar` | `CalendarDaysIcon` |
| `Search` | `MagnifyingGlassIcon` |
| `Plus` | `PlusIcon` |
| `X` | `XMarkIcon` |
| `Check` | `CheckIcon` |
| `ChevronDown` | `ChevronDownIcon` |
| `ChevronRight` | `ChevronRightIcon` |
| `ChevronLeft` | `ChevronLeftIcon` |
| `ArrowLeft` | `ArrowLeftIcon` |
| `ArrowRight` | `ArrowRightIcon` |
| `Trash` / `Trash2` | `TrashIcon` |
| `Edit` / `Edit2` / `Pencil` | `PencilIcon` |
| `MoreHorizontal` | `EllipsisHorizontalIcon` |
| `MoreVertical` | `EllipsisVerticalIcon` |
| `User` | `UserIcon` |
| `Users` | `UsersIcon` |
| `UserPlus` | `UserPlusIcon` |
| `Building2` / `Building` | `BuildingOffice2Icon` |
| `Briefcase` | `BriefcaseIcon` |
| `Wrench` | `WrenchScrewdriverIcon` |
| `Link` / `Link2` | `LinkIcon` |
| `MessageSquare` / `MessageCircle` | `ChatBubbleLeftRightIcon` |
| `IdCard` / `ContactRound` | `IdentificationIcon` |
| `Clock` | `ClockIcon` |
| `Bookmark` | `BookmarkIcon` |
| `FileText` | `DocumentTextIcon` |
| `AlertTriangle` | `ExclamationTriangleIcon` |
| `Flame` | `FireIcon` |
| `Folder` | `FolderIcon` |
| `Moon` | `MoonIcon` |
| `Sun` | `SunIcon` |
| `Scale` | `ScaleIcon` |
| `Share` / `Share2` | `ShareIcon` |
| `CheckCircle` / `CheckCircle2` | `CheckCircleIcon` |

### Swaps that need a concept change (NOT a direct rename)

These are places where the portal currently uses a Lucide icon whose
*shape is wrong* for the surface, not just stylistically different.
Don't blindly rename — pick the right Heroicons component below.

| Surface on portal | Wrong icon (Lucide) | Correct icon (Heroicons) |
|---|---|---|
| My Boards — section header | `Star` (a 5-point star) | **`ViewColumnsIcon`** (vertical bars representing kanban columns) |

The My Boards case is the only known concept-level mismatch right
now. The star is wrong because a star already means "favorited"
elsewhere in the UI (the row-level star toggle on each service in
ACTIVE SERVICES). Using a star for a section header makes the icon
semantics ambiguous.

If any other concept-level mismatches surface during the migration,
add them to this table.

### Missing Heroicons equivalents

Heroicons has fewer icons than Lucide. If the dev hits a Lucide icon
with no clean Heroicons equivalent, the options are (in order of
preference):

1. Pick a close-enough Heroicons icon and document the substitution
2. Keep that single Lucide icon as an exception (one import line)
3. Use a different icon library for the specific icon (Phosphor,
   Iconoir) and document the third source

Visual catalog: https://heroicons.com

---

## Section C — Migration steps

The mechanical work.

### 1. Install Heroicons

```bash
npm install @heroicons/react
```

(or whichever package manager the portal project uses)

### 2. Find every Lucide usage in the projects-v2 directory

```bash
# All Lucide imports
grep -rn "from ['\"]lucide-react['\"]" client/src/pages/projects-v2/

# Or with ripgrep
rg "from ['\"]lucide-react['\"]" client/src/pages/projects-v2/
```

This produces a file-by-file punch list. Work through each file in
isolation — a single commit per file keeps the diff reviewable.

### 3. Per-file swap pattern

**Before** (Lucide):

```tsx
import { Bell, Heart, Star, Calendar } from 'lucide-react';

<Bell size={14} />
<Heart size={14} />
<Star size={14} />
<Calendar size={14} />
```

**After** (Heroicons):

```tsx
import {
  BellAlertIcon,
  HeartIcon,
  ViewColumnsIcon,  // note: was Star, swapped concept
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

<BellAlertIcon width={14} height={14} />
<HeartIcon width={14} height={14} />
<ViewColumnsIcon width={14} height={14} />
<CalendarDaysIcon width={14} height={14} />
```

Two API differences to handle in the swap:

- **Component name suffix.** Lucide is `<Bell />`, Heroicons is
  `<BellIcon />`. Add `Icon` to every name.
- **Sizing prop.** Lucide takes `size={N}` as a single prop. Heroicons
  takes `width={N} height={N}` (or a CSS class on the element). The
  live site's convention is `width={N} height={N}` for inline
  sizing — match it.

### 4. Add `aria-hidden="true"` for decorative icons

The live site marks every decorative icon with `aria-hidden="true"`
so screen readers skip them. Add this when porting any icon that sits
next to a text label (header icons, button-leading icons, label-row
icons).

```tsx
<HeartIcon width={14} height={14} aria-hidden="true" />
```

Don't add it on stand-alone icon-only buttons — those need a real
`aria-label`, not aria-hidden.

### 5. Verify against the inventory

After each file, cross-check the icons used against Section A above.
If the file's icons match the inventory, the file is done. If a file
uses an icon not in Section A, it's either:

- A surface this doc doesn't cover (Stats tab, Notes tab editor,
  kanban card modal, etc. — fine, those will need their own audit
  later)
- A Lucide icon that's wrong for the surface (check Section B's
  concept-change table)

### 6. Commit per file, push, ask for a QA pass

Round 6 of QA will compare each migrated surface against the live
site icon-by-icon. Smaller commits = easier rollback if something
breaks.

---

## Quick reference card

For the dev's "I just need the answer" moments:

- **Library:** `@heroicons/react`
- **Variant:** `/24/outline` (24×24, stroke-based, stroke-width 1.5)
- **Naming:** every component ends in `Icon` (e.g. `BellAlertIcon`)
- **Sizing:** inline `width={N} height={N}` (not `size={N}`)
- **Accessibility:** `aria-hidden="true"` on decorative icons
- **Catalog:** https://heroicons.com
