import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const db = getFirestore(app);
export default app;
