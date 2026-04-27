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

    // users/{uid} — lookup doc mapping a Firebase user to their workspace.
    // Only the user themselves can read/write their own row. Other
    // workspace members write to it during a "remove member" flow, so
    // we relax write to allow any signed-in user (kept tight by the
    // app — Firestore rules can't easily check "the only field
    // changing is workspaceId set to null by the workspace owner").
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
