import { relativeTimeAgo } from '../utils/clientDerived';

/**
 * Brief strip — the discoverability anchor that sits between the
 * filters bar and the kanban columns. Single-line clickable row;
 * click anywhere to open the BriefModal upstream.
 *
 * Generic over what kind of brief it represents: per-service on the
 * client board page, workspace-level on the Ops page. The caller
 * passes the current brief HTML, the timestamp it was last saved,
 * the page-local label ("Project Brief" / "Ops Brief"), and the
 * open-modal callback. The strip handles its own populated/empty
 * rendering and the "Last updated · X ago" indicator.
 */
export function BriefStrip({
  label,
  brief,
  briefUpdatedAt,
  todayISO,
  onOpen,
  emptyCta,
}: {
  /** Eyebrow text shown on the left. e.g. "Project Brief", "Ops Brief". */
  label: string;
  /** Current brief HTML. Empty / undefined → empty-state CTA renders. */
  brief?: string;
  /** ISO timestamp of last save. Drives the "Last updated · X ago" copy. */
  briefUpdatedAt?: string;
  /** ISO date string used as the relative-time anchor — typically
   *  data.today, so the indicator stays stable across re-renders even
   *  if Date.now() has ticked. */
  todayISO: string;
  onOpen: () => void;
  /** Optional override for the empty-state CTA. Defaults to a generic
   *  "+ Add brief" — Ops might want different copy than per-service. */
  emptyCta?: string;
}) {
  // TipTap auto-seeds an empty paragraph (<p></p>) into a "blank"
  // editor; treat that as empty too. Same trick as in the modal's
  // dirty-check.
  const hasBrief = !!brief && brief.trim() !== '' && brief !== '<p></p>';
  const lastUpdated = briefUpdatedAt
    ? relativeTimeAgo(briefUpdatedAt, todayISO)
    : null;

  return (
    <button
      type="button"
      className="brief-strip"
      onClick={onOpen}
      aria-label={hasBrief ? `Open ${label}` : `Add ${label}`}
    >
      <span className="brief-strip-label">{label}</span>
      <span className="brief-strip-meta">
        {hasBrief
          ? lastUpdated
            ? `Last updated · ${lastUpdated}`
            : 'Click to read'
          : emptyCta ?? `+ Add ${label.toLowerCase()}`}
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
