// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

// ===== Config =====
const FLOW_BASE = process.env.FLOW_BASE || 'https://sandbox.flow.cl';
const API_KEY    = process.env.FLOW_API_KEY;       // pública
const SECRET_KEY = process.env.FLOW_SECRET_KEY;    // secreta
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://TU-DOMINIO'; // tu dominio público

if (!API_KEY || !SECRET_KEY) {
  console.error('Faltan FLOW_API_KEY o FLOW_SECRET_KEY en .env');
  process.exit(1);
}

// ===== Helpers =====
function generateSignature(params, secretKey) {
  // Firma: concatenar claves ordenadas alfabéticamente => key + value (sin &)
  const orderedKeys = Object.keys(params).sort();
  const concatenated = orderedKeys.reduce((acc, key) => acc + key + (params[key] ?? ''), '');
  return crypto.createHmac('sha256', secretKey).update(concatenated, 'utf8').digest('hex');
}

function formEncode(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => p.append(k, v));
  return p.toString();
}

/** Construye URL de pago a partir del token */
function buildPayUrl(token) {
  return `${FLOW_BASE}/app/web/pay?token=${encodeURIComponent(token)}`;
}

// ===== App =====
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // necesario para webhook x-www-form-urlencoded

// Simula base de datos en memoria (cámbialo por tu DB)
const ORDERS = new Map();

/**
 * POST /api/flow/create
 * Body: { commerceOrder, subject, amount, email, currency? }
 * Devuelve: { token, flowOrder?, payUrl }
 */
app.post('/api/flow/create', async (req, res) => {
  try {
    const { commerceOrder, subject, amount, email, currency = 'CLP' } = req.body || {};

    if (!commerceOrder || !subject || !amount || !email) {
      return res.status(400).json({ error: 'Faltan campos: commerceOrder, subject, amount, email' });
    }

    // Guarda la orden como pendiente (DB real en producción)
    ORDERS.set(commerceOrder, { status: 'pending', amount, email, subject, createdAt: Date.now() });

    // Params obligatorios
    const params = {
      apiKey: API_KEY,
      commerceOrder: String(commerceOrder),
      subject: String(subject),
      currency: String(currency),
      amount: String(amount), // Flow espera string
      email: String(email),
      urlConfirmation: `${PUBLIC_BASE_URL}/api/flow/webhook`, // debe ser público y HTTPS
      urlReturn:        `${PUBLIC_BASE_URL}/api/flow/return`   // retorno visible al usuario
    };

    const s = generateSignature(params, SECRET_KEY);
    const payload = formEncode({ ...params, s });

    const { data } = await axios.post(
      `${FLOW_BASE}/api/payment/create`,
      payload,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    // Respuesta típica: { token, url: "...", flowOrder, ... }
    const token = data.token;
    const payUrl = data.url || buildPayUrl(token);

    // Opcional: guarda token/flowOrder
    ORDERS.set(commerceOrder, { ...ORDERS.get(commerceOrder), token, flowOrder: data.flowOrder });

    return res.json({ token, payUrl, flowOrder: data.flowOrder, commerceOrder });
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('Error /create:', msg);
    return res.status(500).json({ error: 'No se pudo crear el pago', detail: msg });
  }
});

/**
 * POST /api/flow/webhook
 * Flow envía campos + s (firma). Verificamos firma y actualizamos estado.
 * Debe responder 200 rápido.
 */
app.post('/api/flow/webhook', async (req, res) => {
  try {
    const { s, ...incoming } = req.body || {};
    // Verifica firma
    const expected = generateSignature(incoming, SECRET_KEY);
    if (!s || s !== expected) {
      console.warn('Firma inválida en webhook');
      return res.status(400).send('bad signature');
    }

    const { commerceOrder, flowOrder, status, token } = incoming;

    // Opcional: confirmar estado consultando a Flow por token
    let finalStatus = status;
    if (token) {
      try {
        const statusParams = { apiKey: API_KEY, token };
        const s2 = generateSignature(statusParams, SECRET_KEY);
        const q = formEncode({ ...statusParams, s: s2 });
        const { data } = await axios.post(
          `${FLOW_BASE}/api/payment/getStatus`,
          q,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
        );
        // data.status puede ser 2 = pagado, 1 = pending, etc (ajústalo según Flow)
        finalStatus = String(data.status ?? finalStatus);
        // guarda cualquier info útil (fee, card, etc.)
        ORDERS.set(commerceOrder, { ...(ORDERS.get(commerceOrder) || {}), status: finalStatus, flowDetail: data });
      } catch (e) {
        console.error('No se pudo confirmar estado con getStatus:', e.response?.data || e.message);
        // aun así marca con status recibido
        ORDERS.set(commerceOrder, { ...(ORDERS.get(commerceOrder) || {}), status: String(status), flowOrder, token });
      }
    } else {
      // si no hay token, actualiza con lo que vino
      ORDERS.set(commerceOrder, { ...(ORDERS.get(commerceOrder) || {}), status: String(status), flowOrder });
    }

    // Responder 200 OK siempre que la firma sea válida
    return res.send('OK');
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(500).send('error');
  }
});

/**
 * GET /api/flow/return?token=...
 * Página de retorno del usuario. Puedes consultar estado y redirigir a tu frontend.
 */
app.get('/api/flow/return', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Falta token');

  try {
    // Consulta estado por token para mostrar resultado confiable al usuario
    const params = { apiKey: API_KEY, token: String(token) };
    const s = generateSignature(params, SECRET_KEY);
    const payload = formEncode({ ...params, s });

    const { data } = await axios.post(
      `${FLOW_BASE}/api/payment/getStatus`,
      payload,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    // Según tu frontend, redirige con query
    const paid = String(data.status) === '2'; // ajusta si Flow usa otro código de éxito
    const redirect = paid
      ? `${PUBLIC_BASE_URL}/pago/exito?token=${encodeURIComponent(String(token))}`
      : `${PUBLIC_BASE_URL}/pago/error?token=${encodeURIComponent(String(token))}`;

    return res.redirect(302, redirect);
  } catch (err) {
    console.error('return getStatus error:', err.response?.data || err.message);
    return res.redirect(302, `${PUBLIC_BASE_URL}/pago/error`);
  }
});

// ===== Arranque =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Flow server on http://localhost:${PORT}`);
});