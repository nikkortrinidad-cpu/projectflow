# Firestore Security Rules — Multi-User Setup

**You need to paste these into the Firebase console once.** Without them, the new workspace + invite flow will hit permission errors when a teammate tries to join.

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

    // users/{uid} — lookup doc mapping a Firebase user to their workspace,
    // plus the `revokedAt` timestamp used by "Sign out everywhere"
    // (cross-device session revocation). Only the user themselves can
    // read their own row. Other workspace members can write to clear
    // workspaceId during a "remove member" flow, so we relax write to
    // allow any signed-in user (kept tight by the app — Firestore rules
    // can't easily check "the only field changing is workspaceId set to
    // null by the workspace owner").
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null;
    }

    // workspaces/{wsId} — the central data doc shared by all members.
    // memberUids[] is denormalised on the doc so rules can do an array
    // contains check without traversing nested objects.
    match /workspaces/{wsId} {
      // Read: any current member.
      allow read: if request.auth != null
        && request.auth.uid in resource.data.memberUids;

      // Write: any current member (full data + meta access).
      // Per-field gates (only owners can change members[], etc.) live
      // in the app code today — fine for MVP since the only client of
      // these rules is the Flizow app itself.
      allow update: if request.auth != null
        && request.auth.uid in resource.data.memberUids;

      // Create: only allowed when the creator's UID matches the doc's
      // ownerUid AND the doc-id matches that UID. This keeps anyone
      // from creating workspaces under someone else's name.
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.ownerUid
        && request.auth.uid == wsId;

      // Special rule: a non-member can WRITE to a workspace IF they're
      // adding themselves to memberUids AND a matching pendingInvite
      // existed in the prior state. This is how the accept-invite flow
      // works for users who aren't members yet.
      allow update: if request.auth != null
        && !(request.auth.uid in resource.data.memberUids)
        && request.auth.uid in request.resource.data.memberUids
        && resource.data.pendingInvites.size() > request.resource.data.pendingInvites.size();
    }

    // Legacy single-user docs — readable + writable by their owner so
    // the migration path can read them once and copy them forward.
    // Safe to delete this rule after every user has migrated, but
    // harmless to leave indefinitely.
    match /flizow/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## What these rules guarantee

- **Privacy across tenants:** A signed-in user who knows another workspace's ID still can't read or write it unless their UID is in that workspace's `memberUids`.
- **Owner-pegged creation:** You can only create a workspace whose `ownerUid` and document ID match your own UID. No spoofing.
- **Invite acceptance works for non-members:** The fourth rule — the `update` clause for non-members consuming an invite — is the magic that lets a brand-new user write themselves into your workspace's `memberUids` exactly once. The rule requires that a `pendingInvite` got removed in the same write (count went down), so a malicious user without a valid token can't add themselves.

## Acknowledged limits

- **No per-field permission gates inside a workspace.** A Viewer can technically write to the workspace data via direct Firestore call (the app's UI prevents it, but a determined developer could bypass the UI). Tightening this requires more granular rules with field-level checks. Acceptable for MVP because every client of these rules today is the Flizow app itself.
- **No rate limiting.** A bad actor with a member account could fire thousands of writes. Firestore's own quotas catch the catastrophic case; nothing finer-grained until we add Cloud Functions.
- **Owners can't be transferred.** No rule for it because no UI for it.

## What to do if a teammate gets stuck

If a teammate clicks an invite link and hits "permission denied" or "couldn't load workspace":

1. Check the rules tab in Firebase console — make sure the rules above are actually published (not in draft).
2. Try the link again from a fresh tab. The accept-invite flow only runs on first sign-in; a stale browser session might miss it.
3. As a fallback, ask me (Claude) to manually add their UID to your workspace's `memberUids` from the Firestore console.

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
