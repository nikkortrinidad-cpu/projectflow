import { useEffect, useMemo, useRef, useState } from 'react';
import type { Service, ServiceType, TemplateKey } from '../types/flizow';
import { flizowStore } from '../store/flizowStore';
import { TEMPLATE_OPTIONS } from '../data/serviceTemplateOptions';
import { useModalAutofocus } from '../hooks/useModalAutofocus';
import { useModalKeyboard } from '../hooks/useModalKeyboard';

/**
 * Edit-existing-service modal. Covers the fields AddServiceModal sets at
 * creation time — name, type, template, next deliverable — plus a
 * Progress slider that AddServiceModal doesn't surface (new services
 * start at 0%).
 *
 * The modal is deliberately additive-only: it edits metadata, never
 * triggers the template seeding that Add Service runs. Changing
 * `templateKey` after the board already has cards won't re-seed the
 * onboarding checklist or swap the POOL_LABEL on existing tasks — it's
 * purely a relabel. That's noted inline so the user doesn't expect
 * hidden magic.
 *
 * Delete lives on the ClientDetailPage services strip already
 * (setDeleteServiceId), so it's intentionally NOT duplicated here.
 * Destructive actions should have one home; two entry points to the
 * same cascade delete would double the chance of an accidental click.
 *
 * Shell + field styling reuses the wip-modal-* classes shared across
 * AddServiceModal, AddQuickLinkModal, AddContactModal, TouchpointModal,
 * and InsertLinkDialog.
 */

interface Props {
  service: Service;
  onClose: () => void;
}

export function EditServiceModal({ service, onClose }: Props) {
  const [name, setName] = useState(service.name);
  const [type, setType] = useState<ServiceType>(service.type);
  const [templateKey, setTemplateKey] = useState<TemplateKey>(service.templateKey);
  const [progress, setProgress] = useState<number>(
    Math.max(0, Math.min(100, Math.round(service.progress))),
  );
  const [nextDeliverableAt, setNextDeliverableAt] = useState<string>(
    // nextDeliverableAt may be stored as a full ISO or bare YYYY-MM-DD;
    // the <input type="date"> only accepts the date part either way.
    service.nextDeliverableAt.slice(0, 10),
  );
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Keep the template valid for the selected type. Matches AddServiceModal:
  // if the user picks "retainer" while a project-only template is selected,
  // snap to the first template that still fits rather than letting them
  // save a mismatch.
  const visibleTemplates = useMemo(
    () => TEMPLATE_OPTIONS.filter(t => t.allowed.includes(type)),
    [type],
  );

  useEffect(() => {
    if (!visibleTemplates.some(t => t.value === templateKey) && visibleTemplates.length) {
      setTemplateKey(visibleTemplates[0].value);
    }
  }, [visibleTemplates, templateKey]);

  // Autofocus name and select so hitting the modal with Cmd+Return
  // after a typo fix is one gesture, not two.
  useModalAutofocus(nameRef, { select: true });

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      nameRef.current?.focus();
      window.setTimeout(() => setNameError(false), 1400);
      return;
    }
    // Clamp progress defensively — the slider stays in range but a user
    // typing directly into the number field can type "200".
    const clampedProgress = Math.max(0, Math.min(100, Math.round(progress || 0)));

    flizowStore.updateService(service.id, {
      name: trimmedName,
      type,
      templateKey,
      progress: clampedProgress,
      // Re-ISO the date so the store stays in one shape even though the
      // <input type="date"> hands us YYYY-MM-DD on its own.
      nextDeliverableAt: new Date(`${nextDeliverableAt}T00:00:00`).toISOString(),
    });
    onClose();
  }

  // Escape closes; Cmd/Ctrl+Enter saves. Shared hook; no more
  // hand-rolled keydown listener.
  useModalKeyboard({ onClose, onSave: handleSave });

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Flag whether the template has actually changed. We surface a subtle
  // inline note in that case so the user knows the relabel is just a
  // label — not a re-seed of onboarding or cards.
  const templateChanged = templateKey !== service.templateKey;

  return (
    <div
      className="wip-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-service-title"
      onClick={handleBackdropClick}
    >
      <div className="wip-modal" role="document" style={{ maxWidth: 520 }}>
        <header className="wip-modal-head">
          <h2 className="wip-modal-title" id="edit-service-title">Edit service</h2>
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
              {templateChanged
                ? 'Changing the template relabels this service. Existing cards and onboarding items stay put.'
                : 'Drives the POOL label on cards and the onboarding checklist.'}
            </span>
          </label>

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
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                minWidth: 60,
              }}>
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
            Save changes
          </button>
        </footer>
      </div>
    </div>
  );
}
