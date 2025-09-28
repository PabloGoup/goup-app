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

const ENV_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function normalizePrivateKey(pk) {
  // Permite tanto llaves con "\n" escapados como llaves con saltos reales
  return (pk || "").replace(/\\n/g, "\n");
}

function logInit(source, extra = {}) {
  const base = {
    source,
    project: (admin.app().options && admin.app().options.projectId) || ENV_PROJECT_ID || "<desconocido>",
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
else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // 3) JSON embebido por ENV
  const sa = safeParseJSON(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!sa) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON no es JSON válido");
  if (sa.private_key) sa.private_key = normalizePrivateKey(sa.private_key);
  app = admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: sa.project_id || ENV_PROJECT_ID,
  });
  logInit("SERVICE_ACCOUNT_JSON", { clientEmail: (sa.client_email||'').slice(0,6) + "…" });
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
  // 5) ADC (GOOGLE_APPLICATION_CREDENTIALS, gcloud auth application-default login, Workload Identity, etc.)
  app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: ENV_PROJECT_ID,
  });
  logInit("ADC");
}

const db = admin.firestore();
try { db.settings({ ignoreUndefinedProperties: true }); } catch {}

function getDiagnostics() {
  return {
    projectId: (admin.app().options && admin.app().options.projectId) || ENV_PROJECT_ID || null,
    hasEnvFields: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
    hasJson: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    hasPath: !!process.env.FIREBASE_SA_PATH,
    usingEmulator: process.env.FIREBASE_EMULATOR === "1",
    firestoreEmulator: process.env.FIRESTORE_EMULATOR_HOST || null,
  };
}

module.exports = { admin, db, app, getDiagnostics };