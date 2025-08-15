// functions/src/checkout.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";

const stripe = new Stripe(functions.config().stripe.secret, {
  apiVersion: "2024-06-20",
});

type CartItem = {
  ticketTypeId: string;
  qty: number;
};

type Payload = {
  eventId: string;
  items: CartItem[];
};

type Response = {
  id: string;
  url: string;
};

export const createCheckoutSession = functions.https.onCall(
  async (data: Payload, context): Promise<Response> => {
    const { eventId, items } = data ?? {};
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Login requerido");
    }
    if (!eventId || !Array.isArray(items) || items.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Payload inválido");
    }

    const db = admin.firestore();

    // Lee tipos de ticket del evento (para validar)
    const typesSnap = await db
      .collection("event")
      .doc(eventId)
      .collection("ticketTypes")
      .get();

    const types = new Map(
      typesSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as any) }])
    );

    let amount = 0;
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const it of items) {
      const tt = types.get(it.ticketTypeId);
      if (!tt || !tt.activo) {
        throw new functions.https.HttpsError("failed-precondition", "Ticket inválido");
      }
      if (it.qty < 1 || it.qty > 20) {
        throw new functions.https.HttpsError("failed-precondition", "Cantidad inválida");
      }
      if (tt.stockDisponible < it.qty) {
        throw new functions.https.HttpsError("failed-precondition", "Sin stock");
      }

      amount += Math.round(Number(tt.price) * it.qty);

      line_items.push({
        quantity: it.qty,
        price_data: {
          currency: "clp",
          product_data: {
            name: `${tt.name} — ${eventId}`,
          },
          unit_amount: Math.round(Number(tt.price)),
        },
      });
    }

    // Crea orden 'pending'
    const orderRef = db.collection("orders").doc();
    await orderRef.set({
      userId: uid,
      eventId,
      status: "pending",
      items: items.map((i) => ({
        ticketTypeId: i.ticketTypeId,
        qty: i.qty,
      })),
      amountSubtotal: amount,
      amountFees: 0,
      amountTotal: amount,
      currency: "CLP",
      stripePaymentIntentId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const successUrl = `${functions.config().public.url}/checkout/success?order=${orderRef.id}`;
    const cancelUrl = `${functions.config().public.url}/checkout/cancel?order=${orderRef.id}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      // Email del usuario (si lo tienes en el token)
      customer_email: context.auth?.token?.email as string | undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orderId: orderRef.id,
        eventId,
        userId: uid,
      },
    });

    await orderRef.update({
      stripePaymentIntentId: session.payment_intent ?? null,
    });

    return { id: session.id, url: session.url! };
  }
);