// src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "excel-workflow-automator",
  appId: "1:1077410102272:web:47e317f3639bb0437b6ce5",
  storageBucket: "excel-workflow-automator.firebasestorage.app",
  apiKey: "AIzaSyCz9MBebPtDRBulAVMVUyIug4WkuOTW__Q",
  authDomain: "excel-workflow-automator.firebaseapp.com",
  messagingSenderId: "1077410102272",
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const db = getFirestore(app);

export { db };
