import { useEffect, useMemo, useRef, useState } from 'react';
import {
  XMarkIcon,
  EnvelopeIcon,
  PhoneIcon,
  GlobeAmericasIcon,
  BriefcaseIcon,
  ChatBubbleBottomCenterTextIcon,
  BuildingOffice2Icon,
  UserIcon,
  PencilSquareIcon,
  CameraIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useMemberProfile } from '../contexts/MemberProfileContext';
import { useFlizow } from '../store/useFlizow';
import { flizowStore } from '../store/flizowStore';
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

  // Edit mode + draft state. Drafts shadow each editable field so the
  // user can mash Cancel without committing. Save patches the live
  // record via store.updateMember; Cancel discards. We keep drafts in
  // local state (not the store) because half-typed values shouldn't
  // sync to other peers via Firestore until the user explicitly saves.
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<EditableDrafts>(() => draftsFromMember(member));
  // Reset drafts whenever the member changes (peer opens a different
  // profile, or live updates flow in for the current one).
  useEffect(() => {
    setDrafts(draftsFromMember(member));
    setEditing(false);
  }, [member.id]);
  // Photo upload state — file input ref + uploading flag for the
  // disabled state during the Storage round-trip + an error string
  // for surfacing failures inline (size cap, network, etc.).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Permission gate — the Edit profile button only renders for self
  // or a workspace admin. Self check uses the auth-derived current
  // member id; admin check reads accessLevel from the data record.
  // Both fall back to false for the pre-auth / dev-bypass case so a
  // signed-out user can't see edit affordances.
  const currentId = flizowStore.getCurrentMemberId();
  const isMe = currentId !== null && member.id === currentId;
  const currentMember = data.members.find(m => m.id === currentId);
  const isAdmin = currentMember?.accessLevel === 'admin';
  const canEdit = isMe || isAdmin;
  // Within edit mode, admin-only fields (role + capacity caps) are
  // gated separately. Self-editing-self should NOT be able to bump
  // their own access level — that's an admin call.
  const canEditAdminFields = isAdmin;

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

  function startEditing() {
    setDrafts(draftsFromMember(member));
    setEditing(true);
  }
  function cancelEditing() {
    setDrafts(draftsFromMember(member));
    setEditing(false);
    setPhotoError(null);
  }
  function saveEdits() {
    // Build the patch from drafts. Empty strings flip to undefined
    // so a field cleared in the form doesn't render as a blank line
    // on the profile (the section-hides-when-empty policy reads
    // undefined, not '').
    const patch: Partial<Member> = {
      name: drafts.name.trim() || member.name, // never blank a name
      role: emptyToUndefined(drafts.role),
      email: emptyToUndefined(drafts.email),
      phone: emptyToUndefined(drafts.phone),
      pronouns: emptyToUndefined(drafts.pronouns),
      bio: emptyToUndefined(drafts.bio),
      ianaTimeZone: emptyToUndefined(drafts.ianaTimeZone),
      workingHoursStart: emptyToUndefined(drafts.workingHoursStart),
      workingHoursEnd: emptyToUndefined(drafts.workingHoursEnd),
      workingDays: drafts.workingDays.length > 0 ? drafts.workingDays : undefined,
      // Skills: split on comma, trim, drop empties. Limits to 12 to
      // keep the chip list readable; users with more than that have
      // probably mis-pasted a list and the cap is a friendlier guard
      // than a silent overflow.
      skills: drafts.skills
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 12),
    };
    flizowStore.updateMember(member.id, patch);
    setEditing(false);
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    // Client-side size cap matches the workspace logo path. 5MB is
    // plenty for a profile photo (most JPEGs are < 1MB at standard
    // resolutions); the Storage rules also enforce this server-side.
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Photo must be 5MB or smaller.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please pick an image file.');
      return;
    }
    setPhotoUploading(true);
    try {
      await flizowStore.uploadMemberPhoto(member.id, file);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setPhotoUploading(false);
      // Clear the input value so the same file can be re-selected
      // after a Remove → re-upload cycle.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handlePhotoRemove() {
    setPhotoError(null);
    try {
      await flizowStore.removeMemberPhoto(member.id);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not remove photo.');
    }
  }

  return (
    <>
      <div className="member-profile-head">
        <div className="member-profile-avatar-wrap">
          <ProfileAvatar member={member} />
          {editing && (
            <div className="member-profile-photo-controls">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoSelect}
              />
              <button
                type="button"
                className="member-profile-photo-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                aria-label={member.photoUrl ? 'Change photo' : 'Upload photo'}
              >
                <CameraIcon aria-hidden="true" />
                {photoUploading ? 'Uploading…' : member.photoUrl ? 'Change' : 'Upload'}
              </button>
              {member.photoUrl && (
                <button
                  type="button"
                  className="member-profile-photo-btn member-profile-photo-btn--danger"
                  onClick={handlePhotoRemove}
                  disabled={photoUploading}
                  aria-label="Remove photo"
                >
                  <TrashIcon aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>
          )}
          {photoError && (
            <div className="member-profile-photo-error" role="alert">
              {photoError}
            </div>
          )}
        </div>
        <div className="member-profile-identity">
          {editing ? (
            <input
              type="text"
              className="member-profile-name-input"
              value={drafts.name}
              onChange={(e) => setDrafts({ ...drafts, name: e.target.value })}
              placeholder="Full name"
              aria-label="Name"
            />
          ) : (
            <h2 className="member-profile-name" id="member-profile-name">
              {member.name}
            </h2>
          )}
          {editing ? (
            <input
              type="text"
              className="member-profile-role-input"
              value={drafts.role}
              onChange={(e) => setDrafts({ ...drafts, role: e.target.value })}
              placeholder="Role / title (e.g. Senior Account Manager)"
              aria-label="Role"
            />
          ) : (
            member.role && <div className="member-profile-role">{member.role}</div>
          )}
          {!editing && onVacation && (
            <div className="member-profile-vacation">
              <span className="member-profile-vacation-icon" aria-hidden="true">🌴</span>
              On vacation · back {formatReturnDate(onVacation.end)}
            </div>
          )}
          {!editing && canEdit && (
            <button
              type="button"
              className="member-profile-edit-btn"
              onClick={startEditing}
            >
              <PencilSquareIcon aria-hidden="true" />
              Edit profile
            </button>
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
        {editing ? (
          <ProfileEditForm
            member={member}
            drafts={drafts}
            setDrafts={setDrafts}
            canEditAdminFields={canEditAdminFields}
          />
        ) : (
          <ProfileDisplay
            member={member}
            workingHoursLine={workingHoursLine}
            hasContactInfo={hasContactInfo}
            amClients={amClients.map(c => c.name)}
            operatorClients={operatorClients.map(c => c.name)}
            todayLoad={todayLoad}
            onVacation={!!onVacation}
          />
        )}
      </div>

      {editing && (
        <footer className="member-profile-footer">
          <button
            type="button"
            className="member-profile-footer-btn member-profile-footer-btn--ghost"
            onClick={cancelEditing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="member-profile-footer-btn member-profile-footer-btn--primary"
            onClick={saveEdits}
          >
            Save
          </button>
        </footer>
      )}
    </>
  );
}

// ── Read-only display body ───────────────────────────────────────────────

function ProfileDisplay({
  member,
  workingHoursLine,
  hasContactInfo,
  amClients,
  operatorClients,
  todayLoad,
  onVacation,
}: {
  member: Member;
  workingHoursLine: string | null;
  hasContactInfo: boolean;
  amClients: string[];
  operatorClients: string[];
  todayLoad: { load: number; caps: { soft: number; max: number }; zone: 'green' | 'amber' | 'red' };
  onVacation: boolean;
}) {
  return (
    <>
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
                values={amClients}
              />
            )}
            {operatorClients.length > 0 && (
              <WorkingRow
                Icon={UserIcon}
                label="Operator on"
                values={operatorClients}
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
    </>
  );
}

// ── Edit form ────────────────────────────────────────────────────────────

function ProfileEditForm({
  member,
  drafts,
  setDrafts,
  canEditAdminFields,
}: {
  member: Member;
  drafts: EditableDrafts;
  setDrafts: (d: EditableDrafts) => void;
  canEditAdminFields: boolean;
}) {
  const set = <K extends keyof EditableDrafts>(key: K, value: EditableDrafts[K]) => {
    setDrafts({ ...drafts, [key]: value });
  };
  const toggleDay = (day: number) => {
    const has = drafts.workingDays.includes(day);
    const next = has
      ? drafts.workingDays.filter(d => d !== day)
      : [...drafts.workingDays, day].sort((a, b) => a - b);
    set('workingDays', next);
  };

  return (
    <>
      <section className="member-profile-section">
        <h3 className="member-profile-section-label">Contact</h3>
        <div className="member-profile-edit-grid">
          <FieldGroup label="Email">
            <input
              type="email"
              className="member-profile-input"
              value={drafts.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="name@flizow.com"
            />
          </FieldGroup>
          <FieldGroup label="Phone">
            <input
              type="tel"
              className="member-profile-input"
              value={drafts.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+1 415 555 0148"
            />
          </FieldGroup>
          <FieldGroup label="Time zone">
            <select
              className="member-profile-input"
              value={drafts.ianaTimeZone}
              onChange={(e) => set('ianaTimeZone', e.target.value)}
            >
              <option value="">— Pick a time zone —</option>
              {COMMON_TIME_ZONES.map(tz => (
                <option key={tz.iana} value={tz.iana}>{tz.label}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Pronouns">
            <input
              type="text"
              className="member-profile-input"
              value={drafts.pronouns}
              onChange={(e) => set('pronouns', e.target.value)}
              placeholder="she/her, they/them, …"
            />
          </FieldGroup>
        </div>
      </section>

      <section className="member-profile-section">
        <h3 className="member-profile-section-label">Working hours</h3>
        <div className="member-profile-hours-row">
          <FieldGroup label="Start">
            <input
              type="time"
              className="member-profile-input"
              value={drafts.workingHoursStart}
              onChange={(e) => set('workingHoursStart', e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="End">
            <input
              type="time"
              className="member-profile-input"
              value={drafts.workingHoursEnd}
              onChange={(e) => set('workingHoursEnd', e.target.value)}
            />
          </FieldGroup>
        </div>
        <FieldGroup label="Working days">
          <div className="member-profile-day-toggles" role="group" aria-label="Working days">
            {DAY_NAMES_FULL.map((name, idx) => {
              const active = drafts.workingDays.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  className={`member-profile-day-toggle${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleDay(idx)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </FieldGroup>
      </section>

      <section className="member-profile-section">
        <h3 className="member-profile-section-label">About</h3>
        <textarea
          className="member-profile-input member-profile-textarea"
          value={drafts.bio}
          onChange={(e) => set('bio', e.target.value)}
          placeholder="A short bio — what you focus on, how you got here."
          rows={4}
        />
      </section>

      <section className="member-profile-section">
        <h3 className="member-profile-section-label">Skills</h3>
        <input
          type="text"
          className="member-profile-input"
          value={drafts.skills}
          onChange={(e) => set('skills', e.target.value)}
          placeholder="Content, SEO, Brand, Editing"
          aria-describedby="member-profile-skills-help"
        />
        <p
          id="member-profile-skills-help"
          className="member-profile-help"
        >
          Separate each skill with a comma. Up to 12.
        </p>
      </section>

      {/* Admin-only fields footer note. Self-edit hides this entire
          section since role + access level + caps are governance
          concerns, not personal-profile concerns. The note is light
          and editable inline so admins editing teammates have a
          clear "you're acting as admin" context. */}
      {canEditAdminFields && (
        <section className="member-profile-section">
          <h3 className="member-profile-section-label">Admin only</h3>
          <p className="member-profile-help">
            These fields are visible to and editable by workspace admins.
            They aren't part of personal profile — they govern access
            and capacity.
          </p>
          <p className="member-profile-help" style={{ marginTop: 'var(--sp-md)' }}>
            Role and capacity caps are managed in{' '}
            <strong>Account → Members</strong>. Photo and personal
            fields above can be set here, but the admin-side controls
            for access and caps live in their dedicated surface to
            avoid duplicating UI.
          </p>
          {/* Display the current values inline so admins can confirm
              what they're working with without leaving the panel. */}
          <ul className="member-profile-contact" style={{ marginTop: 'var(--sp-md)' }}>
            <ContactRow
              Icon={UserIcon}
              label="Access"
              value={member.accessLevel ?? '—'}
            />
            <ContactRow
              Icon={BriefcaseIcon}
              label="Capacity"
              value={`${member.capSoft ?? 6} soft / ${member.capMax ?? 8} max`}
            />
          </ul>
        </section>
      )}
    </>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="member-profile-field">
      <span className="member-profile-field-label">{label}</span>
      {children}
    </label>
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

// ── Edit-mode types and constants ────────────────────────────────────────

/** Local form state that shadows Member fields during edit mode.
 *  String-based so empty-but-typed values round-trip cleanly through
 *  controlled inputs; we coerce empties → undefined on save. */
interface EditableDrafts {
  name: string;
  role: string;
  email: string;
  phone: string;
  pronouns: string;
  bio: string;
  ianaTimeZone: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
  /** Comma-separated string in the form. Split + trimmed on save. */
  skills: string;
}

function draftsFromMember(member: Member): EditableDrafts {
  return {
    name: member.name ?? '',
    role: member.role ?? '',
    email: member.email ?? '',
    phone: member.phone ?? '',
    pronouns: member.pronouns ?? '',
    bio: member.bio ?? '',
    ianaTimeZone: member.ianaTimeZone ?? '',
    workingHoursStart: member.workingHoursStart ?? '',
    workingHoursEnd: member.workingHoursEnd ?? '',
    workingDays: member.workingDays ?? [1, 2, 3, 4, 5],
    skills: (member.skills ?? []).join(', '),
  };
}

function emptyToUndefined(s: string): string | undefined {
  const t = s.trim();
  return t.length === 0 ? undefined : t;
}

const DAY_NAMES_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Curated list of common time zones — covers the major working-hours
 * regions for a small/mid-sized agency without dumping all 400+ IANA
 * entries on the user. Order is rough geographic west→east so a US
 * user finds their zone near the top. Easy to extend if a teammate
 * lands in a region not represented here.
 */
const COMMON_TIME_ZONES: Array<{ iana: string; label: string }> = [
  { iana: 'Pacific/Honolulu',     label: 'Hawaii (Honolulu)' },
  { iana: 'America/Anchorage',    label: 'Alaska (Anchorage)' },
  { iana: 'America/Los_Angeles',  label: 'Pacific (Los Angeles)' },
  { iana: 'America/Denver',       label: 'Mountain (Denver)' },
  { iana: 'America/Chicago',      label: 'Central (Chicago)' },
  { iana: 'America/New_York',     label: 'Eastern (New York)' },
  { iana: 'America/Halifax',      label: 'Atlantic (Halifax)' },
  { iana: 'America/Sao_Paulo',    label: 'São Paulo' },
  { iana: 'Atlantic/Azores',      label: 'Azores' },
  { iana: 'Europe/London',        label: 'London' },
  { iana: 'Europe/Paris',         label: 'Paris' },
  { iana: 'Europe/Berlin',        label: 'Berlin' },
  { iana: 'Europe/Helsinki',      label: 'Helsinki' },
  { iana: 'Europe/Moscow',        label: 'Moscow' },
  { iana: 'Asia/Dubai',           label: 'Dubai' },
  { iana: 'Asia/Kolkata',         label: 'India (Kolkata)' },
  { iana: 'Asia/Bangkok',         label: 'Bangkok' },
  { iana: 'Asia/Singapore',       label: 'Singapore' },
  { iana: 'Asia/Manila',          label: 'Manila' },
  { iana: 'Asia/Hong_Kong',       label: 'Hong Kong' },
  { iana: 'Asia/Shanghai',        label: 'Shanghai' },
  { iana: 'Asia/Tokyo',           label: 'Tokyo' },
  { iana: 'Asia/Seoul',           label: 'Seoul' },
  { iana: 'Australia/Perth',      label: 'Perth' },
  { iana: 'Australia/Sydney',     label: 'Sydney' },
  { iana: 'Pacific/Auckland',     label: 'Auckland' },
];

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
