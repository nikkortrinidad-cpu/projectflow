# pm-tool-qa

QA documentation for the 121 Group agency PM tool (the portal at
`dev.portal.121group.io/projects-v2/`).

This folder is the single source of truth for QA findings going
forward. Every QA round Nikko runs against the portal generates a
markdown file here. The dev (Mark) reads from this folder directly on
GitHub — no conversion step, no separate Drive copy.

## Format

All QA docs are plain markdown (`.md`). No PDFs, no DOCX. The dev
prefers markdown because it renders natively on GitHub, diffs cleanly
in pull requests, and doesn't need to be converted before reading.

## Naming convention

Match the surface being QA'd + the round number:

```
[surface]-qa-round[N].md
```

Examples:

- `clients-page-qa-round7.md`
- `home-page-qa-round6.md`
- `kanban-board-qa-round2.md`
- `templates-page-qa-round7.md`
- `account-settings-qa-round3.md`

For one-off audits or workflow walks that aren't tied to a single
surface, use a descriptive name with a date prefix:

```
[YYYY-MM-DD]-[topic]-qa.md
```

Examples:

- `2026-05-15-client-lifecycle-qa.md`
- `2026-05-15-time-off-qa.md`

## Document structure

Each QA doc has the same shape so Mark knows what to expect:

1. **Header** — title, date, summary counts (HIGH / MED / LOW / INFO).
2. **Lede** — short paragraph framing what was tested, the headline
   finding, and what to triage first.
3. **Findings**, grouped first by **Functional** then **Cosmetic**,
   then ordered HIGH → MED → LOW → INFO within each group.
4. Each finding carries two tags inline:
   - **Severity**: HIGH / MED / LOW / INFO
   - **History**: NEW (surfaced this round) or FROM PREVIOUS QA
     (carried over from a prior round)
5. Each finding has four labelled body sections:
   - **Where to see** — the click path to reproduce on the portal.
   - **Portal (today)** — what the portal currently does.
   - **Original (source build)** — what the
     `nikkortrinidad-cpu.github.io/flizow/` mockup does (the target
     behaviour Mark is matching against).
   - **How to ship** — concrete code-shape suggestion for Mark.

## Severity legend

- **HIGH** — blocks the workflow, breaks data, or materially
  diverges from intent. Triage first.
- **MED** — workflow degraded but works. Important polish.
- **LOW** — visual polish or minor wording drift. Backlog-tier.
- **INFO** — matches the original or working as intended.
  Confirmations the dev can quickly scan.

## Functional vs Cosmetic

- **Functional findings** — behaviour issues. Clicks that don't
  work, data that doesn't save, calculations that are wrong,
  permissions that fail, modals that open in the wrong shape.
- **Cosmetic findings** — visual deviations. Wrong colour token,
  wrong font weight, sentence case vs UPPERCASE, missing icon,
  spacing drift, etc.

Functional comes first in every doc because it's what blocks
launch. Cosmetic items are usually backlog-tier unless they're
severe enough to bump to HIGH.

## Historical archive

QA docs from before this folder existed live in
[`docs/qa-comparison/`](../docs/qa-comparison/) in the same repo.
Those are frozen PDFs / one DOCX kept as a paper trail of what was
flagged when. Don't update or delete them — they're the audit log.

Anything from this point forward lands here as `.md`.

## Reading order for the dev

If you only have time to read one finding per doc, read the first
**Functional HIGH** entry. That's whatever's hurting the workflow
most. The doc lede also names the headline finding in the first
sentence, so you can grep for the worst issue without opening the
sections.

`FROM PREVIOUS QA` chips mark items that have been flagged in
prior rounds. Triage those before the `NEW` items in the same
severity bucket — the carry-over count is the cleanest signal of
where the backlog is building up.
