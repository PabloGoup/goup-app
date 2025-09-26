// functions/src/analytics.ts
import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";


// Evita doble inicialización en build/serve
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

const SVC_FEE = 0.12; // 12%

function asNumber(x: any, d = 0) {
  if (x == null) return d;
  if (typeof x === "number") return x;
  const n = Number(String(x).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : d;
}

// Normaliza fechas a epoch ms (acepta number, Firestore Timestamp o string ISO)
function toMs(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x; // epoch ms
  if (x && typeof x.seconds === "number") return x.seconds * 1000; // Firestore Timestamp
  if (typeof x === "string") {
    const t = Date.parse(x);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function netFromOrder(order: any) {
  // Prioriza price*qty; si no hay, deriva de amount/Amount (bruto) y descuenta 12%
  const price = asNumber(order.price, undefined);
  const qty = asNumber(order.qty, undefined);
  if (price != null && qty != null) return Math.round(price * qty);

  const gross =
    asNumber(order.amount, undefined) ??
    asNumber(order.Amount, undefined) ??
    asNumber(order?.webhook?.paymentData?.amount, undefined);

  if (gross != null) return Math.round(gross / (1 + SVC_FEE));
  return 0;
}

export const onOrderWrite = onDocumentWritten({ region: "southamerica-west1", document: "finishedOrder/{orderId}" }, async (event) => {
  const after = event.data?.after?.data() as any | null;
  const before = event.data?.before?.data() as any | null;
  if (!after) return;

  const eventId = after.eventId || after.eventID || after.event_id;
  if (!eventId) return;

  let clubId = after.clubId || after.club?.id || null;

  // Si no vino el club en la orden, intenta resolverlo desde la colección "evento/{eventId}"
  if (!clubId && eventId) {
    try {
      const evSnap = await db.collection("evento").doc(String(eventId)).get();
      if (evSnap.exists) {
        const ev = evSnap.data() as any;
        clubId = ev?.clubId || ev?.club?.id || null;
      }
    } catch (e) {
      logger.warn("[onOrderWrite] No se pudo leer evento para clubId", { eventId, error: String(e) });
    }
  }

  // Fecha de referencia: prioriza paidAt (momento real de pago), luego createdAt
  const createdAtMs =
    toMs(after.paidAt) ??
    toMs(after.createdAt) ??
    Date.now();

  const status = (after.status || after.Status || "").toLowerCase(); // paid|failed|pending
  const net = netFromOrder(after);
  const qty = asNumber(after.qty, 1);

  // Clave de día (YYYY-MM-DD)
  const d = new Date(createdAtMs);
  const dayKey = d.toISOString().slice(0, 10);

  const ref = db.collection("analytics").doc("events").collection("data").doc(eventId);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? (snap.data() as any) : {};

      // -------- summary --------
      const summary = cur.summary || {};
      const prevStatus = (before?.status || before?.Status || "").toLowerCase();
      const wasPaid = prevStatus === "paid";
      const isPaid = status === "paid";

      let gmvNet = Number(summary.gmvNet || 0);
      let paidCount = Number(summary.paidCount || 0);
      let failedCount = Number(summary.failedCount || 0);
      let pendingCount = Number(summary.pendingCount || 0);
      let tickets = Number(summary.tickets || 0);

      // revertimos efecto anterior si cambió de estado
      if (before) {
        if (wasPaid) {
          gmvNet -= netFromOrder(before);
          paidCount -= 1;
          tickets -= asNumber(before.qty, 1);
        }
        const bs = prevStatus || "pending";
        if (bs === "failed") failedCount -= 1;
        if (bs === "pending") pendingCount -= 1;
      }

      // aplicamos nuevo estado
      if (isPaid) {
        gmvNet += net;
        paidCount += 1;
        tickets += qty;
      }
      if (status === "failed") failedCount += 1;
      if (status === "pending") pendingCount += 1;

      const totalPayments = paidCount + failedCount + pendingCount;
      const aovNet = paidCount ? Math.round(gmvNet / paidCount) : 0;

      // -------- seriesDaily --------
      const seriesDaily = cur.seriesDaily || {};
      const s = seriesDaily[dayKey] || { gmvNet: 0, paidCount: 0, tickets: 0 };

      if (before && wasPaid) {
        s.gmvNet -= netFromOrder(before);
        s.paidCount -= 1;
        s.tickets -= asNumber(before.qty, 1);
      }
      if (isPaid) {
        s.gmvNet += net;
        s.paidCount += 1;
        s.tickets += qty;
      }
      seriesDaily[dayKey] = s;

      // -------- ticketsByType --------
      const tbt = cur.ticketsByType || {};
      const type = after.ticketName || after.ticketType || "General";
      const row = tbt[type] || { qty: 0, gmvNet: 0 };
      if (before && wasPaid) {
        row.qty -= asNumber(before.qty, 1);
        row.gmvNet -= netFromOrder(before);
      }
      if (isPaid) {
        row.qty += qty;
        row.gmvNet += net;
      }
      tbt[type] = row;

      // -------- buyers (ligero) --------
      const buyers = cur.buyers || { uniques: 0, repeaters: 0, map: {} as Record<string, any> };
      const buyerKey = after.buyerUid || after.email || after.payer || "anon";
      const prevCount = buyers.map?.[buyerKey]?.count || 0;
      const newCount = Math.max(0, prevCount + (isPaid ? 1 : 0));
      buyers.map = buyers.map || {};
      buyers.map[buyerKey] = {
        count: newCount,
        amount: (buyers.map[buyerKey]?.amount || 0) + (isPaid ? net : 0),
        email: after.email || null,
      };
      const values = Object.values(buyers.map) as any[];
      buyers.uniques = values.length;
      buyers.repeaters = values.filter((r) => r.count >= 2).length;
      buyers.top = values.sort((a, b) => b.amount - a.amount).slice(0, 20);

      // -------- topOrders (últimos N) --------
      const prevTop = (cur.topOrders || []) as any[];
      const co = after.commerceOrder || after.CommerceOrder || after.orderId || "";
      const paymentId = after.paymentId || after.PaymentID || after.flowOrder;
      const rowTop = { createdAt: createdAtMs, paymentId, orderId: co, status, net };
      const filtered = prevTop.filter((r) => r.orderId !== co);
      const limited = [rowTop, ...filtered]
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, 300);

      tx.set(
        ref,
        {
          summary: { gmvNet, paidCount, failedCount, pendingCount, tickets, aovNet, totalPayments },
          seriesDaily,
          ticketsByType: tbt,
          buyers,
          topOrders: limited,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          eventId,
          ...(clubId ? { clubId } : {}),
        },
        { merge: true }
      );
    });
  } catch (err) {
    logger.error("[onOrderWrite] transaction failed", { eventId, error: String(err) });
    return;
  }

  logger.info("[onOrderWrite] processed", {
    eventId,
    orderId: after.orderId || after.CommerceOrder,
  });
});
