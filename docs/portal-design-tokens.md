# Portal design tokens

Copy these tokens **exactly** as listed. Don't reinterpret values, don't
substitute "close enough" hex codes, don't try to derive them from a
generated palette. The design system depends on precise values and the
relationships *between* them.

The token names below are CSS custom properties already in our build's
stylesheet. Setting them on `:root` (light theme) and
`[data-theme="dark"]` (dark theme) cascades the entire visual system —
backgrounds, text, borders, status colors, brand accents, shadows, and
the depth relationships between them.

---

## Why this matters

A QA item that surfaced during the Add Client modal review: portal's
input fields are *lighter* than the surrounding modal background.
Our build renders them *darker* (recessed treatment). The inversion
came from a single wrong relationship between two tokens
(`--bg-soft` and `--bg-elev`) — but it shows up everywhere there's a
form field, which is most of the app.

This is the kind of issue that's invisible per-element but loud at
the system level. Fix it at the token level, you fix every form
field, every hover state, every card surface, in one commit.

### The depth metaphor

Dark mode has a narrow contrast band. Hierarchy comes from depth:

```
--bg          page background (darkest)
↓
--bg-elev     elevated surfaces (cards, modals, panels)
↓
--bg-soft     recessed surfaces (input fields, hover backgrounds)
```

The relationship is `--bg-elev` > `--bg-soft` > `--bg` on the
lightness axis. Inputs sit *inside* cards, both visually and in code.
If you invert that relationship (which portal currently does), inputs
read as "raised" instead of "recessed" — the affordance is wrong, and
the focus ring (blue) loses contrast against the lighter field
background.

### Apple HIG alignment

Our build's design language is Apple HIG-aligned (per `CLAUDE.md`).
The recessed-input pattern is what iOS / macOS Settings, Mail, and
every native dark-mode form uses. Copying Apple's depth treatment
keeps the app coherent with the platform conventions our users
already know.

---

## Light theme tokens

Set these on `:root`:

### Backgrounds + surfaces

| Token | Value | Use |
|---|---|---|
| `--bg` | `#fbfbfd` | Page background |
| `--bg-elev` | `#ffffff` | Elevated surfaces (modals, cards, panels) |
| `--bg-soft` | `#f5f5f7` | Recessed surfaces (input fields, hover backgrounds) |
| `--bg-faint` | `#fafafa` | Subtle alternation (zebra rows) |
| `--column-bg` | `rgba(0,0,0,0.025)` | Kanban column wells |

### Text

| Token | Value | Use |
|---|---|---|
| `--text` | `#1d1d1f` | Primary text (body, headings, input values) |
| `--text-muted` | `#636366` | Secondary text (subtitles, labels) |
| `--text-soft` | `#86868b` | Tertiary text (meta, timestamps) |
| `--text-faint` | `#aeaeb2` | Disabled / placeholder text |

### Hairlines (borders + dividers)

| Token | Value | Use |
|---|---|---|
| `--hairline` | `rgba(0,0,0,0.08)` | Default borders, divider lines |
| `--hairline-soft` | `rgba(0,0,0,0.04)` | Subtle dividers, card edges |
| `--hairline-faint` | `rgba(0,0,0,0.02)` | Faintest dividers, list rows |

### Brand accent (interactive blue)

| Token | Value | Use |
|---|---|---|
| `--highlight` | `#0077C8` | 121 Group brand blue. Primary CTAs, focus rings, links |
| `--highlight-soft` | `rgba(0,119,200,0.08)` | Soft tint backgrounds (selected state, active chip) |
| `--hover-blue` | `#0077C8` | Same as `--highlight`. Used in interactive contexts |
| `--hover-blue-dark` | `#005FA3` | Pressed state, hover-on-blue surfaces |
| `--hover-tint` | `rgba(0,119,200,0.08)` | Light hover backgrounds |
| `--hover-tint-strong` | `rgba(0,119,200,0.14)` | Stronger hover backgrounds |
| `--link-blue` | `#0066CC` | Readable link color on light bg |
| `--btn-bg` | `#ffffff` | Default secondary button background |
| `--btn-bg-hover` | `rgba(0,119,200,0.08)` | Secondary button hover background |

### Status colors

| Token | Value | Use |
|---|---|---|
| `--status-fire` | `#ff3b30` | On Fire — solid color (dots, text, icons) |
| `--status-fire-soft` | `rgba(255,59,48,0.1)` | On Fire — soft tint (pill backgrounds) |
| `--status-risk` | `#ff9f0a` | At Risk — solid |
| `--status-risk-soft` | `rgba(255,159,10,0.12)` | At Risk — soft tint |
| `--status-track` | `#30d158` | On Track — solid |
| `--status-track-soft` | `rgba(48,209,88,0.12)` | On Track — soft tint |
| `--status-onboard` | `#007AFF` | Onboarding — solid (blue dot) |
| `--status-onboard-soft` | `rgba(0,122,255,0.1)` | Onboarding — soft tint |
| `--status-paused` | `#8e8e93` | Paused — solid (gray) |
| `--status-paused-soft` | `rgba(142,142,147,0.12)` | Paused — soft tint |
| `--status-soft` | `#64d2ff` | "Under capacity / informational" cyan (Analytics workload bars, calm signals) |
| `--status-soft-soft` | `rgba(100,210,255,0.14)` | Soft cyan tint |
| `--accent` | `#ff3b30` | Generic destructive accent (delete, danger) |
| `--accent-soft` | `rgba(255,59,48,0.08)` | Destructive soft tint |

### Avatars + chrome

| Token | Value | Use |
|---|---|---|
| `--avatar-bg` | `#1d1d1f` | Default avatar background (when no color set) |
| `--avatar-fg` | `#ffffff` | Avatar text color |
| `--kbd-bg` | `#ffffff` | Keyboard shortcut pill background |
| `--kbd-border` | `#d2d2d7` | Keyboard shortcut pill border |
| `--nav-bg` | `rgba(255,255,255,0.72)` | TopNav background (semi-transparent for blur effect) |
| `--tag-bg` | `rgba(0,0,0,0.04)` | Generic tag chip background |
| `--tag-text` | `#636366` | Generic tag chip text |

### Shadows

| Token | Value | Use |
|---|---|---|
| `--shadow` | `0 1px 3px rgba(0,0,0,0.04)` | Default card shadow |
| `--shadow-hover` | `0 4px 16px rgba(0,0,0,0.08)` | Lifted state shadow |
| `--modal-shadow` | `0 24px 80px rgba(0,0,0,0.18)` | Modal elevation shadow |

---

## Dark theme tokens

Set these on `[data-theme="dark"]` (or whatever selector your portal
uses to flip themes — replace as needed):

### Backgrounds + surfaces

| Token | Value | Use |
|---|---|---|
| `--bg` | `#000000` | Page background (pure black, matches iOS dark) |
| `--bg-elev` | `#1c1c1e` | Elevated surfaces (modals, cards, panels) |
| `--bg-soft` | `#2c2c2e` | Recessed surfaces (input fields, hover backgrounds) |
| `--bg-faint` | `#161618` | Subtle alternation |
| `--column-bg` | `rgba(255,255,255,0.03)` | Kanban column wells |

**The relationship in dark mode:**
`#000000 < #1c1c1e < #2c2c2e` on the lightness axis. The page is pure
black. Modals and cards lift to `#1c1c1e`. Inputs and hover
backgrounds sit at `#2c2c2e` — one notch lighter than the modal.

This follows Apple's iOS dark-mode convention: each surface lifts a
small amount as you go up the elevation ladder. Backgrounds get
*slightly lighter* as you stack containers; the offset is always
subtle (16 levels of gray, not 64). That subtle offset is what makes
the input field read as "inside the modal" rather than "on top of
the modal."

**What portal is doing wrong:** the offset is too large. Portal's
input fields render too light against the modal, breaking the subtle
elevation pattern. The fix is to match our build's exact hex values
below. The token relationship in the sheet is already correct —
portal's values are off.

### Text

| Token | Value | Use |
|---|---|---|
| `--text` | `#f5f5f7` | Primary text |
| `--text-muted` | `#aeaeb2` | Secondary text |
| `--text-soft` | `#a8a8ad` | Tertiary text (WCAG AA contrast on `--bg-soft`: 5.04:1) |
| `--text-faint` | `#8e8e93` | Disabled / placeholder (WCAG AA on `--bg-elev`: 4.61:1) |

**Note:** dark-mode text values are deliberately different from light
mode. Naively swapping `--text-soft` from `#86868b` to its inverse
fails WCAG AA contrast on the darker surfaces. Our build's dark
values are tuned for AA compliance on `--bg-elev` and `--bg-soft`
specifically.

### Hairlines

| Token | Value | Use |
|---|---|---|
| `--hairline` | `rgba(255,255,255,0.1)` | Default borders |
| `--hairline-soft` | `rgba(255,255,255,0.06)` | Subtle dividers |
| `--hairline-faint` | `rgba(255,255,255,0.03)` | Faintest dividers |

### Brand accent (same hex, higher alphas on soft tints)

| Token | Value | Use |
|---|---|---|
| `--highlight` | `#0077C8` | Same brand blue (do not change for dark mode) |
| `--highlight-soft` | `rgba(0,119,200,0.14)` | Soft tint (alpha lifted from 0.08 → 0.14 for visibility) |
| `--hover-blue` | `#0077C8` | Same |
| `--hover-blue-dark` | `#005FA3` | Same |
| `--hover-tint` | `rgba(0,119,200,0.16)` | Hover backgrounds (lifted alpha) |
| `--hover-tint-strong` | `rgba(0,119,200,0.24)` | Strong hover (lifted alpha) |
| `--link-blue` | `#5AC8FA` | Apple Light Blue — readable on near-black |
| `--btn-bg` | `#1c1c1e` | Default secondary button background |
| `--btn-bg-hover` | `rgba(0,119,200,0.18)` | Hover background (lifted alpha) |

### Status colors (subtle tonal shifts for dark mode)

| Token | Value | Use |
|---|---|---|
| `--status-fire` | `#ff453a` | On Fire — slightly brighter for dark bg |
| `--status-fire-soft` | `rgba(255,69,58,0.16)` | Soft tint (lifted alpha) |
| `--status-risk` | `#ffb340` | At Risk — slightly brighter |
| `--status-risk-soft` | `rgba(255,179,64,0.16)` | Soft tint |
| `--status-track` | `#32d74b` | On Track — slightly brighter |
| `--status-track-soft` | `rgba(50,215,75,0.16)` | Soft tint |
| `--status-onboard` | `#0A84FF` | Onboarding — Apple System Blue (dark variant) |
| `--status-onboard-soft` | `rgba(10,132,255,0.18)` | Soft tint |
| `--status-paused` | `#98989d` | Paused — slightly lighter gray |
| `--status-paused-soft` | `rgba(152,152,157,0.14)` | Soft tint |
| `--status-soft` | `#7ad8ff` | Cyan — slightly brighter |
| `--status-soft-soft` | `rgba(122,216,255,0.18)` | Soft tint |
| `--accent` | `#ff453a` | Destructive accent |
| `--accent-soft` | `rgba(255,69,58,0.14)` | Destructive soft tint |

### Avatars + chrome

| Token | Value | Use |
|---|---|---|
| `--avatar-bg` | `#f5f5f7` | Avatar background flips light in dark mode |
| `--avatar-fg` | `#1d1d1f` | Avatar text flips dark |
| `--kbd-bg` | `#2c2c2e` | Keyboard shortcut pill |
| `--kbd-border` | `rgba(255,255,255,0.15)` | Keyboard shortcut border |
| `--nav-bg` | `rgba(0,0,0,0.72)` | TopNav (semi-transparent for blur) |
| `--tag-bg` | `rgba(255,255,255,0.06)` | Generic tag chip background |
| `--tag-text` | `#aeaeb2` | Generic tag chip text |

### Shadows (deeper in dark mode)

| Token | Value | Use |
|---|---|---|
| `--shadow` | `0 1px 3px rgba(0,0,0,0.4)` | Card shadow (alpha lifted) |
| `--shadow-hover` | `0 4px 16px rgba(0,0,0,0.6)` | Lifted shadow |
| `--modal-shadow` | `0 30px 80px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)` | Modal elevation — composite shadow with a hairline outline and an inset highlight for dimensionality |

---

## Disabled state

The dark-mode disabled-state opacity is lifted from 0.4 → 0.6
because 0.4 on near-black backgrounds pulled disabled controls below
WCAG AA contrast (~2.2:1, read as invisible). Apply this rule once,
globally, to every disabled control:

```css
[data-theme="dark"] button:disabled,
[data-theme="dark"] input:disabled,
[data-theme="dark"] textarea:disabled,
[data-theme="dark"] select:disabled,
[data-theme="dark"] [aria-disabled="true"] {
  opacity: 0.6;
}
```

Light mode stays at the default 0.4 (the contrast headroom in light
mode is large enough to absorb it).

---

## Copy-exactly instructions

1. **Replace portal's current token definitions** with the values
   above. Match exact hex codes and exact alpha values.

2. **Match the token names** if you're starting clean. If portal
   uses different names (`--input-bg` vs `--bg-soft`), map them 1:1
   and document the mapping somewhere central.

3. **Don't generate a palette** from one or two seed colors. The
   values above are tuned individually — some for WCAG contrast on
   specific surface combinations, some for Apple HIG alignment, some
   for the brand. Programmatic palette generators won't reproduce
   them.

4. **Don't add new tokens** without documenting their role here. The
   token sheet is the design system contract; ad-hoc additions
   fragment it.

5. **Test both themes in parallel** as you swap. Some bugs only
   surface in one theme — e.g. a focus ring that pops in light mode
   but disappears in dark.

---

## Verification checklist

After the token swap lands, eyeball these surfaces in both themes
(toggle dark mode via the topnav avatar menu) and confirm visual
parity with our build:

### Forms + inputs

- [ ] Add Client modal — input fields recessed (darker in light, see Add Client modal screenshot in `client-page-qa-round5.pdf`)
- [ ] Add Service modal — input fields, template dropdown
- [ ] Add Quick Link modal — title + URL fields
- [ ] Add Contact modal — name / position / email / mobile fields
- [ ] Notes search input (Client → Notes tab)
- [ ] Client list search input

### Cards + panels

- [ ] Client detail header card (look at the divider treatment between client name and the icon row)
- [ ] ACTIVE SERVICES row backgrounds
- [ ] MY TASKS attention card backgrounds
- [ ] MY BOARDS pinned card backgrounds
- [ ] About tab Client Contacts panel
- [ ] About tab Quick Links panel
- [ ] Onboarding tab service cards

### Hover states

- [ ] Client list row hover (subtle blue tint)
- [ ] Filter chip hover
- [ ] Button hover (primary + secondary)
- [ ] Service row hover

### Focus rings (keyboard navigate with Tab)

- [ ] Input fields show a clear blue (#0077C8) focus ring against
      the field background — should pop in both themes
- [ ] Buttons show a focus ring on Tab
- [ ] Filter chips show a focus ring on Tab

### Status colors

- [ ] On Fire pill (red)
- [ ] At Risk pill (amber)
- [ ] On Track pill (green)
- [ ] Onboarding dot (blue)
- [ ] Paused dot (gray)
- [ ] Cross-check the soft tint backgrounds — the pill background should be a low-alpha version of the solid color

### Topnav (per QA policy, topnav differences are intentional, but the *colors* should still match)

- [ ] Avatar background
- [ ] Notification icon color
- [ ] Search button background

### Text contrast

- [ ] Body text (`--text`) is fully readable on `--bg-elev` and `--bg-soft`
- [ ] Muted text (`--text-muted`) is readable on every surface
- [ ] Faint text (`--text-faint`) — placeholder text in input fields, timestamp captions — must pass WCAG AA (4.5:1 for body) on dark backgrounds

---

## Source of truth

Our build's full token sheet lives at:
`src/styles/flizow.css` lines 1-233 (base tokens) and 11717-11750
(status colors). When the design language evolves, that file is the
canonical source — this doc is regenerated from it.

If portal needs to override a token for a portal-specific reason,
document the override in the portal's token file with a comment
explaining why it diverges. Silent overrides drift the design system.
