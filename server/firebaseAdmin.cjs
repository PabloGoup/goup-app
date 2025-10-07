// server/firebaseAdmin.cjs
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

/**
 * Inicialización robusta de Firebase Admin con 5 modos (en orden de prioridad):
 * 1) Emulador local (FIREBASE_EMULATOR=1)
 * 2) Credenciales por campos de ENV (FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY)
 * 3) Credenciales embebidas en ENV (FIREBASE_SERVICE_ACCOUNT_JSON)
 * 4) Ruta a archivo de Service Account (FIREBASE_SA_PATH)
 * 5) Application Default Credentials (ADC)
 */


let app;
// Reusar instancia si ya existe (evita doble init en runtime serverless)
if (!app && admin.apps && admin.apps.length) {
  try {
    app = admin.app();
    console.log("[FirebaseAdmin] Reusing existing app instance");
  } catch {}
}

const ENV_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function normalizePrivateKey(pk) {
  if (!pk) return "";
  let v = String(pk).trim();
  // quita comillas envolventes si vienen del panel ("-----BEGIN...-----")
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.replace(/\\n/g, "\n");
}

function safeApp() {
  try { return (admin.apps && admin.apps.length) ? admin.app() : null; } catch { return null; }
}

function logInit(source, extra = {}) {
  const a = safeApp();
  const base = {
    source,
    project: (a && a.options && a.options.projectId) || ENV_PROJECT_ID || "<desconocido>",
  };
  console.log("[FirebaseAdmin] Inicializado:", { ...base, ...extra });
}

if (process.env.FIREBASE_EMULATOR === "1") {
  // 1) Emulador local
  const projectId = ENV_PROJECT_ID || "demo-goupapp";
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  app = admin.initializeApp({ projectId });
  console.log("[FirebaseAdmin] Usando Firestore Emulator:", process.env.FIRESTORE_EMULATOR_HOST, "project:", projectId);
}
else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  // 2) Campos sueltos por ENV (ideal para Vercel/Node sin archivo)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
  logInit("ENV_FIELDS", { clientEmail: clientEmail?.slice(0, 6) + "…" });
}
else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
  // 3) JSON embebido por ENV (texto o base64)
  let sa = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    sa = safeParseJSON(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!sa) {
      console.error("[FirebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON no es JSON válido (ignorando y probando otras opciones)");
    }
  }
  if (!sa && process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
      sa = safeParseJSON(decoded);
    } catch (e) {
      console.error("[FirebaseAdmin] FIREBASE_SERVICE_ACCOUNT_B64 inválido:", e?.message || e);
    }
  }
  if (sa) {
    if (sa.private_key) sa.private_key = normalizePrivateKey(sa.private_key);
    app = admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || ENV_PROJECT_ID,
    });
    logInit("SERVICE_ACCOUNT_ENV", { clientEmail: (sa.client_email||'').slice(0,6) + "…" });
  }
}
else if (process.env.FIREBASE_SA_PATH) {
  // 4) Ruta a archivo de Service Account
  const jsonPath = path.resolve(process.env.FIREBASE_SA_PATH);
  const content = fs.readFileSync(jsonPath, "utf8");
  const sa = safeParseJSON(content);
  if (!sa) throw new Error(`No se pudo parsear Service Account: ${jsonPath}`);
  if (sa.private_key) sa.private_key = normalizePrivateKey(sa.private_key);
  app = admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: sa.project_id || ENV_PROJECT_ID,
  });
  logInit("SERVICE_ACCOUNT_PATH", { path: jsonPath });
}
else {
  // 5) ADC (GOOGLE_APPLICATION_CREDENTIALS, gcloud ADC, Workload Identity, etc.)
  try {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: ENV_PROJECT_ID,
    });
    logInit("ADC");
  } catch (e) {
    console.error("[FirebaseAdmin] ADC init failed:", e?.message || e);
  }
}

if (!app && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
    logInit("ENV_FIELDS_FALLBACK", { clientEmail: clientEmail?.slice(0, 6) + "…" });
  } catch (e) {
    console.error("[FirebaseAdmin] ENV_FIELDS fallback failed:", e?.message || e);
  }
}

const db = (() => {
  try {
    if (!app) return null;
    const fdb = admin.firestore();
    try { fdb.settings({ ignoreUndefinedProperties: true }); } catch {}
    return fdb;
  } catch (e) {
    console.error("[FirebaseAdmin] Firestore init failed:", e?.message || e);
    return null;
  }
})();

function getDiagnostics() {
  const a = safeApp();
  return {
    projectId: (a && a.options && a.options.projectId) || ENV_PROJECT_ID || null,
    hasEnvFields: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
    hasJson: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    hasJsonB64: !!process.env.FIREBASE_SERVICE_ACCOUNT_B64,
    hasPath: !!process.env.FIREBASE_SA_PATH,
    usingEmulator: process.env.FIREBASE_EMULATOR === "1",
    firestoreEmulator: process.env.FIRESTORE_EMULATOR_HOST || null,
    dbReady: !!db
  };
}

module.exports = { admin, db, app, getDiagnostics };