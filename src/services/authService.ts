import { auth, db } from './firebase';
import { 
  GoogleAuthProvider, 
  getRedirectResult,
  signInWithPopup, 
  signInWithRedirect,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { FirestoreUser } from '../types';

const isMobileAuthRedirectPreferred = (): boolean => {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const isCoarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;

  return /Android|iPhone|iPad|iPod/i.test(ua) || isCoarsePointer || isStandalone;
};

const getGoogleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

const ensureFirestoreUser = async (user: User): Promise<FirestoreUser> => {
  const userRef = doc(db, 'users', user.uid);
  const docSnap = await getDoc(userRef);

  const firestoreUser: FirestoreUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    createdAt: Date.now()
  };

  if (!docSnap.exists()) {
    await setDoc(userRef, firestoreUser);
  }

  return firestoreUser;
};

export const authService = {
  signInWithGoogle: async (): Promise<FirestoreUser> => {
    const provider = getGoogleProvider();

    if (isMobileAuthRedirectPreferred()) {
      await signInWithRedirect(auth, provider);
      return new Promise(() => {});
    }

    const result = await signInWithPopup(auth, provider);
    return ensureFirestoreUser(result.user);
  },

  handleRedirectResult: async (): Promise<FirestoreUser | null> => {
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;
    return ensureFirestoreUser(result.user);
  },
  
  signOut: async (): Promise<void> => {
    await firebaseSignOut(auth);
  },
  
  onAuthStateChanged: (callback: (user: FirestoreUser | null) => void) => {
    return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        callback({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        });
      } else {
        callback(null);
      }
    });
  }
};
