import type { Member, JobTitle, JobTitleKind } from '../types/flizow';

/**
 * Job-title helpers — pure functions for reading the workspace job-
 * title catalog and projecting a member's effective category.
 *
 * Why these live in their own module:
 *   - Three separate consumers (avatar styling, AM filtering, profile
 *     panel display) all need the same lookup. One source of truth.
 *   - Migration logic + default seed values live next to the data
 *     they describe — fewer places to keep in sync.
 *   - Pure ⇒ trivial unit tests (no React, no store).
 *
 * Audit: roles + job-titles Phase 2.
 */

// ── Default seed list ──────────────────────────────────────────────

/** Five default job titles seeded the first time a workspace loads
 *  after Phase 2 ships. The IDs are stable string slugs (not random
 *  UUIDs) so the migration from `Member.type` ('am' | 'operator') to
 *  `Member.jobTitleId` is deterministic across reloads — we don't
 *  generate fresh ids every time the seed runs. */
export const DEFAULT_JOB_TITLES: ReadonlyArray<JobTitle> = [
  {
    id: 'jt-account-manager',
    label: 'Account Manager',
    kind: 'account-manager',
    color: '#5e5ce6',
    active: true,
  },
  {
    id: 'jt-designer',
    label: 'Designer',
    kind: 'operator',
    color: '#ff375f',
    active: true,
  },
  {
    id: 'jt-strategist',
    label: 'Strategist',
    kind: 'operator',
    color: '#bf5af2',
    active: true,
  },
  {
    id: 'jt-operator',
    label: 'Operator',
    kind: 'operator',
    color: '#30d158',
    active: true,
  },
  {
    id: 'jt-manager',
    label: 'Manager',
    kind: 'operator',
    color: '#ff9f0a',
    active: true,
  },
] as const;

/** Stable ids for the two seed titles the migration writes onto
 *  legacy members. Exposed as constants so the migration code can
 *  reference them without hard-coding string literals in two places. */
export const SEED_JOB_TITLE_ID_AM = 'jt-account-manager';
export const SEED_JOB_TITLE_ID_OPERATOR = 'jt-operator';

// ── Lookups ────────────────────────────────────────────────────────

/** Find a JobTitle by id. Returns undefined when the id doesn't
 *  resolve — caller decides the fallback (display "Untitled," skip
 *  the pill, etc.). */
export function findJobTitle(
  jobTitles: ReadonlyArray<JobTitle>,
  id: string | undefined,
): JobTitle | undefined {
  if (!id) return undefined;
  return jobTitles.find((jt) => jt.id === id);
}

/** Find a JobTitle by exact label match. Used when migrating legacy
 *  free-text `Member.role` strings into the catalog so an existing
 *  "Designer" string round-trips into the seeded "Designer" entry
 *  rather than orphaning. Case-insensitive. */
export function findJobTitleByLabel(
  jobTitles: ReadonlyArray<JobTitle>,
  label: string | undefined,
): JobTitle | undefined {
  if (!label) return undefined;
  const lc = label.trim().toLowerCase();
  return jobTitles.find((jt) => jt.label.toLowerCase() === lc);
}

// ── Member projections ─────────────────────────────────────────────

/** The member's effective JobTitleKind. Used everywhere the old code
 *  said `member.type === 'am'` or `member.type === 'operator'`.
 *
 *  Resolution order:
 *    1. The JobTitle pointed to by `member.jobTitleId` (canonical)
 *    2. Member.type as a literal fallback ('am' → 'account-manager',
 *       'operator' → 'operator') for legacy data not yet migrated
 *    3. 'operator' as the safe default (most members are operators) */
export function memberKind(
  member: Pick<Member, 'jobTitleId' | 'type'>,
  jobTitles: ReadonlyArray<JobTitle>,
): JobTitleKind {
  const jt = findJobTitle(jobTitles, member.jobTitleId);
  if (jt) return jt.kind;
  if (member.type === 'am') return 'account-manager';
  if (member.type === 'operator') return 'operator';
  return 'operator';
}

/** Is this member an account manager? Wrapper for the most common
 *  filtering case (assignee pickers, the AM column on a client). */
export function isAccountManager(
  member: Pick<Member, 'jobTitleId' | 'type'>,
  jobTitles: ReadonlyArray<JobTitle>,
): boolean {
  return memberKind(member, jobTitles) === 'account-manager';
}

/** Is this member an operator? Wrapper for the inverse case (team
 *  pickers, ops board assignees). */
export function isOperator(
  member: Pick<Member, 'jobTitleId' | 'type'>,
  jobTitles: ReadonlyArray<JobTitle>,
): boolean {
  return memberKind(member, jobTitles) === 'operator';
}

/** The displayable label for a member's job title. Falls back to
 *  the legacy free-text `Member.role` field when no jobTitleId
 *  resolves, so a partially migrated workspace still shows something
 *  human-readable. Returns empty string when nothing is available
 *  (caller decides whether to render a pill at all). */
export function memberJobTitleLabel(
  member: Pick<Member, 'jobTitleId' | 'role' | 'type'>,
  jobTitles: ReadonlyArray<JobTitle>,
): string {
  const jt = findJobTitle(jobTitles, member.jobTitleId);
  if (jt) return jt.label;
  if (member.role && member.role.trim().length > 0) return member.role.trim();
  // Last-ditch fallback derived from the legacy MemberType binary.
  // Better than blank — at least communicates rough category until
  // the owner categorises the member explicitly.
  if (member.type === 'am') return 'Account Manager';
  return '';
}

// ── Migration ──────────────────────────────────────────────────────

/** Decide which jobTitleId to write onto a legacy member during the
 *  one-time Phase-2 migration. Resolution order:
 *    1. If the member already has a jobTitleId that resolves, keep it.
 *    2. If `member.role` (free text) matches a catalog label exactly,
 *       use that — preserves "Designer", "Strategist", etc.
 *    3. Fall back to the seeded AM or Operator id based on
 *       `Member.type`.
 *  Returns undefined when there's no catalog to resolve against (the
 *  caller should seed defaults first). */
export function pickMigratedJobTitleId(
  member: Pick<Member, 'jobTitleId' | 'role' | 'type'>,
  jobTitles: ReadonlyArray<JobTitle>,
): string | undefined {
  if (jobTitles.length === 0) return undefined;
  // Already migrated — keep what we have.
  if (member.jobTitleId && findJobTitle(jobTitles, member.jobTitleId)) {
    return member.jobTitleId;
  }
  // Free-text role matches a catalog label?
  const labelMatch = findJobTitleByLabel(jobTitles, member.role);
  if (labelMatch) return labelMatch.id;
  // Fall back on the legacy binary.
  if (member.type === 'am') {
    const am = findJobTitle(jobTitles, SEED_JOB_TITLE_ID_AM);
    if (am) return am.id;
  }
  const op = findJobTitle(jobTitles, SEED_JOB_TITLE_ID_OPERATOR);
  return op?.id;
}
