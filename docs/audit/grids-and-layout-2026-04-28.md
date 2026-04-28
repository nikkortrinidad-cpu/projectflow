# Grids & Layout Audit — 2026-04-28

Applies the 12-point checklist from `~/Documents/Claude/skills/grids-and-layout-design.md` to every page and modal in Flizow **except** the Overview page.

**Areas audited:** Clients · Boards · Ops · Weekly WIP · Templates · Analytics · Account modal.
**Scope:** code-level (CSS rules + JSX layout). Visual judgment calls (rule-of-thirds placement, golden ratio in composition) require screenshots and aren't covered here.

**Total findings:** 60 items across 7 areas.

| Area | HIGH | MED | LOW | Total |
|---|---:|---:|---:|---:|
| Clients | 2 | 4 | 2 | 8 |
| Boards | 2 | 5 | 3 | 10 |
| Ops | 3 | 4 | 2 | 9 |
| Weekly WIP | 2 | 4 | 2 | 8 |
| Templates | 3 | 5 | 1 | 9 |
| Analytics | 3 | 4 | 2 | 9 |
| Account | 3 | 4 | 2 | 9 |
| **Total** | **18** | **30** | **14** | **60** |

---

## Cross-cutting themes

These show up in **multiple** areas and would each be a single sweep that resolves several findings at once. Recommend tackling these first:

1. **The 13px body baseline (`--fs-md`)** — the typographic scale skill explicitly flags 13px as "arbitrary, between 12 and 14." Currently the default body size everywhere. Either commit to it (with a documented rationale) or migrate to 14px.
2. **Inline pixel values vs spacing tokens** — Account modal especially uses `style={{ fontSize: 11, padding: '8px 14px' }}` instead of CSS classes. Same pattern in scattered places elsewhere.
3. **Off-scale spacing tokens** (`--sp-18`, `--sp-26`, etc.) — these don't sit on the 4px baseline grid and create one-off rhythms.
4. **Line-length caps undeclared on prose surfaces** — multiple panes can spread body text past 70 cpl on wide viewports (Templates detail, Brief panel, etc.).
5. **Hardcoded brand color (#F15A24) instead of `var(--highlight)`** — the token exists, isn't always used.

---

## Clients area

`src/pages/ClientsPage.tsx`, `src/pages/ClientDetailPage.tsx`, `src/pages/ClientsSplit.tsx`

- **[HIGH] Client row grid uses arbitrary fractional weights** — flizow.css:8763 — `grid-template-columns: minmax(220px, 2.2fr) minmax(200px, 2fr) minmax(120px, 1fr) minmax(140px, 1.2fr) minmax(80px, 0.8fr)` mixes 2.2fr / 2fr / 1.2fr / 0.8fr with no documented basis. Columns reflow unpredictably as the side pane resizes. **Fix:** define a fixed 6–8 col grid via CSS custom properties; let columns span intentional widths.

- **[HIGH] Body text at 13px breaks the typographic scale** — flizow.css var(--fs-md) — Default body size sits between 12 and 14, off the standard scale. Used by ~100+ selectors so this is workspace-wide. **Fix:** migrate body to 14px and fold `--fs-md` into a deprecated alias, OR document the rationale (font-x-height match) at the token definition.

- **[MED] Line-height on `.client-row` cells inherits silently** — flizow.css:8761–8800 — `.client-name`, `.client-industry`, `.client-am-name`, `.client-timestamp` have no explicit `line-height`. A parent change could shift baseline alignment. **Fix:** declare per-cell: dense (1.3) for labels, body (1.4) for sub-text.

- **[MED] `.relationship-grid` cards have no max-width on wide viewports** — flizow.css:9552 — Two-column grid stretches edge-to-edge at 1200px+. Cards exceed 70 cpl for body text. **Fix:** wrap grid in `max-width: 900px; margin: 0 auto;` or cap each card at 540px.

- **[MED] `.hero-meta` uses an off-scale gap (`--sp-18`)** — flizow.css:9063 — `--sp-18` is its own one-off token, separate from `--sp-base / --sp-lg / --sp-xl` (12 / 14 / 16 px). **Fix:** use `var(--sp-lg)` (14px) so the gap sits on the 4px baseline grid.

- **[MED] Section spacing mixes 36px hardcode with `var(--sp-xl)` (16px)** — flizow.css:9332, 11299 — Outer rhythm uses 36px, inner sub-group uses 16px, no shared margin token. **Fix:** add `--margin-section: 36px` and use it everywhere sections separate.

- **[LOW] `.contact-row` and `.quicklink-row` have different hover padding patterns** — flizow.css:9585, 9838 — Same visual intent, two implementations. **Fix:** extract a shared `.interactive-row` class.

- **[LOW] Service pill padding inconsistent** — flizow.css:8807 vs 8859 — Regular `.service-pill` is `3px 9px`; modal pill is `4px 10px`. **Fix:** unify on `var(--sp-micro) var(--sp-md)`.

---

## Boards area

`src/pages/BoardPage.tsx`, `src/components/FlizowCardModal.tsx`, `src/components/FlizowShareModal.tsx`

- **[HIGH] Card modal title uses `margin-left: -10px`** — flizow.css:2542 — Negative margin floats the title off the alignment grid. Violates the "elements align to a shared grid; no floating elements" rule. **Fix:** remove the negative margin and adjust container padding instead.

- **[HIGH] 13px body baseline (cross-cutting)** — flizow.css:47–62 — Same `--fs-md: 13px` issue from the Clients area, surfaces here in card modal + share modal. **Fix:** see cross-cutting theme.

- **[MED] Meta-table row gap (18px) tighter than column gap (32px)** — flizow.css:2546 — `row-gap: var(--sp-18); column-gap: var(--sp-4xl)` inverts proximity — items in the same row should feel grouped, but the column gap pushes them further than the row gap. **Fix:** swap to `row-gap: var(--sp-2xl); column-gap: var(--sp-xl)` or similar so same-row items hug.

- **[MED] Sidebar content padding doesn't anchor to font size** — flizow.css:3242 — `padding: var(--sp-18)` on a 13px / 20px-leading sidebar; padding doesn't scale with the text. **Fix:** use `var(--sp-lg)` (14px) or `var(--sp-base)` (12px).

- **[MED] Comment text caps at 65ch** — flizow.css:3293 — At 13px font the cap renders ~52–55 actual characters, just below the 45–70 cpl floor. Mixes character units with pixel widths elsewhere. **Fix:** raise to 70ch, or pin to a pixel width tied to the 420px sidebar.

- **[MED] Share-modal section padding asymmetric** — flizow.css:6980 — First section overrides with `padding-top: 14px`, others use 16px. **Fix:** unify all sections on the same padding token.

- **[MED] Swimlane sticky header z-index hardcoded** — flizow.css:2185 — `z-index: 3` with no z-layer map. If any column gets a higher z-index, header disappears. **Fix:** define `--z-sticky: 3` and reference everywhere.

- **[LOW] Arbitrary 11/13/15px font sizes outside the scale token** — flizow.css:414, 459, 487, 677 — Several selectors hardcode pixels. **Fix:** map to `--fs-xs / --fs-md / --fs-base`.

- **[LOW] Card modal body gap uses `--sp-26` (off-scale)** — flizow.css:2515 — Sits between `--sp-2xl` (24) and `--sp-3xl` (28). **Fix:** snap to one of the existing scale steps.

- **[LOW] Share modal max-height uses `min(85vh, 640px)` without breakpoint context** — flizow.css:6859 — Responsive but undocumented. **Fix:** add a comment explaining the constraint, or pin to a fixed 640px.

---

## Ops area

`src/pages/OpsPage.tsx`, `src/components/TeamCapacityHeatmap.tsx`

- **[HIGH] Subtitle uses `max-width: 70ch` like body prose does** — flizow.css:6277 — `.capacity-strip-sub` is a short label, not body prose; the 70ch cap reads like prose-width. **Fix:** drop the cap or set 60ch.

- **[HIGH] Hierarchy gap between page title (26px) and body (13px) is 2x** — OpsPage.tsx:357, flizow.css:12002 — No intermediate heading sizes; subsection titles end up using the same body size. **Fix:** add an h2/h3 step at 18–20px, or reduce title to 24px.

- **[HIGH] Heatmap rows have no explicit row-height** — TeamCapacityHeatmap.tsx:158 — `.cap-row` is `display: grid` with no `grid-template-rows`; row heights vary by content, breaking baseline alignment across rows. **Fix:** set `min-height: var(--lh-px-md)` (20px) or define explicit `grid-template-rows`.

- **[MED] Heatmap day-name (11px) and day-date (13px) jump on the same cell** — flizow.css:6462, 6471 — 2px scale jump within a single header. **Fix:** unify both to `--fs-xs` or both to `--fs-sm`.

- **[MED] `.ops-header-sub` declares 1.45 line-height; `.capacity-strip-sub` inherits silently** — flizow.css:12014, 6276 — Different surfaces use different leading patterns. **Fix:** declare `line-height: 1.45` on the strip-sub explicitly, or remove from header-sub and rely on `--lh-body` for both.

- **[MED] `.ops-tabs` gap (6px) tighter than tab padding (8/14px)** — flizow.css:6191 — Buttons feel cramped. **Fix:** raise gap to `var(--sp-sm)` (8px).

- **[MED] Notes panel body has no horizontal margin on wide viewports** — flizow.css:6276 — Prose can run flush to the panel edges. **Fix:** add `margin: 0 auto` or container padding.

- **[LOW] `.ops-header-stats` aligns to baseline** — flizow.css:12018 — When `blocked = 0` and the chip is hidden, alignment shifts. **Fix:** use `align-items: center` for layout stability.

- **[LOW] Cell-detail load badge has asymmetric padding (`4px 10px`)** — flizow.css:6640 — Most pills in the app are symmetric. **Fix:** standardise to `4px 12px`.

---

## Weekly WIP area

`src/pages/WipPage.tsx`

- **[HIGH] Pixel gaps and padding bypass the spacing scale** — flizow.css:13279, 13285, 13290, 13298, 13313, 13323, 13330 — `gap: 10px / 12px / 14px`, `padding: 10px 14px / 8px 10px` are hand-tuned. The token system exists but isn't referenced. **Fix:** swap to `var(--sp-md) / var(--sp-base) / var(--sp-lg)`.

- **[HIGH] Stage title leading at 1.2 is the floor** — flizow.css:13237 — `.wip-live-stage-title` is a display-sized heading; 1.2 leading is tight for that role. **Fix:** raise to 1.3.

- **[MED] Live timer leading (16px on 20px font) is off the baseline grid** — flizow.css:13246 — 0.8 ratio doesn't snap to 4px increments. **Fix:** `line-height: 1.25` (25px) or 1.3 (26px).

- **[MED] Agenda card row pins status pill at 96px** — flizow.css:12852 — `grid-template-columns: 20px 96px 1fr auto` locks the pill width; some statuses overflow, some look orphaned. **Fix:** swap to `20px auto 1fr auto`.

- **[MED] Field label gap (4px) too compressed** — flizow.css:13505, 13511, 13524 — Labels sit on top of inputs at `var(--sp-micro)` (4px); reads cramped. **Fix:** raise to `var(--sp-xs)` (6px).

- **[MED] Quick-capture buttons keep `min-width: 140px` on phones** — flizow.css:13330 — Three 140px buttons + 10px gaps don't fit narrow viewports. **Fix:** add a `@media (max-width: 640px)` rule reducing min-width or removing it.

- **[LOW] Quick-capture buttons read as hollow outlines, not filled CTAs** — flizow.css:13322 — `border + color` only, with subtle hover tint. Figure/ground weak. **Fix:** filled style or stronger hover (16% tint).

- **[LOW] Letter-spacing varies across nested labels without hierarchy** — flizow.css:12751, 13158, 13230 — `-0.01em / 0.08em` with no rule for which goes where. **Fix:** one tight track for UI labels, one open track for uppercase meta.

---

## Templates area

`src/pages/TemplatesPage.tsx`, `src/components/shared/ServiceMetadataForm.tsx`

- **[HIGH] Detail pane content runs to ~90 cpl** — flizow.css:13657 — `.template-detail-page` is `max-width: 820px` with 44px padding → 732px content width, ~90 cpl at 16px. Beyond the 70 cpl ceiling. **Fix:** reduce to 640–680px, or wrap prose sections in a 70ch inner container.

- **[HIGH] No explicit grid in detail pane** — flizow.css:13656 — `max-width` only; no documented column structure or baseline grid. **Fix:** declare the intent (single column? multi-column rows?) and snap children to a baseline.

- **[HIGH] Section spacing reads inverted** — flizow.css:13771, 13775 — 36px between sections, 14px between section header and content within a section — but visually the section-internal gap can feel close to the section-external gap depending on content. **Fix:** lock to a 36/16 ratio (external/internal) so the rhythm reads cleanly.

- **[MED] Checklist item spacing too tight** — flizow.css:14192 — `gap: var(--sp-nano)` between dot/label/remove. Cramped. **Fix:** raise to `var(--sp-xs)`.

- **[MED] Brief field pills lack baseline alignment** — flizow.css:14216 — Wrap row, no `align-items: baseline`. Pills can shift vertically when wrapping. **Fix:** add `align-items: baseline` and unify pill height.

- **[MED] Section title size matches the icon, not the visible hierarchy** — flizow.css:13777 — `.template-section-title` is uppercase 11px, but the icon (14px) feels louder than the label. **Fix:** clarify hierarchy — title 13–14px or icon 12px.

- **[MED] List pane padding inconsistent with header padding** — flizow.css:13608, 13590 — Header and list use different horizontal paddings (20px header, sp-sm list). Items don't align with the header. **Fix:** unify horizontal padding (16px or 20px).

- **[MED] List/header vertical rhythm undocumented** — flizow.css:13771 — Sections have margin-bottom 36px, header has margin-bottom 14px, no token. **Fix:** see the cross-cutting theme on margin tokens.

- **[LOW] Drag handle opacity (0.4) reads disabled** — flizow.css:13924 — Persistent affordance feels muted. **Fix:** raise to 0.6–0.7 at rest.

---

## Analytics area

`src/pages/AnalyticsPage.tsx`

- **[HIGH] KPI grid uses `repeat(5, 1fr)`** — flizow.css:14406 — On a 1240px max-width, columns are ~240px each; KPI labels (11–13 chars) sit far below 45 cpl. **Fix:** cap at 4 columns (`repeat(4, 1fr)`) or use `auto-fit` with `min-width: 200px`.

- **[HIGH] Workload grid columns rely on implicit fr ratios** — flizow.css:14656 — `minmax(0, 1.2fr) minmax(0, 1.6fr) 70px 64px 90px 20px` — content widths are derived from fr math. **Fix:** declare explicit pixels (`180px 240px 70px 64px 90px 20px`).

- **[HIGH] Filter option sub-label hardcodes 11px** — flizow.css:14391 — Should use a scale token. **Fix:** `var(--fs-nano)`.

- **[MED] Leading varies across sections without a baseline** — flizow.css:14292, 14459, 14518, 14625 — Some elements set `1.4`; others inherit silently. **Fix:** establish a baseline grid (24px) and set body leading to 1.5 across.

- **[MED] Drill-down panel margin (32px) doesn't match section margin (24px)** — flizow.css:14471, 14552 — Inconsistent visual weight. **Fix:** align to `--sp-xl`.

- **[MED] Drill + Workload row hover doesn't shift figure/ground** — flizow.css:14512, 14607, 14687 — `bg-soft` is barely visible against the page. **Fix:** add `border-left: 3px solid var(--highlight)` on hover, or increase elevation.

- **[MED] Drill rows lack baseline alignment** — flizow.css:14500 — Grid layout has fixed columns but no `align-items: baseline`; subtext shifts vertically against title. **Fix:** add `align-items: baseline`.

- **[LOW] Empty-state icon (32px) overpowers the body text** — AnalyticsPage.tsx:857, 1040 — Icon dominates the empty-state composition. **Fix:** reduce to 24px and bump margin-bottom to 12–14px.

- **[LOW] Section header doesn't constrain title vs subtitle wrapping** — flizow.css:14555 — On narrow viewports, subtitle wraps below title without a flex-wrap rule. **Fix:** `flex-wrap: wrap; align-items: flex-start;`.

---

## Account modal

`src/components/FlizowAccountModal.tsx`

- **[HIGH] Inline `style={{ fontSize: N }}` everywhere** — FlizowAccountModal.tsx:466, 557, 581, 590 — Pixel literals (11/12/13) bypass the `--fs-*` token system. Inline styles also fight CSS specificity. **Fix:** lift to CSS classes that use scale tokens.

- **[HIGH] Inline padding values (`8px 14px`, `0 14px`)** — FlizowAccountModal.tsx:570–606 — Off-scale spacing in inline button styles. **Fix:** lift to `.acct-*` classes; use spacing tokens.

- **[HIGH] Form-grid gap mismatch** — flizow.css:896 — `gap: 12px 14px` (row 12, column 14) creates inconsistent rhythm. Email full-width row leaves orphan alignment in the two-column zone. **Fix:** unify on a single gap (`var(--sp-base)` 12px) and verify all fields snap to a baseline.

- **[MED] Form labels have no declared line-height** — flizow.css:901 — 11px labels inherit browser default (~1.2). Wrapping is unpredictable. **Fix:** declare `line-height: 1.2`–`1.3` and `min-width` if labels should stay on one line.

- **[MED] Section header lacks vertical rhythm** — flizow.css:845 — Title has no line-height; sub margin-top is 2px (off the baseline grid). **Fix:** title 1.3–1.4 leading, sub margin-top `var(--sp-xs)` (6px).

- **[MED] Responsive collapse loses padding scale** — flizow.css:1128 — At max-width:720px, nav goes horizontal but content padding (22px 26px) stays unchanged; risk of clipping on phones. **Fix:** scale padding down responsively.

- **[MED] Members row baseline alignment unverified** — flizow.css:5168 — Avatar, role select, cap inputs share a flex row without explicit line-height continuity. **Fix:** verify `line-height: var(--lh-body)` on all row children.

- **[LOW] Section dividers use literal pixels (`marginTop: 18, paddingTop: 14`)** — FlizowAccountModal.tsx:556, 774 — Off-scale spacing. **Fix:** `var(--sp-xl) / var(--sp-base)`.

- **[LOW] Brand color hardcoded as `#F15A24`** — flizow.css:831, 923, 1023, 1036, 1109 — Token (`--highlight`) exists but isn't used. **Fix:** swap all literals to `var(--highlight)`.

---

## Recommended order

If shipping a single round, tackle in this order:

1. **The 13px body baseline decision** — pick: keep + document, or migrate to 14px. Affects every area.
2. **Cross-cutting cleanup** — convert inline `style={{ fontSize/padding }}` to classes; replace `--sp-18 / --sp-26` with on-scale tokens.
3. **High-severity findings per area** (18 items total) — listed above.
4. **MED items** as a polish pass.
5. **LOW items** opportunistically.

---

*Generated 2026-04-28 from 7 parallel `/Users/nikko/Documents/Claude/skills/grids-and-layout-design.md` audits. Skipped: Overview page + its inline popovers (DayCap, Delegate, Welcome banner).*
