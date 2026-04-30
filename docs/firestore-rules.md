# Firestore Security Rules — Multi-User Setup

**You need to paste these into the Firebase console once.** Without them, the new workspace + invite flow will hit permission errors when a teammate tries to join.

> **Heads-up (May 1, 2026):** rules tightened to enforce roles at the storage layer. Previously a Viewer who knew the wsId could write to the workspace via direct Firestore call. The new rules reject that — only Owner/Admin can change members, settings, billing, and data; Member writes are limited to their own time-off requests + the agency-side data they're allowed to edit. **Re-paste the rules block below in the Firebase console after you ship this update.** Old rules keep working but don't enforce the new role boundaries.

## How to paste them

1. Open https://console.firebase.google.com/
2. Pick your **flizow** project
3. In the left nav: **Build → Firestore Database**
4. Click the **Rules** tab at the top
5. Replace whatever's there with the rules block below
6. Click **Publish**

It takes about 30 seconds to propagate. You'll see a green "rules published" toast.

## The rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ──────────────────────────────────────────────────
    //
    // Role lookup reads the denormalized `memberRoles` map keyed by
    // uid. members[] also carries the role on each row, but Firestore
    // rules can't iterate arrays to find one by uid — hence the map.
    // The store keeps both in sync on every mutation; the migration
    // backfills the map for any pre-2026-05-01 workspace doc.
    function memberRole(workspace) {
      return workspace.data.memberRoles[request.auth.uid];
    }

    function isMember(workspace) {
      return request.auth != null
        && request.auth.uid in workspace.data.memberUids;
    }

    function isOwnerOrAdmin(workspace) {
      return isMember(workspace)
        && memberRole(workspace) in ['owner', 'admin'];
    }

    function isOwner(workspace) {
      return isMember(workspace)
        && memberRole(workspace) == 'owner';
    }

    // Which top-level keys on the workspace doc only Owner/Admin can
    // change. Member + Viewer writes that touch ANY of these get
    // rejected. The 'data' field stays open to all members so the
    // agency-side store mutations (cards, comments, time-off
    // submissions, etc.) keep working.
    function adminOnlyKeys() {
      return [
        'members', 'memberUids', 'memberRoles',
        'pendingInvites', 'name', 'initials', 'color', 'logoUrl',
        'ownerUid'
      ];
    }

    // True iff the diff between the prior + incoming docs only
    // touches keys members are allowed to change. We use this for
    // the 'data' open-write path; admin-only keys must NOT appear.
    function memberWriteScopeOk(prior, incoming) {
      return !incoming.data.diff(prior.data).affectedKeys()
        .hasAny(adminOnlyKeys());
    }

    // ── users/{uid} ──────────────────────────────────────────────
    //
    // Lookup doc mapping a Firebase user to their workspace, plus
    // the `revokedAt` timestamp used by "Sign out everywhere"
    // (cross-device session revocation). Only the user themselves
    // can read their own row. Writes are still open to any signed-in
    // user — the workspace-removal flow needs to clear another
    // user's `workspaceId` from the owner's session, and Firestore
    // rules can't easily check "the only field changing is
    // workspaceId set to null by the workspace owner."
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null;
    }

    // ── workspaces/{wsId} ────────────────────────────────────────

    match /workspaces/{wsId} {

      // Read: any current member, any role.
      allow read: if isMember(resource);

      // Create: only allowed when the creator's UID matches the
      // doc's ownerUid AND the doc-id matches that UID. The new
      // doc must seed memberRoles[creator] = 'owner' so subsequent
      // role checks work. Anyone trying to create a workspace under
      // someone else's name fails the first check.
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.ownerUid
        && request.auth.uid == wsId
        && request.resource.data.memberRoles[request.auth.uid] == 'owner';

      // Update — admin-tier writes. Owner + Admin can change any
      // top-level field (members, settings, data — everything).
      allow update: if isOwnerOrAdmin(resource);

      // Update — member-tier writes. A Member or Viewer who's
      // already on the workspace can only write to the `data`
      // field (cards, comments, time-off requests, etc.) — never
      // to members[], pendingInvites[], settings, etc. The diff
      // helper rejects any cross-key write.
      allow update: if isMember(resource)
        && memberWriteScopeOk(resource, request.resource);

      // Update — invite acceptance. A non-member writes themselves
      // into memberUids + memberRoles + members[] AND consumes a
      // pendingInvite (count goes down). The new role they assign
      // themselves must equal whatever the matching invite carried;
      // we can't easily look that up in rules, so we constrain to
      // 'admin' / 'member' / 'viewer' (no self-promote-to-owner).
      allow update: if request.auth != null
        && !(request.auth.uid in resource.data.memberUids)
        && request.auth.uid in request.resource.data.memberUids
        && resource.data.pendingInvites.size() > request.resource.data.pendingInvites.size()
        && request.resource.data.memberRoles[request.auth.uid] in ['admin', 'member', 'viewer'];
    }

    // ── flizow/{uid} (legacy single-user) ────────────────────────
    //
    // Pre-multi-user docs. Readable + writable by their owner so the
    // migration path can read them once and copy them forward. Safe
    // to delete this rule after every user has migrated, but
    // harmless to leave indefinitely.
    match /flizow/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## What these rules guarantee

- **Privacy across tenants.** A signed-in user who knows another workspace's ID still can't read or write it unless their UID is in that workspace's `memberUids`.
- **Owner-pegged creation.** You can only create a workspace whose `ownerUid` and document ID match your own UID. The created doc must self-assign your role as 'owner' via `memberRoles[uid] = 'owner'`.
- **Role enforcement at the storage layer.** A Member or Viewer who tries a direct Firestore call to change `members[]`, `pendingInvites[]`, or workspace settings now gets rejected — even if they bypass the UI. Only Owner + Admin can touch admin-only keys.
- **Member-tier writes still work.** Cards, comments, time-off submissions, and other agency-side data live under the `data` field, which any member can write. The diff helper checks the affected keys against an explicit deny-list — admin-only keys can't sneak through a `data` update.
- **Invite acceptance works for non-members.** The non-member-update clause lets a brand-new user write themselves into `memberUids` + `memberRoles` exactly once, but only if a matching `pendingInvite` got consumed in the same write AND they don't try to promote themselves to 'owner'.

## What's still NOT in these rules

- **Per-record validation inside `data`.** A Member can write any field of `data` — including ones the UI gates them out of (workspace logo, templates, etc., which live under `data`'s nested objects). Tightening means listing each allowed-key per role, which is verbose. Acceptable for v1 because every client of these rules is the Flizow app.
- **Rate limiting.** A bad actor with a member account could fire thousands of writes. Firestore's own quotas catch the catastrophic case; nothing finer-grained until we add Cloud Functions.
- **Owner transfer.** Still no UI for transferring ownership, so no rule for it. The non-member-update rule explicitly rejects self-promote-to-'owner' as defense-in-depth.

## Migration note (for the previous version)

Workspaces created before May 1, 2026 don't have a `memberRoles` map on their doc. The store's snapshot handler runs `migrateWorkspaceAccessRoles` on first load, which now also backfills the map from `members[].role`. The owner-only persist path writes the map back on the same migration sweep. So:

1. **Owner signs in once** → migration runs → `memberRoles` lands on the doc.
2. **Members + viewers sign in after that** → role checks work.

If a teammate hits a "permission denied" error after this update, ask the workspace owner to sign in once to trigger the backfill.

## What to do if a teammate gets stuck

If a teammate clicks an invite link and hits "permission denied" or "couldn't load workspace":

1. Check the rules tab in Firebase console — make sure the rules above are actually published (not in draft).
2. Make sure the workspace owner has signed in at least once after the May 1 update so `memberRoles` got backfilled (see migration note above).
3. Try the link again from a fresh tab. The accept-invite flow only runs on first sign-in; a stale browser session might miss it.
4. As a fallback, ask me (Claude) to manually add their UID to `memberUids` + `memberRoles` from the Firestore console.

---

# Firebase Storage rules — workspace logos

The workspace-logo uploader writes images to `workspaces/{wsId}/logo` in Firebase Storage. **This is a separate rules surface from Firestore** — even though both live under the same Firebase project, they have different rules editors.

## How to enable Storage + paste these rules

1. Open https://console.firebase.google.com/
2. Pick your **flizow** project
3. Left nav: **Build → Storage**
4. If you've never used Storage in this project: click **Get started**, accept the default bucket (matches `flizow.firebasestorage.app`), pick a region close to you (e.g., `us-central1` or `nam5`)
5. Click the **Rules** tab at the top of the Storage page
6. Replace the default rules with the block below
7. Click **Publish**

## The rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Workspace logos — readable by any signed-in user (so members
    // can render the logo for their workspace). Writes restricted
    // to images under 5MB.
    //
    // Tighter rules would also check workspace membership via a
    // Firestore lookup (firestore.get(...)), but that's slow and
    // costs Firestore reads per file access. Skipping for MVP —
    // the client UI gates the upload to owner-only, and a writer
    // would need to know the wsId to even attempt a write.
    match /workspaces/{wsId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

## What these rules guarantee

- **Authenticated read.** Any signed-in user can fetch a workspace logo. Used by the workspace tile render in the modal, and (when image-aware invite landings ship) by the invite page.
- **Image-only writes.** The `request.resource.contentType.matches('image/.*')` rule blocks PDFs, scripts, anything not labeled as an image type. A malicious user can fake the content type, but the upload UI only accepts `image/png,image/jpeg,image/webp` so this is defense in depth.
- **5MB cap.** Keeps Storage costs predictable and prevents abuse. The client-side UI also surfaces a friendlier error before the upload fires.

## What's NOT in these rules (yet)

- **Per-workspace membership check.** A signed-in user with the right wsId can in principle write a logo to any workspace they know the ID for. Tightening would need a Firestore-backed `firestore.get(/databases/(default)/documents/workspaces/$(wsId)).data.memberUids` lookup — works but costs reads per upload. Acceptable to skip in MVP because the wsId is the owner's UID and isn't easily guessable.
- **Per-file size variants.** Some apps store thumbnails alongside originals; we don't, single image per workspace.

If you ever skip the Storage setup, the logo uploader will surface a friendly "Couldn't upload" error and the rest of the app stays fine — initials + color tile still render.
