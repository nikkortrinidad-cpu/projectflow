import { useLayoutEffect, useMemo, useState } from 'react';
import { useRoute, navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import { resolveTemplates, isBuiltInTemplate, blankTemplate } from '../data/templates';
import { useCanEditTemplates } from '../hooks/useCanEditTemplates';
import { InlineText } from '../components/shared/InlineText';
import { flizowStore } from '../store/flizowStore';
import type { TemplateRecord, TemplateIcon } from '../types/flizow';

/**
 * Service Templates — reusable blueprints that hydrate a new service on a
 * client. Left pane lists the templates; right pane opens the one picked
 * via the hash route (`#templates/{id}`). Mirrors the mockup's
 * `.templates-split-wrapper` layout so the existing CSS does the lifting.
 *
 * Template data flows through `resolveTemplates(data.templateOverrides)`:
 * the five built-in templates live in `data/builtInTemplates.ts` as
 * pristine defaults; user edits + user-created records live in
 * `flizowStore.data.templateOverrides`; the resolver overlays them
 * before render. Inline editing lands in commit 2 of the templates M2
 * sequence — this commit just plumbs the data path.
 */

// `TemplateDef` was the old hardcoded shape. The live shape now lives
// in src/types/flizow.ts as TemplateRecord. The local alias keeps the
// rest of this file's signatures readable.
type TemplateDef = TemplateRecord;

// Live template list now flows from the store via resolveTemplates().
// The pristine BUILT_IN_TEMPLATES live in src/data/builtInTemplates.ts;
// edits + user-created records live in flizowStore.data.templateOverrides.
// See `templates` const inside TemplatesPage below.

// ── Icon sprites (inline so we don't depend on /icons.svg) ────────────

function TemplateIcon({ kind }: { kind: TemplateIcon }) {
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden width="14" height="14">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden width="12" height="12">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden width="12" height="12">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden width="12" height="12">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function TemplatesPage() {
  const route = useRoute();
  const { data } = useFlizow();
  // Live template list: built-ins overlaid with any user edits +
  // user-created records. Archived ones drop out of the picker.
  // Memoised on `templateOverrides` so a typed character in the
  // search box doesn't recompute the whole resolve.
  const templates = useMemo(
    () => resolveTemplates(data.templateOverrides),
    [data.templateOverrides],
  );

  // The list URL is `#templates`; the detail URL is `#templates/{id}`.
  // Fall back to the first template so the right pane is never empty.
  const routeId = route.params.id;
  const selectedId = useMemo(() => {
    if (routeId && templates.some((t) => t.id === routeId)) return routeId;
    return templates[0]?.id;
  }, [routeId, templates]);
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];

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
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [query, templates]);

  const canEdit = useCanEditTemplates();
  // "+ New template" — mints a blank record, persists it, and
  // navigates to its detail URL so the user lands on the editor with
  // the name input ready to go. crypto.randomUUID() over a ts+random
  // recipe — same reasoning as the contact-id fix in Wave 6.
  function handleNewTemplate() {
    const id = `tpl-${crypto.randomUUID()}`;
    flizowStore.upsertTemplate(blankTemplate(id));
    navigate(`#templates/${id}`);
  }

  // Defensive empty-state — built-in templates can't be hard-deleted,
  // but if all five are archived AND no user-created records exist
  // we'd reach here with `selected` undefined. Show a one-line "no
  // templates available" notice instead of crashing.
  if (!selected) {
    return (
      <div className="view view-templates active">
        <main style={{ padding: '64px 32px', maxWidth: 480, margin: '0 auto', color: 'var(--text-soft)' }}>
          No templates available. Restore one from the archive or create a new template.
        </main>
      </div>
    );
  }

  return (
    <div className="view view-templates active">
      <div className="templates-split-wrapper">
        <ListPane
          templates={filtered}
          selectedId={selectedId ?? ''}
          query={query}
          onQuery={setQuery}
          canEdit={canEdit}
          onNewTemplate={handleNewTemplate}
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
  canEdit,
  onNewTemplate,
}: {
  templates: TemplateDef[];
  selectedId: string;
  query: string;
  onQuery: (q: string) => void;
  canEdit: boolean;
  onNewTemplate: () => void;
}) {
  return (
    <aside className="templates-list-pane" aria-label="Service templates">
      <div className="templates-list-header">
        <div className="templates-list-title">Service Templates</div>
        <div className="templates-list-subtitle">Reusable blueprints for onboarding and kanban boards</div>
      </div>

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
        {/* "+ New template" — gated through useCanEditTemplates so the
            admin-only future is a one-line change. Spawns a blank
            user-created record and navigates straight to it so the
            user can rename + fill it in without an extra click.
            Audit: templates M2 (commit 3/4). */}
        {canEdit && (
          <button
            type="button"
            className="list-pane-add-btn"
            aria-label="New template"
            onClick={onNewTemplate}
          >
            <PlusIcon />
            <span>New template</span>
          </button>
        )}
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

  // Edit gate. Returns true unconditionally today; later the hook will
  // wire to a role check. Every <InlineText disabled={!canEdit}> below
  // gates through this so admin-only is a one-line change. Audit:
  // templates M2.
  const canEdit = useCanEditTemplates();
  const isBuiltIn = isBuiltInTemplate(template.id);
  const hasBeenEdited = template.editedAt !== null;
  // "Reset to default" only makes sense for built-in templates (there's
  // no default for user-created records) and only when there are
  // actual edits to revert.
  const canReset = isBuiltIn && hasBeenEdited && canEdit;

  function togglePhase(index: number) {
    setOpenPhases((prev) => {
      const currentSet = prev[template.id] ?? new Set<number>();
      const next = new Set(currentSet);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, [template.id]: next };
    });
  }

  // Tiny helper: every save handler in this pane is "patch the record
  // on top of the current `template` and upsert." The function body
  // changes per field; the wrapper stays the same.
  function save(patch: Partial<TemplateDef>) {
    flizowStore.upsertTemplate({ ...template, ...patch });
  }

  // Helpers for editing nested arrays — keep the call sites readable
  // by isolating the index math.
  function savePhaseName(index: number, name: string) {
    const phases = template.phases.map((p, i) => i === index ? { ...p, name } : p);
    save({ phases });
  }
  function saveSubtask(phaseIndex: number, subIndex: number, text: string) {
    const phases = template.phases.map((p, i) => {
      if (i !== phaseIndex) return p;
      const subtasks = p.subtasks.map((s, j) => j === subIndex ? text : s);
      return { ...p, subtasks };
    });
    save({ phases });
  }
  function saveOnboarding(side: 'client' | 'us', index: number, text: string) {
    const list = template.onboarding[side].map((item, i) => i === index ? text : item);
    save({ onboarding: { ...template.onboarding, [side]: list } });
  }
  function saveBriefField(index: number, text: string) {
    const brief = template.brief.map((b, i) => i === index ? text : b);
    save({ brief });
  }

  // ── Structure changes (commit 3 of M2 sequence) ───────────────────
  // Add / remove / reorder helpers. Phases get up/down arrows for
  // reordering instead of drag-and-drop because (a) it's keyboard-
  // accessible by default and (b) it doesn't drag in dnd-kit for a
  // surface that only needs to move 5–7 items. Subtasks / onboarding /
  // brief items don't get reordering — the audit only called for it on
  // phases, and the leaf lists are short enough that delete + re-add
  // covers the rare reorder case.

  function addPhase() {
    const phases = [...template.phases, { name: 'New phase', subtasks: [] }];
    save({ phases });
    // Auto-open the new phase so the user can start adding subtasks
    // immediately. Same UX as the inline card composer's enter-then-
    // type pattern.
    setOpenPhases((prev) => {
      const currentSet = prev[template.id] ?? new Set<number>();
      const next = new Set(currentSet);
      next.add(phases.length - 1);
      return { ...prev, [template.id]: next };
    });
  }
  function removePhase(index: number) {
    const phases = template.phases.filter((_, i) => i !== index);
    save({ phases });
  }
  function movePhase(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= template.phases.length) return;
    const phases = template.phases.slice();
    [phases[index], phases[target]] = [phases[target], phases[index]];
    save({ phases });
  }
  function addSubtask(phaseIndex: number) {
    const phases = template.phases.map((p, i) =>
      i === phaseIndex ? { ...p, subtasks: [...p.subtasks, 'New subtask'] } : p,
    );
    save({ phases });
  }
  function removeSubtask(phaseIndex: number, subIndex: number) {
    const phases = template.phases.map((p, i) => {
      if (i !== phaseIndex) return p;
      return { ...p, subtasks: p.subtasks.filter((_, j) => j !== subIndex) };
    });
    save({ phases });
  }
  function addOnboarding(side: 'client' | 'us') {
    const list = [...template.onboarding[side], 'New item'];
    save({ onboarding: { ...template.onboarding, [side]: list } });
  }
  function removeOnboarding(side: 'client' | 'us', index: number) {
    const list = template.onboarding[side].filter((_, i) => i !== index);
    save({ onboarding: { ...template.onboarding, [side]: list } });
  }
  function addBriefField() {
    save({ brief: [...template.brief, 'New field'] });
  }
  function removeBriefField(index: number) {
    save({ brief: template.brief.filter((_, i) => i !== index) });
  }

  return (
    <div className="templates-detail-pane">
      <section className="template-detail-page">
        <div className="template-hero">
          <div className="template-hero-icon">
            <TemplateIcon kind={template.icon} />
          </div>
          <div className="template-hero-body">
            <div className="template-hero-title">
              <InlineText
                value={template.name}
                onSave={(name) => save({ name })}
                disabled={!canEdit}
                ariaLabel="Template name"
              />
            </div>
            <div className="template-hero-meta">
              <span className="template-category-chip">
                <InlineText
                  value={template.category}
                  onSave={(category) => save({ category })}
                  disabled={!canEdit}
                  ariaLabel="Template category"
                />
              </span>
              {/* Read-only tag is honest about the editor state: it
                  shows on never-edited records (the "ships with the
                  product" baseline) and disappears the moment the
                  user touches anything. Drives clarity in the audit
                  M2 sense — the surface no longer lies about its
                  state in either direction. */}
              {!hasBeenEdited && (
                <span
                  className="template-readonly-tag"
                  title="No edits yet. Click any field to start customizing."
                >
                  Read-only
                </span>
              )}
              {/* Reset-to-default only renders on built-in templates
                  the user has actually edited. Audit: templates M2
                  (decision 5: yes to Reset to default). */}
              {canReset && (
                <button
                  type="button"
                  className="template-reset-btn"
                  onClick={() => flizowStore.resetTemplate(template.id)}
                  title="Restore this template to its built-in defaults"
                >
                  Reset to default
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="template-section">
          <div className="template-section-header">
            <div className="template-section-title">Phases</div>
            <div className="template-section-sub">
              <InlineText
                value={template.phasesSub}
                onSave={(phasesSub) => save({ phasesSub })}
                disabled={!canEdit}
                allowEmpty
                placeholder="Describe how this template's phases are paced"
                ariaLabel="Phases description"
              />
            </div>
          </div>
          <div className="template-phase-list">
            {template.phases.map((phase, i) => {
              const expanded = openSet.has(i);
              const panelId = `template-${template.id}-phase-${i}-subtasks`;
              const isFirst = i === 0;
              const isLast = i === template.phases.length - 1;
              return (
                <div key={i} className={`template-phase${expanded ? ' expanded' : ''}`}>
                  <div className="template-phase-row">
                    <div className="template-phase-num">{i + 1}</div>
                    <div className="template-phase-name">
                      <InlineText
                        value={phase.name}
                        onSave={(name) => savePhaseName(i, name)}
                        disabled={!canEdit}
                        ariaLabel={`Phase ${i + 1} name`}
                      />
                    </div>
                    <div className="template-phase-meta">{phase.subtasks.length} subtasks</div>
                    {/* Hover-revealed structure controls. Up/down for
                        reorder (disabled at the endpoints), × for
                        remove. Auto-hidden in read-only mode. Audit:
                        templates M2 (commit 3). */}
                    {canEdit && (
                      <div className="template-phase-actions">
                        <button
                          type="button"
                          className="template-phase-action"
                          onClick={() => movePhase(i, -1)}
                          disabled={isFirst}
                          aria-label={`Move ${phase.name} up`}
                          title="Move up"
                        >
                          <ArrowUpIcon />
                        </button>
                        <button
                          type="button"
                          className="template-phase-action"
                          onClick={() => movePhase(i, 1)}
                          disabled={isLast}
                          aria-label={`Move ${phase.name} down`}
                          title="Move down"
                        >
                          <ArrowDownIcon />
                        </button>
                        <button
                          type="button"
                          className="template-phase-action is-remove"
                          onClick={() => removePhase(i)}
                          aria-label={`Remove ${phase.name}`}
                          title="Remove phase"
                        >
                          <CloseIcon />
                        </button>
                      </div>
                    )}
                    {/* Chevron lives in its own button so the click
                        target for expand/collapse doesn't collide with
                        the InlineText edit gesture on the name. */}
                    <button
                      type="button"
                      className="template-phase-expand"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      aria-label={expanded ? `Collapse ${phase.name} subtasks` : `Expand ${phase.name} subtasks`}
                      onClick={() => togglePhase(i)}
                    >
                      <ChevronDown className="template-phase-chevron" />
                    </button>
                  </div>
                  <div id={panelId} className="template-phase-subtasks">
                    {phase.subtasks.map((st, j) => (
                      <div key={j} className="template-phase-subtask">
                        <span className="dot" />
                        <InlineText
                          value={st}
                          onSave={(text) => saveSubtask(i, j, text)}
                          disabled={!canEdit}
                          ariaLabel={`Subtask ${j + 1} of ${phase.name}`}
                        />
                        {canEdit && (
                          <button
                            type="button"
                            className="template-row-remove"
                            onClick={() => removeSubtask(i, j)}
                            aria-label={`Remove subtask ${st}`}
                            title="Remove subtask"
                          >
                            <CloseIcon />
                          </button>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <button
                        type="button"
                        className="template-add-row"
                        onClick={() => addSubtask(i)}
                      >
                        <PlusIcon />
                        Add subtask
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {canEdit && (
              <button
                type="button"
                className="template-add-row template-add-row--phase"
                onClick={addPhase}
              >
                <PlusIcon />
                Add phase
              </button>
            )}
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
                  <div className="template-checklist-item-label">
                    <InlineText
                      value={item}
                      onSave={(text) => saveOnboarding('client', i, text)}
                      disabled={!canEdit}
                      ariaLabel={`From-client onboarding item ${i + 1}`}
                    />
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="template-row-remove"
                      onClick={() => removeOnboarding('client', i)}
                      aria-label={`Remove ${item}`}
                      title="Remove item"
                    >
                      <CloseIcon />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button
                  type="button"
                  className="template-add-row"
                  onClick={() => addOnboarding('client')}
                >
                  <PlusIcon />
                  Add item
                </button>
              )}
            </div>
          </div>
          <div className="template-checklist-group">
            <div className="template-checklist-owner from-us">From us</div>
            <div className="template-checklist">
              {template.onboarding.us.map((item, i) => (
                <div key={i} className="template-checklist-item">
                  <span className="dot" />
                  <div className="template-checklist-item-label">
                    <InlineText
                      value={item}
                      onSave={(text) => saveOnboarding('us', i, text)}
                      disabled={!canEdit}
                      ariaLabel={`From-us onboarding item ${i + 1}`}
                    />
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="template-row-remove"
                      onClick={() => removeOnboarding('us', i)}
                      aria-label={`Remove ${item}`}
                      title="Remove item"
                    >
                      <CloseIcon />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button
                  type="button"
                  className="template-add-row"
                  onClick={() => addOnboarding('us')}
                >
                  <PlusIcon />
                  Add item
                </button>
              )}
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
                <InlineText
                  value={field}
                  onSave={(text) => saveBriefField(i, text)}
                  disabled={!canEdit}
                  ariaLabel={`Brief field ${i + 1}`}
                />
                {canEdit && (
                  <button
                    type="button"
                    className="template-row-remove"
                    onClick={() => removeBriefField(i)}
                    aria-label={`Remove ${field}`}
                    title="Remove field"
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <button
                type="button"
                className="template-add-row"
                onClick={addBriefField}
              >
                <PlusIcon />
                Add field
              </button>
            )}
          </div>
        </div>

        {/* Activity section deleted in Wave 4 (Templates M3). Will
            return when there's a real audit log to fill it. */}
      </section>
    </div>
  );
}
