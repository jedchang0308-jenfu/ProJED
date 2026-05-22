/**
 * Firebase 初始化設定
 * 設計意圖：集中管理 Firebase App 初始化與服務實例匯出，
 * 確保整個應用只有一個 Firebase App 實例。
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const isFirebaseConfigPresent = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

const app: FirebaseApp | null = isFirebaseConfigPresent ? initializeApp(firebaseConfig) : null;
export const isFirebaseConfigured = Boolean(app);
export const db: Firestore | null = app ? getFirestore(app) : null;
export const auth: Auth | null = app ? getAuth(app) : null;

export const requireFirebaseDb = (): Firestore => {
  if (!db) {
    throw new Error('Firebase is not configured. Set the VITE_FIREBASE_* variables before using the Firebase backend.');
  }
  return db;
};

export const requireFirebaseAuth = (): Auth => {
  if (!auth) {
    throw new Error('Firebase is not configured. Set the VITE_FIREBASE_* variables before using Firebase auth.');
  }
  return auth;
};

export default app;
