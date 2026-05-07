import { auth, db } from './firebase';
import { 
  GoogleAuthProvider, 
  getRedirectResult,
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { FirestoreUser } from '../types';

export const isEmbeddedAuthBlocked = (): boolean => {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
  const isInAppBrowser =
    /FBAN|FBAV|Instagram|Line|MicroMessenger|Threads/i.test(ua);

  return isStandalone || isInAppBrowser;
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
    if (isEmbeddedAuthBlocked()) {
      throw new Error('Google 登入需要使用 Chrome 或 Safari 瀏覽器開啟，請不要從 PWA、LINE、FB 或 IG 內建瀏覽器登入。');
    }

    const provider = getGoogleProvider();
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
