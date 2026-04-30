import { useEffect, useMemo, useState } from 'react';
import { XMarkIcon, EnvelopeIcon, PhoneIcon, GlobeAmericasIcon, BriefcaseIcon, ChatBubbleBottomCenterTextIcon, BuildingOffice2Icon, UserIcon } from '@heroicons/react/24/outline';
import { useMemberProfile } from '../contexts/MemberProfileContext';
import { useFlizow } from '../store/useFlizow';
import { loadFor, effectiveCapFor, zoneFor, type CapacityTask } from '../utils/capacity';
import type { Member } from '../types/flizow';

/**
 * MemberProfilePanel — the side-panel sheet that slides in from the
 * right when any member avatar is clicked. Mounted by
 * MemberProfileProvider so it lives at the app root and can render
 * over any page.
 *
 * Phase 2 ships read-only. Phase 3 adds the edit affordance + photo
 * upload; Phase 4 wires the click handlers on every avatar across
 * the app. Until then the panel only opens via direct .open() calls
 * from dev tooling.
 *
 * Layout (top → bottom):
 *   - Header: photo (or initials), name, role, [X close]
 *   - Vacation pill (only when today falls inside a timeOff period)
 *   - Contact: email, phone, time zone, working hours, pronouns
 *   - About (bio)
 *   - Skills (chip list)
 *   - Working with: AM-of clients, operator-on clients, today's load
 *
 * Empty-section policy: if a section's data is missing, the section
 * doesn't render. We don't show "—" rows or "Not set" placeholders —
 * absence is fine, only filled-in fields earn UI space.
 */

export function MemberProfilePanel() {
  const { activeId, close } = useMemberProfile();
  const { data } = useFlizow();

  // Esc closes the panel from anywhere. Only attached while a panel
  // is open so we don't pollute the global keymap when nothing's
  // showing. The handler is stable; effect re-runs when activeId
  // toggles between null and a real id.
  useEffect(() => {
    if (!activeId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, close]);

  // Find the active member each render. The store's array reference
  // changes on every mutation — useMemo keyed on the member slice +
  // id keeps the lookup cheap.
  const member = useMemo(() => {
    if (!activeId) return null;
    return data.members.find(m => m.id === activeId) ?? null;
  }, [activeId, data.members]);

  // Don't render anything when closed. Conditional return AFTER hooks
  // so the rules-of-hooks order stays stable.
  if (!activeId || !member) return null;

  return (
    <>
      <div
        className="member-profile-backdrop"
        onClick={close}
        aria-hidden="true"
      />
      <aside
        className="member-profile-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="member-profile-name"
      >
        <ProfileBody member={member} onClose={close} />
      </aside>
    </>
  );
}

// ── Body (split out so the conditional hooks above stay clean) ───────────

function ProfileBody({ member, onClose }: { member: Member; onClose: () => void }) {
  const { data } = useFlizow();

  // Working-with computations — what clients this member belongs to,
  // and as what role. Both are array filters so the cost is linear
  // in clients (small N). Memoised so a re-render driven by an
  // unrelated store change doesn't recompute.
  const amClients = useMemo(
    () => data.clients.filter(c => c.amId === member.id && !c.archived),
    [data.clients, member.id],
  );
  const operatorClients = useMemo(
    () => data.clients.filter(c => c.teamIds.includes(member.id) && !c.archived),
    [data.clients, member.id],
  );

  // Today's load — same numbers the capacity heatmap shows, scoped to
  // a single day. Pulls both client tasks + ops tasks because workload
  // doesn't care which kanban a card lives on. The calculation matches
  // TeamCapacityHeatmap's day cell so users see consistent numbers
  // when they cross-reference.
  const todayLoad = useMemo(() => {
    const allSlotTasks: CapacityTask[] = [
      ...data.tasks,
      ...data.opsTasks,
    ];
    const load = loadFor(member.id, data.today, allSlotTasks);
    const caps = effectiveCapFor(member.id, data.today, data.members, data.memberDayOverrides);
    return { load, caps, zone: zoneFor(load, caps) };
  }, [data.tasks, data.opsTasks, data.members, data.memberDayOverrides, data.today, member.id]);

  // Vacation status. Walk the timeOff array for any period where
  // `today` falls between start and end (inclusive on both sides).
  // Returns the period's end date so the pill can show "back May 15".
  const onVacation = useMemo(() => {
    if (!member.timeOff || member.timeOff.length === 0) return null;
    for (const period of member.timeOff) {
      if (data.today >= period.start && data.today <= period.end) {
        return period;
      }
    }
    return null;
  }, [member.timeOff, data.today]);

  // Working hours line — built from structured fields. Falls back to
  // null (section hidden) when none of the components are set, so
  // members who haven't filled it in don't see an empty slot.
  const workingHoursLine = useMemo(() => formatWorkingHoursLine(member), [member]);

  // Determine which Contact rows have content. The whole Contact
  // section hides if every line is empty.
  const hasContactInfo =
    !!member.email || !!member.phone || !!member.ianaTimeZone ||
    !!workingHoursLine || !!member.pronouns;

  return (
    <>
      <div className="member-profile-head">
        <ProfileAvatar member={member} />
        <div className="member-profile-identity">
          <h2 className="member-profile-name" id="member-profile-name">
            {member.name}
          </h2>
          {member.role && (
            <div className="member-profile-role">{member.role}</div>
          )}
          {onVacation && (
            <div className="member-profile-vacation">
              <span className="member-profile-vacation-icon" aria-hidden="true">🌴</span>
              On vacation · back {formatReturnDate(onVacation.end)}
            </div>
          )}
        </div>
        <button
          type="button"
          className="member-profile-close"
          onClick={onClose}
          aria-label="Close profile"
        >
          <XMarkIcon aria-hidden="true" />
        </button>
      </div>

      <div className="member-profile-body">
        {hasContactInfo && (
          <section className="member-profile-section">
            <h3 className="member-profile-section-label">Contact</h3>
            <ul className="member-profile-contact">
              {member.email && (
                <ContactRow
                  Icon={EnvelopeIcon}
                  label="Email"
                  value={member.email}
                  href={`mailto:${member.email}`}
                />
              )}
              {member.phone && (
                <ContactRow
                  Icon={PhoneIcon}
                  label="Phone"
                  value={member.phone}
                  href={`tel:${member.phone.replace(/[^+\d]/g, '')}`}
                />
              )}
              {member.ianaTimeZone && (
                <ContactRow
                  Icon={GlobeAmericasIcon}
                  label="Time zone"
                  value={formatTimeZone(member.ianaTimeZone)}
                />
              )}
              {workingHoursLine && (
                <ContactRow
                  Icon={BriefcaseIcon}
                  label="Working hours"
                  value={workingHoursLine}
                />
              )}
              {member.pronouns && (
                <ContactRow
                  Icon={ChatBubbleBottomCenterTextIcon}
                  label="Pronouns"
                  value={member.pronouns}
                />
              )}
            </ul>
          </section>
        )}

        {member.bio && member.bio.trim() !== '' && (
          <section className="member-profile-section">
            <h3 className="member-profile-section-label">About</h3>
            <p className="member-profile-bio">{member.bio}</p>
          </section>
        )}

        {member.skills && member.skills.length > 0 && (
          <section className="member-profile-section">
            <h3 className="member-profile-section-label">Skills</h3>
            <ul className="member-profile-skills">
              {member.skills.map(skill => (
                <li key={skill} className="member-profile-skill">{skill}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="member-profile-section">
          <h3 className="member-profile-section-label">Working with</h3>
          {amClients.length === 0 && operatorClients.length === 0 ? (
            <p className="member-profile-empty">
              Not yet assigned to any clients in this workspace.
            </p>
          ) : (
            <div className="member-profile-working">
              {amClients.length > 0 && (
                <WorkingRow
                  Icon={BuildingOffice2Icon}
                  label="Account manager for"
                  values={amClients.map(c => c.name)}
                />
              )}
              {operatorClients.length > 0 && (
                <WorkingRow
                  Icon={UserIcon}
                  label="Operator on"
                  values={operatorClients.map(c => c.name)}
                />
              )}
            </div>
          )}
          {/* Today's load — quiet metric line. Reads alongside the
              "Working with" section so users get the people-context
              + the workload-context in one section instead of two
              competing for visual weight. */}
          <div className={`member-profile-load member-profile-load--${todayLoad.zone}`}>
            <span className="member-profile-load-value">
              {todayLoad.load} / {todayLoad.caps.soft}
            </span>
            <span className="member-profile-load-label">
              slots booked today
            </span>
            {onVacation && (
              <span className="member-profile-load-note">
                · away
              </span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function ProfileAvatar({ member }: { member: Member }) {
  // Photos are opt-in. When photoUrl is set, render the image with
  // an onError fallback so a broken url doesn't leave a blank circle —
  // the initials avatar takes over. Initials-only is the default and
  // works for every member who hasn't uploaded a photo.
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!member.photoUrl && !imgFailed;
  return (
    <div
      className="member-profile-avatar"
      style={member.bg
        ? { background: member.bg, color: member.color }
        : { background: member.color, color: '#fff' }
      }
      aria-hidden="true"
    >
      {showPhoto ? (
        <img
          src={member.photoUrl}
          alt=""
          className="member-profile-avatar-img"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="member-profile-avatar-initials">
          {member.initials}
        </span>
      )}
    </div>
  );
}

function ContactRow({
  Icon,
  label,
  value,
  href,
}: {
  Icon: typeof EnvelopeIcon;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <li className="member-profile-contact-row">
      <Icon aria-hidden="true" className="member-profile-contact-icon" />
      <span className="member-profile-contact-label">{label}</span>
      {href ? (
        <a className="member-profile-contact-value" href={href}>
          {value}
        </a>
      ) : (
        <span className="member-profile-contact-value">{value}</span>
      )}
    </li>
  );
}

function WorkingRow({
  Icon,
  label,
  values,
}: {
  Icon: typeof BuildingOffice2Icon;
  label: string;
  values: string[];
}) {
  return (
    <div className="member-profile-working-row">
      <div className="member-profile-working-head">
        <Icon aria-hidden="true" className="member-profile-working-icon" />
        <span className="member-profile-working-label">{label}</span>
      </div>
      <div className="member-profile-working-values">
        {values.join(', ')}
      </div>
    </div>
  );
}

// ── Format helpers ───────────────────────────────────────────────────────

/** "09:00" → "9:00 AM". Returns the input untouched if it doesn't
 *  match the HH:mm shape (defensive — older data or hand-typed values
 *  shouldn't crash the panel). */
function formatTime12h(hhmm: string | undefined): string | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2];
  if (h < 0 || h > 23) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${min} ${period}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Format a working-days array as a human label.
 *    [1,2,3,4,5] → "Mon–Fri" (single contiguous span)
 *    [1,2,3,4]   → "Mon–Thu"
 *    [1,3,5]     → "Mon · Wed · Fri" (non-contiguous → bullet list)
 *    [0,1,2,3,4,5,6] → "Every day"
 *    [] → "No working days set"
 *    undefined → defaults to weekdays (per the type doc)
 *  Defensive: dedupes and sorts. */
function formatWorkingDays(days: number[] | undefined): string {
  const list = days ?? [1, 2, 3, 4, 5];
  if (list.length === 0) return 'No working days set';
  if (list.length === 7) return 'Every day';
  const sorted = Array.from(new Set(list)).sort((a, b) => a - b);
  // Detect a single contiguous run.
  let isContiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      isContiguous = false;
      break;
    }
  }
  if (isContiguous && sorted.length >= 2) {
    return `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length - 1]]}`;
  }
  return sorted.map(d => DAY_NAMES[d]).join(' · ');
}

/** Build the full "Mon–Fri, 9:00 AM – 6:00 PM PT" line. Returns null
 *  when none of the structured fields are set so the section hides
 *  cleanly. The TZ abbreviation is intentionally short ("PT") rather
 *  than a city name — matches how working-hours are spoken. */
function formatWorkingHoursLine(member: Member): string | null {
  const start = formatTime12h(member.workingHoursStart);
  const end = formatTime12h(member.workingHoursEnd);
  const days = member.workingDays;
  // If no times AND no days override, nothing to show.
  if (!start && !end && !days) return null;
  const dayPart = formatWorkingDays(days);
  const timePart = start && end ? `${start} – ${end}` : start || end;
  if (!timePart) return dayPart;
  const tzPart = member.ianaTimeZone ? ` ${formatTimeZoneShort(member.ianaTimeZone)}` : '';
  return `${dayPart}, ${timePart}${tzPart}`;
}

/** "America/Los_Angeles" → "Los Angeles" (city only). Used in the
 *  Contact section as a clear, full-city display. */
function formatTimeZone(iana: string): string {
  const slash = iana.lastIndexOf('/');
  const city = slash >= 0 ? iana.slice(slash + 1) : iana;
  return city.replace(/_/g, ' ');
}

/** Short tz abbreviation for the working-hours line: tries to derive
 *  via Intl, with hand-picked fallbacks for the common ones. We don't
 *  want a 12-character region name eating the line. */
function formatTimeZoneShort(iana: string): string {
  // Intl can produce a "short" timezone name for the formatToParts
  // path. Wrap in try/catch — older browsers + invalid IANA strings
  // shouldn't crash the panel.
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'short',
    });
    const parts = dtf.formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart) return tzPart.value;
  } catch {
    // fall through
  }
  // Fallback — the city name from the IANA string.
  return formatTimeZone(iana);
}

/** ISO date "2026-05-15" → "May 15". Used in the vacation pill so
 *  the user reads "back May 15" not "back 2026-05-15". */
function formatReturnDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
