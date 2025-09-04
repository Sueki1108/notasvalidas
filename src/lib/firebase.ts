// src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCVdXuRyIWyFhMCzW1gNTVSLTUKWPUbONQ",
  authDomain: "notas-validas.firebaseapp.com",
  projectId: "notas-validas",
  storageBucket: "notas-validas.firebasestorage.app",
  messagingSenderId: "1062251427316",
  appId: "1:1062251427316:web:fc7552f815d2fb2e7bf5a1",
  measurementId: "G-NKCFQMHHLR"
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
