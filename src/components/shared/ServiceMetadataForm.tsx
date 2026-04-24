import { useEffect, useMemo, useRef, useState } from 'react';
import type { ServiceType, TemplateKey } from '../../types/flizow';
import { TEMPLATE_OPTIONS } from '../../data/serviceTemplateOptions';
import { useModalAutofocus } from '../../hooks/useModalAutofocus';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';
import { useModalKeyboard } from '../../hooks/useModalKeyboard';

/**
 * ServiceMetadataForm — the shared modal form used by both Add Service
 * (in ClientDetailPage) and EditServiceModal. Before extraction, both
 * modals hand-rolled ~180 lines of near-identical JSX that had started
 * to drift (autofocus behavior differed, template hint text differed,
 * the 80ms setTimeout was written twice).
 *
 * The caller is responsible for deciding what to do on submit — that's
 * where the two modes diverge most: Add creates a service and navigates
 * to its board; Edit updates the existing record. Everything else —
 * fields, validation, keyboard shortcuts, backdrop click — is the same
 * in both shapes.
 *
 * Progress slider only appears in Edit mode; new services start at 0%
 * by policy, so surfacing a slider would be an attractive nuisance.
 *
 * When `originalTemplateKey` is passed and the user changes the template,
 * we show a subtle inline note clarifying that the change is a relabel
 * only — it doesn't re-seed the onboarding checklist or swap labels on
 * existing cards. That was a real bit of user-visible honesty from the
 * pre-extraction EditServiceModal and is preserved here.
 */

export type ServiceFormValues = {
  name: string;
  type: ServiceType;
  templateKey: TemplateKey;
  progress: number;
  /** YYYY-MM-DD (what `<input type="date">` emits). Caller is responsible
   *  for re-ISO-ing on the store write if it wants a full timestamp. */
  nextDeliverableAt: string;
};

interface Props {
  mode: 'add' | 'edit';
  initial: ServiceFormValues;
  /** Called on a valid Cmd/Ctrl+Enter or click of the primary button.
   *  Does NOT auto-close the modal — the caller decides what happens
   *  next (navigate, toast, stay open to add another, etc.). */
  onSubmit: (values: ServiceFormValues) => void;
  onClose: () => void;
  /** Optional override for the modal h2. Defaults to "Add service" /
   *  "Edit service" based on `mode`. */
  title?: string;
  /** Optional override for the primary button label. */
  submitLabel?: string;
  /** For `mode === 'edit'` only — used to decide whether to show the
   *  "template changed, this is a relabel" note. */
  originalTemplateKey?: TemplateKey;
}

export function ServiceMetadataForm({
  mode,
  initial,
  onSubmit,
  onClose,
  title,
  submitLabel,
  originalTemplateKey,
}: Props) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<ServiceType>(initial.type);
  const [templateKey, setTemplateKey] = useState<TemplateKey>(initial.templateKey);
  const [progress, setProgress] = useState<number>(
    Math.max(0, Math.min(100, Math.round(initial.progress))),
  );
  const [nextDeliverableAt, setNextDeliverableAt] = useState<string>(
    // Accept either a full ISO or bare YYYY-MM-DD; the native date input
    // only uses the date slice.
    initial.nextDeliverableAt.slice(0, 10),
  );
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // Modal shell ref so the focus trap can query descendants. Both add
  // and edit share this form, so fixing the trap here fixes both flows.
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(modalRef);

  // Only show templates allowed for the selected type. If the user
  // switches to a type that disallows the current template, snap to
  // the first allowed option rather than letting the user save a
  // mismatch.
  const visibleTemplates = useMemo(
    () => TEMPLATE_OPTIONS.filter(t => t.allowed.includes(type)),
    [type],
  );
  useEffect(() => {
    if (!visibleTemplates.some(t => t.value === templateKey) && visibleTemplates.length) {
      setTemplateKey(visibleTemplates[0].value);
    }
  }, [visibleTemplates, templateKey]);

  // Edit mode selects the field — user came here to rename or tweak an
  // existing string. Add mode starts empty, so select is a no-op.
  useModalAutofocus(nameRef, { select: mode === 'edit' });

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      nameRef.current?.focus();
      window.setTimeout(() => setNameError(false), 1400);
      return;
    }
    const clampedProgress = Math.max(0, Math.min(100, Math.round(progress || 0)));
    onSubmit({
      name: trimmedName,
      type,
      templateKey,
      progress: clampedProgress,
      nextDeliverableAt,
    });
  }

  useModalKeyboard({ onClose, onSave: handleSave });

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const showProgress = mode === 'edit';
  const resolvedTitle = title ?? (mode === 'add' ? 'Add service' : 'Edit service');
  const resolvedSubmitLabel = submitLabel ?? (mode === 'add' ? 'Create service' : 'Save changes');
  const templateChanged =
    originalTemplateKey != null && templateKey !== originalTemplateKey;
  const titleId = mode === 'add' ? 'add-service-title' : 'edit-service-title';

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
    >
      <div ref={modalRef} className="wip-modal" role="document" style={{ maxWidth: 520 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id={titleId}>{resolvedTitle}</h2>
          <button type="button" className="wip-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="wip-modal-body">
          <label className="wip-field">
            <span className="wip-field-label">Service name</span>
            <input
              ref={nameRef}
              type="text"
              className="wip-field-input"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
              placeholder="e.g. Q2 Paid Social Retainer"
              style={nameError ? { borderColor: 'var(--status-fire)' } : undefined}
              aria-invalid={nameError || undefined}
            />
          </label>

          <div className="wip-field" role="radiogroup" aria-label="Service type">
            <span className="wip-field-label">Type</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['retainer', 'project'] as ServiceType[]).map(opt => {
                const checked = type === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setType(opt)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: checked
                        ? '2px solid var(--highlight)'
                        : '1px solid var(--hairline-soft)',
                      background: checked ? 'var(--highlight-soft)' : 'var(--bg-elev)',
                      color: 'var(--text)',
                      font: 'inherit',
                      fontWeight: checked ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ textTransform: 'capitalize' }}>{opt}</div>
                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-soft)', marginTop: 2 }}>
                      {opt === 'retainer'
                        ? 'Ongoing monthly scope'
                        : 'Fixed deliverable, ships once'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="wip-field">
            <span className="wip-field-label">Template</span>
            <select
              className="wip-field-input"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value as TemplateKey)}
            >
              {visibleTemplates.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', marginTop: 4, display: 'block' }}>
              {mode === 'add'
                ? 'Seeds the board with starter columns and a few example cards.'
                : templateChanged
                  ? 'Changing the template relabels this service. Existing cards and onboarding items stay put.'
                  : 'Drives the POOL label on cards and the onboarding checklist.'}
            </span>
          </label>

          {showProgress && (
            <label className="wip-field">
              <span className="wip-field-label">
                Progress
                <span style={{ marginLeft: 8, color: 'var(--text-faint)', fontWeight: 400, fontSize: 'var(--fs-xs)' }}>
                  drives the bar on the service card
                </span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  aria-label="Progress percentage"
                  style={{ flex: 1 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 60 }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="wip-field-input"
                    style={{ width: 60, textAlign: 'right' }}
                    aria-label="Progress percentage"
                  />
                  <span style={{ color: 'var(--text-faint)', fontSize: 'var(--fs-sm)' }}>%</span>
                </div>
              </div>
            </label>
          )}

          <label className="wip-field">
            <span className="wip-field-label">
              {type === 'project' ? 'Due date' : 'Next deliverable'}
            </span>
            <input
              type="date"
              className="wip-field-input"
              value={nextDeliverableAt}
              onChange={(e) => setNextDeliverableAt(e.target.value)}
            />
          </label>
        </div>

        <footer className="wip-modal-foot">
          <button type="button" className="wip-btn wip-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="wip-btn wip-btn-primary" onClick={handleSave}>
            {resolvedSubmitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
