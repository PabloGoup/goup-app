// functions/src/webhooks.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";

const stripe = new Stripe(functions.config().stripe.secret, {
  apiVersion: "2024-06-20",
});

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) {
    res.status(400).send("Missing signature");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig as string,
      functions.config().stripe.webhook_secret
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  const db = admin.firestore();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (!orderId) {
      res.json({ received: true });
      return;
    }

    const orderRef = db.collection("orders").doc(orderId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return;

      const order = snap.data()!;
      if (order.status === "paid") return; // idempotente

      // Marca pagado
      tx.update(orderRef, {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Descuenta stock y emite tickets
      for (const it of order.items as Array<{ ticketTypeId: string; qty: number }>) {
        const typeRef = db
          .collection("event")
          .doc(order.eventId)
          .collection("ticketTypes")
          .doc(it.ticketTypeId);

        const typeSnap = await tx.get(typeRef);
        const type = typeSnap.data()!;
        const newStock = (type.stockDisponible || 0) - it.qty;
        if (newStock < 0) throw new Error("Stock negativo");
        tx.update(typeRef, { stockDisponible: newStock });

        // Crea N tickets (uno por cupo)
        for (let i = 0; i < it.qty; i++) {
          const tRef = db.collection("tickets").doc();
          tx.set(tRef, {
            orderId,
            eventId: order.eventId,
            ticketTypeId: it.ticketTypeId,
            userId: order.userId,
            qr: tRef.id, // puedes reemplazar por un UUID
            status: "valid",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });
  }

  res.json({ received: true });
});