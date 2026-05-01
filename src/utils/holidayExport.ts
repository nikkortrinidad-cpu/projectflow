import type { Holiday } from '../types/flizow';

/**
 * Holiday export / import — the JSON portability path.
 *
 * Why this exists:
 *   The OM curates a holiday catalog (specials, custom corp days,
 *   regional observances) and wants to carry that catalog into a
 *   new workspace, share it with another agency, or back it up
 *   before a major edit. The Nager auto-sync covers the public
 *   layer; this covers everything else.
 *
 * Shape design:
 *   - Versioned. v1 is just the catalog + meta; v2+ might add
 *     observation overrides or coverage rules.
 *   - File extension stays `.json` — easy to share, easy to inspect.
 *   - exportedAt timestamp + workspaceName so files are identifiable
 *     when an agency keeps multiple backups.
 *
 * Validation philosophy:
 *   - Strict on shape (top-level must have version + holidays array)
 *   - Lenient on individual entries (drop malformed rows, don't fail
 *     the whole import — partial recovery beats nothing)
 *
 * Phase 9.5 — JSON portability.
 */

// ── Types ──────────────────────────────────────────────────────────

/** Wire format. Bump version on schema changes; the parser accepts
 *  v1 only for now and rejects everything else with a clear error. */
export interface HolidayExport {
  version: 1;
  exportedAt: string;       // ISO timestamp of the export
  workspaceName?: string;   // Identifier for the user, never authoritative
  holidays: Holiday[];
}

export type ImportResult =
  | { kind: 'success'; holidays: Holiday[]; total: number; workspaceName?: string; exportedAt?: string }
  | { kind: 'invalid-json'; message: string }
  | { kind: 'wrong-shape'; message: string }
  | { kind: 'unsupported-version'; version: unknown };

// ── Export ─────────────────────────────────────────────────────────

/** Serialize a workspace's holiday catalog into the wire format.
 *  Pure function — caller is responsible for kicking off the actual
 *  download (Blob + URL.createObjectURL). */
export function buildHolidayExport(
  holidays: ReadonlyArray<Holiday>,
  workspaceName?: string,
  nowISO: string = new Date().toISOString(),
): HolidayExport {
  return {
    version: 1,
    exportedAt: nowISO,
    workspaceName,
    holidays: holidays.slice(),
  };
}

/** Suggested filename for the download.
 *    flizow-holidays-{slug}-{YYYY-MM-DD}.json
 *  Slug derived from workspace name; falls back to "workspace". */
export function exportFilename(
  workspaceName: string | undefined,
  nowISO: string = new Date().toISOString(),
): string {
  const slug = (workspaceName ?? 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'workspace';
  const date = nowISO.slice(0, 10); // YYYY-MM-DD
  return `flizow-holidays-${slug}-${date}.json`;
}

// ── Import ─────────────────────────────────────────────────────────

/** Parse a JSON string from a user-uploaded file. Returns a typed
 *  result so the UI can branch into "ok / show count" vs "show
 *  error message" without try/catch leaking through. */
export function parseHolidayImport(rawJson: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      kind: 'invalid-json',
      message: err instanceof Error ? err.message : 'Could not parse the file as JSON',
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'wrong-shape', message: 'File is not a Flizow holiday export.' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) {
    return { kind: 'unsupported-version', version: obj.version };
  }
  if (!Array.isArray(obj.holidays)) {
    return {
      kind: 'wrong-shape',
      message: "Missing or invalid 'holidays' field — expected an array.",
    };
  }
  // Lenient on entries — drop malformed rows rather than failing
  // the whole import. The catch is that the user still gets the
  // good rows; the bad ones are silently skipped (count tells them).
  const valid: Holiday[] = [];
  for (const entry of obj.holidays) {
    const h = coerceHoliday(entry);
    if (h) valid.push(h);
  }
  return {
    kind: 'success',
    holidays: valid,
    total: valid.length,
    workspaceName: typeof obj.workspaceName === 'string' ? obj.workspaceName : undefined,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined,
  };
}

/** Validate + normalize a single entry. Returns null on shape
 *  failure so the import skips it cleanly. */
function coerceHoliday(raw: unknown): Holiday | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.name !== 'string' || !r.name) return null;
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;
  if (typeof r.country !== 'string' || !r.country) return null;
  // type + defaultObservation are constrained unions; default to
  // sensible values when the file's value is unrecognized.
  const type = r.type === 'special' || r.type === 'public' ? r.type : 'public';
  const defaultObservation = r.defaultObservation === 'worked' ? 'worked' : 'observed';
  // states is optional + an array of strings — drop other shapes.
  let states: string[] | undefined;
  if (Array.isArray(r.states) && r.states.every((s) => typeof s === 'string')) {
    states = r.states as string[];
  }
  return {
    id: r.id,
    name: r.name,
    date: r.date,
    country: r.country,
    type: type as Holiday['type'],
    defaultObservation: defaultObservation as Holiday['defaultObservation'],
    active: r.active === false ? false : true,
    ...(states ? { states } : {}),
  };
}
