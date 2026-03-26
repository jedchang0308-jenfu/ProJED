/**
 * Firebase 初始化設定
 * 設計意圖：集中管理 Firebase App 初始化與服務實例匯出，
 * 確保整個應用只有一個 Firebase App 實例。
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyBWsUrkyzlYZqBGeeQ7XEVqbN-k-0gvvb0",
    authDomain: "projed-cc78d.firebaseapp.com",
    projectId: "projed-cc78d",
    storageBucket: "projed-cc78d.firebasestorage.app",
    messagingSenderId: "967362299895",
    appId: "1:967362299895:web:64fd89a26d8f37751410f2",
    measurementId: "G-79J8PQK5SK"
};

const app: FirebaseApp = initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);
export default app;
