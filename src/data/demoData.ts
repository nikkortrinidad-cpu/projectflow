import type {
  FlizowData, Client, Service, Task, Integration, OnboardingItem,
  Contact, QuickLink, Note, Touchpoint, ActionItem, TaskComment,
  ColumnId, Priority, IndustryCategory, TemplateKey,
  ServiceType, TaskSeverity, ScheduleMeta,
} from '../types/flizow';
import { CLIENT_SEEDS, type ClientSeed } from './demoClientSeeds';
import { DEMO_AMS, OPS_TEAM } from './demoRosters';
import { OPS_TASK_SEED } from './opsSeed';
import { ONBOARDING_TEMPLATES, slugifyLabel } from './onboardingTemplates';
import { TASK_POOLS as SHARED_TASK_POOLS } from './taskPools';
import { DEFAULT_JOB_TITLES } from '../utils/jobTitles';

/**
 * Port of the mockup's window.FLIZOW_DATA generator
 * (public/flizow-test.html ~25200–25560). Deterministic — same seeds +
 * same `today` produce the same output, so the demo never shifts under
 * the user's feet between page loads.
 *
 * Call generateDemoData() to get a fully populated FlizowData bundle
 * ready to hand to flizowStore.replaceAll().
 */

// ── Deterministic helpers ────────────────────────────────────────────────

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

// ── Category classification ──────────────────────────────────────────────

/** Regex map from the industry string on a client seed to one of the
 *  ten service-template categories. Order matters — `professional` is
 *  the default fallback. */
const INDUSTRY_CATEGORY: Array<[IndustryCategory, RegExp]> = [
  ['saas',         /Tech|SaaS|Developer/i],
  ['ecommerce',    /E-commerce|Retail · (Fashion|Outdoor|Surf|Water|Handcraft|Floral|jewelry|Fine)/i],
  ['healthcare',   /Healthcare|Biotech|Fitness|Rehab/i],
  ['fnb',          /F&B|Agriculture/i],
  ['education',    /Education|EdTech/i],
  ['professional', /Legal|Finance|FinTech|Professional · Agency|Accounting|Architecture/i],
  ['realestate',   /Real Estate|Hospitality|Travel/i],
  ['services',     /Services · (HVAC|Electrical|Movers|Cybersecurity)/i],
  ['industrial',   /Manufacturing|Aerospace|Automotive|Energy|Logistics/i],
  ['media',        /Media|Gaming|Beauty/i],
];

function categoryFor(industry: string): IndustryCategory {
  for (const [cat, re] of INDUSTRY_CATEGORY) if (re.test(industry)) return cat;
  return 'professional';
}

// ── Service templates + task pools ───────────────────────────────────────

interface ServiceTemplateDef {
  name: string;
  type: ServiceType;
  pool: TemplateKey;
}

const SERVICE_TEMPLATES: Record<IndustryCategory, ServiceTemplateDef[]> = {
  saas: [
    { name: 'Demand Gen Retainer',     type: 'retainer', pool: 'demandgen' },
    { name: 'Content & SEO',           type: 'retainer', pool: 'contentSEO' },
    { name: 'Product Launch',          type: 'project',  pool: 'launch' },
    { name: 'Conversion Optimization', type: 'retainer', pool: 'cro' },
  ],
  ecommerce: [
    { name: 'Paid Social & Shopping', type: 'retainer', pool: 'paidSocial' },
    { name: 'Email Marketing',        type: 'retainer', pool: 'email' },
    { name: 'Seasonal Campaign',      type: 'project',  pool: 'seasonal' },
    { name: 'Site CRO',               type: 'retainer', pool: 'cro' },
  ],
  healthcare: [
    { name: 'Local SEO & Reviews',  type: 'retainer', pool: 'localSEO' },
    { name: 'Patient Acquisition',  type: 'retainer', pool: 'paidLead' },
    { name: 'Content & Compliance', type: 'retainer', pool: 'contentSEO' },
    { name: 'Reputation Rebuild',   type: 'project',  pool: 'reputation' },
  ],
  fnb: [
    { name: 'Social & Influencer',  type: 'retainer', pool: 'social' },
    { name: 'Photography Retainer', type: 'retainer', pool: 'photo' },
    { name: 'Local SEO',            type: 'retainer', pool: 'localSEO' },
    { name: 'Product Launch',       type: 'project',  pool: 'launch' },
  ],
  education: [
    { name: 'Enrollment Funnel',   type: 'retainer', pool: 'paidLead' },
    { name: 'Email Nurture',       type: 'retainer', pool: 'email' },
    { name: 'Content Marketing',   type: 'retainer', pool: 'contentSEO' },
  ],
  professional: [
    { name: 'LinkedIn & PR',    type: 'retainer', pool: 'linkedin' },
    { name: 'Content & SEO',    type: 'retainer', pool: 'contentSEO' },
    { name: 'Website Redesign', type: 'project',  pool: 'website' },
  ],
  realestate: [
    { name: 'Photography & Video', type: 'retainer', pool: 'photo' },
    { name: 'Paid Social',         type: 'retainer', pool: 'paidSocial' },
    { name: 'Email & CRM',         type: 'retainer', pool: 'email' },
  ],
  services: [
    { name: 'Google Ads',          type: 'retainer', pool: 'paidLead' },
    { name: 'Local SEO & Reviews', type: 'retainer', pool: 'localSEO' },
    { name: 'Website Refresh',     type: 'project',  pool: 'website' },
  ],
  industrial: [
    { name: 'PR & Case Studies',   type: 'retainer', pool: 'linkedin' },
    { name: 'Content Marketing',   type: 'retainer', pool: 'contentSEO' },
    { name: 'Trade Show Campaign', type: 'project',  pool: 'seasonal' },
  ],
  media: [
    { name: 'Creator & Influencer', type: 'retainer', pool: 'social' },
    { name: 'Video Production',     type: 'retainer', pool: 'photo' },
    { name: 'Launch Campaign',      type: 'project',  pool: 'launch' },
  ],
};

// The demo task pool deliberately keeps the two project-specific templates
// empty — demoData hardcodes their Acme tasks below. The shared pool in
// ./taskPools.ts keeps those templates populated for real addService calls.
const TASK_POOLS: Record<TemplateKey, string[]> = {
  ...SHARED_TASK_POOLS,
  'web-design-full-stack': [],
  'brand-refresh': [],
};

// ── Schedule seeds ───────────────────────────────────────────────────────

interface ScheduleSeed {
  id: string;
  clientId: string;
  pool: TemplateKey;
  title: string;
  columnId: ColumnId;
  priority: Priority;
  severity?: TaskSeverity;
  /** Days from this week's Monday. 0–4 = Mon–Fri this week; 7–11 next. */
  dayOffset: number;
  tag: ScheduleMeta['tag'];
  meta: string;
  done?: boolean;
}

const SCHEDULE_SEEDS: ScheduleSeed[] = [
  { id: 'seo-audit',            clientId: 'techstart-inc',  pool: 'contentSEO', title: 'TechStart SEO audit final delivery',          columnId: 'review',     priority: 'urgent', severity: 'warning', dayOffset: 0,  tag: 'deadline',  meta: 'Chris Castellano · Running 2 days behind' },
  { id: 'bloom-deck',           clientId: 'bloom-retail',   pool: 'email',      title: 'Bloom Retail reporting deck',                  columnId: 'review',     priority: 'high',   severity: 'warning', dayOffset: 0,  tag: 'deadline',  meta: 'Kate Lawrence · Client meeting at 9am' },
  { id: 'polaris-kickoff',      clientId: 'polaris-aero',   pool: 'contentSEO', title: 'Polaris Aero kickoff meeting',                 columnId: 'done',       priority: 'medium',                      dayOffset: 1,  tag: 'meeting',   meta: '10:00 AM · New client onboarding', done: true },
  { id: 'vertex-scope',         clientId: 'vertex-finance', pool: 'launch',     title: 'Vertex Finance scope change decision',         columnId: 'inprogress', priority: 'urgent', severity: 'warning', dayOffset: 2,  tag: 'deadline',  meta: 'Your sign-off needed by EOD' },
  { id: 'echo-api',             clientId: 'echo-voiceai',   pool: 'demandgen',  title: 'Echo Voice AI API credentials follow-up',      columnId: 'todo',       priority: 'medium',                      dayOffset: 2,  tag: 'deadline',  meta: "Client IT still hasn't responded" },
  { id: 'acme-wireframes',      clientId: 'acme-corp',      pool: 'contentSEO', title: 'Acme wireframes v3 internal review',           columnId: 'inprogress', priority: 'high',                        dayOffset: 2,  tag: 'meeting',   meta: 'Harvey San Juan · Prep before Thu stakeholder call' },
  { id: 'bloom-q2',             clientId: 'bloom-retail',   pool: 'seasonal',   title: 'Bloom Retail Q2 plan — team alignment',        columnId: 'inprogress', priority: 'medium',                      dayOffset: 2,  tag: 'meeting',   meta: '11:00 AM · Kate Lawrence presenting draft' },
  { id: 'summit-calendar',      clientId: 'summit-outdoor', pool: 'paidSocial', title: 'Summit Outdoor content calendar sign-off',     columnId: 'review',     priority: 'medium',                      dayOffset: 2,  tag: 'deadline',  meta: 'May publishing schedule needs approval' },
  { id: 'riverbank-sow',        clientId: 'riverbank-law',  pool: 'linkedin',   title: 'Riverbank Law SOW draft review',               columnId: 'todo',       priority: 'high',                        dayOffset: 2,  tag: 'deadline',  meta: 'New client · Contract terms need your input' },
  { id: 'acme-review',          clientId: 'acme-corp',      pool: 'cro',        title: 'Acme design review — stakeholder walkthrough', columnId: 'inprogress', priority: 'high',                        dayOffset: 3,  tag: 'meeting',   meta: '2:00 PM · Harvey San Juan presenting' },
  { id: 'acme-launch',          clientId: 'acme-corp',      pool: 'cro',        title: 'Acme website launch target',                   columnId: 'inprogress', priority: 'urgent', severity: 'warning', dayOffset: 4,  tag: 'milestone', meta: 'At risk — waiting on client feedback' },
  { id: 'bloom-ads',            clientId: 'bloom-retail',   pool: 'cro',        title: 'Bloom Retail paid ads — performance report',   columnId: 'inprogress', priority: 'medium',                      dayOffset: 4,  tag: 'milestone', meta: 'SEM team · First-week results' },
  { id: 'nw-bloom-retro',       clientId: 'bloom-retail',   pool: 'seasonal',   title: 'Bloom Retail campaign retro',                  columnId: 'todo',       priority: 'medium',                      dayOffset: 7,  tag: 'meeting',   meta: '10:00 AM · Full team debrief' },
  { id: 'nw-polaris-checkin',   clientId: 'polaris-aero',   pool: 'contentSEO', title: 'Polaris Aero 1-week check-in',                 columnId: 'todo',       priority: 'low',                         dayOffset: 8,  tag: 'meeting',   meta: '2:00 PM · Post-kickoff progress review' },
  { id: 'nw-summit-publish',    clientId: 'summit-outdoor', pool: 'paidSocial', title: 'Summit Outdoor May content goes live',         columnId: 'todo',       priority: 'medium',                      dayOffset: 8,  tag: 'milestone', meta: 'First batch of scheduled posts' },
  { id: 'nw-acme-revisions',    clientId: 'acme-corp',      pool: 'contentSEO', title: 'Acme design revisions due',                    columnId: 'todo',       priority: 'high',                        dayOffset: 9,  tag: 'deadline',  meta: 'Harvey San Juan · Based on Thu feedback' },
  { id: 'nw-riverbank-kickoff', clientId: 'riverbank-law',  pool: 'linkedin',   title: 'Riverbank Law project kickoff',                columnId: 'todo',       priority: 'medium',                      dayOffset: 10, tag: 'meeting',   meta: '11:00 AM · New client onboarding' },
  { id: 'nw-vertex-delivery',   clientId: 'vertex-finance', pool: 'launch',     title: 'Vertex Finance mobile module spec delivery',   columnId: 'todo',       priority: 'high',                        dayOffset: 11, tag: 'deadline',  meta: 'End of sprint 1 · Scope approved this week' },
];

const INTEGRATION_POOL = ['Google Analytics','Google Ads','Meta Ads','HubSpot','Salesforce','Klaviyo','Slack','Figma','Notion','Shopify'];

// ── Derived values ───────────────────────────────────────────────────────

/** Skew the kanban column distribution by how far along the service is. */
function distributeColumn(progress: number, i: number, _n: number, seed: number): ColumnId {
  const r = (seed + i * 31) % 100;
  if (progress < 20) return r < 70 ? 'todo' : 'inprogress';
  if (progress < 40) return r < 35 ? 'todo' : (r < 75 ? 'inprogress' : 'review');
  if (progress < 70) return r < 15 ? 'todo' : (r < 55 ? 'inprogress' : (r < 80 ? 'review' : 'done'));
  return r < 10 ? 'inprogress' : (r < 30 ? 'review' : 'done');
}

function progressForStatus(status: ClientSeed['status'], seed: number): number {
  const map: Record<ClientSeed['status'], number> = {
    fire:    30 + (seed % 20),
    risk:    40 + (seed % 20),
    track:   60 + (seed % 30),
    onboard: 5  + (seed % 15),
    paused:  seed % 5,
  };
  return map[status];
}

// mrrForCategory() lived here. Removed 2026-04-26 along with the
// mrr field on Client.

// ── Date helpers ─────────────────────────────────────────────────────────

function todayAnchor(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysFromTodayISO(today: Date, offset: number): string {
  return isoFromDate(new Date(today.getTime() + offset * 86_400_000));
}

// ── Onboarding seeding ───────────────────────────────────────────────────

interface OnboardingOpts {
  /** Client status — drives the default done ratio when `doneLabels` isn't
   *  passed. `'onboard'` → partial (~55% done). Anything else → fully done,
   *  because the setup is long over for a client who's been live for months. */
  status?: ClientSeed['status'];
  /** Explicit "these exact labels are done" override. Used by the Acme
   *  extras so the mockup's 4/7 and 3/6 progress bars reproduce verbatim
   *  no matter what the status-based heuristic would say. */
  doneLabels?: Set<string>;
  /** Stir-value for the `onboard`-status partial distribution. Different
   *  seeds give each service a distinct spread so the UI isn't marking the
   *  same three positions done on every card. */
  seed?: number;
}

/**
 * Expand a template's checklist into concrete OnboardingItem rows.
 *
 * Labels come from ONBOARDING_TEMPLATES keyed by the service's template.
 * Done-state is either drawn from an explicit set (`doneLabels`) or derived
 * from the client's status: `'onboard'` clients land with a partial,
 * deterministic mix so the tab has real work to chip through, and every
 * other status gets "all done" because by the time a client is on-track /
 * at-risk / paused, setup is a closed book.
 */
function buildOnboardingItems(
  serviceId: string,
  templateKey: TemplateKey,
  opts: OnboardingOpts,
): OnboardingItem[] {
  const template = ONBOARDING_TEMPLATES[templateKey];
  if (!template) return [];

  const { status, doneLabels, seed = 0 } = opts;
  const items: OnboardingItem[] = [];
  let idx = 0;

  const push = (group: 'client' | 'us', label: string) => {
    let done: boolean;
    if (doneLabels) {
      done = doneLabels.has(label);
    } else if (status === 'onboard') {
      // ~55% done, deterministically scattered. Keeps the checklist
      // visibly live instead of "all green" or "all empty".
      done = ((seed * 31 + idx * 17) % 100) < 55;
    } else {
      done = true;
    }
    items.push({
      id: `${serviceId}-${slugifyLabel(label)}`,
      serviceId,
      group,
      label,
      done,
    });
    idx++;
  };

  template.client.forEach(label => push('client', label));
  template.us.forEach(label => push('us', label));
  return items;
}

// ── Contact / quick-link seeding ─────────────────────────────────────────

const CONTACT_NAMES = [
  'Sarah Chen',      'Marcus Rivera',   'Priya Patel',     'James Oduya',
  'Elena Moretti',   'Diego Fernandez', 'Amara Okonkwo',   'Lina Tran',
  'Owen Mitchell',   'Hana Watanabe',   'Nikolai Volkov',  'Farida Haddad',
  'Robert Langston', 'Ines Ribeiro',    'Tomas Svensson',  'Layla Martin',
] as const;

const CONTACT_ROLES = [
  'VP Marketing',         'Head of Growth',      'Marketing Director',
  'Chief Marketing Officer', 'Director of Digital', 'Brand Manager',
  'Founder & CEO',        'Head of Demand Gen',  'Product Marketing Lead',
  'Operations Lead',      'Head of Partnerships', 'Chief of Staff',
] as const;

function slugDomain(clientName: string): string {
  return clientName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24) || 'client';
}

function emailOf(fullName: string, domain: string): string {
  const first = fullName.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
  return `${first}@${domain}.com`;
}

function buildContacts(clientId: string, clientName: string, seed: number): Contact[] {
  const count = 2 + (seed % 3); // 2–4 contacts
  const domain = slugDomain(clientName);
  const out: Contact[] = [];
  for (let i = 0; i < count; i++) {
    const name = CONTACT_NAMES[(seed + i * 7) % CONTACT_NAMES.length];
    const role = CONTACT_ROLES[(seed + i * 11) % CONTACT_ROLES.length];
    out.push({
      id: `${clientId}-contact-${i}`,
      clientId,
      name,
      role,
      email: emailOf(name, domain),
      // Roughly one in three carries a phone — keeps the list from
      // feeling uniform.
      phone: (seed + i) % 3 === 0
        ? `+1 (415) 555-${String(((seed + i * 41) % 10000)).padStart(4, '0')}`
        : undefined,
      primary: i === 0,
    });
  }
  return out;
}

interface QuickLinkDef {
  label: string;
  urlFor: (domain: string, clientId: string) => string;
  icon: NonNullable<QuickLink['icon']>;
}

const QUICK_LINK_CATALOG: QuickLinkDef[] = [
  { label: 'Website',       urlFor: d => `https://${d}.com`,                icon: 'globe' },
  { label: 'Shared Drive',  urlFor: (_d, cid) => `https://drive.google.com/drive/folders/${cid}`, icon: 'drive' },
  { label: 'Brand Guide',   urlFor: (_d, cid) => `https://docs.google.com/document/d/${cid}-brand`, icon: 'doc' },
  { label: 'Design Files',  urlFor: (_d, cid) => `https://figma.com/files/team/${cid}`, icon: 'figma' },
  { label: 'Asset Library', urlFor: (_d, cid) => `https://drive.google.com/drive/folders/${cid}-assets`, icon: 'folder' },
  { label: 'Status Portal', urlFor: (_d, cid) => `https://flizow.app/c/${cid}`, icon: 'link' },
];

// ── Notes seeding ────────────────────────────────────────────────────────

/** Small stable of note bodies keyed by client status. The Notes tab isn't
 *  the place for filler lorem ipsum — a two-line, plausible agency note
 *  makes the tab feel lived-in from first render. */
const NOTE_BODIES_BY_STATUS: Record<string, string[]> = {
  fire: [
    '<h3>Escalation log</h3><p>Client raised timeline concerns on Tuesday. Owner has the response drafted — awaiting sign-off before send. Keep AM in the loop.</p><ul><li>Call scheduled for Thursday 2pm</li><li>Draft response in Drive</li><li>Track turnaround on open blockers</li></ul>',
    '<h3>Weekly pulse</h3><p>Three blockers hit this sprint. Pattern looks like <strong>approval latency</strong> rather than execution. Flag at next WIP.</p>',
  ],
  risk: [
    '<h3>Retention notes</h3><p>Signals of drift: fewer open tickets, slower email replies. Worth pulling performance numbers before the next check-in.</p><ul><li>Pull last 90 days of engagement</li><li>Draft QBR agenda</li><li>Loop in AM lead</li></ul>',
    '<h3>Follow-up</h3><p>Customer asked about scope expansion but deferred on signing. Revisit in 2 weeks if no movement.</p>',
  ],
  track: [
    '<h3>Ongoing</h3><p>Client is steady. Regular retainer cadence holding up. Document any one-off asks here so they don\'t get lost.</p>',
    '<h3>Opportunities</h3><p>They mentioned a Q3 expansion push. Worth drafting a proposal ahead of the QBR — historically they sign during that window.</p>',
  ],
  onboard: [
    '<h3>Kickoff notes</h3><p>Initial kickoff went well. Team aligned on scope and cadence. Next steps: finalise working agreement, provision tooling, introduce project team.</p><ul><li>Access provisioning — in progress</li><li>Working agreement — draft shared</li><li>Kickoff retro — scheduled</li></ul>',
  ],
  paused: [
    '<h3>Paused</h3><p>Retainer paused mid-quarter. Check in monthly. Door is open when they\'re ready to resume.</p>',
  ],
};

function buildNotes(
  clientId: string,
  clientName: string,
  status: string,
  seed: number,
  todayStr: string,
): Note[] {
  // Keep the seed light — not every client needs multiple notes to look
  // plausible. One per client is enough to show the layout; a couple of
  // the more active statuses get two.
  const pool = NOTE_BODIES_BY_STATUS[status] ?? NOTE_BODIES_BY_STATUS.track;
  const n = Math.min(pool.length, 1 + (seed % 2));
  const out: Note[] = [];
  for (let i = 0; i < n; i++) {
    const daysAgo = 3 + i * 6 + (seed % 10);
    const iso = new Date(
      new Date(todayStr).getTime() - daysAgo * 86_400_000,
    ).toISOString();
    out.push({
      id: `${clientId}-note-${i}`,
      clientId,
      body: pool[i],
      // Pin the most recent note per client so the Notes sidebar always
      // has a top item that's not buried by idle notes.
      pinned: i === 0,
      createdAt: iso,
      updatedAt: iso,
    });
  }
  // Silences the unused-param warning while keeping the signature clean
  // in case we later want to include the client's name in the body.
  void clientName;
  return out;
}

// ── Touchpoints + action items ───────────────────────────────────────────

/** Meeting topics keyed by client status. A fire-status client's
 *  touchpoints read different from a track-status client's on purpose —
 *  the topic is the single clearest signal of what the relationship is
 *  doing. */
const TOUCHPOINT_TOPICS: Record<string, string[]> = {
  fire: [
    'Escalation: delivery concerns', 'Urgent: timeline review',
    'Root cause: missed deadline',  'Weekly sync',
  ],
  risk: [
    'Retention check-in', 'Scope review', 'Q2 priorities sync', 'Weekly sync',
  ],
  track: [
    'Weekly client sync', 'Monthly performance review', 'Roadmap check-in',
    'QBR prep',
  ],
  onboard: [
    'Kickoff meeting', 'Working session: access + tooling',
    'Discovery interview', 'First-week check-in',
  ],
  paused: [
    'Pause agreement', 'Relationship check-in',
  ],
};

/** Short TL;DR blurbs, keyed by status. Kept punchy so the paper trail
 *  doesn't read like lorem ipsum. */
const TLDR_POOL: Record<string, string[]> = {
  fire: [
    'Client flagged delivery concerns — agreed to weekly check-ins until the timeline stabilises. Owner handles escalations; AM coordinates reporting.',
    'Walked through root cause of missed milestone. Mitigation plan set for next sprint, with extra QA before any client-facing push.',
  ],
  risk: [
    'Client is drifting. Engagement dropped in the last 30 days. Agreed to pull metrics and set a retention-focused QBR for early next month.',
    'Scope expansion discussion parked — client not ready to sign. Revisit in 2 weeks with updated ROI narrative.',
  ],
  track: [
    'Steady week. Campaigns performing within target. Confirmed Q2 priorities; no scope changes. Next review in two weeks.',
    'Approved Q2 roadmap: homepage first, then brand refresh. Budget signed off. No scope creep until Q3.',
  ],
  onboard: [
    'Kickoff landed. Team introduced, access provisioned, first-sprint scope locked. Working agreement signed off.',
    'Discovery session completed. Customer goals logged; first draft of strategy due by end of week.',
  ],
  paused: [
    'Paused retainer. Monthly light touch confirmed. Door is open when client is ready to resume.',
  ],
};

/** Action item templates by status. Each item needs text + an offset
 *  from the meeting date for the due date. */
const ACTION_POOL: Record<string, Array<{ text: string; dueOffset: number }>> = {
  fire: [
    { text: 'Draft root-cause summary for client',     dueOffset: 1 },
    { text: 'Schedule daily check-in for next sprint', dueOffset: 0 },
    { text: 'Run timeline review with delivery lead',  dueOffset: 2 },
    { text: 'Send risk mitigation plan to AM',         dueOffset: 3 },
  ],
  risk: [
    { text: 'Pull last 90 days of engagement metrics', dueOffset: 2 },
    { text: 'Draft retention-focused QBR agenda',      dueOffset: 4 },
    { text: 'Confirm Q2 scope with delivery',          dueOffset: 1 },
    { text: 'Loop in AM lead on renewal outlook',      dueOffset: 5 },
  ],
  track: [
    { text: 'Send weekly report to client',            dueOffset: 1 },
    { text: 'Confirm next campaign launch date',       dueOffset: 3 },
    { text: 'Share performance recap',                 dueOffset: 2 },
    { text: 'Schedule QBR with stakeholders',          dueOffset: 7 },
  ],
  onboard: [
    { text: 'Provision tooling access',                 dueOffset: 1 },
    { text: 'Share working agreement for sign-off',     dueOffset: 2 },
    { text: 'Introduce project team via email',         dueOffset: 1 },
    { text: 'Draft 30-60-90 plan',                      dueOffset: 5 },
  ],
  paused: [
    { text: 'Set calendar reminder for 30-day check-in', dueOffset: 28 },
  ],
};

/**
 * Build a client's Touchpoints + ActionItems list.
 *
 * Seed shape: 3–4 touchpoints per client spread over the last ~28 days
 * plus up to one upcoming. Oldest meetings get their TL;DR locked to
 * mirror the mockup's "locked after 72h" behaviour. Paused clients get
 * a single legacy touchpoint so the tab doesn't render empty — anyone
 * looking at a paused client still sees how the pause was handled.
 */
function buildTouchpoints(
  clientId: string,
  status: string,
  seed: number,
  todayStr: string,
  amId: string,
  contactIds: string[],
  teamIds: string[],
): { touchpoints: Touchpoint[]; actionItems: ActionItem[] } {
  const touchpoints: Touchpoint[] = [];
  const actionItems: ActionItem[] = [];
  const topics = TOUCHPOINT_TOPICS[status] ?? TOUCHPOINT_TOPICS.track;
  const tldrs = TLDR_POOL[status] ?? TLDR_POOL.track;
  const actionPool = ACTION_POOL[status] ?? ACTION_POOL.track;
  const today = new Date(todayStr);

  // Mix of client + our-side attendees — a real meeting has both. Two
  // contacts + the AM + maybe one operator gives the typical 3-4 row
  // attendee strip from the mockup.
  const makeAttendees = (extra = 0): string[] => {
    const out: string[] = [];
    if (amId) out.push(amId);
    contactIds.slice(0, 2).forEach(id => out.push(id));
    if (extra > 0 && teamIds.length > 0) {
      out.push(teamIds[(seed + extra) % teamIds.length]);
    }
    return out;
  };

  // Paused clients sit on a single legacy touchpoint and nothing else.
  if (status === 'paused') {
    const daysAgo = 21 + (seed % 14);
    const at = isoTime(today, -daysAgo, 14, 0);
    const tpId = `${clientId}-tp-0`;
    touchpoints.push({
      id: tpId, clientId,
      topic: topics[0],
      occurredAt: at,
      kind: 'meeting',
      scheduled: false,
      attendeeIds: makeAttendees(),
      durationMin: 20,
      recordingUrl: `https://fellow.app/t/${tpId}`,
      recordingLabel: '20 min · Fellow',
      tldr: tldrs[0],
      tldrLocked: true,
      createdAt: at,
    });
    return { touchpoints, actionItems };
  }

  // 1. Upcoming scheduled meeting — ~60% of clients have one on the
  //    books. Skip for fire clients so the tab leads with the open
  //    escalation instead of a future date.
  const hasUpcoming = status !== 'fire' && (seed % 5) !== 0;
  if (hasUpcoming) {
    const daysAhead = 1 + (seed % 4);
    const at = isoTime(today, daysAhead, 10, 0);
    const tpId = `${clientId}-tp-upcoming`;
    touchpoints.push({
      id: tpId, clientId,
      topic: `${topics[0]} · next week`,
      occurredAt: at,
      kind: 'meeting',
      scheduled: true,
      attendeeIds: makeAttendees(),
      tldr: `Agenda: ${topics[0].toLowerCase()} — prep ahead of the call.`,
      calendarUrl: 'https://calendar.google.com/calendar',
      createdAt: isoTime(today, -1, 9, 0),
    });
  }

  // 2. Recent past meeting (2-4 days ago). TL;DR maybe filled in.
  const recentDaysAgo = 2 + (seed % 3);
  const recentAt = isoTime(today, -recentDaysAgo, 14, 0);
  const recentId = `${clientId}-tp-recent`;
  const recentHasTldr = status !== 'fire' && (seed % 3) !== 0;
  touchpoints.push({
    id: recentId, clientId,
    topic: topics[1 % topics.length],
    occurredAt: recentAt,
    kind: 'meeting',
    scheduled: false,
    attendeeIds: makeAttendees(1),
    durationMin: 30 + (seed % 25),
    recordingUrl: `https://fellow.app/t/${recentId}`,
    recordingLabel: `${30 + (seed % 25)} min · Fellow`,
    tldr: recentHasTldr ? tldrs[0] : '',
    tldrLocked: false,
    createdAt: recentAt,
  });
  actionItems.push(
    ...seedActions(recentId, clientId, actionPool, seed, todayStr, recentDaysAgo, {
      amId, teamIds, count: 3, doneFirst: false, overdueFirst: status === 'fire',
    }),
  );

  // 3. Mid-range meeting (~8-12 days ago). TL;DR written and still
  //    unlocked for a narrow window — the mockup locks at 72h so really
  //    these should be locked; keep one unlocked so the inline-edit demo
  //    surface has something to act on.
  const midDaysAgo = 8 + (seed % 5);
  const midAt = isoTime(today, -midDaysAgo, 11, 0);
  const midId = `${clientId}-tp-mid`;
  touchpoints.push({
    id: midId, clientId,
    topic: topics[2 % topics.length],
    occurredAt: midAt,
    kind: (seed % 4 === 0) ? 'call' : 'meeting',
    scheduled: false,
    attendeeIds: makeAttendees(),
    durationMin: 20 + (seed % 20),
    recordingUrl: `https://fellow.app/t/${midId}`,
    recordingLabel: `${20 + (seed % 20)} min · Fellow`,
    tldr: tldrs[1 % tldrs.length],
    tldrLocked: false,
    createdAt: midAt,
  });
  actionItems.push(
    ...seedActions(midId, clientId, actionPool, seed + 1, todayStr, midDaysAgo, {
      amId, teamIds, count: 2, doneFirst: true, overdueFirst: false,
    }),
  );

  // 4. Old locked meeting (20-28 days ago). TL;DR locked, action items
  //    mostly done. Every client gets one so there's always at least a
  //    little history to scroll through.
  const oldDaysAgo = 20 + (seed % 9);
  const oldAt = isoTime(today, -oldDaysAgo, 15, 0);
  const oldId = `${clientId}-tp-old`;
  touchpoints.push({
    id: oldId, clientId,
    topic: topics[0],
    occurredAt: oldAt,
    kind: 'meeting',
    scheduled: false,
    attendeeIds: makeAttendees(2),
    durationMin: 25 + (seed % 15),
    recordingUrl: `https://fellow.app/t/${oldId}`,
    recordingLabel: `${25 + (seed % 15)} min · Fellow`,
    tldr: tldrs[0],
    tldrLocked: true,
    createdAt: oldAt,
  });
  actionItems.push(
    ...seedActions(oldId, clientId, actionPool, seed + 2, todayStr, oldDaysAgo, {
      amId, teamIds, count: 2, doneFirst: true, overdueFirst: false, allDone: true,
    }),
  );

  return { touchpoints, actionItems };
}

interface SeedActionsOpts {
  amId: string;
  teamIds: string[];
  count: number;
  /** Render the first item as done — used on historical meetings where
   *  the first checkbox has usually already been ticked. */
  doneFirst: boolean;
  /** Push one overdue item to the top — fire-client touchpoints get
   *  this so the escalation narrative reads as a real fire. */
  overdueFirst: boolean;
  /** All items land done. Used for the oldest meetings to mirror the
   *  mockup's "ancient history, nothing pending" pattern. */
  allDone?: boolean;
}

function seedActions(
  touchpointId: string,
  clientId: string,
  pool: Array<{ text: string; dueOffset: number }>,
  seed: number,
  todayStr: string,
  meetingDaysAgo: number,
  opts: SeedActionsOpts,
): ActionItem[] {
  const out: ActionItem[] = [];
  const { amId, teamIds, count, doneFirst, overdueFirst, allDone } = opts;
  const today = new Date(todayStr);
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const item = pool[(seed + i * 3) % pool.length];
    // Due date = (meeting date) + item.dueOffset. We want the first
    // action on a fire touchpoint to be overdue, so we pin dueOffset
    // to something small there.
    const due = isoDay(today, -meetingDaysAgo + (overdueFirst && i === 0 ? 1 : item.dueOffset));
    const assigneeId = (i === 0 || teamIds.length === 0)
      ? amId
      : teamIds[(seed + i) % teamIds.length];
    out.push({
      id: `${touchpointId}-a${i}`,
      touchpointId,
      clientId,
      text: item.text,
      assigneeId,
      dueDate: due,
      done: !!allDone || (doneFirst && i === 0),
    });
  }
  return out;
}

/** Full ISO timestamp anchored at a specific day + hour of the mockup
 *  today. Keeps all demo touchpoints deterministic across runs. */
function isoTime(today: Date, dayOffset: number, hour: number, minute: number): string {
  const d = new Date(today.getTime() + dayOffset * 86_400_000);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Date-only ISO (YYYY-MM-DD) relative to the mockup today. */
function isoDay(today: Date, dayOffset: number): string {
  return isoFromDate(new Date(today.getTime() + dayOffset * 86_400_000));
}

function buildQuickLinks(clientId: string, clientName: string, seed: number): QuickLink[] {
  const count = 3 + (seed % 3); // 3–5 links
  const domain = slugDomain(clientName);
  const out: QuickLink[] = [];
  // Website is always first — it's the one link every client has.
  const picks: QuickLinkDef[] = [QUICK_LINK_CATALOG[0]];
  for (let i = 1; picks.length < count && i < QUICK_LINK_CATALOG.length * 2; i++) {
    const def = QUICK_LINK_CATALOG[(seed + i * 3) % QUICK_LINK_CATALOG.length];
    if (!picks.includes(def)) picks.push(def);
  }
  picks.forEach((def, i) => {
    out.push({
      id: `${clientId}-link-${i}`,
      clientId,
      label: def.label,
      url: def.urlFor(domain, clientId),
      icon: def.icon,
    });
  });
  return out;
}

// ── Main build ───────────────────────────────────────────────────────────

export function generateDemoData(): FlizowData {
  const today = todayAnchor();
  const todayStr = isoFromDate(today);

  const clients: Client[] = [];
  const services: Service[] = [];
  const tasks: Task[] = [];
  const integrations: Integration[] = [];
  const onboardingItems: OnboardingItem[] = [];
  const contacts: Contact[] = [];
  const quickLinks: QuickLink[] = [];
  const notes: Note[] = [];
  const touchpoints: Touchpoint[] = [];
  const actionItems: ActionItem[] = [];
  const taskComments: TaskComment[] = [];

  const members = [...DEMO_AMS, ...OPS_TEAM];
  const operatorIds = OPS_TEAM.map(m => m.id);

  CLIENT_SEEDS.forEach(seedRow => {
    const seed = hash(seedRow.id);
    const cat = categoryFor(seedRow.industry);
    const amId = seedRow.amInits.toLowerCase();

    // Pick a 3–5 person project team from the ops roster, excluding the AM.
    // Deterministic, rotating start so teams spread across the roster
    // instead of piling on the first few operators.
    const teamSize = 3 + (seed % 3);
    const teamIds: string[] = [];
    for (let ti = 0; ti < teamSize; ti++) {
      const mid = operatorIds[(seed + ti * 5) % operatorIds.length];
      if (mid !== amId && !teamIds.includes(mid)) teamIds.push(mid);
    }

    const client: Client = {
      id: seedRow.id,
      name: seedRow.name,
      initials: seedRow.initials,
      logoClass: seedRow.logoClass,
      status: seedRow.status,
      industryCategory: cat,
      amId,
      startedAt: daysFromTodayISO(today, -180 - (seed % 900)),
      serviceIds: [],
      teamIds,
    };

    // Seed 2–4 contacts and 3–5 quick links per client.
    const clientContacts = buildContacts(seedRow.id, seedRow.name, seed);
    contacts.push(...clientContacts);
    quickLinks.push(...buildQuickLinks(seedRow.id, seedRow.name, seed));
    notes.push(...buildNotes(seedRow.id, seedRow.name, seedRow.status, seed, todayStr));

    // Seed touchpoints (meetings + action items) — attendees are pulled
    // from both sides of the relationship so the attendee strip looks
    // real: AM + 1-2 client contacts, sometimes a teammate.
    const tp = buildTouchpoints(
      seedRow.id,
      seedRow.status,
      seed,
      todayStr,
      amId,
      clientContacts.map(c => c.id),
      teamIds,
    );
    touchpoints.push(...tp.touchpoints);
    actionItems.push(...tp.actionItems);

    const catServices = SERVICE_TEMPLATES[cat];
    const nServices = Math.min(2 + (seed % 3), catServices.length);
    const offset = seed % catServices.length;

    for (let si = 0; si < nServices; si++) {
      const tmpl = catServices[(offset + si) % catServices.length];
      const serviceId = `${seedRow.id}-svc-${si}`;
      const progress = progressForStatus(seedRow.status, seed + si * 7);

      const service: Service = {
        id: serviceId,
        clientId: seedRow.id,
        name: tmpl.name,
        type: tmpl.type,
        templateKey: tmpl.pool,
        progress,
        nextDeliverableAt: daysFromTodayISO(today, 3 + ((seed + si) % 25)),
        taskIds: [],
      };

      const pool = TASK_POOLS[tmpl.pool];
      const nTasks = 5 + ((seed + si) % 4);
      for (let ti = 0; ti < nTasks; ti++) {
        const taskId = `${serviceId}-t${ti}`;
        const col = distributeColumn(progress, ti, nTasks, seed + si);

        const task: Task = {
          id: taskId,
          serviceId,
          clientId: seedRow.id,
          title: pool[(seed + si * 11 + ti) % pool.length],
          columnId: col,
          priority: pick(['low','medium','high','urgent'] as Priority[], (seed + ti * 3) % 4),
          assigneeId: amId,
          labels: [],
          dueDate: daysFromTodayISO(today, ((seed + ti * 2) % 30) - 3),
          createdAt: daysFromTodayISO(today, -(((seed + ti * 5) % 60) + 1)),
        };

        // Fire clients get a critical-blocker card; risk clients get a
        // warning-tinted in-progress card. Mirrors the mockup's "why this
        // board is on fire" visual signal.
        if (seedRow.status === 'fire' && si === 0 && ti === 0) {
          task.severity = 'critical';
          task.priority = 'urgent';
          task.columnId = 'blocked';
          task.dueDate = daysFromTodayISO(today, -(((seed) % 9) + 1));
          task.blockerReason = pick(
            ['Waiting on client feedback','Missing creative assets','Legal review pending','Budget approval stalled'],
            seed % 4,
          );
        } else if (seedRow.status === 'risk' && col === 'inprogress' && ti < 2) {
          task.severity = 'warning';
          task.priority = ti === 0 ? 'high' : 'medium';
          task.dueDate = daysFromTodayISO(today, ((seed + si * 7 + ti * 3) % 7) - 2);
        }

        tasks.push(task);
        service.taskIds.push(taskId);
      }

      services.push(service);
      client.serviceIds.push(serviceId);

      // Seed the onboarding checklist for this service. For fully
      // ramped-up clients (track / fire / risk / paused) treat the
      // setup as long complete; only onboard-status clients carry
      // partially-done lists so the tab actually has something to do.
      onboardingItems.push(
        ...buildOnboardingItems(serviceId, tmpl.pool, {
          status: seedRow.status,
          seed: seed + si,
        }),
      );
    }

    // 2–4 integrations per client, mostly connected with the occasional error.
    const nInt = 2 + (seed % 3);
    for (let ii = 0; ii < nInt; ii++) {
      integrations.push({
        clientId: seedRow.id,
        name: INTEGRATION_POOL[(seed + ii * 3) % INTEGRATION_POOL.length],
        status: ((seed + ii) % 11 === 0) ? 'error' : 'connected',
      });
    }

    clients.push(client);
  });

  // ── Schedule seeds become real kanban cards ─────────────────────────

  const scheduleTaskMap: { [id: string]: string } = {};
  const clientById: { [id: string]: Client } = {};
  clients.forEach(c => { clientById[c.id] = c; });

  // Days from this week's Monday — so the schedule always lands in the
  // visible window no matter when the user loads.
  const todayDow = today.getDay(); // 0=Sun, 6=Sat
  const daysToMonday = todayDow === 0 ? -6 : (1 - todayDow);
  const dayFromMonday = (off: number) => daysFromTodayISO(today, daysToMonday + off);

  SCHEDULE_SEEDS.forEach(seedItem => {
    const clientServices = services.filter(s => s.clientId === seedItem.clientId);
    if (!clientServices.length) return;
    const target =
      clientServices.find(s => s.templateKey === seedItem.pool) || clientServices[0];
    const amId = clientById[seedItem.clientId]?.amId ?? null;

    const task: Task = {
      id: seedItem.id,
      serviceId: target.id,
      clientId: seedItem.clientId,
      title: seedItem.title,
      columnId: seedItem.columnId,
      priority: seedItem.priority,
      assigneeId: amId,
      labels: [],
      dueDate: dayFromMonday(seedItem.dayOffset),
      createdAt: daysFromTodayISO(today, -7),
      _schedule: { tag: seedItem.tag, meta: seedItem.meta, done: !!seedItem.done },
    };
    if (seedItem.severity) task.severity = seedItem.severity;
    tasks.push(task);
    target.taskIds.push(seedItem.id);
    scheduleTaskMap[seedItem.id] = target.id;
  });

  // ── Acme extras: two hardcoded projects end-to-end ──────────────────

  const acme = clientById['acme-corp'];
  if (acme) {
    const amId = acme.amId ?? 'nt';

    const mkTask = (
      id: string, serviceId: string, title: string, col: ColumnId,
      priority: Priority, dueOffset: number, createdOffset: number,
    ): Task => ({
      id, serviceId, clientId: 'acme-corp',
      title, columnId: col, priority,
      assigneeId: amId, labels: [],
      dueDate: daysFromTodayISO(today, dueOffset),
      createdAt: daysFromTodayISO(today, createdOffset),
    });

    // Marketing Site v3
    const msId = 'acme-corp-svc-ms3';
    const ms: Service = {
      id: msId, clientId: 'acme-corp',
      name: 'Marketing Site v3', type: 'project',
      templateKey: 'web-design-full-stack',
      progress: 62,
      nextDeliverableAt: daysFromTodayISO(today, 14),
      taskIds: [],
    };
    const msTasks: Task[] = [
      mkTask(`${msId}-t0`, msId, 'Discovery interviews synthesis',       'done',       'medium', -18, -32),
      mkTask(`${msId}-t1`, msId, 'Sitemap & IA approved by stakeholders','done',       'high',   -11, -24),
      mkTask(`${msId}-t2`, msId, 'Low-fidelity wireframes — core flows', 'done',       'high',    -5, -14),
      mkTask(`${msId}-t3`, msId, 'Homepage visual design — round 2',     'review',     'high',     1,  -8),
      mkTask(`${msId}-t4`, msId, 'Component library build (tokens + UI)','inprogress', 'high',     6,  -7),
      mkTask(`${msId}-t5`, msId, 'Analytics + tag verification plan',    'todo',       'medium',  17,  -2),
    ];
    msTasks.forEach(t => { tasks.push(t); ms.taskIds.push(t.id); });
    services.push(ms);
    acme.serviceIds.unshift(msId);

    // Mockup shows Marketing Site v3 at 4 of 7 items complete. Pin
    // exactly which ones are done so the strip matches the reference.
    onboardingItems.push(
      ...buildOnboardingItems(msId, 'web-design-full-stack', {
        doneLabels: new Set([
          'Domain registrar credentials',
          'Hosting or CDN access',
          'Brand kit — logos, fonts, colors',
          'Provision staging environment',
        ]),
      }),
    );

    // Brand Refresh Q2
    const brId = 'acme-corp-svc-brq2';
    const br: Service = {
      id: brId, clientId: 'acme-corp',
      name: 'Brand Refresh Q2', type: 'project',
      templateKey: 'brand-refresh',
      progress: 35,
      nextDeliverableAt: daysFromTodayISO(today, 21),
      taskIds: [],
    };
    const brTasks: Task[] = [
      mkTask(`${brId}-t0`, brId, 'Leadership discovery interviews',        'done',       'high',   -12, -26),
      mkTask(`${brId}-t1`, brId, 'Customer interview insights synthesis',  'done',       'medium',  -6, -18),
      mkTask(`${brId}-t2`, brId, 'Moodboard directions — round 1',         'review',     'high',     2,  -7),
      mkTask(`${brId}-t3`, brId, 'Typography study — headline pairings',   'inprogress', 'medium',   8,  -4),
      mkTask(`${brId}-t4`, brId, 'Logo concepts — three directions',       'todo',       'high',    15,  -1),
      mkTask(`${brId}-t5`, brId, 'Rollout kit — templates scope draft',    'todo',       'low',     26,  -1),
    ];
    brTasks.forEach(t => { tasks.push(t); br.taskIds.push(t.id); });
    services.push(br);
    acme.serviceIds.unshift(brId);

    // Mockup shows Brand Refresh Q2 at 3 of 6 items complete.
    onboardingItems.push(
      ...buildOnboardingItems(brId, 'brand-refresh', {
        doneLabels: new Set([
          'Existing brand history & assets shared',
          'Leadership interviews scheduled',
          'Set up moodboard workspace',
        ]),
      }),
    );

    // Demo comments on a handful of Acme tasks so anyone loading the
    // seed sees the threaded conversation UI populated out of the box.
    // `isoAt` builds a stable ISO timestamp N days before `today` at a
    // plausible hour — we anchor to `today` so comment order stays
    // consistent with the rest of the dataset.
    const isoAt = (daysAgo: number, hour: number, minute = 0) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(hour, minute, 0, 0);
      return d.toISOString();
    };
    const mkComment = (
      id: string, taskId: string, authorId: string, text: string,
      daysAgo: number, hour: number, parentId: string | null = null,
    ): TaskComment => ({
      id, taskId, authorId, text,
      createdAt: isoAt(daysAgo, hour),
      ...(parentId ? { parentId } : {}),
    });

    taskComments.push(
      // Homepage visual design — in review, a small back-and-forth.
      mkComment('acme-cmt-ms3-1', `${msId}-t3`, 'hs',
        'Round 2 is uploaded — focused on the hero and the "what we do" strip. Curious what you think about the gradient direction.', 2, 9),
      mkComment('acme-cmt-ms3-2', `${msId}-t3`, 'nt',
        'Loving the hero. The gradient reads a touch too pink on the lower half — can we pull it back toward the brand indigo?', 2, 11, 'acme-cmt-ms3-1'),
      mkComment('acme-cmt-ms3-3', `${msId}-t3`, 'hs',
        'Good call. I\'ll push an updated version by EOD with the indigo shift.', 1, 14, 'acme-cmt-ms3-1'),
      mkComment('acme-cmt-ms3-4', `${msId}-t3`, 'cc',
        'Also flagging: tag verification plan is going to need the final page slugs from this round before I can map events.', 1, 16),

      // Component library build — in progress, one-off status comment.
      mkComment('acme-cmt-ms3-5', `${msId}-t4`, 'hs',
        'Tokens + button variants are done. Starting on form inputs + modals next.', 0, 10),

      // Brand Refresh — moodboard review.
      mkComment('acme-cmt-br-1', `${brId}-t2`, 'nt',
        'Moodboard round 1 is solid. Direction B feels the most aligned with the leadership interviews — want to push that one further?', 1, 13),
    );
  }

  return {
    clients,
    services,
    tasks,
    members,
    integrations,
    onboardingItems,
    contacts,
    quickLinks,
    notes,
    touchpoints,
    actionItems,
    taskComments,
    // Activity feed starts empty on a fresh demo load — activity gets
    // appended as the user moves cards, edits fields, etc. Seeding
    // historical activity would feel artificial next to the comment
    // seeds (which are explicitly conversational).
    taskActivity: [],
    // No manual agenda items in the demo — the "Added by hand" group
    // only shows up after the user raises something from the WIP page
    // itself. Keeps the section quiet on first load so the auto-built
    // agenda is what the user sees first.
    manualAgendaItems: [],
    // Empty Quick-Capture log — captures only get raised during a
    // Live Meeting via the N/D/A keys, so demo users see a clean log
    // until they actually run a meeting in the Live tab.
    meetingCaptures: [],
    memberDayOverrides: [],
    // Ops board seed bundled directly here. Used to come from
    // flizowStore.migrate(), but that auto-seed is now gated for
    // brand-new users (so an empty fresh install doesn't get fake
    // colleagues). The demo path always wants a populated Ops board,
    // so we include the seed inline.
    opsTasks: OPS_TASK_SEED.map(t => ({ ...t })),
    today: todayStr,
    scheduleTaskMap,
    // Demo loads come in without anything pinned. The star affordance
    // on each service card is self-explanatory enough that the user
    // picks their own My Boards strip as they poke around.
    favoriteServiceIds: [],
    // Demo loads also come in without template edits — the resolver
    // overlays an empty array onto BUILT_IN_TEMPLATES, surfacing the
    // five built-ins as-is. Audit: templates M2.
    templateOverrides: [],
    // Theme defaults to light on a fresh demo load. The user's
    // existing pick survives because migrate() preserves theme from
    // the parsed payload before running emptyData() defaults — but
    // demo loads come through replaceAll which calls migrate(), and
    // migrate prefers `parsed.theme`, so this default only kicks in
    // when a brand-new user demo-loads without ever touching theme.
    theme: 'light',
    // Mark Ops as already seeded so the legacy backfill path in
    // migrate() never tries to re-seed on top of the data we
    // bundle above.
    opsSeeded: true,
    // Demo workspace ships with an empty Trash. Soft-deletes the
    // user makes while exploring will populate this; on a fresh
    // demo load nothing is in there yet.
    trash: [],
    // Bundle the default job-title catalog with the demo. The
    // demo's seeded members already carry stable jobTitleId values
    // (mapping to the Account Manager / Designer / Strategist
    // entries), so the catalog here keeps them resolved on a fresh
    // load without waiting for the migration pass.
    jobTitles: DEFAULT_JOB_TITLES.map((jt) => ({ ...jt })),
    // Empty time-off ledger. Demo members can submit / approve
    // requests interactively; seeding fake history would clutter
    // the surface without adding signal.
    timeOffRequests: [],
    // Empty rules list. Same reasoning as the request list — the
    // OM creates rules through the Phase-6 builder; demo loads
    // shouldn't ship pre-baked coverage logic the user didn't
    // choose.
    coverageRules: [],
  };
}
