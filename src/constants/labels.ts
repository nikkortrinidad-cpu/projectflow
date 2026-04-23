/**
 * Board labels — the palette of tags a task can carry on the Flizow
 * kanban. Mirrors `BOARD_LABELS` in the mockup (~line 23167 of
 * public/flizow-test.html). We key on `id` when storing, but show
 * the human `name` everywhere the user sees it; the CSS class drives
 * the coloured pill.
 *
 * Kept as a static list for now. When labels become user-editable (per
 * workspace), this table migrates into FlizowData alongside clients and
 * services — the id-based lookup in the card modal stays the same.
 */

export interface BoardLabel {
  id: string;
  name: string;
  /** Coloured-text class from flizow.css (.label-bug, .label-feature, …) */
  cls: string;
}

export const BOARD_LABELS: BoardLabel[] = [
  { id: 'bug', name: 'Bug', cls: 'label-bug' },
  { id: 'feature', name: 'Feature', cls: 'label-feature' },
  { id: 'improvement', name: 'Improvement', cls: 'label-dev' },
  { id: 'urgent', name: 'Urgent', cls: 'label-urgent' },
  { id: 'design', name: 'Design', cls: 'label-design' },
  { id: 'research', name: 'Research', cls: 'label-content' },
];

/** Lookup helper. Returns null if the id isn't in the table — older
 *  tasks that were tagged with a now-deleted label render gracefully. */
export function labelById(id: string): BoardLabel | null {
  return BOARD_LABELS.find((l) => l.id === id) ?? null;
}
