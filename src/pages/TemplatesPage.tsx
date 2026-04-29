import { forwardRef, useLayoutEffect, useMemo, useState } from 'react';
// Renamed on import so local wrapper components named `ChevronDown` and
// `PlusIcon` (defined later in this file) can keep their existing names
// and call sites unchanged. The wrappers' bodies now delegate to the
// Heroicons components.
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon as HeroChevronDownIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ListBulletIcon,
  PlusIcon as HeroPlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRoute, navigate } from '../router';
import { useFlizow } from '../store/useFlizow';
import { resolveTemplates, isBuiltInTemplate, blankTemplate } from '../data/templates';
import { useCanEditTemplates } from '../hooks/useCanEditTemplates';
import { InlineText } from '../components/shared/InlineText';
import { ConfirmDangerDialog } from '../components/ConfirmDangerDialog';
import { flizowStore } from '../store/flizowStore';
import type { TemplateRecord, TemplateIcon, TemplatePhase } from '../types/flizow';

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
  return <HeroChevronDownIcon className={className} aria-hidden="true" />;
}

function PlusIcon() {
  return <HeroPlusIcon width={14} height={14} aria-hidden="true" />;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden width="12" height="12">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** Six-dots drag handle icon. Universal "this is draggable" cue —
 *  same shape used by Trello, Linear, Asana, etc. */
function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width="14" height="14">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
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

  // Archive list — used by the "Show archived" disclosure at the
  // bottom of the list pane. Pulled with includeArchived so we can
  // surface the archived items separately from the live picker.
  const allWithArchived = useMemo(
    () => resolveTemplates(data.templateOverrides, { includeArchived: true }),
    [data.templateOverrides],
  );
  const archived = useMemo(
    () => allWithArchived.filter((t) => t.archived),
    [allWithArchived],
  );

  // Archive flow follows the file-system trash metaphor:
  //   1. Click "Archive" on a live template → it moves to the
  //      Archived strip at the bottom of the list pane. One click.
  //   2. From the Archived strip, click "Restore" to bring it back
  //      to the picker, OR (user-created only) click "Delete
  //      permanently" to fire a ConfirmDangerDialog and then purge.
  //   Built-in templates can never be hard-purged — the underlying
  //   default in BUILT_IN_TEMPLATES is the safety net.
  const [purgeTarget, setPurgeTarget] = useState<TemplateRecord | null>(null);

  function handleArchive(record: TemplateRecord) {
    flizowStore.archiveTemplate(record);
    // Move the user to the next live template so they're not staring
    // at the same archived record they just hid. Falls back to no-op
    // if all templates end up archived (the empty-state branch above
    // handles that on next render).
    const nextLive = templates.find((t) => t.id !== record.id && !t.archived);
    if (nextLive) navigate(`#templates/${nextLive.id}`);
  }

  function handleRestore(record: TemplateRecord) {
    flizowStore.restoreTemplate(record);
    navigate(`#templates/${record.id}`);
  }

  function handlePurgeRequest(record: TemplateRecord) {
    setPurgeTarget(record);
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
          totalActive={allWithArchived.filter(t => !t.archived).length}
          selectedId={selectedId ?? ''}
          query={query}
          onQuery={setQuery}
          canEdit={canEdit}
          onNewTemplate={handleNewTemplate}
          archived={archived}
          onRestore={handleRestore}
          onPurge={handlePurgeRequest}
        />
        <DetailPane template={selected} onArchive={handleArchive} />
      </div>
      {/* Hard-purge confirm — only fires for user-created templates
          via ListPane's archived strip. Built-in templates can never
          reach this dialog. */}
      {purgeTarget && (
        <ConfirmDangerDialog
          title={`Delete "${purgeTarget.name}" permanently?`}
          body={
            <>
              <p style={{ margin: 0 }}>
                This template will be removed from the store. Existing
                services that were created from it keep their
                onboarding and phases — those snapshots aren't tied to
                the template at runtime.
              </p>
              <p style={{ margin: '10px 0 0' }}>
                You can't undo this. To bring it back, you'll need to
                rebuild it from scratch.
              </p>
            </>
          }
          confirmLabel="Delete permanently"
          onConfirm={() => {
            flizowStore.purgeTemplate(purgeTarget.id);
            setPurgeTarget(null);
          }}
          onClose={() => setPurgeTarget(null)}
        />
      )}
    </div>
  );
}

// ── List pane (left) ─────────────────────────────────────────────────

function ListPane({
  templates,
  totalActive,
  selectedId,
  query,
  onQuery,
  canEdit,
  onNewTemplate,
  archived,
  onRestore,
  onPurge,
}: {
  templates: TemplateDef[];
  /** Unfiltered active template count — drives the eyebrow.
   *  `templates` is search-filtered, so we can't derive it locally
   *  without losing the count when the user is typing in the search. */
  totalActive: number;
  selectedId: string;
  query: string;
  onQuery: (q: string) => void;
  canEdit: boolean;
  onNewTemplate: () => void;
  archived: TemplateDef[];
  onRestore: (record: TemplateDef) => void;
  onPurge: (record: TemplateDef) => void;
}) {
  // Archived strip is collapsed by default. The toggle reveals the
  // hidden records at the bottom of the list — same pattern Finder
  // uses for the Trash sidebar entry.
  const [showArchived, setShowArchived] = useState(false);
  // Eyebrow text — count + state breakdown. Falls back to a single
  // count when there are no archived templates so the line stays
  // clean for the common case.
  const eyebrowText = (() => {
    const a = archived.length;
    if (a === 0) {
      return totalActive === 1 ? '1 template' : `${totalActive} templates`;
    }
    return `${totalActive} active · ${a} archived`;
  })();
  return (
    <aside className="templates-list-pane" aria-label="Service templates">
      <div className="templates-list-header">
        <div className="page-greeting">{eyebrowText}</div>
        <h1 className="page-title">Templates</h1>
        <p className="page-date">
          Reusable blueprints for every kind of work you do.
        </p>
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

      {/* Archived strip — hidden by default, expands on click. Same
          metaphor as Finder's Trash sidebar entry. Each row offers
          "Restore"; user-created rows also offer the destructive
          "Delete permanently" path through ConfirmDangerDialog at the
          page level. Audit: templates M2 (commit 4/4). */}
      {archived.length > 0 && (
        <div className="templates-archive-strip">
          <button
            type="button"
            className="templates-archive-toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          >
            <ChevronDown
              className={`templates-archive-chevron${showArchived ? ' is-open' : ''}`}
            />
            <ArchiveBoxIcon width={14} height={14} aria-hidden="true" />
            Archived
            <span className="templates-archive-count">{archived.length}</span>
          </button>
          {showArchived && (
            <ul className="templates-archive-list">
              {archived.map((t) => (
                <li key={t.id} className="templates-archive-row">
                  <span className="templates-archive-name" title={t.name}>{t.name}</span>
                  <div className="templates-archive-actions">
                    <button
                      type="button"
                      className="templates-archive-action"
                      onClick={() => onRestore(t)}
                      aria-label={`Restore ${t.name}`}
                      // Mirror the screen-reader name as a hover hint so
                      // mouse users see the template name when the row's
                      // visible label is truncated. Without it, the
                      // disambiguator only existed for SR users — sighted
                      // mouse users hovering "Restore" got nothing back.
                      // Audit: templates MED.
                      title={`Restore ${t.name}`}
                    >
                      <ArrowUturnLeftIcon width={12} height={12} aria-hidden="true" />
                      Restore
                    </button>
                    {/* Hard-purge only on user-created rows. Built-in
                        templates can always be restored — that's the
                        safety net that lets us never offer purge for
                        them. */}
                    {t.userCreated && (
                      <button
                        type="button"
                        className="templates-archive-action is-danger"
                        onClick={() => onPurge(t)}
                        aria-label={`Delete ${t.name} permanently`}
                        title={`Delete ${t.name} permanently`}
                      >
                        <TrashIcon width={12} height={12} aria-hidden="true" />
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}

// ── Detail pane (right) ──────────────────────────────────────────────

function DetailPane({
  template,
  onArchive,
}: {
  template: TemplateDef;
  /** Caller owns the confirm dialog because for user-created
   *  templates we want a proper destructive confirm before purging.
   *  Built-in templates archive directly; the parent decides. */
  onArchive: (template: TemplateDef) => void;
}) {
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
  // When non-null, a confirm dialog is stacked over the editor for
  // a phase that has subtasks the user is about to discard.
  const [removePhaseTarget, setRemovePhaseTarget] = useState<{
    index: number;
    name: string;
    subtaskCount: number;
  } | null>(null);

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
    const phase = template.phases[index];
    // Cheap forgiveness: a phase with a single placeholder subtask
    // doesn't merit a confirm. Only ask when there's content the
    // user might miss. Audit: HIG #6 (forgiveness) — we'd rather
    // ask once than restore a phase from "wait, where did my
    // subtasks go?". Snapshot semantics still apply (existing
    // services keep their seeded data), so this is purely about
    // confidence in the editor itself.
    if (phase && phase.subtasks.length > 0) {
      setRemovePhaseTarget({ index, name: phase.name, subtaskCount: phase.subtasks.length });
      return;
    }
    const phases = template.phases.filter((_, i) => i !== index);
    save({ phases });
  }
  function confirmRemovePhase() {
    if (!removePhaseTarget) return;
    const phases = template.phases.filter((_, i) => i !== removePhaseTarget.index);
    save({ phases });
    setRemovePhaseTarget(null);
  }
  function reorderPhases(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const phases = arrayMove(template.phases, fromIndex, toIndex);
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
              {/* Wave 6 added a "Read-only" tag here as honesty before
                  the editor existed. With the Wave 7 editor live, the
                  tag actively misleads — users read it and conclude
                  they can't edit, when in fact every field is
                  click-to-edit. Replaced with a small affordance
                  hint that only appears on never-edited templates,
                  so a first-time user sees the gesture is available
                  and an experienced user doesn't get nagged. */}
              {!hasBeenEdited && canEdit && (
                <span className="template-edit-hint" aria-hidden="true">
                  Click any field to edit
                </span>
              )}
              {/* Reset-to-default — always visible on built-in
                  templates so users discover the affordance from
                  the first visit, but disabled when there's nothing
                  to reset. Used to be conditional on hasBeenEdited
                  ({canReset && ...}); user feedback flagged that
                  the button was invisible on never-edited templates,
                  so they couldn't tell the safety net existed.
                  Audit: templates M2 + post-Wave-7 user feedback. */}
              {isBuiltIn && canEdit && (
                <button
                  type="button"
                  className="template-reset-btn"
                  onClick={() => flizowStore.resetTemplate(template.id)}
                  disabled={!hasBeenEdited}
                  title={
                    hasBeenEdited
                      ? 'Restore this template to its built-in defaults'
                      : 'No edits to reset — this template is at its built-in shape'
                  }
                >
                  Reset to default
                </button>
              )}
              {/* Archive: hides from the picker but keeps the record
                  so existing services can still resolve their
                  template name. Both built-in and user-created
                  records archive with one click; the destructive
                  "Delete permanently" affordance for user-created
                  records lives on the archived strip below, behind
                  ConfirmDangerDialog. Audit: templates M2
                  (decision 2: soft delete). */}
              {canEdit && (
                <button
                  type="button"
                  className="template-reset-btn template-archive-btn"
                  onClick={() => onArchive(template)}
                  title="Hide this template from the picker"
                >
                  <ArchiveBoxIcon width={14} height={14} aria-hidden="true" />
                  Archive
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="template-section">
          <div className="template-section-header">
            <div className="template-section-title">
              <ListBulletIcon width={14} height={14} aria-hidden="true" />
              Phases
            </div>
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
          <PhaseList
            template={template}
            openSet={openSet}
            canEdit={canEdit}
            onTogglePhase={togglePhase}
            onSavePhaseName={savePhaseName}
            onRemovePhase={removePhase}
            onReorderPhases={reorderPhases}
            onSaveSubtask={saveSubtask}
            onAddSubtask={addSubtask}
            onRemoveSubtask={removeSubtask}
            onAddPhase={addPhase}
          />
        </div>

        {/* Onboarding */}
        <div className="template-section">
          <div className="template-section-header">
            <div className="template-section-title">
              <ClipboardDocumentIcon width={14} height={14} aria-hidden="true" />
              Onboarding checklist
            </div>
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
            <div className="template-section-title">
              <DocumentTextIcon width={14} height={14} aria-hidden="true" />
              Project brief fields
            </div>
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

      {/* Confirm dialog for removing a phase with subtasks. Only
          renders when the user clicks × on a content-rich phase —
          phases with zero subtasks remove without a confirm because
          there's nothing to lose. Audit: HIG #6 (forgiveness). */}
      {removePhaseTarget && (
        <ConfirmDangerDialog
          title={`Remove "${removePhaseTarget.name}"?`}
          body={
            <>
              <p style={{ margin: 0 }}>
                This phase has{' '}
                <strong>
                  {removePhaseTarget.subtaskCount}{' '}
                  {removePhaseTarget.subtaskCount === 1 ? 'subtask' : 'subtasks'}
                </strong>
                {' '}that will go with it.
              </p>
              <p style={{ margin: '10px 0 0' }}>
                Existing services that were created from this template
                keep their seeded phases — those snapshots aren't tied
                to the template at runtime. Only new services started
                from this template will be affected.
              </p>
            </>
          }
          confirmLabel="Remove phase"
          onConfirm={confirmRemovePhase}
          onClose={() => setRemovePhaseTarget(null)}
        />
      )}
    </div>
  );
}

// ── Phase list (drag-and-drop) ───────────────────────────────────────

/**
 * Wraps the phase list in dnd-kit's DndContext + SortableContext so
 * each row is draggable. Drop indicator is a horizontal blue line
 * rendered above the over-target via a CSS pseudo-element gated on
 * `data-drop-active="true"`.
 *
 * Wave 7's first cut used ↑/↓ buttons. User feedback after that ship
 * asked for direct manipulation — drag the row to the spot you want
 * it. Same gesture as the kanban board, same dnd-kit primitives.
 */
function PhaseList({
  template,
  openSet,
  canEdit,
  onTogglePhase,
  onSavePhaseName,
  onRemovePhase,
  onReorderPhases,
  onSaveSubtask,
  onAddSubtask,
  onRemoveSubtask,
  onAddPhase,
}: {
  template: TemplateRecord;
  openSet: Set<number>;
  canEdit: boolean;
  onTogglePhase: (i: number) => void;
  onSavePhaseName: (i: number, name: string) => void;
  onRemovePhase: (i: number) => void;
  onReorderPhases: (from: number, to: number) => void;
  onSaveSubtask: (phaseIndex: number, subIndex: number, text: string) => void;
  onAddSubtask: (phaseIndex: number) => void;
  onRemoveSubtask: (phaseIndex: number, subIndex: number) => void;
  onAddPhase: () => void;
}) {
  // Stable row IDs derived from index. Phases don't have persistent
  // ids, so the reorder handler uses positions directly. dnd-kit
  // tolerates index-based ids fine because `arrayMove` is computed
  // from the active/over indices we look up at drop time.
  const phaseIds = useMemo(
    () => template.phases.map((_, i) => `phase-${i}`),
    [template.phases],
  );

  // Pointer + keyboard sensors. KeyboardSensor uses the standard
  // sortableKeyboardCoordinates so Space picks up the row, arrows
  // move it, Space drops it, Esc cancels — same as the kanban
  // board's keyboard story. Audit memo is consistent across drag
  // surfaces.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const fromIndex = phaseIds.indexOf(String(e.active.id));
    const toIndex = phaseIds.indexOf(String(e.over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    onReorderPhases(fromIndex, toIndex);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  // When canEdit is false (future admin gate), skip dnd entirely so
  // read-only viewers don't get a drag affordance they can't act on.
  if (!canEdit) {
    return (
      <div className="template-phase-list">
        {template.phases.map((phase, i) => (
          <PhaseBody
            key={i}
            phase={phase}
            index={i}
            template={template}
            openSet={openSet}
            canEdit={false}
            onTogglePhase={onTogglePhase}
            onSavePhaseName={onSavePhaseName}
            onRemovePhase={onRemovePhase}
            onSaveSubtask={onSaveSubtask}
            onAddSubtask={onAddSubtask}
            onRemoveSubtask={onRemoveSubtask}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={phaseIds} strategy={verticalListSortingStrategy}>
        <div className="template-phase-list">
          {template.phases.map((phase, i) => (
            <SortablePhase
              key={phaseIds[i]}
              id={phaseIds[i]}
              phase={phase}
              index={i}
              template={template}
              openSet={openSet}
              activeId={activeId}
              onTogglePhase={onTogglePhase}
              onSavePhaseName={onSavePhaseName}
              onRemovePhase={onRemovePhase}
              onSaveSubtask={onSaveSubtask}
              onAddSubtask={onAddSubtask}
              onRemoveSubtask={onRemoveSubtask}
            />
          ))}
          <button
            type="button"
            className="template-add-row template-add-row--phase"
            onClick={onAddPhase}
          >
            <PlusIcon />
            Add phase
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}

/** A phase row wrapped in useSortable. The drag handle on the right
 *  carries the listeners — only that handle starts a drag, so the
 *  user can still freely click the InlineText name and the chevron
 *  expand without accidentally picking the row up. */
function SortablePhase({
  id,
  phase,
  index,
  template,
  openSet,
  activeId,
  onTogglePhase,
  onSavePhaseName,
  onRemovePhase,
  onSaveSubtask,
  onAddSubtask,
  onRemoveSubtask,
}: {
  id: string;
  phase: TemplatePhase;
  index: number;
  template: TemplateRecord;
  openSet: Set<number>;
  activeId: string | null;
  onTogglePhase: (i: number) => void;
  onSavePhaseName: (i: number, name: string) => void;
  onRemovePhase: (i: number) => void;
  onSaveSubtask: (phaseIndex: number, subIndex: number, text: string) => void;
  onAddSubtask: (phaseIndex: number) => void;
  onRemoveSubtask: (phaseIndex: number, subIndex: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    over,
    active,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // "Drop above" indicator: the line shows above the over-target
  // when dragging an item from below it (i.e., the dragged item
  // would settle BEFORE this row). When dragging from above, the
  // indicator shows below the over-target. We compute "from where"
  // by comparing the active and over indices at render time.
  const dropAbove = isOver
    && active
    && over
    && phaseIds(template).indexOf(String(active.id)) > index;
  const dropBelow = isOver
    && active
    && over
    && phaseIds(template).indexOf(String(active.id)) < index;

  return (
    <PhaseBody
      ref={setNodeRef}
      phase={phase}
      index={index}
      template={template}
      openSet={openSet}
      canEdit={true}
      style={style}
      isDragging={isDragging}
      isActive={activeId === id}
      dropAbove={dropAbove ?? false}
      dropBelow={dropBelow ?? false}
      dragHandleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef }}
      onTogglePhase={onTogglePhase}
      onSavePhaseName={onSavePhaseName}
      onRemovePhase={onRemovePhase}
      onSaveSubtask={onSaveSubtask}
      onAddSubtask={onAddSubtask}
      onRemoveSubtask={onRemoveSubtask}
    />
  );
}

// Tiny helper so SortablePhase can compute the active index without
// pulling the whole phase list into props. `template` is in scope
// already; this just walks its phases.
function phaseIds(template: TemplateRecord): string[] {
  return template.phases.map((_, i) => `phase-${i}`);
}

type PhaseBodyProps = {
  phase: TemplatePhase;
  index: number;
  template: TemplateRecord;
  openSet: Set<number>;
  canEdit: boolean;
  style?: React.CSSProperties;
  isDragging?: boolean;
  isActive?: boolean;
  dropAbove?: boolean;
  dropBelow?: boolean;
  /** dnd-kit's drag-handle props bundle. Includes the listeners,
   *  attributes, and a ref-callback for the activator node. We
   *  destructure the ref out and spread the rest onto the handle
   *  button. */
  dragHandleProps?: {
    ref?: (node: HTMLElement | null) => void;
  } & Record<string, unknown>;
  onTogglePhase: (i: number) => void;
  onSavePhaseName: (i: number, name: string) => void;
  onRemovePhase: (i: number) => void;
  onSaveSubtask: (phaseIndex: number, subIndex: number, text: string) => void;
  onAddSubtask: (phaseIndex: number) => void;
  onRemoveSubtask: (phaseIndex: number, subIndex: number) => void;
};

/** Visual body of a phase row. Used by both the dnd-kit-wrapped
 *  SortablePhase and the canEdit:false fallback. forwardRef so the
 *  sortable wrapper can attach setNodeRef on the outer div. */
const PhaseBody = forwardRef<HTMLDivElement, PhaseBodyProps>(function PhaseBody(props, ref) {
  const {
    phase, index, template, openSet, canEdit,
    style, isDragging, isActive, dropAbove, dropBelow, dragHandleProps,
    onTogglePhase, onSavePhaseName, onRemovePhase,
    onSaveSubtask, onAddSubtask, onRemoveSubtask,
  } = props;
  const expanded = openSet.has(index);
  const panelId = `template-${template.id}-phase-${index}-subtasks`;
  // Pull the activator ref out of the drag-handle bundle so we can
  // attach it to the button element. The rest of the props (sensor
  // listeners + a11y attributes) spread onto the button.
  const handleRef = dragHandleProps?.ref;
  const handleRest = dragHandleProps ? { ...dragHandleProps } : undefined;
  if (handleRest) delete (handleRest as { ref?: unknown }).ref;
  return (
    <div
      ref={ref}
      className={[
        'template-phase',
        expanded ? 'expanded' : '',
        isDragging ? 'is-dragging' : '',
        isActive ? 'is-active' : '',
        dropAbove ? 'drop-above' : '',
        dropBelow ? 'drop-below' : '',
      ].filter(Boolean).join(' ')}
      style={style}
    >
      {/* Whole row is the toggle. Single-click anywhere — including
          the phase name — flips the subtask panel. The phase name
          uses InlineText with `gesture="doubleClick"`, so editing
          the name needs a double-click; single-click belongs to
          the row's toggle. The drag handle and × stop propagation
          via their own buttons.
          Keyboard: Tab to focus the row, Enter or Space to toggle.
          ARIA: role="button" + aria-expanded + aria-controls so
          screen readers announce the disclosure relationship. */}
      <div
        className="template-phase-row"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${phase.name}, ${expanded ? 'expanded' : 'collapsed'}. ${phase.subtasks.length} subtasks. Click to toggle, double-click name to rename.`}
        onClick={(e) => {
          // Skip if the click originated inside the actions group or
          // the drag handle — those have their own semantics. The
          // InlineText field (phase name) lives inside the row but
          // uses a double-click gesture, so its single-click bubbles
          // up to here on purpose.
          if ((e.target as HTMLElement).closest(
            '.template-phase-actions, .template-phase-drag, input, [contenteditable]',
          )) return;
          onTogglePhase(index);
        }}
        onKeyDown={(e) => {
          // Same target check as click: keyboard activation on the
          // row toggles, but Enter/Space inside an inner button or
          // input belongs to that element.
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTogglePhase(index);
          }
        }}
      >
        {canEdit && handleRest && (
          <button
            ref={handleRef}
            type="button"
            className="template-phase-drag"
            aria-label={`Drag ${phase.name} to reorder`}
            title="Drag to reorder. Keyboard: focus + Space, then arrows, then Space to drop."
            {...handleRest}
          >
            <DragHandleIcon />
          </button>
        )}
        <div className="template-phase-num">{index + 1}</div>
        <div className="template-phase-name">
          <InlineText
            value={phase.name}
            onSave={(name) => onSavePhaseName(index, name)}
            disabled={!canEdit}
            ariaLabel={`Phase ${index + 1} name`}
            // Single-click on the name lets the row's toggle fire
            // (so the panel opens). Double-click on the name enters
            // edit mode. Keeps the toggle as the dominant gesture
            // while keeping the name editable.
            gesture="doubleClick"
          />
        </div>
        <div className="template-phase-meta">{phase.subtasks.length} subtasks</div>
        {canEdit && (
          <div className="template-phase-actions">
            <button
              type="button"
              className="template-phase-action is-remove"
              onClick={() => onRemovePhase(index)}
              aria-label={`Remove ${phase.name}`}
              title="Remove phase"
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>
      <div id={panelId} className="template-phase-subtasks">
        {phase.subtasks.map((st, j) => (
          <div key={j} className="template-phase-subtask">
            <span className="dot" />
            <InlineText
              value={st}
              onSave={(text) => onSaveSubtask(index, j, text)}
              disabled={!canEdit}
              ariaLabel={`Subtask ${j + 1} of ${phase.name}`}
            />
            {canEdit && (
              <button
                type="button"
                className="template-row-remove"
                onClick={() => onRemoveSubtask(index, j)}
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
            onClick={() => onAddSubtask(index)}
          >
            <PlusIcon />
            Add subtask
          </button>
        )}
      </div>
    </div>
  );
});
