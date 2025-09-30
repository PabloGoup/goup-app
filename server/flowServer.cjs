/* server/flowServer.cjs
 * GoUp – Flow integration + Firestore persistence (1 doc por ítem)
 */
require('dotenv/config');

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const https = require('https');
const dns = require('dns');
const { admin, db } = require('./firebaseAdmin.cjs');
const { FieldValue, Timestamp } = admin.firestore;

try {
  const proj = (admin.app().options && admin.app().options.projectId) || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'unknown';
  console.log(`[FirebaseAdmin] using project: ${proj}`);
} catch {}


if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

// ==== Vercel/serverless flags and public host fallback ====
const IS_VERCEL = !!process.env.VERCEL;
const PUBLIC_HOST = process.env.PUBLIC_HOST || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");


// ==== Métricas Embudo (server) ====
async function bumpFunnelServer(eventId, step, extra = {}) {
  try {
    const now = new Date();
    const dateKey = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
    const evRef = db.doc(`metrics_funnel/${dateKey}/events/${eventId}`);
    await evRef.set(
      { dateKey, eventId, updatedAt: Timestamp.now(), [step]: FieldValue.increment(1), ...extra },
      { merge: true }
    );
    const gRef = db.doc(`metrics_funnel/${dateKey}/global/global`);
    await gRef.set(
      { dateKey, updatedAt: Timestamp.now(), [step]: FieldValue.increment(1) },
      { merge: true }
    );
  } catch (e) {
    console.warn("[funnel] write failed:", e);
  }
}

// ===== Helpers: attendees → tickets + metrics_funnel =====
function safeInt(v, d = null) { try { const n = Number(v); return Number.isFinite(n) ? n : d; } catch { return d; } }
function calcAgeFromDOB(dob) {
  if (!dob) return null; // expects YYYY-MM-DD
  try {
    const [y,m,dd] = String(dob).slice(0,10).split('-').map(x => parseInt(x,10));
    if (!y || !m || !dd) return null;
    const today = new Date();
    let age = today.getFullYear() - y;
    const mo = today.getMonth() + 1;
    if (mo < m || (mo === m && today.getDate() < dd)) age--;
    return age >= 0 && age < 130 ? age : null;
  } catch { return null; }
}
function ageBucketFrom(age) {
  const a = safeInt(age, null);
  if (a == null) return null;
  if (a < 18) return 'age_lt18';
  if (a <= 24) return 'age_18_24';
  if (a <= 34) return 'age_25_34';
  if (a <= 44) return 'age_35_44';
  if (a <= 54) return 'age_45_54';
  return 'age_55p';
}
function genderKey(g) {
  const s = String(g || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'f' || s.startsWith('fem')) return 'gender_F';
  if (s === 'm' || s.startsWith('masc')) return 'gender_M';
  return 'gender_O';
}
async function applyAttendeesToTickets(db, { orderId, paidAt }) {
  const dateKey = (paidAt instanceof Date ? paidAt : new Date(paidAt || Date.now()))
    .toISOString().slice(0,10).replace(/-/g, '');

  // 1) Leer nominativos: primero ordersWeb/{orderId}/attendees, si no hay, fallback a flowCarts.attendeesRaw
  let attendees = [];
  try {
    const attSnap = await db.collection('ordersWeb').doc(orderId).collection('attendees').get();
    if (!attSnap.empty) {
      attendees = attSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => Number(a.guestIndex||a.id) - Number(b.guestIndex||b.id));
    }
  } catch (_) {}
  if (!attendees.length) {
    try {
      const cartSnap = await db.collection('flowCarts').doc(orderId).get();
      const cart = cartSnap.exists ? (cartSnap.data() || {}) : {};

      const raw = Array.isArray(cart.attendeesRaw) ? cart.attendeesRaw : [];
      const itemsArr = Array.isArray(cart.items) ? cart.items : [];
      const firstEventId = (itemsArr[0] && (itemsArr[0].eventId || null)) || (raw[0] && raw[0].eventId) || cart.eventId || null;
      const firstTicketId = (itemsArr[0] && (itemsArr[0].ticketId || null)) || (raw[0] && raw[0].ticketId) || null;

      // Datos del comprador (cliente 1)
      const demoBuyer = cart.demographics && cart.demographics.buyer ? cart.demographics.buyer : null;
      const buyerNombre = cart.buyerName || (demoBuyer && (demoBuyer.nombre || demoBuyer.name)) || null;
      const buyerCorreo = cart.email || (cart.webhook && cart.webhook.payer) || (demoBuyer && demoBuyer.correo) || null;
      const buyerRut =
        (demoBuyer && (demoBuyer.rut || demoBuyer.RUT)) ||
        cart.buyerRut ||
        (Array.isArray(raw) && raw.length > 0 ? raw[0].rut : null) ||
        null;
      const buyerTelefono = (demoBuyer && (demoBuyer.telefono || demoBuyer.phone)) || null;

      const buyerAtt = {
        guestIndex: 1,
        nombre: buyerNombre || null,
        correo: buyerCorreo || null,
        rut: buyerRut || null,
        telefono: buyerTelefono || null,
        sexo: (demoBuyer && demoBuyer.sexo) || null,
        fecha_nacimiento: (demoBuyer && demoBuyer.fecha_nacimiento) || null,
        edad:
          typeof (demoBuyer && demoBuyer.edad) === 'number'
            ? demoBuyer.edad
            : null,
        eventId: firstEventId,
        ticketId: firstTicketId,
      };

      // Clientes 2+ desde attendeesRaw
      const rest = raw.map((x, i) => ({
        guestIndex: x && x.guestIndex ? Number(x.guestIndex) : i + 2, // 2,3,...
        nombre: (x && x.nombre) || null,
        correo: (x && x.correo) || null,
        rut: (x && x.rut) || null,
        telefono: (x && x.telefono) || null,
        sexo: (x && x.sexo) || null,
        fecha_nacimiento: (x && x.fecha_nacimiento) || null,
        edad: x && typeof x.edad === 'number' ? x.edad : null,
        eventId: (x && x.eventId) || firstEventId || null,
        ticketId: (x && x.ticketId) || firstTicketId || null,
      }));

      attendees = [buyerAtt, ...rest];
    } catch (_) {}
  }

  // 2) Tickets del pedido (ordenados por issuedAt asc, in-memory sort to avoid composite index)
  const tSnap = await db.collection('tickets').where('orderId', '==', orderId).get();
  const tickets = tSnap.docs
    .map(d => ({ id: d.id, ref: d.ref, data: d.data() }))
    .sort((a, b) => (Number(a.data.issuedAt || 0) - Number(b.data.issuedAt || 0)));

  if (!tickets.length) return; // nothing to enrich yet

  // 3) Asignar nominativo por posición y escribir en ticket; actualizar metrics_funnel por eventId
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    const att = attendees[i] || null;
    const guestIndex = att?.guestIndex || (i + 1);

    // Preparar bloque attendee
    const edad = att && (typeof att.edad === 'number' ? att.edad : calcAgeFromDOB(att.fecha_nacimiento));
    const attendeeBlock = att ? {
      nombre: att.nombre ?? null,
      correo: att.correo ?? null,
      rut: att.rut ?? null,
      telefono: att.telefono ?? null,
      sexo: att.sexo ?? null,
      fecha_nacimiento: att.fecha_nacimiento ?? null,
      edad: typeof edad === 'number' ? edad : null,
    } : null;

    await t.ref.set(
      {
        attendee: attendeeBlock,
        guestIndex,
        ...(attendeeBlock && attendeeBlock.rut ? { buyerRut: attendeeBlock.rut } : {}),
        ...(attendeeBlock && attendeeBlock.telefono ? { buyerPhone: attendeeBlock.telefono } : {}),
      },
      { merge: true }
    );

    // Metrics por evento en la fecha real del pago
    const evId = att?.eventId || t.data.eventId || null;
    if (evId) {
      const evRef = db.doc(`metrics_funnel/${dateKey}/events/${String(evId)}`);
      const updates = { dateKey, eventId: String(evId), updatedAt: Timestamp.now() };
      const gk = genderKey(att?.sexo);
      if (gk) updates[gk] = FieldValue.increment(1);
      const bucket = ageBucketFrom(edad);
      if (bucket) updates[bucket] = FieldValue.increment(1);
      if (gk || bucket) {
        await evRef.set(updates, { merge: true });
      }
    }
  }
}

/* =========================
 * ENV / Config
 * ========================= */
const PORT = Number(process.env.FLOW_SERVER_PORT || process.env.PORT || 8788);
const FLOW_BASE = (process.env.FLOW_BASE || 'https://www.flow.cl').replace(/\/+$/, '');
const FLOW_API_KEY = process.env.FLOW_API_KEY || '';
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY || '';
const PUBLIC_CONFIRM_URL =
  process.env.PUBLIC_CONFIRM_URL || process.env.VITE_PUBLIC_CONFIRM_URL || '';
const PUBLIC_RETURN_BASE = (process.env.PUBLIC_RETURN_BASE || PUBLIC_HOST || '').trim();

if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
  console.warn('[Flow] FALTAN FLOW_API_KEY / FLOW_SECRET_KEY en .env');
}
console.log(
  `[Flow] Firestore ${db ? 'ON' : 'OFF'} • BASE: ${FLOW_BASE} (${/sandbox/.test(FLOW_BASE) ? 'sandbox' : 'prod'})`
);
console.log(`[Flow] webhook: ${PUBLIC_CONFIRM_URL || '(no definido)'}`);


/* =========================
 * Axios hacia Flow
 * ========================= */
const agent = new https.Agent({ keepAlive: true });
const flowAxios = axios.create({
  baseURL: `${FLOW_BASE}/api`,
  timeout: 20000,
  httpsAgent: agent,
  validateStatus: () => true,
  proxy: false,
  maxRedirects: 0,
});

/* =========================
 * Webpay Plus (Transbank)
 * ========================= */
let WebpayPlusLib = null;
try {
  WebpayPlusLib = require('transbank-sdk');
} catch (e) {
  console.warn('[Webpay] SDK no instalado. Ejecuta: npm i transbank-sdk');
}
const TBK_COMMERCE_CODE = process.env.TBK_COMMERCE_CODE || '';
const TBK_API_KEY = process.env.TBK_API_KEY || '';
const TBK_ENV = (process.env.TBK_ENV || 'INTEGRATION').toUpperCase(); // INTEGRATION | PRODUCTION

const hasWebpay = !!(WebpayPlusLib && TBK_COMMERCE_CODE && TBK_API_KEY);
const { WebpayPlus, Options, Environment } = WebpayPlusLib || {};
const tbkOptions = hasWebpay
  ? new Options(
      TBK_COMMERCE_CODE,
      TBK_API_KEY,
      TBK_ENV === 'PRODUCTION' ? Environment.Production : Environment.Integration
    )
  : null;

// Helper para SDK v4+: instancia Transaction con Options
function getWebpayTx() {
  if (!hasWebpay) throw new Error('WEBPAY_NOT_CONFIGURED');
  if (!WebpayPlus || !WebpayPlus.Transaction) throw new Error('WEBPAY_SDK_NOT_AVAILABLE');
  return new WebpayPlus.Transaction(tbkOptions);
}

console.log(
  `[Webpay] ${hasWebpay ? 'ON' : 'OFF'} • env=${TBK_ENV} • commerce=${TBK_COMMERCE_CODE || '(none)'}`
);

// Default return URL (backend commit endpoint) for Webpay if client doesn't send one
function getDefaultWebpayReturnUrl() {
  const base = (process.env.WEBPAY_RETURN_BASE || process.env.PUBLIC_RETURN_BASE || PUBLIC_HOST || process.env.NGROK_BASE || '').trim();
  if (!base) return null; // caller should validate
  return `${String(base).replace(/\/+$/,'')}/api/webpay/commit`;
}

// URL pública del FRONT (PaymentReturn)
function getDefaultFrontReturnUrl(orderId) {
  const base = (process.env.WEBPAY_RETURN_BASE || process.env.PUBLIC_RETURN_BASE || PUBLIC_HOST || process.env.NGROK_BASE || '').trim();
  if (!base) return null;
  const clean = base.replace(/\/$/, '');
  const qs = orderId ? `?order=${encodeURIComponent(orderId)}` : '';
  return `${clean}/pago/retorno${qs}`;
}

/* =========================
 * Helpers
 * ========================= */

// ---- Resolver fechas de evento desde Firestore ----
async function resolveEventSchedule(db, eventId) {
  if (!eventId) return { start: null, end: null };
  try {
    const ref = db.doc(`evento/${String(eventId)}`);
    const snap = await ref.get();
    if (!snap.exists) return { start: null, end: null };
    const d = snap.data() || {};

    const pick = (...keys) => {
      for (const k of keys) {
        const v = d?.[k];
        if (v != null) return v;
      }
      return null;
    };

    let startRaw = pick('start','eventStart','dateStart','startDate') || (d.schedule && d.schedule.start) || null;
    let endRaw   = pick('end','eventEnd','dateEnd','endDate')       || (d.schedule && d.schedule.end)   || null;

    const toIso = (x) => {
      if (!x) return null;
      if (typeof x === 'string') return x;
      if (x?.toDate) return x.toDate().toISOString();
      if (typeof x?.seconds === 'number') return new Date(x.seconds * 1000).toISOString();
      return null;
    };

    return { start: toIso(startRaw), end: toIso(endRaw) };
  } catch (_) {
    return { start: null, end: null };
  }
}
// Firma tipo Flow: concatena key+value ordenado alfabéticamente (sin nulos/indefinidos)
function signFlow(params, secretKey) {
  const clean = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  );
  const orderedKeys = Object.keys(clean).sort();
  const concatenated = orderedKeys.reduce((acc, k) => acc + k + clean[k], '');
  return crypto.createHmac('sha256', secretKey).update(concatenated, 'utf8').digest('hex');
}
const tryParseJSON = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

function normalizeDocPath(p) {
  if (!p) return null;
  const clean = String(p).replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length % 2 !== 0) return null;
  return clean;
}

const lineAmount = (it) =>
  Math.round(Number(it.price || 0)) * Math.max(1, Number(it.qty || 0));
const sumItems = (items = []) => items.reduce((acc, it) => acc + lineAmount(it), 0);

/* =========================
 * QR Codes (secure payload)
 * ========================= */
const QR_SECRET_KEY = process.env.QR_SECRET_KEY || process.env.TICKET_SECRET || '';
function signTicketPayload({ ticketId, orderId, eventId, ts, v }, secret) {
  const base = `${ticketId}.${orderId}.${eventId}.${ts}.v${v}`;
  return crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex');
}
function buildQrData({ ticketId, orderId, eventId, ticketTypeId }) {
  const v = 1;
  const ts = Date.now();
  const payload = { t: ticketId, o: orderId, e: eventId, tp: ticketTypeId || null, ts, v };
  if (QR_SECRET_KEY) {
    payload.sig = signTicketPayload({ ticketId, orderId, eventId, ts, v }, QR_SECRET_KEY);
  }
  // compact string that you can render as QR directly (safe to display)
  const text = `GUP:${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return { text, payload };
}

/** =========================
 * Flow status normalizer (best-effort)
 * ========================= */
function normalizeFlow(status) {
  const p = status?.paymentData || status || {};
  const flowOrder = Number(status?.flowOrder || p.flowOrder || 0) || null;
  const token = status?.token || p.token || null;
  const paymentId = String(p.paymentId || token || flowOrder || "").trim() || null;
  const amount = parseInt(String(status?.amount || p.amount || 0).replace(/[^\d]/g, ""), 10) || 0;
  const currency = (status?.currency || p.currency || "CLP") || "CLP";
  // status mapping
  const s = String(status?.status || p.status || "").toLowerCase();
  let norm = "pending";
  if (["paid","approved","success","ok"].includes(s)) norm = "paid";
  else if (["failed","error","rejected","declined"].includes(s)) norm = "failed";
  else if (["canceled","cancelled","anulado"].includes(s)) norm = "canceled";
  const media = p.media || p.method || null;
  const flowTxId = p.flowTransactionId || p.flow_tx_id || p.transactionId || null;
  const customerEmail = status?.customerEmail || p.customerEmail || p.email || null;
  return {
    paymentId,
    flowOrder,
    token,
    amount,
    currency,
    status: norm,
    rawStatus: s || null,
    media,
    flowTxId,
    customerEmail,
  };
}

// === Idempotency helpers (avoid double materialization) ===
async function isOrderAlreadyProcessed(db, orderId) {
  try {
    const q = await db
      .collection('finishedOrder')
      .where('orderId', '==', String(orderId))
      .limit(1)
      .get();
    return !q.empty;
  } catch (_) {
    return false;
  }
}

function getOrderLockRef(db, orderId) {
  return db.doc(`orderLocks/${String(orderId)}`);
}

/* =========================
 * Express
 * ========================= */
const app = express();
const allowedOrigin = (origin) => {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.host;
    if (PUBLIC_HOST && origin.startsWith(PUBLIC_HOST)) return true;
    if (/localhost:\d+$/i.test(host)) return true;
    return true; // fallback: keep permissive as antes
  } catch { return true; }
};
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());



app.get('/health', (_req, res) => res.json({ ok: true }));

// Simple health for funnel with project check
app.get('/api/funnel/health', (_req, res) => {
  try {
    const projectId =
      (admin.app().options && admin.app().options.projectId) ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      'unknown';
    const now = new Date();
    const dateKey = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
    return res.json({ ok: true, projectId, dateKey, firestore: !!admin.firestore() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/* =======================================================================
 * POST /api/webpay/create
 * Guarda snapshot en flowCarts/{orderId} y crea transacción en Webpay Plus
 * Body:
 *  { orderId, subject, currency, amount, email, returnUrl,
 *    items:[{eventId,eventName,eventImage,eventStart,eventEnd,ticketId,ticketName,price,currency,qty,ticketPath}],
 *    buyerUid, buyerName, subtotal, serviceFee, serviceFeeRate, attendees, demographics }
 * ======================================================================= */
async function createWebpayHandler(req, res) {
  try {
    if (!hasWebpay) return res.status(500).json({ error: 'Webpay no configurado' });

    const b = req.body || {};
    const {
      orderId,
      subject,
      currency = 'CLP',
      amount,
      email,
      returnUrl: rawReturnUrl,
      items = [],
      buyerUid = null,
      buyerName = null,
      subtotal = null,
      serviceFee = null,
      serviceFeeRate = null,
    } = b;

    if (!orderId || !currency || !amount || !email) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Faltan items del carrito' });
    }

    // Normaliza items
    const normItems = items.map((it) => ({
      eventId: it.eventId || null,
      eventName: it.eventName || null,
      eventImage: it.eventImage || null,
      eventStart: it.eventStart || null,
      eventEnd: it.eventEnd || null,
      ticketId: it.ticketId || null,
      ticketName: it.ticketName || null,
      ticketPath:
        normalizeDocPath(it.ticketPath) ||
        (it.eventId && it.ticketId ? `evento/${it.eventId}/ticketTypes/${it.ticketId}` : null),
      qty: Math.max(1, Number(it.qty || 0)),
      price: Math.round(Number(it.price || 0)),
      currency: it.currency || currency || 'CLP',
    }));

    // Enriquecer fechas de evento si faltan (informativo para cliente y para check-in)
    const eventDateCache = new Map();
    for (const it of normItems) {
      if ((!it.eventStart || !it.eventEnd) && it.eventId) {
        let cached = eventDateCache.get(it.eventId);
        if (!cached) {
          cached = await resolveEventSchedule(db, it.eventId);
          eventDateCache.set(it.eventId, cached);
        }
        it.eventStart = it.eventStart || cached.start || null;
        it.eventEnd   = it.eventEnd   || cached.end   || null;
      }
    }

    const attendeesRaw = Array.isArray(b.attendees) ? b.attendees : [];

    // Demografía entrante (puede venir buyer y/o attendees[0] con los datos del cliente 1)
    const demographics = b.demographics || null;
    const buyerFromDemo = (b.demographics && b.demographics.buyer) || null;
    const buyerFromAtt0 =
      (Array.isArray(b.demographics?.attendees) && b.demographics.attendees[0]) ||
      (Array.isArray(attendeesRaw) && attendeesRaw[0]) ||
      null;

    // Extrae RUT y teléfono del cliente 1 desde donde esté disponible
    const buyerRut =
      (buyerFromDemo && (buyerFromDemo.rut || buyerFromDemo.RUT)) ||
      (buyerFromAtt0 && (buyerFromAtt0.rut || buyerFromAtt0.RUT)) ||
      b.buyerRut ||
      null;

    const buyerPhone =
      (buyerFromDemo && (buyerFromDemo.telefono || buyerFromDemo.phone)) ||
      (buyerFromAtt0 && (buyerFromAtt0.telefono || buyerFromAtt0.phone)) ||
      b.buyerPhone ||
      null;

    // Normaliza demografía a guardar, inyectando rut/telefono en buyer
    const demoSave =
      demographics && typeof demographics === 'object' ? { ...demographics } : null;
    if (demoSave) {
      const prevBuyer =
        demoSave.buyer && typeof demoSave.buyer === 'object' ? demoSave.buyer : {};
      demoSave.buyer = {
        ...prevBuyer,
        rut: buyerRut ?? prevBuyer.rut ?? null,
        telefono: buyerPhone ?? prevBuyer.telefono ?? null,
      };
    }

    // Recalcula total en servidor (igual que Flow)
    const serverSubtotal = sumItems(normItems);
    const rate = typeof serviceFeeRate === 'number' && isFinite(serviceFeeRate) ? serviceFeeRate : 0.12;
    const serverFee = typeof serviceFee === 'number' && isFinite(serviceFee)
      ? Math.round(serviceFee)
      : Math.round(serverSubtotal * rate);
    const serverTotal = serverSubtotal + serverFee;

    // FIX: usar regex correcto para limpiar no-dígitos
    const amountInt = parseInt(String(amount).replace(/[^\d]/g, ''), 10) || Number(amount);
    if (serverTotal !== amountInt) {
      return res.status(400).json({
        error: 'Monto total no coincide con items',
        serverSubtotal,
        serverFee,
        serverTotal,
        clientAmount: amountInt,
      });
    }

    const commerceOrder = String(orderId).slice(0, 45);
    const sessionId = email || buyerUid || `sess_${Date.now()}`;

    // Return URL: prioriza FRONT (/pago/retorno). Permite https://... o http://localhost en pruebas.
    const clientUrl = (typeof rawReturnUrl === 'string' && rawReturnUrl.trim()) ? String(rawReturnUrl).trim() : null;
    const defaultFrontUrl = getDefaultFrontReturnUrl(commerceOrder) || getDefaultWebpayReturnUrl();
    let pickedReturnUrl = defaultFrontUrl;
    if (clientUrl && (/^https:\/\//i.test(clientUrl) || /^http:\/\/localhost/i.test(clientUrl))) {
      pickedReturnUrl = clientUrl;
    }
    const computedReturnUrl = pickedReturnUrl ? String(pickedReturnUrl).replace(/\/+$/, '') : null;

    if (!computedReturnUrl) {
      return res.status(500).json({ error: 'Falta URL de retorno pública. Configure WEBPAY_RETURN_BASE/PUBLIC_RETURN_BASE/NGROK_BASE' });
    }
    // Allow https://... or http://localhost... as valid return URLs
    if (!/^https:\/\//i.test(computedReturnUrl) && !/^http:\/\/localhost/i.test(computedReturnUrl)) {
      return res.status(400).json({ error: 'returnUrl debe ser https público o localhost', returnUrl: computedReturnUrl });
    }

    // Snapshot del carrito (reutilizamos flowCarts para no romper front)
    await db.collection('flowCarts').doc(commerceOrder).set(
      {
        orderId: commerceOrder,
        subject: subject || `Carrito GoUp • ${normItems.length} ítem(s)`,
        currency,
        amount: serverTotal,
        email,
        returnUrl: computedReturnUrl || null,
        confirmUrl: null,
        items: normItems,
        buyerUid,
        buyerName,
        subtotal: serverSubtotal,
        serviceFee: serverFee,
        serviceFeeRate: rate,
        createdAt: Date.now(),
        status: 'created',
        attendeesRaw,
        buyerRut: buyerRut || null,
        buyerPhone: buyerPhone || null,
        demographics: demoSave,
        provider: 'webpay',
      },
      { merge: true }
    );

    // Debug log justo antes de llamar a Transbank
    console.log('[Webpay] init →', {
      commerceOrder,
      sessionId,
      serverTotal,
      computedReturnUrl,
      tbkEnv: TBK_ENV,
      commerce: TBK_COMMERCE_CODE,
    });
    // Crear transacción Webpay
    const tx = getWebpayTx();
    const resp = await tx.create(
      commerceOrder,
      sessionId,
      serverTotal,
      computedReturnUrl
    );
    const token = resp && resp.token;
    const redirectUrl = resp && resp.url && token ? `${resp.url}?token_ws=${token}` : null;

    if (!token || !redirectUrl) {
      console.error('[Webpay] create sin token/url:', resp);
      return res.status(502).json({ error: 'Webpay no entregó token/url', resp });
    }

    await db.collection('flowCarts').doc(commerceOrder).set({ token, updatedAt: Date.now() }, { merge: true });
    await db.collection('purchaseOrder').doc(commerceOrder).set(
      {
        OrderID: commerceOrder,
        Token: token,
        FlowOrder: null,
        Amount: serverTotal,
        Currency: currency || 'CLP',
        CustomerEmail: email || null,
        created_at: Date.now(),
        updated_at: Date.now(),
        PaymentToken: token,
        Status: 'created',
        Provider: 'webpay',
      },
      { merge: true }
    );

    return res.json({ ok: true, redirectUrl, commerceOrder, token });
  } catch (e) {
    const respStatus = e?.response?.status;
    const respData = e?.response?.data;
    const msg = e?.message || String(e);
    console.error('[Webpay] ERROR create:', respStatus, respData || msg);
    return res.status(502).json({
      error: 'Error creando transacción Webpay',
      status: respStatus || null,
      message: msg,
      body: respData || null,
      context: {
        env: TBK_ENV,
        commerce: TBK_COMMERCE_CODE ? TBK_COMMERCE_CODE : null,
        hasOptions: !!tbkOptions,
        hasSdk: !!WebpayPlus,
      },
    });
  }
}

// Rutas Webpay (nueva y compat)
app.post('/api/webpay/create', createWebpayHandler);
app.post('/api/payments/webpay/init', createWebpayHandler);

// ==== Webpay commit single-flight + retry helpers ====
const _wbpCommitLocks = new Map(); // token -> Promise
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function commitWebpayWithRetry(token, { maxRetries = 5, delayMs = 600 } = {}) {
  const tx = getWebpayTx();
  let lastErr = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await tx.commit(token);
    } catch (e) {
      const msg = String(e?.message || e).toLowerCase();
      const code = e?.response?.status || e?.code || null;
      const locked = msg.includes('locked') || msg.includes('already locked') || code === 422;
      if (!locked) { lastErr = e; break; }
      lastErr = e;
      await sleep(delayMs);
      // Optional: try status to short-circuit if already authorized
      try {
        const st = await tx.status(token);
        if (st && String(st.status || '').toUpperCase() !== 'INITIALIZED') {
          return st; // treat as final
        }
      } catch (_) {}
    }
  }
  throw lastErr || new Error('WEBPAY_COMMIT_FAILED');
}

async function singleFlightCommit(token) {
  const key = String(token);
  if (_wbpCommitLocks.has(key)) return _wbpCommitLocks.get(key);
  const p = (async () => {
    try {
      const r = await commitWebpayWithRetry(key);
      return r;
    } finally {
      // small delay before releasing to avoid thundering herd
      setTimeout(() => _wbpCommitLocks.delete(key), 1500);
    }
  })();
  _wbpCommitLocks.set(key, p);
  return p;
}

/* =======================================================================
 * POST /api/webpay/commit  (también acepta GET)
 * Confirma transacción con token_ws y materializa órdenes/tickets (misma lógica que Flow)
 * ======================================================================= */
async function finalizeOrderFromWebpayCommit({ token }) {
  // 1) Commit en Webpay
  const commit = await singleFlightCommit(token);
  // commit.status: 'AUTHORIZED' | 'FAILED' etc.
  const status = String(commit.status || '').toUpperCase();
  const isPaid = status === 'AUTHORIZED';
  const amountPaidInt = Math.round(Number(commit.amount || 0));
  const commerceOrder = String(commit.buy_order || '').slice(0, 45);

  if (!commerceOrder) throw new Error('ORDER_NOT_FOUND_IN_COMMIT');

  // Idempotency: if this order was already materialized, short-circuit
  if (await isOrderAlreadyProcessed(db, commerceOrder)) {
    return { ok: true, buyOrder: commerceOrder, amount: amountPaidInt, status };
  }

  // === A partir de aquí replicamos la lógica del webhook de Flow ===
  const cartRef = db.collection('flowCarts').doc(commerceOrder);
  const ordersColl = db.collection('finishedOrder');

  await db.runTransaction(async (tx) => {
    // Read lock first to comply with Firestore rule: all reads before writes
    const lockRef = getOrderLockRef(db, commerceOrder);
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists) {
      throw new Error('ORDER_ALREADY_LOCKED');
    }

    const cartSnap = await tx.get(cartRef);
    if (!cartSnap.exists) throw new Error(`CART_NOT_FOUND:${commerceOrder}`);
    const cart = cartSnap.data() || {};

    const expected = Number(cart.amount ?? cart.amountTotal ?? 0);
    if (Number.isFinite(expected) && expected > 0 && expected !== amountPaidInt) {
      throw new Error(`TOTAL_MISMATCH expected=${expected} paid=${amountPaidInt}`);
    }

    const items = Array.isArray(cart.items) ? cart.items : [];
    if (items.length === 0) throw new Error('EMPTY_CART_ITEMS');

    // Pre-lectura de tickets
    const ticketRefs = [];
    const reads = [];
    for (const it of items) {
      if (it.eventId && it.ticketId) {
        const ref = db.doc(`evento/${it.eventId}/ticketTypes/${it.ticketId}`);
        ticketRefs.push({ ref, qty: Number(it.qty || 1), it });
        reads.push(tx.get(ref));
      }
    }
    const snaps = await Promise.all(reads);
    snaps.forEach((snap, i) => {
      if (!snap.exists) throw new Error(`TICKET_NOT_FOUND:${ticketRefs[i].it.ticketId}`);
      const data = snap.data() || {};
      const disponible = Number(data.stockDisponible ?? 0);
      const need = Number(ticketRefs[i].qty || 1);
      if (disponible < need) {
        throw new Error(`OUT_OF_STOCK:${ticketRefs[i].it.ticketId} need=${need} have=${disponible}`);
      }
    });

    const now = Date.now();
    // First write: create the order lock to prevent double materialization
    tx.create(lockRef, { orderId: commerceOrder, token, createdAt: now });
    const paymentStatus = isPaid ? 'paid' : 'failed';

    // 1) Un documento por ítem
      for (const it of items) {
        const qty = Math.max(1, Number(it.qty || 1));
        const price = Math.round(Number(it.price || 0));
        const lineAmount = price * qty;

        const newRef = ordersColl.doc();
        tx.set(newRef, {
          orderId: commerceOrder,
          token,
          flowOrder: null,
          status: paymentStatus,
          paidAt: isPaid ? now : null,

          email: cart.email || cart.buyerEmail || null,
          buyerUid: cart.buyerUid || null,
          buyerName: cart.buyerName || null,
          buyerRut: cart.buyerRut || (cart.demographics?.buyer?.rut ?? (Array.isArray(cart.demographics?.attendees) ? cart.demographics.attendees[0]?.rut : null)) || null,
          buyerPhone: cart.buyerPhone || (cart.demographics?.buyer?.telefono ?? cart.demographics?.buyer?.phone ?? (Array.isArray(cart.demographics?.attendees) ? (cart.demographics.attendees[0]?.telefono ?? cart.demographics.attendees[0]?.phone) : null)) || null,

          eventId: it.eventId,
          eventName: it.eventName || null,
          eventImage: it.eventImage || null,
          eventStart: it.eventStart || null,
          eventEnd: it.eventEnd || null,
          ticketId: it.ticketId,
          ticketName: it.ticketName,
          ticketPath: it.ticketPath || null,

          price,
          qty,
          amount: lineAmount,
          currency: it.currency || cart.currency || 'CLP',

          subject: cart.subject || `Carrito GoUp • ${items.length} ítem(s)`,
          createdAt: cart.createdAt || now,
          updatedAt: now,

          webhook: { data: commit },
        });

        // Generar tickets si pagado
        if (isPaid) {
          for (let i = 0; i < qty; i++) {
            const tRef = db.collection('tickets').doc();
            const qr = buildQrData({ ticketId: tRef.id, orderId: commerceOrder, eventId: it.eventId, ticketTypeId: it.ticketId });
            tx.set(tRef, {
              ticketId: tRef.id,
              orderId: commerceOrder,
              orderItemId: newRef.id,
              eventId: it.eventId,
              eventName: it.eventName || null,
              eventStart: it.eventStart || null,
              eventEnd: it.eventEnd || null,
              ticketTypeId: it.ticketId,
              ticketName: it.ticketName,
              price: price,
              currency: it.currency || cart.currency || 'CLP',
              buyerUid: cart.buyerUid || null,
              buyerName: cart.buyerName || null,
              buyerRut: cart.buyerRut || (cart.demographics?.buyer?.rut ?? (Array.isArray(cart.demographics?.attendees) ? cart.demographics.attendees[0]?.rut : null)) || null,
              buyerPhone: cart.buyerPhone || (cart.demographics?.buyer?.telefono ?? cart.demographics?.buyer?.phone ?? (Array.isArray(cart.demographics?.attendees) ? (cart.demographics.attendees[0]?.telefono ?? cart.demographics.attendees[0]?.phone) : null)) || null,
  
              email: cart.email || cart.buyerEmail || null,
              status: 'valid',
              issuedAt: now,
              usedAt: null,
              qr: { text: qr.text, payload: qr.payload },
              webhook: { data: commit },
            });
            tx.set(newRef, { ticketIds: admin.firestore.FieldValue.arrayUnion(tRef.id) }, { merge: true });
          }
        }
      }

    // Descontar stock si pagado
    if (isPaid) {
      for (const { ref, qty } of ticketRefs) {
        tx.update(ref, { stockDisponible: admin.firestore.FieldValue.increment(-qty) });
      }
    }

    // Marcar carrito
    tx.set(
      cartRef,
      { status: paymentStatus, paidAt: isPaid ? now : null, token, flowOrder: null, webhook: commit, updatedAt: now, provider: 'webpay' },
      { merge: true }
    );
  });

  // Marcar embudo success si pagado
  try {
    const cartSnap2 = await db.collection('flowCarts').doc(String(commit.buy_order)).get();
    const cart2 = cartSnap2.exists ? (cartSnap2.data() || {}) : {};
    const rawItems2 = Array.isArray(cart2.items) ? cart2.items : [];
    const eventIds2 = Array.from(new Set(rawItems2.map((i) => i && i.eventId).filter(Boolean).map(String)));
    if (eventIds2.length > 0 && status === 'AUTHORIZED') {
      await Promise.all(eventIds2.map((eid) => bumpFunnelServer(eid, 'success', { orderId: String(commit.buy_order) })));
    }
  } catch (e) {
    console.warn('[funnel] webhook marking failed (webpay):', e);
  }

  // Persistencia analytics (purchaseOrder / Payments / Payment_History)
  const now = Date.now();
  const paymentDocId = token ? `wbp_${token}` : `ord_${commit.buy_order}`;

  await db.collection('purchaseOrder').doc(String(commit.buy_order)).set(
    {
      OrderID: String(commit.buy_order),
      Token: token || null,
      FlowOrder: null,
      Amount: amountPaidInt,
      Currency: 'CLP',
      CustomerEmail: commit.card_detail && commit.card_detail.card_number ? null : null,
      updated_at: now,
      PaymentToken: token || null,
      Status: status === 'AUTHORIZED' ? 'paid' : 'failed',
      Provider: 'webpay',
    },
    { merge: true }
  );

  await db.collection('Payments').doc(paymentDocId).set(
    {
      PaymentID: paymentDocId,
      FlowOrder: null,
      CommerceOrder: String(commit.buy_order),
      Token: token || null,
      Status: status === 'AUTHORIZED' ? 'paid' : 'failed',
      Currency: 'CLP',
      Amount: amountPaidInt,
      Media: 'Webpay',
      Created_at: now,
      Updated_at: now,
      Flow_Transaction_id: null,
      Raw: commit || null,
    },
    { merge: true }
  );

  const histRef = db.collection('Payment_History').doc();
  await histRef.set({
    ID: histRef.id,
    PaymentID: paymentDocId,
    Status: status === 'AUTHORIZED' ? 'paid' : 'failed',
    Message: String(commit.status || ''),
    Date: now,
    CommerceOrder: String(commit.buy_order),
  });

  // Aplicar nominativos
  try {
    const paidAtMs = Date.now();
    await applyAttendeesToTickets(db, { orderId: String(commit.buy_order), paidAt: new Date(paidAtMs) });
  } catch (e) {
    console.warn('[attendees→tickets webpay] failed:', e?.message || e);
  }

  return { ok: true, buyOrder: String(commit.buy_order), amount: amountPaidInt, status: status };
}

app.post('/api/webpay/commit', async (req, res) => {
  try {
    if (!hasWebpay) return res.status(500).json({ ok: false, error: 'Webpay no configurado' });
    const token = String(req.body.token_ws || req.body.token || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'token_ws requerido' });
    const r = await finalizeOrderFromWebpayCommit({ token });
    return res.json(r);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('ORDER_ALREADY_LOCKED')) {
      // Someone else just processed it; return a benign OK so front can continue
      return res.json({ ok: true, status: 'AUTHORIZED' });
    }
    console.error('[Webpay] commit error:', e);
    return res.status(400).json({ ok: false, error: msg });
  }
});

// También soporta GET (cuando retornas directo a backend)
app.get('/api/webpay/commit', async (req, res) => {
  try {
    if (!hasWebpay) return res.status(500).json({ ok: false, error: 'Webpay no configurado' });
    const token = String(req.query.token_ws || req.query.token || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'token_ws requerido' });
    const r = await finalizeOrderFromWebpayCommit({ token });
    const front = getDefaultFrontReturnUrl(r.buyOrder) || getDefaultWebpayReturnUrl();
    // Allow redirect to https://... or http://localhost... for local testing
    if (front && (/^https:\/\//i.test(front) || /^http:\/\/localhost/i.test(front))) {
      const url = `${front}${front.includes('?') ? '&' : '?'}status=${encodeURIComponent(r.status || '')}`;
      return res.redirect(302, url);
    }
    return res.json(r);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('ORDER_ALREADY_LOCKED')) {
      const front = getDefaultFrontReturnUrl(null) || getDefaultWebpayReturnUrl();
      if (front && (/^https:\/\//i.test(front) || /^http:\/\/localhost/i.test(front))) {
        const url = `${front}${front.includes('?') ? '&' : '?'}status=AUTHORIZED`;
        return res.redirect(302, url);
      }
      return res.json({ ok: true, status: 'AUTHORIZED' });
    }
    console.error('[Webpay] commit error:', e);
    const front = getDefaultFrontReturnUrl(null) || getDefaultWebpayReturnUrl();
    if (front && (/^https:\/\//i.test(front) || /^http:\/\/localhost/i.test(front))) {
      const url = `${front}${front.includes('?') ? '&' : '?'}error=${encodeURIComponent(msg)}`;
      return res.redirect(302, url);
    }
    return res.status(400).json({ ok: false, error: msg });
  }
});

// Compat aliases for commit endpoints expected by some frontends
app.post('/api/payments/webpay/commit', async (req, res) => {
  try {
    if (!hasWebpay) return res.status(500).json({ ok: false, error: 'Webpay no configurado' });
    const token = String(req.body.token_ws || req.body.token || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'token_ws requerido' });
    const r = await finalizeOrderFromWebpayCommit({ token });
    return res.json(r);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('ORDER_ALREADY_LOCKED')) {
      // Someone else just processed it; return a benign OK so front can continue
      return res.json({ ok: true, status: 'AUTHORIZED' });
    }
    console.error('[Webpay] commit error (compat):', e);
    return res.status(400).json({ ok: false, error: msg });
  }
});

app.get('/api/payments/webpay/commit', async (req, res) => {
  try {
    if (!hasWebpay) return res.status(500).json({ ok: false, error: 'Webpay no configurado' });
    const token = String(req.query.token_ws || req.query.token || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'token_ws requerido' });
    const r = await finalizeOrderFromWebpayCommit({ token });
    const front = getDefaultFrontReturnUrl(r.buyOrder) || getDefaultWebpayReturnUrl();
    // Allow redirect to https://... or http://localhost... for local testing
    if (front && (/^https:\/\//i.test(front) || /^http:\/\/localhost/i.test(front))) {
      const url = `${front}${front.includes('?') ? '&' : '?'}status=${encodeURIComponent(r.status || '')}`;
      return res.redirect(302, url);
    }
    return res.json(r);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('ORDER_ALREADY_LOCKED')) {
      const front = getDefaultFrontReturnUrl(null) || getDefaultWebpayReturnUrl();
      if (front && (/^https:\/\//i.test(front) || /^http:\/\/localhost/i.test(front))) {
        const url = `${front}${front.includes('?') ? '&' : '?'}status=AUTHORIZED`;
        return res.redirect(302, url);
      }
      return res.json({ ok: true, status: 'AUTHORIZED' });
    }
    console.error('[Webpay] commit error (compat GET):', e);
    const front = getDefaultFrontReturnUrl(null) || getDefaultWebpayReturnUrl();
    if (front && (/^https:\/\//i.test(front) || /^http:\/\/localhost/i.test(front))) {
      const url = `${front}${front.includes('?') ? '&' : '?'}error=${encodeURIComponent(msg)}`;
      return res.redirect(302, url);
    }
    return res.status(400).json({ ok: false, error: msg });
  }
});

/* =======================================================================
 * POST /api/funnel
 * Body: { eventId: string, step: "views"|"carts"|"started"|"success", orderId?: string }
 * Marca contadores en metrics_funnel/{YYYYMMDD}/events/{eventId} y .../global/global
 * ======================================================================= */
app.post('/api/funnel', async (req, res) => {
  try {
    const body = req.body || {};
    const eventId = String(body.eventId || '').trim();
    const step = String(body.step || '').trim().toLowerCase();
    const orderId = body.orderId ? String(body.orderId) : undefined;
    const ALLOWED = new Set(['views', 'carts', 'started', 'success']);
    console.log('[funnel api] step:', step, 'eventId:', eventId, 'orderId:', orderId);
    if (!eventId || !ALLOWED.has(step)) {
      return res.status(400).json({ ok: false, error: 'bad_request', details: 'eventId/step inválidos' });
    }
    await bumpFunnelServer(eventId, step, orderId ? { orderId } : {});
    console.log('[funnel api] wrote ok');
    return res.json({ ok: true });
  } catch (e) {
    console.warn('[funnel api] failed:', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* =======================================================================
 * POST /api/flow/create
 * Guarda snapshot en flowCarts/{orderId} y crea pago en Flow
 * Body:
 *  { orderId, subject, currency, amount, email, returnUrl, confirmUrl,
 *    items:[{eventId,eventName,eventImage,eventStart,eventEnd,ticketId,ticketName,price,currency,qty,ticketPath}],
 *    buyerUid, buyerName, subtotal, serviceFee, serviceFeeRate }
 * ======================================================================= */
app.post('/api/flow/create', async (req, res) => {
  try {
    const b = req.body || {};
    const {
      orderId,
      subject,
      currency = 'CLP',
      amount,
      email,
      returnUrl,
      confirmUrl,
      items = [],
      buyerUid = null,
      buyerName = null,
      subtotal = null,
      serviceFee = null,
      serviceFeeRate = null,
    } = b;

    if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
      return res.status(500).json({ error: 'Faltan FLOW_API_KEY/FLOW_SECRET_KEY' });
    }
    if (!orderId || !currency || !amount || !email) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Faltan items del carrito' });
    }

    // Normaliza items
    const normItems = items.map((it) => ({
      eventId: it.eventId || null,
      eventName: it.eventName || null,
      eventImage: it.eventImage || null,
      eventStart: it.eventStart || null,
      eventEnd: it.eventEnd || null,
      ticketId: it.ticketId || null,
      ticketName: it.ticketName || null,
      ticketPath:
        normalizeDocPath(it.ticketPath) ||
        (it.eventId && it.ticketId ? `evento/${it.eventId}/ticketTypes/${it.ticketId}` : null),
      qty: Math.max(1, Number(it.qty || 0)),
      price: Math.round(Number(it.price || 0)),
      currency: it.currency || currency || 'CLP',
    }));

    const attendeesRaw = Array.isArray(b.attendees) ? b.attendees : [];
    const demographics = b.demographics || null;

    // Recalcula total en servidor
    const serverSubtotal = sumItems(normItems);
    const rate =
      typeof serviceFeeRate === 'number' && isFinite(serviceFeeRate) ? serviceFeeRate : 0.12;
    const serverFee =
      typeof serviceFee === 'number' && isFinite(serviceFee)
        ? Math.round(serviceFee)
        : Math.round(serverSubtotal * rate);
    const serverTotal = serverSubtotal + serverFee;

    const amountInt = parseInt(String(amount).replace(/[^\d]/g, ''), 10);
    if (serverTotal !== amountInt) {
      return res.status(400).json({
        error: 'Monto total no coincide con items',
        serverSubtotal,
        serverFee,
        serverTotal,
        clientAmount: amountInt,
      });
    }

    const commerceOrder = String(orderId).slice(0, 45);

    // Snapshot del carrito para el webhook
    await db
      .collection('flowCarts')
      .doc(commerceOrder)
      .set(
        {
          orderId: commerceOrder,
          subject: subject || `Carrito GoUp • ${normItems.length} ítem(s)`,
          currency,
          amount: serverTotal,
          email,
          returnUrl:
            returnUrl ||
            (PUBLIC_RETURN_BASE
              ? `${PUBLIC_RETURN_BASE}/pago/retorno?order=${encodeURIComponent(commerceOrder)}`
              : null),
          confirmUrl: confirmUrl || PUBLIC_CONFIRM_URL || null,
          items: normItems,
          buyerUid,
          buyerName,
          subtotal: serverSubtotal,
          serviceFee: serverFee,
          serviceFeeRate: rate,
          createdAt: Date.now(),
          status: 'created',
          attendeesRaw,
          demographics,
        },
        { merge: true }
      );

    /** Mirror order header for analytics (purchaseOrder) */
    await db.collection("purchaseOrder").doc(commerceOrder).set(
      {
        OrderID: commerceOrder,
        Token: null,
        FlowOrder: null,
        Amount: serverTotal,
        Currency: currency || "CLP",
        CustomerEmail: email || null,
        created_at: Date.now(),
        updated_at: Date.now(),
        PaymentToken: null,
        Status: "created",
      },
      { merge: true }
    );

    // Crear pago en Flow
    const paramsRaw = {
      apiKey: FLOW_API_KEY,
      commerceOrder,
      subject: (subject || `Carrito GoUp • ${normItems.length} item(s)`).toString().trim(),
      currency: (currency || 'CLP').toString().trim(),
      amount: String(amountInt),
      email: String(email).trim(),
      urlConfirmation: (confirmUrl || PUBLIC_CONFIRM_URL || '').toString().trim() || null,
      urlReturn:
        (returnUrl ||
          (PUBLIC_RETURN_BASE
            ? `${PUBLIC_RETURN_BASE}/pago/retorno?order=${encodeURIComponent(commerceOrder)}`
            : '')).toString().trim() || null,
    };
    // Eliminar nulos/indefinidos antes de firmar/enviar
    const params = Object.fromEntries(
      Object.entries(paramsRaw).filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    );
    const s = signFlow(params, FLOW_SECRET_KEY);
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) form.append(k, String(v));
    form.append('s', s);

    const r = await flowAxios.post('/payment/create', form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

    if (r.status < 200 || r.status >= 300) {
      console.error('[Flow] create rejected:', r.status, '\n', r.data, '\nparams=', params, '\nsigned=', s);
      return res.status(502).json({
        error: 'Flow rechazo la petición',
        flowStatus: r.status,
        flowBody: r.data,
        sent: params,
      });
    }

    const data = typeof r.data === 'string' ? tryParseJSON(r.data) : r.data;
    const token = data?.token || data?.token_ws || data?.flowToken || null;
    const url = data?.url || data?.redirect || data?.redirectUrl || null;
    const redirectUrl = token && url ? `${url}?token=${token}` : null;

    await db
      .collection('flowCarts')
      .doc(commerceOrder)
      .set({ token: token || null, updatedAt: Date.now() }, { merge: true });

    return res.json({ ok: true, redirectUrl, commerceOrder, token, raw: data });
  } catch (e) {
    console.error('[Flow] ERROR create:', e?.response?.status, e?.response?.data || e);
    return res
      .status(502)
      .json({ error: 'Error creando pago', status: e?.response?.status, body: e?.response?.data });
  }
});

/* =======================================================================
 * POST /api/flow/webhook
 * Soporta:
 *  - token-only (Flow moderno) -> getStatus
 *  - payload con firma 's' (legacy)
 * Realiza:
 *  - Valida total con flowCarts/{orderId}
 *  - Pre-lee todos los tickets y valida stock
 *  - Crea 1 documento por ítem en `finishedOrder` (modelo nuevo)
 *  - Descuenta stock
 *  - Marca flowCarts/{orderId} como paid
 * ======================================================================= */
app.post('/api/flow/webhook', async (req, res) => {
  try {
    const body = req.body || {};

    let statusData = null; // respuesta normalizada de getStatus o del body firmado
    let commerceOrder = null;

    if (body.token && !body.s) {
      // token-only
      const token = String(body.token);
      const params = { apiKey: FLOW_API_KEY, token };
      const s = signFlow(params, FLOW_SECRET_KEY);
      const r = await flowAxios.get('/payment/getStatus', {
        params: { ...params, s },
        headers: { Accept: 'application/json' },
      });
      if (r.status < 200 || r.status >= 300) {
        return res.status(502).json({ ok: false, error: 'getStatus failed', status: r.status });
      }
      const data = typeof r.data === 'string' ? tryParseJSON(r.data) : r.data;
      statusData = data;
      commerceOrder = String(data?.commerceOrder || data?.orderNumber || '').slice(0, 45);
      if (!commerceOrder) return res.status(400).json({ ok: false, reason: 'no commerceOrder' });
    } else {
      // firmado
      const { s, ...fields } = body;
      const expected = signFlow(fields, FLOW_SECRET_KEY);
      if (!s || s !== expected) return res.status(400).json({ ok: false, reason: 'bad signature' });
      statusData = fields;
      commerceOrder = String(fields.commerceOrder || fields.orderId || '').slice(0, 45);
      if (!commerceOrder) return res.status(400).json({ ok: false, reason: 'no order' });
    }

    const amountPaidInt = parseInt(
      String(statusData?.amount || statusData?.paymentData?.amount || 0).replace(/[^\d]/g, ''),
      10
    );

    const cartRef = db.collection('flowCarts').doc(commerceOrder);
    const ordersColl = db.collection('finishedOrder');

    await db.runTransaction(async (tx) => {
      /* ---- LECTURAS ---- */
      const cartSnap = await tx.get(cartRef);
      if (!cartSnap.exists) throw new Error(`CART_NOT_FOUND:${commerceOrder}`);
      const cart = cartSnap.data() || {};

      const expected = Number(cart.amount ?? cart.amountTotal ?? 0);
      if (Number.isFinite(expected) && expected > 0 && expected !== amountPaidInt) {
        throw new Error(`TOTAL_MISMATCH expected=${expected} paid=${amountPaidInt}`);
      }

      const items = Array.isArray(cart.items) ? cart.items : [];
      if (items.length === 0) throw new Error('EMPTY_CART_ITEMS');

      // Pre-lectura de tickets
      const ticketRefs = [];
      const reads = [];
      for (const it of items) {
        if (it.eventId && it.ticketId) {
          const ref = db.doc(`evento/${it.eventId}/ticketTypes/${it.ticketId}`);
          ticketRefs.push({ ref, qty: Number(it.qty || 1), it });
          reads.push(tx.get(ref));
        }
      }
      const snaps = await Promise.all(reads);
      snaps.forEach((snap, i) => {
        if (!snap.exists)
          throw new Error(`TICKET_NOT_FOUND:${ticketRefs[i].it.ticketId}`);
        const data = snap.data() || {};
        const disponible = Number(data.stockDisponible ?? 0);
        const need = Number(ticketRefs[i].qty || 1);
        if (disponible < need) {
          throw new Error(
            `OUT_OF_STOCK:${ticketRefs[i].it.ticketId} need=${need} have=${disponible}`
          );
        }
      });

      /* ---- ESCRITURAS ---- */
      const now = Date.now();
      const flowOrder = Number(statusData?.flowOrder || 0) || null;
      const token = statusData?.token || cart.token || null;

      // 1) Un documento por ítem
      for (const it of items) {
        const qty = Math.max(1, Number(it.qty || 1));
        const price = Math.round(Number(it.price || 0));
        const lineAmount = price * qty;

        const docData = {
          orderId: commerceOrder,
          token,
          flowOrder,
          status: 'paid',
          paidAt: now,

          email: cart.email || cart.buyerEmail || null,
          buyerUid: cart.buyerUid || null,
          buyerName: cart.buyerName || null,
          buyerRut: cart.buyerRut || (cart.demographics?.buyer?.rut ?? (Array.isArray(cart.demographics?.attendees) ? cart.demographics.attendees[0]?.rut : null)) || null,
          buyerPhone: cart.buyerPhone || (cart.demographics?.buyer?.telefono ?? cart.demographics?.buyer?.phone ?? (Array.isArray(cart.demographics?.attendees) ? (cart.demographics.attendees[0]?.telefono ?? cart.demographics.attendees[0]?.phone) : null)) || null,


          eventId: it.eventId,
          eventName: it.eventName || null,
          eventImage: it.eventImage || null,
          eventStart: it.eventStart || null,
          eventEnd: it.eventEnd || null,
          ticketId: it.ticketId,
          ticketName: it.ticketName,
          ticketPath: it.ticketPath || null,

          price,
          qty,
          amount: lineAmount,
          currency: it.currency || cart.currency || 'CLP',

          subject: cart.subject || `Carrito GoUp • ${items.length} ítem(s)`,
          createdAt: cart.createdAt || now,
          updatedAt: now,

          webhook: { data: statusData },
        };

        const newRef = ordersColl.doc();
        tx.set(newRef, docData);

        // 1.1) Generar tickets (un QR único por cada unidad comprada)
        for (let i = 0; i < qty; i++) {
          const tRef = db.collection('tickets').doc();
          const qr = buildQrData({
            ticketId: tRef.id,
            orderId: commerceOrder,
            eventId: it.eventId,
            ticketTypeId: it.ticketId,
          });

          const ticketDoc = {
            ticketId: tRef.id,
            orderId: commerceOrder,
            orderItemId: newRef.id,
            eventId: it.eventId,
            eventName: it.eventName || null,
            eventStart: it.eventStart || null,
            eventEnd: it.eventEnd || null,
            ticketTypeId: it.ticketId,
            ticketName: it.ticketName,
            price: price,
            currency: it.currency || cart.currency || 'CLP',
            buyerUid: cart.buyerUid || null,
            buyerName: cart.buyerName || null,
            buyerRut: cart.buyerRut || (cart.demographics?.buyer?.rut ?? (Array.isArray(cart.demographics?.attendees) ? cart.demographics.attendees[0]?.rut : null)) || null,
            buyerPhone: cart.buyerPhone || (cart.demographics?.buyer?.telefono ?? cart.demographics?.buyer?.phone ?? (Array.isArray(cart.demographics?.attendees) ? (cart.demographics.attendees[0]?.telefono ?? cart.demographics.attendees[0]?.phone) : null)) || null,
 

            email: cart.email || cart.buyerEmail || null,
            status: 'valid',       // listo para ser usado
            issuedAt: now,
            usedAt: null,          // se rellenará al validar en puerta
            qr: {
              text: qr.text,       // cadena que se renderiza como QR
              payload: qr.payload, // objeto (t, o, e, tp, ts, v, sig)
            },
            webhook: { data: statusData },
          };

          tx.set(tRef, ticketDoc);

          // referencia inversa en el ítem de la orden (útil para consultas)
          tx.set(
            newRef,
            { ticketIds: admin.firestore.FieldValue.arrayUnion(tRef.id) },
            { merge: true }
          );
        }
      }

      // 2) Descontar stock
      for (const { ref, qty } of ticketRefs) {
        tx.update(ref, {
          stockDisponible: admin.firestore.FieldValue.increment(-qty),
        });
      }

      // 3) Marcar carrito
      tx.set(
        cartRef,
        {
          status: 'paid',
          paidAt: now,
          token,
          flowOrder,
          webhook: statusData,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    // ===== Embudo: marcar success por cada evento del pedido =====
    try {
      // Relee items del carrito para determinar eventos involucrados
      const cartSnap2 = await db.collection('flowCarts').doc(commerceOrder).get();
      const cart2 = cartSnap2.exists ? (cartSnap2.data() || {}) : {};
      const rawItems2 = Array.isArray(cart2.items) ? cart2.items : [];
      const eventIds2 = Array.from(
        new Set(
          rawItems2
            .map((i) => i && i.eventId)
            .filter(Boolean)
            .map(String)
        )
      );
      if (eventIds2.length > 0) {
        await Promise.all(eventIds2.map((eid) => bumpFunnelServer(eid, "success", { orderId: commerceOrder })));
      }
    } catch (e) {
      console.warn("[funnel] webhook marking failed:", e);
    }

    // === Persist to analytics-friendly collections ===
    const now = Date.now();
    const norm = normalizeFlow(statusData);
    const paymentDocId = norm.paymentId || (norm.token ? `tok_${norm.token}` : `ord_${commerceOrder}`);

    // 1) Orders (header)
    await db.collection("purchaseOrder").doc(commerceOrder).set(
      {
        OrderID: commerceOrder,
        Token: norm.token || null,
        FlowOrder: norm.flowOrder,
        Amount: amountPaidInt,
        Currency: norm.currency || "CLP",
        CustomerEmail: norm.customerEmail || null,
        updated_at: now,
        PaymentToken: norm.token || null,
        Status: norm.status,
      },
      { merge: true }
    );

    // 2) Payments (one per Flow payment/attempt)
    await db.collection("Payments").doc(paymentDocId).set(
      {
        PaymentID: paymentDocId,
        FlowOrder: norm.flowOrder,
        CommerceOrder: commerceOrder,
        Token: norm.token || null,
        Status: norm.status,
        Currency: norm.currency || "CLP",
        Amount: amountPaidInt,
        Media: norm.media || null,
        Created_at: now,
        Updated_at: now,
        Flow_Transaction_id: norm.flowTxId || null,
        Raw: statusData || null,
      },
      { merge: true }
    );

    // 3) Payment_History (append-only log)
    const histRef = db.collection("Payment_History").doc();
    await histRef.set({
      ID: histRef.id,
      PaymentID: paymentDocId,
      Status: norm.status,
      Message: norm.rawStatus || null,
      Date: now,
      CommerceOrder: commerceOrder,
    });

    // === Aplicar nominativos a tickets + demografía (fecha real del pago) ===
    try {
      const paidAtMs = Date.now();
      await applyAttendeesToTickets(db, { orderId: commerceOrder, paidAt: new Date(paidAtMs) });
    } catch (e) {
      console.warn('[attendees→tickets] failed:', e?.message || e);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Flow] webhook error:', err?.message || err);
    return res.status(400).json({ error: String(err?.message || err) });
  }
});

// DEBUG ONLY: GET /api/funnel/debug?eventId=EID&step=views
app.get('/api/funnel/debug', async (req, res) => {
  try {
    const eventId = String(req.query.eventId || '').trim();
    const step = String(req.query.step || '').trim().toLowerCase();
    const ALLOWED = new Set(['views', 'carts', 'started', 'success']);
    if (!eventId || !ALLOWED.has(step)) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }
    await bumpFunnelServer(eventId, step);
    return res.json({ ok: true, eventId, step });
  } catch (e) {
    console.error('[funnel debug] error:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** ======================================================================
 * (Future) POST /api/flow/refund
 * Body: { paymentId, amount, reason }
 * Creates a record in Reimbursement (actual refund call to Flow can be plugged later).
 * ====================================================================== */
// app.post("/api/flow/refund", async (req, res) => {
//   try {
//     const { paymentId, amount, reason } = req.body || {};
//     if (!paymentId || !amount) return res.status(400).json({ ok:false, error:"paymentId/amount requeridos" });
//     const now = Date.now();
//     const id = `${paymentId}_${now}`;
//     await db.collection("Reimbursement").doc(id).set({
//       ID: id,
//       PaymentID: paymentId,
//       flow_reimbursement_id: null,
//       Amount: Number(amount),
//       Reason: reason || null,
//       Status: "requested",
//       Created_at: now,
//       Processed_at: null,
//     });
//     return res.json({ ok: true, id });
//   } catch (e) {
//     console.error("[refund] error:", e);
//     return res.status(500).json({ ok:false, error:"refund record failed" });
//   }
// });

/* =======================================================================
 * GET /api/flow/status?order=CART-123
 * Devuelve el estado agregando los ítems (modelo nuevo: finishedOrder planos)
 * ======================================================================= */
app.get('/api/flow/status', async (req, res) => {
  const order = String(req.query.order || req.query.orderId || '');
  if (!order) return res.status(400).json({ error: 'order requerido' });
  const id = order.length > 45 ? order.slice(0, 45) : order;

  try {
    // 1) Busca ítems ya materializados
    const q = await db.collection('finishedOrder').where('orderId', '==', id).get();
    if (!q.empty) {
      const items = q.docs.map((d) => ({ id: d.id, ...d.data() }));
      // status agregado
      let status = 'paid';
      if (items.some((x) => x.status === 'failed' || x.status === 'canceled')) status = 'failed';
      else if (items.some((x) => x.status !== 'paid')) status = 'pending';

      const paidAt =
        items
          .map((x) => x.paidAt || 0)
          .filter(Boolean)
          .sort((a, b) => b - a)[0] || null;

      const data = {
        orderId: id,
        status,
        items,
        paidAt,
        createdAt:
          items
            .map((x) => x.createdAt || 0)
            .filter(Boolean)
            .sort((a, b) => a - b)[0] || null,
      };
      return res.json({ status, source: 'finished', data });
    }

    // 2) Si aún no hay ítems, intenta snapshot del carrito
    const cartSnap = await db.collection('flowCarts').doc(id).get();
    if (cartSnap.exists) {
      const cart = cartSnap.data();
      const data = {
        orderId: id,
        status: cart.status || 'created',
        items: (cart.items || []).map((it, idx) => ({
          id: `cart-${idx + 1}`,
          orderId: id,
          status: 'pending',
          eventId: it.eventId,
          eventName: it.eventName,
          ticketId: it.ticketId,
          ticketName: it.ticketName,
          price: it.price,
          qty: it.qty,
          currency: it.currency || cart.currency || 'CLP',
        })),
        createdAt: cart.createdAt || null,
        paidAt: cart.paidAt || null,
        subject: cart.subject || null,
      };
      return res.json({ status: data.status, source: 'cart', data });
    }

    return res.json({ status: 'unknown', data: null });
  } catch (e) {
    console.error('[Flow] status error:', e);
    return res.status(500).json({ status: 'error', error: e.message });
  }
});

/* =======================================================================
 * GET /api/tickets/verify?code=GUP:...
 * Verifica firma y estado del ticket
 * ======================================================================= */
app.get('/api/tickets/verify', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ ok: false, error: 'code requerido' });

    let payload = null;
    if (code.startsWith('GUP:')) {
      const b64 = code.slice(4);
      const json = Buffer.from(b64, 'base64url').toString('utf8');
      payload = tryParseJSON(json);
    } else {
      payload = tryParseJSON(code);
    }
    if (!payload || !payload.t || !payload.o || !payload.e) {
      return res.status(400).json({ ok: false, error: 'payload inválido' });
    }

    if (QR_SECRET_KEY) {
      const expected = signTicketPayload(
        { ticketId: payload.t, orderId: payload.o, eventId: payload.e, ts: payload.ts, v: payload.v || 1 },
        QR_SECRET_KEY
      );
      if (expected !== payload.sig) {
        return res.status(400).json({ ok: false, error: 'firma inválida' });
      }
    }

    const tSnap = await db.collection('tickets').doc(String(payload.t)).get();
    if (!tSnap.exists) return res.status(404).json({ ok: false, error: 'ticket no existe' });
    const t = tSnap.data();

    return res.json({
      ok: true,
      ticket: {
        ticketId: t.ticketId,
        status: t.status,
        orderId: t.orderId,
        eventId: t.eventId,
        ticketTypeId: t.ticketTypeId,
        ticketName: t.ticketName,
        buyerUid: t.buyerUid || null,
        email: t.email || null,
        usedAt: t.usedAt || null,
      },
    });
  } catch (e) {
    console.error('[Tickets] verify error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});
// ======== Ticket Lookup / Check-in (QR) ========
/**
 * Busca un ticket por código (texto del QR) o por id de documento.
 * Retorna { ref, snap, data } o null si no existe.
 */
async function findTicketByCode(db, code) {
  const id = String(code || "").trim();
  if (!id) return null;

  // 1) Probar por id de documento
  try {
    const byId = await db.collection("tickets").doc(id).get();
    if (byId.exists) {
      return { ref: byId.ref, snap: byId, data: byId.data() };
    }
  } catch (_) {}

  // 2) Probar por campo qr.text
  try {
    const q = await db
      .collection("tickets")
      .where("qr.text", "==", id)
      .limit(1)
      .get();
    if (!q.empty) {
      const snap = q.docs[0];
      return { ref: snap.ref, snap, data: snap.data() };
    }
  } catch (_) {}

  // 3) Probar alias simples (qrText / code / qr)
  try {
    const aliases = ["qrText", "code", "qr"];
    for (const field of aliases) {
      const qq = await db.collection("tickets").where(field, "==", id).limit(1).get();
      if (!qq.empty) {
        const snap = qq.docs[0];
        return { ref: snap.ref, snap, data: snap.data() };
      }
    }
  } catch (_) {}

  return null;
}


// =========================
// Helper: buildCheckinPayloadFromTicketDoc
// =========================
async function buildCheckinPayloadFromTicketDoc(docSnap) {
  if (!docSnap.exists) return null;
  const t = docSnap.data() || {};
  const attendee = t.attendee || {};
  const qr = t.qr?.payload || {};

  const eventStart =
    t.eventStart ||
    t.orderItem?.eventStart ||
    t.items?.[0]?.eventStart ||
    null;

  return {
    id: t.ticketId || docSnap.id,
    status: t.status || (t.usedAt ? "used" : "valid"),
    usedAt: t.usedAt ?? null,
    orderId: t.orderId || qr.o || null,
    eventId: t.eventId || qr.e || null,
    ticketTypeId: t.ticketTypeId || qr.tp || null,

    // Buyer/attendee info for UI
    buyerUid: t.buyerUid || attendee.uid || null,
    email: t.email || attendee.correo || null,
    buyerName: t.buyerName || attendee.nombre || null,
    buyerRut: t.buyerRut || attendee.rut || null,

    // Event presentation fields
    eventName: t.eventName || t.event?.name || null,
    eventStart,
  };
}

/**
 * GET /api/tickets/lookup?code=XXXX
 * Devuelve el estado actual del ticket por código o id.
 */
app.get("/api/tickets/lookup", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    if (!code) return res.status(400).json({ ok: false, error: "code requerido" });

    const found = await findTicketByCode(db, code);
    if (!found) return res.status(404).json({ ok: false, error: "ticket no encontrado" });

    const payload = await buildCheckinPayloadFromTicketDoc(found.snap);
    return res.json({ ok: true, ticket: payload });
  } catch (e) {
    console.error("[tickets/lookup] error:", e);
    return res.status(500).json({ ok: false, error: "lookup failed" });
  }
});

/**
 * POST /api/tickets/checkin
 * Body: { code: string, gate?: string, operator?: string }
 * Marca el ticket como usado si está disponible.
 */
app.post("/api/tickets/checkin", async (req, res) => {
  try {
    const { code, gate = null, operator = null } = req.body || {};
    if (!code) return res.status(400).json({ ok: false, error: "code requerido" });

    const found = await findTicketByCode(db, String(code));
    if (!found) return res.status(404).json({ ok: false, error: "ticket no encontrado" });

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(found.ref);
      if (!snap.exists) throw new Error("not_found");
      const d = snap.data() || {};
      const now = Date.now();

      const currentStatus = d.status || (d.usedAt ? "used" : "valid");
      if (currentStatus === "void") {
        return { updated: false, conflict: "void", usedAt: d.usedAt || null, snap };
      }
      if (currentStatus === "used") {
        return { updated: false, conflict: "used", usedAt: d.usedAt || null, snap };
      }

      tx.update(found.ref, {
        status: "used",
        usedAt: now,
        usedGate: gate,
        usedBy: operator,
        updatedAt: now,
      });

      // log subcolección
      const logRef = found.ref.collection("checkins").doc();
      tx.set(logRef, { at: now, gate, operator, action: "used" });

      return { updated: true, usedAt: now };
    });

    // Construir payload final (releer si se actualizó)
    const finalSnap = result.snap ? result.snap : await found.ref.get();
    const payload = await buildCheckinPayloadFromTicketDoc(finalSnap);
    if (result.updated) payload.status = "used";

    return res.json({ ok: true, ticket: payload });
  } catch (e) {
    console.error("[tickets/checkin] error:", e);
    return res.status(500).json({ ok: false, error: "checkin failed" });
  }
});
/* =========================
 * Start
 * ========================= */
app.get('/api/payments/health', (_req, res) => {
  return res.json({ ok: true, webpay: hasWebpay, tbkEnv: TBK_ENV });
});

// En Vercel (serverless) NO hacemos listen; exportamos el app
if (!IS_VERCEL && !process.env.DISABLE_LISTEN) {
  app.listen(PORT, () => {
    console.log(`Flow server escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;