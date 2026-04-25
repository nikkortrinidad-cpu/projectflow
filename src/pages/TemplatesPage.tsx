import { useLayoutEffect, useMemo, useState } from 'react';
import { useRoute, navigate } from '../router';

/**
 * Service Templates — reusable blueprints that hydrate a new service on a
 * client. Left pane lists the five templates; right pane opens the one
 * picked via the hash route (`#templates/{id}`). Mirrors the mockup's
 * `.templates-split-wrapper` layout so the existing CSS does the lifting.
 *
 * Editing is out of scope for the first pass — the five templates are
 * hard-coded here (same content as the mockup). Once the admin UI lands,
 * this data moves into the store.
 */

// ── Template data ────────────────────────────────────────────────────

type PhaseDef = { name: string; subtasks: string[] };
type ChecklistDef = { client: string[]; us: string[] };
type TemplateDef = {
  id: string;
  name: string;
  category: string;
  icon: 'web' | 'seo' | 'content' | 'brand' | 'paid';
  phases: PhaseDef[];
  phasesSub: string;
  onboarding: ChecklistDef;
  brief: string[];
};

const TEMPLATES: TemplateDef[] = [
  {
    id: 'web-design-full-stack',
    name: 'Web Design — Full Stack',
    category: 'Web Development',
    icon: 'web',
    phasesSub: 'Auto-populate into the To Do column when onboarding completes',
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
  },
];

// ── Icon sprites (inline so we don't depend on /icons.svg) ────────────

function TemplateIcon({ kind }: { kind: TemplateDef['icon'] }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'web':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <line x1="2" y1="9" x2="22" y2="9" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="18" x2="12" y2="21" />
        </svg>
      );
    case 'seo':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case 'content':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      );
    case 'brand':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
      );
    case 'paid':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
  }
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function TemplatesPage() {
  const route = useRoute();
  // The list URL is `#templates`; the detail URL is `#templates/{id}`.
  // Fall back to the first template so the right pane is never empty.
  const routeId = route.params.id;
  const selectedId = useMemo(() => {
    if (routeId && TEMPLATES.some((t) => t.id === routeId)) return routeId;
    return TEMPLATES[0].id;
  }, [routeId]);
  const selected = TEMPLATES.find((t) => t.id === selectedId) ?? TEMPLATES[0];

  // Keep `body[data-active-view]` pinned to `templates` for the whole
  // time we're on this view. Mirrors ClientsSplit's trick — otherwise
  // the CSS default (`display: none` on `.templates-split-wrapper`)
  // flashes for one frame on mount.
  useLayoutEffect(() => {
    document.body.setAttribute('data-active-view', 'templates');
    return () => {
      if (document.body.getAttribute('data-active-view') === 'templates') {
        document.body.removeAttribute('data-active-view');
      }
    };
  }, []);

  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TEMPLATES;
    return TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="view view-templates active">
      <div className="templates-split-wrapper">
        <ListPane
          templates={filtered}
          selectedId={selectedId}
          query={query}
          onQuery={setQuery}
        />
        <DetailPane template={selected} />
      </div>
    </div>
  );
}

// ── List pane (left) ─────────────────────────────────────────────────

function ListPane({
  templates,
  selectedId,
  query,
  onQuery,
}: {
  templates: TemplateDef[];
  selectedId: string;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <aside className="templates-list-pane" aria-label="Service templates">
      <div className="templates-list-header">
        <div className="templates-list-title">Service Templates</div>
        <div className="templates-list-subtitle">Reusable blueprints for onboarding and kanban boards</div>
      </div>

      {/* No "+ Add template" button yet — templates are defined in
          types/flizow.ts as constants and there's no editor UI to open.
          A styled button that did nothing was worse than a missing
          button: it read as Tier-1 CTA (same class as Clients' New
          Client) and every click was a broken promise. Add back here
          when the editor lands. Audit: templates.md H1. */}
      <div className="templates-list-toolbar">
        <label className="list-pane-search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search templates"
            aria-label="Search templates"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
      </div>

      {/* The row container used to carry role="list" and each anchor
          role="listitem" + tabIndex={0}. Anchors with href are already
          focusable and are announced as links by screen readers — the
          extra role/tabIndex made every row read as "link, list item,
          tab-stop". Native <a> semantics are enough. Audit: templates
          L2 + L3. */}
      <div className="templates-list">
        {templates.length === 0 && (
          <div style={{ padding: '24px 12px', color: 'var(--text-soft)', fontSize: 'var(--fs-sm)' }}>
            No templates match "{query}".
          </div>
        )}
        {templates.map((t) => {
          const onboardingCount = t.onboarding.client.length + t.onboarding.us.length;
          const href = `#templates/${t.id}`;
          const isSelected = t.id === selectedId;
          return (
            <a
              key={t.id}
              className={`template-row${isSelected ? ' selected' : ''}`}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                navigate(href);
              }}
            >
              <div className="template-icon">
                <TemplateIcon kind={t.icon} />
              </div>
              <div className="template-row-body">
                <div className="template-row-name">{t.name}</div>
                <div className="template-row-meta">
                  {t.phases.length} phases · {onboardingCount} onboarding items
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </aside>
  );
}

// ── Detail pane (right) ──────────────────────────────────────────────

function DetailPane({ template }: { template: TemplateDef }) {
  // Phase open/close is per-template so switching templates doesn't keep
  // stale open states; `key` on the panel tree would work too, but this
  // is cheaper and keyed to the id.
  const [openPhases, setOpenPhases] = useState<Record<string, Set<number>>>({});
  const openSet = openPhases[template.id] ?? new Set<number>();

  function togglePhase(index: number) {
    setOpenPhases((prev) => {
      const currentSet = prev[template.id] ?? new Set<number>();
      const next = new Set(currentSet);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, [template.id]: next };
    });
  }

  return (
    <div className="templates-detail-pane">
      <section className="template-detail-page">
        <div className="template-hero">
          <div className="template-hero-icon">
            <TemplateIcon kind={template.icon} />
          </div>
          <div className="template-hero-body">
            <div className="template-hero-title">{template.name}</div>
            <div className="template-hero-meta">
              <span className="template-category-chip">{template.category}</span>
              {/* Honest call-out: the surface looks editable (hero +
                  phases + checklists + brief fields) but the data is
                  hard-coded in TEMPLATE_DEF until the admin editor
                  ships. Says so plainly here so the user doesn't try
                  to click into a phase and find nothing happens.
                  Audit: templates M2. */}
              <span className="template-readonly-tag" title="Templates ship as part of the product. The admin editor is on the roadmap.">
                Read-only
              </span>
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="template-section">
          <div className="template-section-header">
            <div className="template-section-title">Phases</div>
            <div className="template-section-sub">{template.phasesSub}</div>
          </div>
          <div className="template-phase-list">
            {template.phases.map((phase, i) => {
              const expanded = openSet.has(i);
              const panelId = `template-${template.id}-phase-${i}-subtasks`;
              return (
                <div key={i} className={`template-phase${expanded ? ' expanded' : ''}`}>
                  <button
                    type="button"
                    className="template-phase-toggle"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => togglePhase(i)}
                  >
                    <div className="template-phase-num">{i + 1}</div>
                    <div className="template-phase-name">{phase.name}</div>
                    <div className="template-phase-meta">{phase.subtasks.length} subtasks</div>
                    <ChevronDown className="template-phase-chevron" />
                  </button>
                  {/* Subtask panel carries the id that aria-controls on
                      the toggle references. Without it, the toggle
                      announced "expanded / collapsed" but not *what*
                      expanded. Audit: templates L4. */}
                  <div id={panelId} className="template-phase-subtasks">
                    {phase.subtasks.map((st, j) => (
                      <div key={j} className="template-phase-subtask">
                        <span className="dot" />
                        {st}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Onboarding */}
        <div className="template-section">
          <div className="template-section-header">
            <div className="template-section-title">Onboarding checklist</div>
            <div className="template-section-sub">Added to client detail when this service is selected</div>
          </div>
          <div className="template-checklist-group">
            <div className="template-checklist-owner from-client">From client</div>
            <div className="template-checklist">
              {template.onboarding.client.map((item, i) => (
                <div key={i} className="template-checklist-item">
                  <span className="dot" />
                  <div className="template-checklist-item-label">{item}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="template-checklist-group">
            <div className="template-checklist-owner from-us">From us</div>
            <div className="template-checklist">
              {template.onboarding.us.map((item, i) => (
                <div key={i} className="template-checklist-item">
                  <span className="dot" />
                  <div className="template-checklist-item-label">{item}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Brief fields */}
        <div className="template-section">
          <div className="template-section-header">
            <div className="template-section-title">Project brief fields</div>
            <div className="template-section-sub">Prompts shown in the brief panel on the kanban board</div>
          </div>
          <div className="template-brief-fields">
            {template.brief.map((field, i) => (
              <div key={i} className="template-brief-field">
                {field}
              </div>
            ))}
          </div>
        </div>

        {/* Activity section deleted — the empty state rendered
            "No activity yet. Edits you make to this template will
            show up here." on every template, but TEMPLATES is a
            hard-coded first-pass array with no write path, so the
            list will never populate. Same "unbuilt feature shown as
            empty state" trap we cleaned up on Analytics and Weekly
            WIP. Put the section back when the admin editor ships
            the timestamps. Audit: templates M3. */}
      </section>
    </div>
  );
}
