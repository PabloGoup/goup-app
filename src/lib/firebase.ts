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
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  enableNetwork,
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

/* ================== Firestore (nueva API de caché) ================== */
/**
 * - En navegador: usa cache persistente + multi-pestaña.
 * - En SSR/WebWorkers/etc.: usa memoria.
 */
export const db = initializeFirestore(app, {
  // Cache persistente en navegador (multi-tab) o memoria en SSR/webworkers
  localCache:
    typeof window !== "undefined"
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
  /**
   * Mitiga errores de WebChannel 400 en algunos proxies/extensiones:
   * - auto-detecta long polling si es necesario
   * - usa Fetch Streams en lugar de WebChannel cuando está disponible
   */
  experimentalAutoDetectLongPolling: true,
});

// Fuerza conexión online para evitar "solo cache" tras usar emulador
if (typeof window !== "undefined") {
  enableNetwork(db).catch(() => {
    // si ya está online o no aplica, ignoramos
  });
  // Recuperación suave si alguna vez quedaste con caché corrupto por emulador ⇄ prod
  if (typeof window !== "undefined") {
    // Si detectamos fallo de escucha (guardado en sesión), purga caches al recargar una vez
    const RECOVERY_FLAG = "goup:fs-recovered";
    if (!sessionStorage.getItem(RECOVERY_FLAG)) {
      // Escucha un error de transporte para forzar limpieza en el próximo load
      window.addEventListener("unhandledrejection", (ev) => {
        const msg = String((ev?.reason && (ev.reason.message || ev.reason)) || "");
        if (msg.includes("WebChannelConnection") || msg.includes("transport errored")) {
          try {
            // Señalizamos para el siguiente reload
            sessionStorage.setItem(RECOVERY_FLAG, "1");
          } catch {}
        }
      });
    } else {
      // Primera carga después de un fallo: limpiamos storage de Firestore
      (async () => {
        try {
          // Borra bases conocidas; si no existe, no pasa nada
          const dbs = await (indexedDB as any).databases?.();
          if (Array.isArray(dbs)) {
            for (const d of dbs) {
              if (d && d.name && /firestore|firebase/i.test(d.name)) {
                try { indexedDB.deleteDatabase(d.name); } catch {}
              }
            }
          } else {
            // Fallback conservador
            try { indexedDB.deleteDatabase("firebase-firestore-database"); } catch {}
            try { indexedDB.deleteDatabase("firestore/[DEFAULT]"); } catch {}
          }
        } catch {}
        // Limpiamos el flag para no repetir
        sessionStorage.removeItem(RECOVERY_FLAG);
        // Recargar para reconstruir caches sanos
        setTimeout(() => location.reload(), 0);
      })();
    }
  }
}