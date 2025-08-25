// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence,
} from "firebase/firestore";

/* ================== Config Firebase ================== */
const firebaseConfig = {
  apiKey: "AIzaSyDBiInvXywL0IrCgQsiEiYxXTfBMliUoFo",
  authDomain: "goupevents-infra-non-prod-s23.firebaseapp.com",
  projectId: "goupevents-infra-non-prod-s23",
  storageBucket: "goupevents-infra-non-prod-s23.firebasestorage.app",
  messagingSenderId: "931565577824",
  appId: "1:931565577824:web:e602132b96358460538505",
  measurementId: "G-7YTJNEZ0KW",
};

/* ================== Inicialización ================== */
const app = initializeApp(firebaseConfig);

// Analytics (solo en cliente; ignora si no disponible)
let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== "undefined") {
  try {
    analytics = getAnalytics(app);
  } catch {
    // No-op
  }
}

/* ================== Auth ================== */
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

/** Suscribe a cambios de sesión; devuelve unsubscribe */
export function onUserChanged(cb: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, cb);
}

/** Iniciar sesión con email/password */
export function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Registrar usuario con email/password */
export function registerWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** Cerrar sesión */
export function signOut() {
  return firebaseSignOut(auth);
}

/* ================== Firestore ================== */
export const db = getFirestore(app);

/**
 * Activa cache persistente (IndexedDB).
 * - Primero intenta multi-tab para sincronizar entre pestañas.
 * - Si falla por “failed-precondition” (p.ej. Safari privado / WebView),
 *   intenta single-tab.
 * - Si tampoco se puede (navigator sin IndexedDB), Firestore seguirá
 *   funcionando sin persistencia (cache en memoria).
 */
if (typeof window !== "undefined") {
  enableMultiTabIndexedDbPersistence(db).catch(async (err: any) => {
    if (err?.code === "failed-precondition") {
      // No se puede multi-tab; intenta single-tab
      try {
        await enableIndexedDbPersistence(db);
      } catch (e) {
        console.info("[Firestore] Persistencia no disponible:", (e as any)?.code || e);
      }
    } else {
      // p.ej. navigator sin IndexedDB
      console.info("[Firestore] Persistencia no disponible:", err?.code || err);
    }
  });
}