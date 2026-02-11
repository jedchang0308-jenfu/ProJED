import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyBWsUrkyzlYZqBGeeQ7XEVqbN-k-0gvvb0",
    authDomain: "projed-cc78d.firebaseapp.com",
    projectId: "projed-cc78d",
    storageBucket: "projed-cc78d.firebasestorage.app",
    messagingSenderId: "967362299895",
    appId: "1:967362299895:web:64fd89a26d8f37751410f2",
    measurementId: "G-79J8PQK5SK"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
