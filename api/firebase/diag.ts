// /api/firebase/diag.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Importa firebase-admin SIN forzar inicialización aquí.
// Tu init real vive en server/firebaseAdmin.cjs (o similar).
// Si ese init no corrió aún, este diag NO fallará.
const admin = require('firebase-admin');

function safeApp() {
  try {
    return (admin.apps && admin.apps.length) ? admin.app() : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Señales de variables de entorno (sin exponer valores)
  const hasJsonB64 = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64;
  const hasJson    = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const hasKey     = !!process.env.FIREBASE_PRIVATE_KEY;
  const hasEmail   = !!process.env.FIREBASE_CLIENT_EMAIL;
  const envProject = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || null;

  const app = safeApp();
  const opts = app?.options || {};
  const detectedProject =
    opts.projectId || envProject || null;

  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST || null;

  // No tocamos Firestore si no hay app; solo informamos señales
  const payload = {
    ok: true,
    ts: Date.now(),
    projectId: detectedProject,
    hasEnvFields: { hasJsonB64, hasJson, hasKey, hasEmail },
    usingEmulator,
    firestoreEmulator,
    adminInitialized: !!app,
  };

  res.status(200).json(payload);
}