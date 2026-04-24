import type { Service } from '../types/flizow';
import { flizowStore } from '../store/flizowStore';
import { ServiceMetadataForm } from './shared/ServiceMetadataForm';

/**
 * Edit-existing-service modal. Thin wrapper over the shared
 * ServiceMetadataForm — this file only owns two things:
 *
 *   1. Mapping the existing Service record into the form's initial
 *      shape (progress clamped, nextDeliverableAt pulled through).
 *   2. Writing the edit back to the store and closing. The form
 *      doesn't auto-close on submit; it hands the user's values to
 *      us and we decide what to do with them.
 *
 * Delete lives on the ClientDetailPage services strip already, so it's
 * intentionally NOT duplicated here. Destructive actions should have
 * one home; two entry points to the same cascade delete would double
 * the chance of an accidental click.
 *
 * Pre-extraction this file was ~280 lines of form JSX copy-pasted
 * from AddServiceModal. They had started to drift — autofocus
 * behaviour, hint copy, the 80ms magic number. Now both callers
 * share one surface and neither can drift.
 */
export function EditServiceModal({ service, onClose }: { service: Service; onClose: () => void }) {
  return (
    <ServiceMetadataForm
      mode="edit"
      initial={{
        name: service.name,
        type: service.type,
        templateKey: service.templateKey,
        progress: service.progress,
        nextDeliverableAt: service.nextDeliverableAt,
      }}
      originalTemplateKey={service.templateKey}
      onClose={onClose}
      onSubmit={(values) => {
        flizowStore.updateService(service.id, {
          name: values.name,
          type: values.type,
          templateKey: values.templateKey,
          progress: values.progress,
          // Re-ISO the date so the store stays in one shape even though
          // the <input type="date"> hands us YYYY-MM-DD on its own.
          nextDeliverableAt: new Date(`${values.nextDeliverableAt}T00:00:00`).toISOString(),
        });
        onClose();
      }}
    />
  );
}
