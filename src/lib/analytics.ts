// src/lib/analytics.ts
import {
  Firestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
  import { db as firebaseDb } from "@/lib/firebase";
  
  // Tipos base (ajústalos si tus campos difieren)
  export type PaymentDoc = {
    PaymentID: string;
    FlowOrder?: number | null;
    CommerceOrder: string;     // = orderId
    Token?: string | null;
    Status: "paid" | "pending" | "failed" | "canceled" | "refunded";
    Currency: "CLP" | "USD";
    Amount: number;            // entero (ej: CLP)
    Media?: string | null;     // método
    Created_at: number;        // epoch ms
    Updated_at?: number | null;
    Flow_Transaction_id?: string | null;
    // Scope helpers opcionales
    EventId?: string | null;
    ClubId?: string | null;
    ProducerUid?: string | null;
  };
export async function fetchEventAnalytics(eventId: string) {
  const ref = doc(firebaseDb as Firestore, "analytics/events/data", eventId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as any) : null;
}
  export type OrderItemDoc = {
    orderId: string;
    status: "paid" | "pending" | "failed";
    price: number;    // unit
    qty: number;
    eventId?: string | null;
    ticketId?: string | null;
    ticketName?: string | null;
    currency?: "CLP" | "USD";
    paidAt?: number | null;
    createdAt?: number | null;
    producerUid?: string | null; // si lo guardas
    clubId?: string | null;      // si lo guardas
  };
  
  export type Range = { from: Date; to: Date };
  export const todayRange = (): Range => {
    const to = new Date(); to.setHours(23,59,59,999);
    const from = new Date(); from.setHours(0,0,0,0);
    return { from, to };
  };
  
  const toMs = (d: Date) => d.getTime();
  
  // Filtro de ámbito (reutilizable)
  type Scope = {
    producerUid?: string;   // dueño
    eventId?: string;
    clubId?: string;
  };
  
  // Construye predicates para post-filtrado (si aún no guardas scope en Payments)
  const matchScope = (s?: Scope) => (p: PaymentDoc | OrderItemDoc) => {
    if (!s) return true;
    if (s.eventId && "eventId" in p && p.eventId) return p.eventId === s.eventId;
    if (s.clubId && "clubId" in p && p.clubId) return (p as any).clubId === s.clubId;
    if (s.producerUid && "producerUid" in p && p.producerUid) return (p as any).producerUid === s.producerUid;
    // si no hay campos de scope en el doc, se permite; idealmente agrega estos campos en escritura
    return true;
  };
  
  // ======== Consultas ========
  
  // Pagos (colección plana nueva)
  export async function fetchPayments(range: Range, scope?: Scope): Promise<PaymentDoc[]> {
    const ref = collection(firebaseDb as Firestore, "Payments");
    const q = query(
      ref,
      where("Created_at", ">=", toMs(range.from)),
      where("Created_at", "<=", toMs(range.to)),
      orderBy("Created_at", "asc"),
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ PaymentID: d.id, ...(d.data() as any) })) as PaymentDoc[];
    return list.filter(matchScope(scope));
  }
  
  // Ítems de orden (tu modelo operativo de 1 doc por item)
  export async function fetchOrderItems(range: Range, scope?: Scope): Promise<OrderItemDoc[]> {
    const ref = collection(firebaseDb as Firestore, "finishedOrder");
    const q = query(
      ref,
      where("createdAt", ">=", toMs(range.from)),
      where("createdAt", "<=", toMs(range.to)),
      orderBy("createdAt", "asc"),
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ ...(d.data() as any) })) as OrderItemDoc[];
    return list.filter(i => i.status === "paid").filter(matchScope(scope));
  }
  
  // ======== Agregaciones en cliente ========
  
  export function summarize(payments: PaymentDoc[], items: OrderItemDoc[]) {
    const paid = payments.filter(p => p.Status === "paid");
    const failed = payments.filter(p => p.Status === "failed" || p.Status === "canceled");
    const refunded = payments.filter(p => p.Status === "refunded");
  
    const gmv = paid.reduce((a, p) => a + (p.Amount || 0), 0);
    const refunds = refunded.reduce((a, p) => a + (p.Amount || 0), 0);
    const tickets = items.reduce((a, it) => a + Math.max(0, it.qty || 0), 0);
    const successRate = payments.length ? (paid.length / payments.length) : 0;
    const aov = paid.length ? (gmv / paid.length) : 0;
  
    // Serie por día (ventas)
    const byDay = new Map<string, { date: string; gmv: number; tickets: number }>();
    items.forEach(it => {
      const t = new Date(it.paidAt || it.createdAt || 0);
      const key = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
      const prev = byDay.get(key) || { date: key, gmv: 0, tickets: 0 };
      const line = Math.round((it.price || 0) * (it.qty || 0));
      prev.gmv += line;
      prev.tickets += (it.qty || 0);
      byDay.set(key, prev);
    });
    const daily = Array.from(byDay.values()).sort((a,b) => a.date.localeCompare(b.date));
  
    // Tickets por tipo
    const byTicket = new Map<string, number>();
    items.forEach(it => {
      const name = it.ticketName || "Entrada";
      byTicket.set(name, (byTicket.get(name) || 0) + (it.qty || 0));
    });
    const ticketBar = Array.from(byTicket.entries()).map(([name, qty]) => ({ name, qty }))
      .sort((a,b) => b.qty - a.qty);
  
    // Top eventos por GMV
    const byEvent = new Map<string, { eventId: string, gmv: number, tickets: number }>();
    items.forEach(it => {
      const id = it.eventId || "(sin-id)";
      const prev = byEvent.get(id) || { eventId: id, gmv: 0, tickets: 0 };
      prev.gmv += Math.round((it.price || 0) * (it.qty || 0));
      prev.tickets += (it.qty || 0);
      byEvent.set(id, prev);
    });
    const topEvents = Array.from(byEvent.values()).sort((a,b)=> b.gmv - a.gmv).slice(0,10);
  
    return {
      gmv, refunds, tickets, successRate, aov,
      daily, ticketBar, topEvents,
      paidCount: paid.length, totalPayments: payments.length,
    };
  }
  
  export const fmtCLP = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);
  export const pct = (x: number) => `${(x*100).toFixed(1)}%`;