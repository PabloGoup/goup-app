import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export { createCheckoutSession } from "./checkout";
export { stripeWebhook } from "./webhooks";

// (Aquí puedes exportar más funciones en el futuro)