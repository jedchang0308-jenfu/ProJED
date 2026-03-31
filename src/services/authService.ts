import { auth, db } from './firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { FirestoreUser } from '../types';

export const authService = {
  signInWithGoogle: async (): Promise<FirestoreUser> => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
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
