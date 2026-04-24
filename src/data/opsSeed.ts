/**
 * Ops board seed — the six internal team members + the twelve starter
 * cards that populate the Ops board on first load. Lifted wholesale from
 * the mockup so the first impression matches what Nikko's been clicking
 * around for weeks.
 *
 * Seeding rules live in `flizowStore.migrate()`. Both pools fire together
 * the first time a workspace loads without any ops-team members — after
 * that the store treats them like any other user-editable row.
 */

import type { Member, OpsTask } from '../types/flizow';

/** Stable member ids. Everything else references these, including the
 *  `assigneeId` field on each OpsTask seed below. Keeping them as string
 *  constants (not UUIDs) means the seed is readable as pure data. */
export const OPS_MEMBER_IDS = {
  rc: 'ops-rc',
  kl: 'ops-kl',
  cc: 'ops-cc',
  hs: 'ops-hs',
  jc: 'ops-jc',
  sc: 'ops-sc',
} as const;

/**
 * Six-person internal team. Types set to `operator` so the avatar
 * renders with the soft-background pattern the CSS already handles for
 * ops folks (see `.assignee-chip[data-type=operator]` in flizow.css).
 * Colours picked to stay distinct without colliding with the AM palette
 * the client rows use.
 */
export const OPS_TEAM_MEMBERS: Member[] = [
  {
    id: OPS_MEMBER_IDS.rc,
    name: 'Ryan Castro',
    initials: 'RC',
    role: 'COO',
    type: 'operator',
    color: '#1e3a8a',
    bg: '#dbeafe',
  },
  {
    id: OPS_MEMBER_IDS.kl,
    name: 'Kayleigh Lin',
    initials: 'KL',
    role: 'People Ops Lead',
    type: 'operator',
    color: '#0f766e',
    bg: '#ccfbf1',
  },
  {
    id: OPS_MEMBER_IDS.cc,
    name: 'Celina Cruz',
    initials: 'CC',
    role: 'Brand Director',
    type: 'operator',
    color: '#be185d',
    bg: '#fce7f3',
  },
  {
    id: OPS_MEMBER_IDS.hs,
    name: 'Hiro Sato',
    initials: 'HS',
    role: 'Creative Director',
    type: 'operator',
    color: '#6d28d9',
    bg: '#ede9fe',
  },
  {
    id: OPS_MEMBER_IDS.jc,
    name: 'Joshua Castilla',
    initials: 'JC',
    role: 'Senior AM',
    type: 'operator',
    color: '#047857',
    bg: '#d1fae5',
  },
  {
    id: OPS_MEMBER_IDS.sc,
    name: 'Sarah Chen',
    initials: 'SC',
    role: 'Growth Analyst',
    type: 'operator',
    color: '#c2410c',
    bg: '#ffedd5',
  },
];

/**
 * Twelve starter cards mirroring the mockup's Ops board. Fields match
 * the mockup exactly so the first render is pixel-identical — once the
 * team starts editing we treat these like any other stored row. The
 * `createdAt` timestamps use the seed date rather than load-time so
 * the same card doesn't re-appear as "just added" on every migration.
 *
 * IDs use an `ops-` prefix so they can't collide with client task ids
 * (which start with `t-` or `{serviceId}-starter-N`).
 */
const SEED_DATE = '2026-04-15T09:00:00.000Z';

export const OPS_TASK_SEED: OpsTask[] = [
  { id: 'ops-1',  columnId: 'todo',       priority: 'high',   labels: ['Hiring'],  assigneeId: OPS_MEMBER_IDS.kl, dueDate: '2026-04-24', title: 'Post Social Media Manager listing on LinkedIn and WeWorkRemotely', comments: 2, createdAt: SEED_DATE },
  { id: 'ops-2',  columnId: 'todo',       priority: 'medium', labels: ['Legal'],   assigneeId: OPS_MEMBER_IDS.rc, dueDate: '2026-04-28', title: 'Review Q2 retainer contracts — Acme, Summit, Cascade', comments: 1, attachments: 3, createdAt: SEED_DATE },
  { id: 'ops-3',  columnId: 'todo',       priority: 'medium', labels: ['Process'], assigneeId: OPS_MEMBER_IDS.rc, title: 'Draft team offsite agenda — June in Tahoe', comments: 4, createdAt: SEED_DATE },

  { id: 'ops-4',  columnId: 'inprogress', priority: 'high',   labels: ['Hiring'],  assigneeId: OPS_MEMBER_IDS.kl, dueDate: '2026-04-26', title: 'Build internal hiring pipeline in Ashby ATS', comments: 6, attachments: 2, createdAt: SEED_DATE },
  { id: 'ops-5',  columnId: 'inprogress', priority: 'high',   labels: ['Finance'], assigneeId: OPS_MEMBER_IDS.rc, dueDate: '2026-05-01', title: 'Migrate invoicing from Wave to QuickBooks Online', comments: 4, attachments: 1, createdAt: SEED_DATE },
  { id: 'ops-6',  columnId: 'inprogress', priority: 'medium', labels: ['Brand'],   assigneeId: OPS_MEMBER_IDS.cc, title: 'Refresh agency pricing sheet for 2026 retainers', comments: 2, createdAt: SEED_DATE },

  { id: 'ops-7',  columnId: 'blocked',    priority: 'high',   labels: ['Legal'],   assigneeId: OPS_MEMBER_IDS.rc, enteredDaysAgo: 2, overrideMod: 'due-blocked', overrideLabel: 'Blocked · 2d', title: 'Sign new office lease — waiting on landlord redlines', comments: 3, attachments: 2, createdAt: SEED_DATE },

  { id: 'ops-8',  columnId: 'review',     priority: 'medium', labels: ['Process'], assigneeId: OPS_MEMBER_IDS.kl, enteredDaysAgo: 3, overrideMod: 'due-waiting', overrideLabel: 'Waiting · 3d', title: 'Employee handbook v2 — final draft for legal review', comments: 8, attachments: 1, createdAt: SEED_DATE },
  { id: 'ops-9',  columnId: 'review',     priority: 'medium', labels: ['Brand'],   assigneeId: OPS_MEMBER_IDS.hs, enteredDaysAgo: 1, overrideMod: 'due-waiting', overrideLabel: 'Waiting · 1d', title: 'Portfolio case studies — 3 new drafts for site relaunch', comments: 5, attachments: 3, createdAt: SEED_DATE },

  { id: 'ops-10', columnId: 'done',       priority: 'medium', labels: ['Hiring'],  assigneeId: OPS_MEMBER_IDS.rc, title: 'Onboard Michael Potts — Paid Social Manager', comments: 9, createdAt: SEED_DATE },
  { id: 'ops-11', columnId: 'done',       priority: 'low',    labels: ['Tools'],   assigneeId: OPS_MEMBER_IDS.cc, title: 'Upgrade Notion workspace to Business plan', comments: 1, createdAt: SEED_DATE },
  { id: 'ops-12', columnId: 'done',       priority: 'medium', labels: ['Process'], assigneeId: OPS_MEMBER_IDS.rc, title: 'Q1 retro slide deck and action items', comments: 6, attachments: 2, createdAt: SEED_DATE },
];
