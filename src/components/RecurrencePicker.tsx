import { useState, useRef, useEffect } from 'react';
import type { Recurrence } from '../types/flizow';
import { defaultRule, summarizeRecurrence, dayOfWeekLabel } from '../utils/recurrence';

/**
 * Repeat-rule picker for the card modal. Renders the inline summary
 * line ("Doesn't repeat" / "Weekly on Tue" / etc.) and, when expanded,
 * the preset list + Custom editor + Pause + End-by inputs.
 *
 * Design notes:
 *  - Click the summary line to expand. Same click-to-edit pattern used
 *    by every other inline editor in the modal (no pencil icon).
 *  - The five preset options are radio-like rows with smart defaults
 *    seeded from `anchorISO` (the card's current dueDate). So if the
 *    card is due on a Tuesday, "Weekly on Tuesday" comes pre-filled.
 *  - "Custom" expands to inline interval / day mask / month-day / end
 *    fields. Visible only when the user explicitly picks Custom; the
 *    common cases stay one click.
 *  - Pause toggle and End-by date sit at the bottom of the expanded
 *    block — they're independent of which preset is active.
 *  - All edits flow through `onChange`, which the modal forwards to
 *    `patchCard`. The picker itself holds no state apart from the
 *    open/closed flag.
 */

type Pattern = Recurrence['pattern'];
type PresetKind = 'none' | Pattern | 'custom';

export interface RecurrencePickerProps {
  /** Current rule on the card. Undefined = "Doesn't repeat". */
  rule: Recurrence | undefined;
  /** Anchor used to seed preset defaults (typically the card's
   *  dueDate; the parent passes today's ISO when dueDate is unset). */
  anchorISO: string;
  /** Receives the new rule, or undefined when the user picks "Doesn't
   *  repeat". The parent handles persistence. */
  onChange: (next: Recurrence | undefined) => void;
}

export default function RecurrencePicker({ rule, anchorISO, onChange }: RecurrencePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on click-outside. Mousedown matches the dropdown convention
  // used elsewhere in the app so the toggle button doesn't race with
  // the close handler on the same click.
  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      const w = wrapRef.current;
      if (!w) return;
      if (!w.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouse);
    return () => document.removeEventListener('mousedown', onMouse);
  }, [open]);

  const summary = rule ? summarizeRecurrence(rule) : "Doesn't repeat";
  const activeKind: PresetKind = pickActivePreset(rule, anchorISO);

  function setPreset(kind: PresetKind) {
    if (kind === 'none') {
      onChange(undefined);
      return;
    }
    if (kind === 'custom') {
      // Seed Custom from whatever's already there, or from a sensible
      // weekly default if the user is starting fresh.
      onChange(rule ?? defaultRule('weekly', anchorISO));
      return;
    }
    onChange(defaultRule(kind, anchorISO));
  }

  return (
    <div ref={wrapRef} className="recurrence-picker">
      <button
        type="button"
        className="recurrence-summary"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <RepeatIcon dimmed={!rule} />
        <span className={rule ? 'recurrence-summary-text' : 'recurrence-summary-text faint'}>
          {summary}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="recurrence-popover" role="dialog" aria-label="Repeat options">
          <PresetRow
            label="Doesn't repeat"
            active={activeKind === 'none'}
            onClick={() => { setPreset('none'); setOpen(false); }}
          />
          <PresetRow
            label="Daily"
            active={activeKind === 'daily'}
            onClick={() => setPreset('daily')}
          />
          <PresetRow
            label={`Weekly on ${weeklyDefaultLabel(anchorISO)}`}
            active={activeKind === 'weekly'}
            onClick={() => setPreset('weekly')}
          />
          <PresetRow
            label={`Monthly on the ${monthlyDefaultLabel(anchorISO)}`}
            active={activeKind === 'monthly'}
            onClick={() => setPreset('monthly')}
          />
          <PresetRow
            label="Yearly"
            active={activeKind === 'yearly'}
            onClick={() => setPreset('yearly')}
          />
          <PresetRow
            label="Custom..."
            active={activeKind === 'custom'}
            onClick={() => setPreset('custom')}
          />

          {rule && activeKind === 'custom' && (
            <CustomEditor rule={rule} onChange={onChange} />
          )}

          {rule && (
            <RuleExtras rule={rule} onChange={onChange} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function PresetRow({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`recurrence-preset${active ? ' recurrence-preset-active' : ''}`}
      onClick={onClick}
    >
      <span className="recurrence-preset-radio" aria-hidden>
        {active ? <Dot /> : null}
      </span>
      <span className="recurrence-preset-label">{label}</span>
    </button>
  );
}

function CustomEditor({ rule, onChange }: {
  rule: Recurrence; onChange: (r: Recurrence) => void;
}) {
  const interval = Math.max(1, Math.floor(rule.interval ?? 1));
  return (
    <div className="recurrence-custom">
      <div className="recurrence-row">
        <span className="recurrence-row-label">Every</span>
        <input
          type="number"
          min={1}
          max={365}
          value={interval}
          onChange={(e) => onChange({ ...rule, interval: Math.max(1, Number(e.target.value) || 1) })}
          className="recurrence-num"
          aria-label="Interval"
        />
        <select
          value={rule.pattern}
          onChange={(e) => onChange({ ...rule, pattern: e.target.value as Pattern })}
          className="recurrence-select"
          aria-label="Pattern"
        >
          <option value="daily">{interval === 1 ? 'day' : 'days'}</option>
          <option value="weekly">{interval === 1 ? 'week' : 'weeks'}</option>
          <option value="monthly">{interval === 1 ? 'month' : 'months'}</option>
          <option value="yearly">{interval === 1 ? 'year' : 'years'}</option>
        </select>
      </div>

      {rule.pattern === 'weekly' && (
        <div className="recurrence-row">
          <span className="recurrence-row-label">On</span>
          <div className="recurrence-day-chips">
            {[0, 1, 2, 3, 4, 5, 6].map(d => {
              const active = (rule.byDay ?? []).includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={`recurrence-day-chip${active ? ' is-active' : ''}`}
                  onClick={() => {
                    const set = new Set(rule.byDay ?? []);
                    if (active) set.delete(d); else set.add(d);
                    const sorted = Array.from(set).sort((a, b) => a - b);
                    onChange({ ...rule, byDay: sorted });
                  }}
                  aria-pressed={active}
                >
                  {dayOfWeekLabel(d, true)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {rule.pattern === 'monthly' && (
        <div className="recurrence-row">
          <span className="recurrence-row-label">On day</span>
          <input
            type="number"
            min={1}
            max={31}
            value={rule.byMonthDay ?? 1}
            onChange={(e) => {
              const n = Math.max(1, Math.min(31, Number(e.target.value) || 1));
              onChange({ ...rule, byMonthDay: n });
            }}
            className="recurrence-num"
            aria-label="Day of month"
          />
          <span className="recurrence-row-hint">
            (the 31st falls back to the last day of shorter months)
          </span>
        </div>
      )}
    </div>
  );
}

function RuleExtras({ rule, onChange }: {
  rule: Recurrence; onChange: (r: Recurrence) => void;
}) {
  return (
    <div className="recurrence-extras">
      <label className="recurrence-row recurrence-row-checkbox">
        <input
          type="checkbox"
          checked={!!rule.endsAt}
          onChange={(e) => {
            if (e.target.checked) {
              // Default end to 3 months from today; user can adjust.
              const d = new Date();
              d.setMonth(d.getMonth() + 3);
              onChange({ ...rule, endsAt: d.toISOString().slice(0, 10) });
            } else {
              onChange({ ...rule, endsAt: undefined });
            }
          }}
        />
        <span className="recurrence-row-label">End by</span>
        {rule.endsAt && (
          <input
            type="date"
            className="recurrence-date"
            value={rule.endsAt}
            onChange={(e) => onChange({ ...rule, endsAt: e.target.value || undefined })}
            aria-label="End date"
          />
        )}
      </label>

      <label className="recurrence-row recurrence-row-checkbox">
        <input
          type="checkbox"
          checked={!!rule.paused}
          onChange={(e) => onChange({ ...rule, paused: e.target.checked })}
        />
        <span className="recurrence-row-label">
          Pause (keeps the rule but stops spawning new cards)
        </span>
      </label>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function pickActivePreset(rule: Recurrence | undefined, anchorISO: string): PresetKind {
  if (!rule) return 'none';
  // The user is on a "preset" only when the rule matches the default
  // shape for that pattern. Custom lights up otherwise. This keeps the
  // five-row picker readable: the top four are the easy paths, Custom
  // is the catch-all.
  const def = defaultRule(rule.pattern, anchorISO);
  const sameInterval = (rule.interval ?? 1) === def.interval;
  const noEnd = !rule.endsAt && !rule.paused;
  if (!sameInterval || !noEnd) return 'custom';
  if (rule.pattern === 'weekly') {
    const ruleDays = (rule.byDay ?? []).slice().sort((a, b) => a - b).join(',');
    const defDays = (def.byDay ?? []).slice().sort((a, b) => a - b).join(',');
    if (ruleDays !== defDays) return 'custom';
  }
  if (rule.pattern === 'monthly') {
    if ((rule.byMonthDay ?? null) !== (def.byMonthDay ?? null)) return 'custom';
  }
  return rule.pattern;
}

function weeklyDefaultLabel(anchorISO: string): string {
  const d = parseISOLocal(anchorISO) ?? new Date();
  return dayOfWeekLabel(d.getDay());
}

function monthlyDefaultLabel(anchorISO: string): string {
  const d = parseISOLocal(anchorISO) ?? new Date();
  return ordinal(d.getDate());
}

function parseISOLocal(iso: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Tiny inline icons ──────────────────────────────────────────────

function RepeatIcon({ dimmed }: { dimmed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
      style={{ opacity: dimmed ? 0.55 : 1 }}
      aria-hidden
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Dot() {
  return (
    <svg viewBox="0 0 8 8" width="8" height="8" aria-hidden>
      <circle cx="4" cy="4" r="3" fill="currentColor" />
    </svg>
  );
}
