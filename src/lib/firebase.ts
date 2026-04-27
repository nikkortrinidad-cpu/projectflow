import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyB3m0UFv_f0Wfh5mOoY9bhQ9X2te46Ejz4",
  authDomain: "flizow.firebaseapp.com",
  projectId: "flizow",
  storageBucket: "flizow.firebasestorage.app",
  messagingSenderId: "356054513186",
  appId: "1:356054513186:web:cace4fb361c4725bbebc7b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// `ignoreUndefinedProperties: true` makes Firestore silently strip
// undefined fields on writes instead of throwing
// "Unsupported field value: undefined". Our codebase has several
// `field: value || undefined` patterns (optional displayName, email,
// photoURL on WorkspaceMembership; optional `note` on PendingInvite;
// etc.). Without this flag a single missing field crashes the whole
// write — which the user hit on the Members tab when generating an
// invite without a note. Switch is global and safe: undefined was
// never meaningful data; it was always "leave this field out."
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
});
// Firebase Storage — used by the workspace-logo uploader. Bucket is
// configured in firebaseConfig.storageBucket above. Storage rules
// for write/read access live in docs/firestore-rules.md alongside
// the Firestore rules.
export const storage = getStorage(app);
export default app;
