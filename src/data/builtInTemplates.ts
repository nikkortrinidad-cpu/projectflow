import type { TemplateRecord } from '../types/flizow';

/**
 * The five built-in templates the app ships with. Lives outside the
 * store so "Reset to default" can roll an edited template back to its
 * original shape regardless of what's currently in templateOverrides.
 *
 * Adding a new built-in: append a record here. The store's resolver
 * will surface it on next load. Existing user data is unaffected.
 *
 * Renaming a built-in's id: don't. Services point at templates by id
 * and we don't have a migration story for renames yet.
 */
export const BUILT_IN_TEMPLATES: TemplateRecord[] = [
  {
    id: 'web-design-full-stack',
    name: 'Web Design — Full Stack',
    category: 'Web Development',
    icon: 'web',
    phasesSub: 'Phase cards land in To Do; onboarding runs in parallel on its own tab.',
    phases: [
      { name: 'Discovery', subtasks: ['Kickoff call scheduled', 'Stakeholder interviews complete', 'Requirements doc drafted', 'Competitor scan written up', 'Success metrics agreed'] },
      { name: 'IA & Wireframes', subtasks: ['Sitemap draft', 'Key user flows mapped', 'Low-fidelity wireframes', 'Content model defined', 'Internal review signed off'] },
      { name: 'Visual Design', subtasks: ['Moodboard approved', 'Design system foundations', 'Hero + core pages designed', 'Interactive prototype shared', 'Client sign-off'] },
      { name: 'Development', subtasks: ['Environment + tooling set up', 'Component library built', 'Pages implemented', 'CMS integration', 'Animation + polish pass'] },
      { name: 'QA', subtasks: ['Cross-browser test', 'Mobile responsiveness pass', 'Accessibility review', 'Performance audit', 'Bug triage resolved'] },
      { name: 'Launch', subtasks: ['DNS + hosting cutover', 'Analytics + tag verification', 'Go-live checklist', 'Post-launch monitoring', 'Client handoff doc'] },
    ],
    onboarding: {
      client: ['Domain registrar credentials', 'Hosting or CDN access', 'Brand kit — logos, fonts, colors', 'Content inventory spreadsheet'],
      us: ['Provision staging environment', 'Create GitHub repository', 'Install Analytics & Tag Manager'],
    },
    brief: ['Goals', 'Target audience', 'Success metrics', 'Competitors', 'Must-keep features', 'Out of scope', 'Timeline milestones'],
    userCreated: false,
    archived: false,
    editedAt: null,
  },
  {
    id: 'seo-retainer-monthly',
    name: 'SEO Retainer — Monthly',
    category: 'SEO',
    icon: 'seo',
    phasesSub: 'Repeats every month after the first cycle',
    phases: [
      { name: 'Audit', subtasks: ['Technical crawl', 'Content inventory', 'Backlink profile', 'Competitor scan', 'Findings report'] },
      { name: 'Keyword plan', subtasks: ['Seed list collected', 'Search volume pull', 'Intent + funnel grouping', 'Priority matrix', 'Client review'] },
      { name: 'On-page', subtasks: ['Title & meta updates', 'Internal linking pass', 'Schema markup', 'Image optimization', 'Core Web Vitals fix list'] },
      { name: 'Content calendar', subtasks: ['Topics prioritized', 'Briefs drafted', 'Assignments made', 'Editorial review', 'Publish queue set'] },
      { name: 'Link building', subtasks: ['Target list built', 'Outreach sequences', 'Pitch drafting', 'Follow-up cadence', 'Placements tracked'] },
      { name: 'Monthly report', subtasks: ['Rankings delta', 'Traffic analytics', 'Win highlights', 'Next month plan', 'Client readout'] },
    ],
    onboarding: {
      client: ['Google Search Console access', 'Google Analytics 4 access', 'CMS admin access'],
      us: ['Configure rank tracker', 'Run baseline audit', 'Map keyword universe'],
    },
    brief: ['Business goals', 'Target geographies', 'Priority keywords', 'Competitors to monitor', 'Reporting cadence'],
    userCreated: false,
    archived: false,
    editedAt: null,
  },
  {
    id: 'content-8-articles',
    name: 'Content — 8 articles/mo',
    category: 'Content',
    icon: 'content',
    phasesSub: 'One batch of 8 cards per month',
    phases: [
      { name: 'Topic planning', subtasks: ['Topic brainstorm', 'Keyword overlay', 'Priority sort', 'Briefs drafted', 'Client approval'] },
      { name: 'Outlining', subtasks: ['SERP analysis', 'Outline draft', 'SME input', 'Revision pass', 'Writer handoff'] },
      { name: 'Drafting', subtasks: ['First draft', 'Fact-check', 'Internal edit', 'SEO pass', 'Client-facing draft'] },
      { name: 'Editing', subtasks: ['Copy edit', 'Voice & tone pass', 'Structure polish', 'Final proofread', 'Approval request'] },
      { name: 'Design & imagery', subtasks: ['Hero image', 'In-article graphics', 'Social thumbnails', 'Alt text + captions', 'Image optimization'] },
      { name: 'Publishing', subtasks: ['CMS upload', 'Meta fields', 'Internal links', 'Schedule post', 'Preview check'] },
      { name: 'Distribution', subtasks: ['Social push', 'Newsletter clip', 'Repurposed snippets', 'Internal Slack share', 'UTM tracking'] },
    ],
    onboarding: {
      client: ['Editorial voice & tone guide', 'CMS publishing access', 'Subject-matter expert intros'],
      us: ['Set up editorial calendar', 'Load style guide', 'Prep AI-assisted outline workflow'],
    },
    brief: ['Audience personas', 'Tone & voice', 'Key topics', 'Distribution channels', 'SEO targets'],
    userCreated: false,
    archived: false,
    editedAt: null,
  },
  {
    id: 'brand-refresh',
    name: 'Brand Refresh',
    category: 'Brand',
    icon: 'brand',
    phasesSub: 'One-time engagement, roughly 8–12 weeks',
    phases: [
      { name: 'Discovery interviews', subtasks: ['Leadership sessions', 'Customer interviews', 'Internal survey', 'Competitive audit', 'Insights synthesis'] },
      { name: 'Moodboards', subtasks: ['Direction sketches', 'Mood exploration', 'Typography study', 'Color exploration', 'Direction narrowed'] },
      { name: 'Logo concepts', subtasks: ['Three directions explored', 'Variations developed', 'Refinement round', 'Client pick', 'Final polish'] },
      { name: 'System design', subtasks: ['Color system', 'Type scale', 'Iconography', 'Illustration style', 'Motion principles'] },
      { name: 'Guidelines', subtasks: ['Logo usage rules', 'Color rules', 'Type rules', 'Imagery style', "Do's and don'ts"] },
      { name: 'Rollout kit', subtasks: ['Social templates', 'Email templates', 'Deck template', 'Swag mockups', 'Launch checklist'] },
    ],
    onboarding: {
      client: ['Existing brand history & assets', 'Leadership interviews scheduled', 'Reference brands & inspirations'],
      us: ['Set up moodboard workspace', 'Run naming audit (if applicable)', 'Draft brand positioning doc'],
    },
    brief: ['Brand positioning', 'Audience shift', 'Competitive landscape', 'Must-preserve elements', 'Rollout timeline'],
    userCreated: false,
    archived: false,
    editedAt: null,
  },
  {
    id: 'paid-media',
    name: 'Paid Media',
    category: 'Paid Media',
    icon: 'paid',
    phasesSub: 'Runs on a monthly optimize-and-report cadence after launch',
    phases: [
      { name: 'Account audit', subtasks: ['Structure review', 'Conversion setup check', 'Keyword waste scan', 'Creative audit', 'Findings doc'] },
      { name: 'Account setup', subtasks: ['Campaign structure', 'Ad group build', 'Negative keywords', 'Audience setup', 'Budget pacing rules'] },
      { name: 'Creative brief', subtasks: ['Messaging pillars', 'Audience hooks', 'Visual direction', 'CTA matrix', 'Internal approval'] },
      { name: 'Launch', subtasks: ['Final QA', 'Pixel + conversion check', 'Soft launch', 'Performance baseline', 'Full ramp'] },
      { name: 'Optimize', subtasks: ['Bid adjustments', 'Creative refresh', 'A/B tests', 'Audience refinement', 'Budget reallocation'] },
      { name: 'Monthly report', subtasks: ['KPI summary', 'Winning creatives', 'Audience insights', 'Next month plan', 'Client readout'] },
    ],
    onboarding: {
      client: ['Google Ads / Meta admin access', 'Pixel & server-side tagging confirmation', 'Brand assets & creative library', 'Monthly budget confirmation'],
      us: ['Establish UTM taxonomy', 'Validate conversion tracking', 'Connect Looker dashboard'],
    },
    brief: ['Target CPA / ROAS', 'Audiences', 'Creative pillars', 'Exclusions', 'Budget pacing rules'],
    userCreated: false,
    archived: false,
    editedAt: null,
  },
];

/** Stable set of built-in template ids — used by the resolver to know
 *  whether an entry in templateOverrides is replacing a built-in or
 *  introducing a user-created template. */
export const BUILT_IN_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  BUILT_IN_TEMPLATES.map(t => t.id),
);
