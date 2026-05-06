import type { ServiceType, TemplateRecord } from '../types/flizow';
import { resolveTemplates } from './templates';

/**
 * Template options for the Add Service / Edit Service template picker.
 *
 * Pre-2026-05-06: this module exported a hard-coded TEMPLATE_OPTIONS
 * array that listed legacy template keys ('demandgen', 'contentSEO',
 * etc.). The list never matched the live workspace templates the user
 * managed on the Templates page, which meant new user-created
 * templates didn't show up in the Add Service dropdown — the bug that
 * triggered the rewrite.
 *
 * The picker now reads through the same resolver the Templates page
 * uses (resolveTemplates) so the dropdown reflects:
 *   - The 5 built-in templates (Web Design, SEO, Content, Brand
 *     Refresh, Paid Media)
 *   - User-created templates from data.templateOverrides
 *   - Edits to either, applied via override-overlay
 *   - Archived templates filtered out (they're hidden from the picker
 *     but kept on the record so existing services can still resolve
 *     their template name).
 *
 * `allowed` filtering still happens here. Each TemplateRecord declares
 * which service types it pairs with; user-created templates default
 * to both when the field is unset (creators don't have to think about
 * it unless they want to).
 */

export interface TemplateOption {
  /** Live template id (`TemplateRecord.id`). Stored on
   *  `Service.templateKey` so the resolver can hop back to the full
   *  TemplateRecord on read. */
  value: string;
  /** Display label — defaults to the record's name. */
  label: string;
  /** Service types this template can pair with. Used both for the
   *  type-filter on the picker and for the snap-to-default logic in
   *  ServiceMetadataForm when the user switches type. */
  allowed: ServiceType[];
}

const DEFAULT_ALLOWED: ServiceType[] = ['retainer', 'project'];

/** Build the option list for the picker.
 *
 *  Pass `data.templateOverrides` from the store and (optionally) the
 *  currently-selected service type. When a type is given, options are
 *  filtered to those whose `allowed` includes it. When omitted, every
 *  active template is returned. */
export function templateOptionsFor(
  overrides: TemplateRecord[],
  type?: ServiceType,
): TemplateOption[] {
  const records = resolveTemplates(overrides);
  const options = records.map<TemplateOption>(r => ({
    value: r.id,
    label: r.name,
    allowed: r.allowed && r.allowed.length > 0 ? r.allowed : DEFAULT_ALLOWED,
  }));
  if (!type) return options;
  return options.filter(o => o.allowed.includes(type));
}

/** Pick the first sensible default templateKey for a fresh service of
 *  the given type. Returns the first option allowed for that type, or
 *  the first option overall if the list is empty (defensive — should
 *  never happen because built-ins always exist). Used by the Add
 *  Service modal so the form opens with a real, valid value selected
 *  rather than a stale enum string the resolver doesn't know. */
export function defaultTemplateKey(
  overrides: TemplateRecord[],
  type: ServiceType,
): string {
  const opts = templateOptionsFor(overrides, type);
  if (opts.length > 0) return opts[0].value;
  const all = templateOptionsFor(overrides);
  return all[0]?.value ?? 'web-design-full-stack';
}

/** Default the "next deliverable" date to two weeks out — far enough
 *  that nothing's urgent on day one, close enough that the user will
 *  correct it rather than leave the default in place for a year. */
export function defaultNextDeliverableAt(): string {
  return new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
}
