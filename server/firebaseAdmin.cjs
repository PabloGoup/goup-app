// server/firebaseAdmin.cjs
const admin = require("firebase-admin");

let app;
if (process.env.FIREBASE_EMULATOR === "1") {
  // Modo emulador local
  const projectId = process.env.FIREBASE_PROJECT_ID || "demo-goupapp";
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  app = admin.initializeApp({ projectId });
  console.log("[FirebaseAdmin] Usando Firestore Emulator:", process.env.FIRESTORE_EMULATOR_HOST, "project:", projectId);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Credenciales embebidas por env
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  app = admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: sa.project_id,
  });
  console.log("[FirebaseAdmin] Inicializado con SERVICE_ACCOUNT_JSON, project:", sa.project_id);
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Credenciales por archivo (ADC)
  app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID, // fija el Project ID y evita el error
  });
  console.log("[FirebaseAdmin] Inicializado con GOOGLE_APPLICATION_CREDENTIALS, project:", process.env.FIREBASE_PROJECT_ID);
} else {
  throw new Error("No hay credenciales de Firebase Admin. Define FIREBASE_SERVICE_ACCOUNT_JSON o GOOGLE_APPLICATION_CREDENTIALS, o habilita el emulador con FIREBASE_EMULATOR=1.");
}

const db = admin.firestore();
module.exports = { admin, db };