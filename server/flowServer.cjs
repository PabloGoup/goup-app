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
const admin = require('firebase-admin');

if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

/* =========================
 * Firebase Admin
 * ========================= */
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    const projectId =
      (admin.app().options.credential && admin.app().options.credential.projectId) ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      'unknown';
    console.log(
      `[FirebaseAdmin] Inicializado con GOOGLE_APPLICATION_CREDENTIALS, project: ${projectId}`
    );
  } catch (e) {
    console.error('[FirebaseAdmin] Error inicializando:', e);
  }
}
const db = admin.firestore();

/* =========================
 * ENV / Config
 * ========================= */
const PORT = Number(process.env.FLOW_SERVER_PORT || process.env.PORT || 8788);
const FLOW_BASE = (process.env.FLOW_BASE || 'https://www.flow.cl').replace(/\/+$/, '');
const FLOW_API_KEY = process.env.FLOW_API_KEY || '';
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY || '';
const PUBLIC_CONFIRM_URL =
  process.env.PUBLIC_CONFIRM_URL || process.env.VITE_PUBLIC_CONFIRM_URL || '';
const PUBLIC_RETURN_BASE = process.env.PUBLIC_RETURN_BASE || '';

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
 * Helpers
 * ========================= */
// Firma tipo Flow: concatena key+value ordenado alfabéticamente
function signFlow(params, secretKey) {
  const orderedKeys = Object.keys(params).sort();
  const concatenated = orderedKeys.reduce((acc, k) => acc + k + (params[k] ?? ''), '');
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

/* =========================
 * Express
 * ========================= */
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

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
        },
        { merge: true }
      );

    // Crear pago en Flow
    const params = {
      apiKey: FLOW_API_KEY,
      commerceOrder,
      subject: subject || `Carrito GoUp • ${normItems.length} ítem(s)`,
      currency,
      amount: String(amountInt),
      email,
      urlConfirmation: confirmUrl || PUBLIC_CONFIRM_URL,
      urlReturn:
        returnUrl ||
        (PUBLIC_RETURN_BASE
          ? `${PUBLIC_RETURN_BASE}/pago/retorno?order=${encodeURIComponent(commerceOrder)}`
          : null),
    };
    const s = signFlow(params, FLOW_SECRET_KEY);
    const form = new URLSearchParams();
    for (const k of Object.keys(params)) form.append(k, params[k]);
    form.append('s', s);

    const r = await flowAxios.post('/payment/create', form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

    if (r.status < 200 || r.status >= 300) {
      return res.status(502).json({
        error: 'Flow rechazó la petición',
        flowStatus: r.status,
        flowBody: r.data,
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
 *  - Crea 1 documento por ítem en `orders` (modelo nuevo)
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
    const ordersColl = db.collection('orders');

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
            ticketTypeId: it.ticketId,
            ticketName: it.ticketName,
            price: price,
            currency: it.currency || cart.currency || 'CLP',
            buyerUid: cart.buyerUid || null,
            buyerName: cart.buyerName || null,
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

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Flow] webhook error:', err?.message || err);
    return res.status(400).json({ error: String(err?.message || err) });
  }
});

/* =======================================================================
 * GET /api/flow/status?order=CART-123
 * Devuelve el estado agregando los ítems (modelo nuevo: orders planos)
 * ======================================================================= */
app.get('/api/flow/status', async (req, res) => {
  const order = String(req.query.order || req.query.orderId || '');
  if (!order) return res.status(400).json({ error: 'order requerido' });
  const id = order.length > 45 ? order.slice(0, 45) : order;

  try {
    // 1) Busca ítems ya materializados
    const q = await db.collection('orders').where('orderId', '==', id).get();
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
      return res.json({ status, data });
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
      return res.json({ status: data.status, data });
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

    const d = found.data || {};
    const status = d.status || (d.usedAt ? "used" : "valid");
    return res.json({
      ok: true,
      ticket: {
        id: found.snap.id,
        status,
        usedAt: d.usedAt || null,
        orderId: d.orderId || null,
        eventId: d.eventId || null,
        ticketTypeId: d.ticketTypeId || d.ticketId || null,
        buyerUid: d.buyerUid || null,
        email: d.email || null,
      },
    });
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
        return { updated: false, conflict: "void", usedAt: d.usedAt || null };
      }
      if (currentStatus === "used") {
        return { updated: false, conflict: "used", usedAt: d.usedAt || null };
      }

      tx.update(found.ref, {
        status: "used",
        usedAt: now,
        usedGate: gate,
        usedBy: operator,
        updatedAt: now,
      });

      // Log opcional en subcolección
      const logRef = found.ref.collection("checkins").doc();
      tx.set(logRef, {
        at: now,
        gate,
        operator,
        action: "used",
      });

      return { updated: true, usedAt: now };
    });

    if (!result.updated) {
      return res.status(409).json({
        ok: false,
        error: result.conflict === "used" ? "ticket ya usado" : "ticket anulado",
        status: result.conflict,
        usedAt: result.usedAt || null,
      });
    }

    return res.json({ ok: true, status: "used", usedAt: result.usedAt });
  } catch (e) {
    console.error("[tickets/checkin] error:", e);
    return res.status(500).json({ ok: false, error: "checkin failed" });
  }
});
/* =========================
 * Start
 * ========================= */
app.listen(PORT, () => {
  console.log(`Flow server escuchando en http://localhost:${PORT}`);
});