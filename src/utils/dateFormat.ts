/**
 * Thin date-formatting helpers. The mockup reaches for `toLocaleDateString`
 * with a handful of recurring option bags — collect them here so the pages
 * aren't scattered with inline formatters, and so they all accept the same
 * `today` anchor when they need one.
 */

/** "Aug 2023" */
export function formatMonthYear(iso: string): string {
  const d = parseISO(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** "Aug 12" — no year. Used for short-form date displays across
 *  service "Next deliverable" chips, schedule items, and similar. */
export function formatMonthDay(iso: string): string {
  const d = parseISO(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Aug 12, 2026" — full date. */
export function formatFullDate(iso: string): string {
  const d = parseISO(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// formatMrr() lived here. Removed 2026-04-26 along with the mrr
// field on Client. If currency formatting comes back later (different
// surface, not tied to the dropped pill), prefer Intl.NumberFormat
// directly at the call site rather than reviving this helper — the
// hardcoded 'en-US'/'USD' was already an i18n blocker (see i18n.md).

/** Days between two ISO dates (b − a), rounded. Negative when `b` is past. */
export function daysBetween(aISO: string, bISO: string): number {
  const a = parseISO(aISO); const b = parseISO(bISO);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function parseISO(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
