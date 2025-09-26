// src/pages/analytics/AnalyticsDashboard.tsx
import React, { useEffect, useMemo, useState, useRef } from "react";
const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';
import { Link } from "react-router-dom";
import { fetchPayments, fetchOrderItems, fetchEventAnalytics, summarize, fmtCLP, pct, Range } from "@/lib/analytics";
import { Kpi } from "@/components/analytics/Kpi";
import { SalesLine } from "@/components/analytics/SalesLine";
import { Bars } from "@/components/analytics/Bars";
import { DataTable } from "@/components/analytics/DataTable";
import { useAuth } from "@/auth/AuthContext";
import { Firestore, collection, getDocs, query, where, doc, documentId } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";
import { groupBy } from "lodash";

const presets: { label: string; days: number }[] = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];

const CHART_CARD = "rounded-xl border border-white/10 bg-white/5 p-3 overflow-visible min-h-[18rem] md:min-h-[22rem]";
const TABLE_CARD = "rounded-xl border border-white/10 bg-white/5 p-2 overflow-x-auto";

type SheetRef = React.RefObject<HTMLDivElement>;

function rangeOf(days: number): Range {
  const to = new Date(); to.setHours(23,59,59,999);
  const from = new Date(to); from.setDate(to.getDate() - (days-1)); from.setHours(0,0,0,0);
  return { from, to };
}

// Tabs del hub
const TABS = [
  { key: "hoy", label: "Hoy" },
  { key: "ventas", label: "Ventas e ingresos" },
  { key: "clientes", label: "Clientes" },
  { key: "embudos", label: "Embudos" },
  { key: "notif", label: "Notificaciones" },
  { key: "operacion", label: "Operación" },
  { key: "fidel", label: "Fidelización" },
  { key: "calidad", label: "Calidad" },
] as const;

type EventOpt = { id: string; name: string; clubId?: string | null; clubName?: string | null; producerUid?: string | null };
type ClubOpt = { id: string; name: string };

type FunnelCounts = { views: number; carts: number; started: number; success: number };

function uniqBy<T, K extends keyof any>(arr: T[], key: (t: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const it of arr) {
    const k = key(it);
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out;
}

function applyLocalFilters(
  payments: any[],
  items: any[],
  scope: { eventId?: string; clubId?: string }
) {
  const { eventId, clubId } = scope;
  const fp = payments.filter((p) => {
    if (eventId && p.eventId !== eventId) return false;
    if (clubId && p.clubId !== clubId) return false;
    return true;
  });
  const fi = items.filter((it) => {
    if (eventId && it.eventId !== eventId) return false;
    if (clubId && it.clubId && it.clubId !== clubId) return false;
    return true;
  });
  return { payments: fp, items: fi };
}

function extractServiceFee(p: any, gross: number): number {
  // Busca en distintas rutas posibles
  const candidates = [
    p.serviceFee, p.fee, p.Fee, p.service_fee, p.cargoServicio,
    p.paymentData?.fee, p.webhook?.paymentData?.fee,
    p.Raw?.paymentData?.fee, p.raw?.paymentData?.fee
  ];
  // Normaliza (puede venir string "1618.00" o con símbolos)
  const toNum = (v: any): number | null => {
    if (v == null) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  for (const c of candidates) {
    const n = toNum(c);
    if (n != null) return Math.max(0, Math.round(n));
  }
  // Fallback: 12% del bruto si no viene fee explícito
  const fallback = Math.round((Number.isFinite(gross) ? gross : 0) * 0.12);
  return Math.max(0, fallback);
}

function extractNetAmount(p: any): number {
  // 1) Si vienen precio y cantidad desde la orden, esa es la base neta
  const toNum = (v: any): number | null => {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const price = toNum(p.price);
  const qty = toNum(p.qty);
  if (price != null && qty != null) {
    return Math.max(0, Math.round(price * qty));
  }

  // 2) Si viene un total neto de la orden, úsalo
  const orderAmount = toNum(p.orderAmount) ?? toNum(p.orderTotalNet) ?? toNum(p.totalNet);
  if (orderAmount != null) {
    return Math.max(0, Math.round(orderAmount));
  }

  // 3) Derivar desde el pago bruto. En Payments el `Amount` suele incluir
  //    el cargo por servicio del 12% (de GoUp). Para mostrar el total neto
  //    que corresponde al dueño del evento, retiramos ese 12% del bruto.
  const gross =
    toNum(p.amount) ??
    toNum(p.Amount) ??
    toNum(p.webhook?.paymentData?.amount) ??
    toNum(p.paymentData?.amount) ??
    null;

  if (gross != null) {
    // Recupera la base sin cargo por servicio (12%).
    const net = Math.round(gross / 1.12);
    return Math.max(0, net);
  }

  return 0;
}

/** Adapta el documento agregado analytics/events/data/{eventId} a la forma esperada por los gráficos/KPIs */
function adaptAggFromDoc(doc: any) {
  const sum = doc?.summary || {};
  const series = doc?.seriesDaily || {};
  const tbt = doc?.ticketsByType || {};
  const daily = Object.entries(series)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]: any) => ({
      date: String(day),
      gmv: Math.round(v?.gmvNet || 0),
      tickets: Number(v?.tickets || 0),
    }));
  const ticketBar = Object.entries(tbt).map(([name, row]: any) => ({
    name: String(name),
    qty: Number(row?.qty || 0),
    gmv: Math.round(row?.gmvNet || 0),
  }));
  const topEvents = [{ eventId: doc?.eventId || "evento", gmv: Math.round(sum?.gmvNet || 0) }];
  const paid = Number(sum?.paidCount || 0);
  const failed = Number(sum?.failedCount || 0);
  const pending = Number(sum?.pendingCount || 0);
  const total = paid + failed + pending || 1;
  return {
    gmv: Math.round(sum?.gmvNet || 0),
    tickets: Number(sum?.tickets || 0),
    aov: Number(sum?.aovNet || 0),
    refunds: 0,
    successRate: paid / total,
    totalPayments: total,
    paidCount: paid,
    daily,
    ticketBar,
    topEvents,
  };
}

/** Agrupa pagos por comprador para stats de Clientes */
function buildBuyerStats(payments: any[]) {
  type Row = { buyerKey: string; buyerName?: string | null; email?: string | null; count: number; amount: number; lastAt?: number };
  const map = new Map<string, Row>();
  for (const p of payments) {
    const buyerKey = p.buyerUid || p.email || p.payer || "anon";
    const row = map.get(buyerKey) || { buyerKey, buyerName: p.buyerName || null, email: p.email || p.payer || null, count: 0, amount: 0, lastAt: 0 };
    row.count += 1;
    const amt = typeof p.amount === "number" ? p.amount : (typeof p.Amount === "number" ? p.Amount : 0);
    row.amount += amt;
    const ts = typeof p.Created_at === "number" ? p.Created_at : (p.Created_at ? Date.parse(p.Created_at) : 0);
    row.lastAt = Math.max(row.lastAt || 0, ts || 0);
    map.set(buyerKey, row);
  }
  const rows = Array.from(map.values());
  const uniques = rows.length;
  const repeaters = rows.filter(r => r.count >= 2).length;
  const top = rows.sort((a,b) => b.amount - a.amount).slice(0, 20);
  return { uniques, repeaters, rows, top };
}

/** Pequeño embudo a partir de pagos (sin vistas/carro reales). Si hay modo demo, se enriquecen pasos previos. */
function buildFunnel(payments: any[], demo: boolean) {
  const paid = payments.filter(p => (p.Status || p.status) === "paid").length;
  const failed = payments.filter(p => (p.Status || p.status) === "failed").length;
  let payStarted = paid + failed;
  let cart = Math.round(payStarted * 1.25);
  let views = Math.round(cart * 2.0);
  if (demo) {
    // en demo, hacemos los pasos más "completos"
    cart = Math.max(cart, payStarted + Math.round(payStarted * 0.3));
    views = Math.max(views, cart + Math.round(cart * 0.8));
  }
  const conv = views ? (paid / views) : 0;
  return { views, cart, payStarted, paid, failed, conv };
}

/** Notificaciones (placeholder): en modo demo genera métricas */
function buildNotif(demo: boolean) {
  if (!demo) return { sent: 0, opened: 0, clicked: 0, purchases: 0, openRate: "0%", ctr: "0%", cvr: "0%" };
  const sent = 1200, opened = 360, clicked = 140, purchases = 35;
  const pct = (n: number, d: number) => d ? ((n/d)*100).toFixed(1) + "%" : "0%";
  return { sent, opened, clicked, purchases, openRate: pct(opened, sent), ctr: pct(clicked, opened), cvr: pct(purchases, clicked) };
}

/** Operación del evento (día D): estimaciones simples desde pagos/items */
function buildOpsToday(payments: any[], items: any[]) {
  const today = new Date(); today.setHours(0,0,0,0);
  const isToday = (ts: any) => {
    const d = typeof ts === "number" ? new Date(ts) : (ts ? new Date(ts) : null);
    if (!d) return false;
    const t0 = new Date(today);
    const t1 = new Date(today); t1.setDate(t1.getDate()+1);
    return d >= t0 && d < t1;
  };
  const paidToday = payments.filter(p => (p.Status || p.status) === "paid" && isToday(p.Created_at));
  const ticketsToday = paidToday.length; // 1 pago ~ 1 línea base
  const checkins = 0; // requiere colección de scans; placeholder
  return { ticketsToday, checkins, ratio: ticketsToday ? (checkins / ticketsToday) : 0 };
}

/** Fidelización básica: repetición por ventanas */
function buildLoyalty(buyers: ReturnType<typeof buildBuyerStats>) {
  const rows = buyers.rows;
  const multi = rows.filter(r => r.count >= 2).length;
  const share = rows.length ? multi / rows.length : 0;
  const top = rows.sort((a,b) => b.count - a.count).slice(0, 10);
  return { repeaters: multi, share, top };
}

/** Calidad: placeholder de NPS/resenas */
function buildQuality(demo: boolean) {
  if (!demo) return { nps: null as null | number, responses: 0 };
  return { nps: 58, responses: 42 };
}

// ====== Demografía de compradores (edad y sexo) ======
type AgeBuckets = { '<18': number; '18-24': number; '25-34': number; '35-44': number; '45-54': number; '55+': number };
type GenderCounts = { F: number; M: number; O: number }; // O = Otro/Prefiero no decir

function emptyAgeBuckets(): AgeBuckets {
  return { '<18': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
}
function emptyGenderCounts(): GenderCounts {
  return { F: 0, M: 0, O: 0 };
}
function safeDate(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  // Firestore Timestamp
  if (typeof input === 'object' && input?.seconds) {
    try { return new Date(input.seconds * 1000); } catch { return null; }
  }
  // millis
  if (typeof input === 'number') {
    try { return new Date(input); } catch { return null; }
  }
  // ISO/string
  const t = Date.parse(String(input));
  return Number.isFinite(t) ? new Date(t) : null;
}
function calcAge(dob: any): number | null {
  const d = safeDate(dob);
  if (!d) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}
function ageToBucket(age: number): keyof AgeBuckets {
  if (age < 18) return '<18';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  return '55+';
}
function normGender(v: any): keyof GenderCounts {
  const s = String(v || '').toLowerCase().trim();
  if (['f','female','femenino','mujer'].includes(s)) return 'F';
  if (['m','male','masculino','hombre'].includes(s)) return 'M';
  return 'O';
}
async function fetchBuyerDemographics(buyerUids: string[]): Promise<{ ages: AgeBuckets; genders: GenderCounts }> {
  const ages = emptyAgeBuckets();
  const genders = emptyGenderCounts();
  if (!buyerUids.length) return { ages, genders };
  // Firestore 'in' acepta máx 10 ids => chunk
  const chunks: string[][] = [];
  for (let i = 0; i < buyerUids.length; i += 10) chunks.push(buyerUids.slice(i, i + 10));
  for (const c of chunks) {
    try {
      const base = collection(firebaseDb as Firestore, 'users');
      const q = query(base, where(documentId(), 'in', c));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const u: any = d.data() || {};
        // birthdate variantes
        const dob = u.birthdate ?? u.birthday ?? u.fechaNacimiento ?? u.nacimiento ?? u.dob;
        const age = calcAge(dob);
        if (age != null) {
          const b = ageToBucket(age);
          ages[b] += 1;
        }
        // gender variantes
        const g = u.gender ?? u.genero ?? u.sexo ?? u.sex;
        const key = normGender(g);
        genders[key] += 1;
      });
    } catch (e) {
      if (DEBUG) console.warn('[demo] fetchBuyerDemographics chunk failed', e);
    }
  }
  return { ages, genders };
}

// Datos ficticios para pruebas rápidas (no persiste nada)
function makeFakeData(range: Range, opts: { eventId?: string; clubId?: string }) {
  const days: Date[] = [];
  const cur = new Date(range.from);
  while (cur <= range.to) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  const payments = days.flatMap((d, i) => {
    const base = 5 + (i % 7); // ondulación semanal
    return Array.from({ length: base }, (_, j) => ({
      Created_at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10 + j).toISOString(),
      PaymentID: `FAKE-${i}-${j}`,
      CommerceOrder: `ORD-${i}-${j}`,
      Status: j % 5 === 0 ? "failed" : "paid",
      Amount: j % 5 === 0 ? 0 : 10000 + (j * 2500),
      eventId: opts.eventId || `evt-${(i%3)+1}`,
      clubId: opts.clubId || `club-${(i%2)+1}`,
      ticketType: j % 4 === 0 ? "VIP" : "General",
    }));
  });
  const items = payments
    .filter(p => p.Status === "paid")
    .map(p => ({
      eventId: p.eventId,
      ticketType: p.ticketType,
      qty: 1,
      price: p.Amount,
    }));
  return { payments, items };
}

// Helpers para métricas reales del embudo
function dateKeysForRange(range: Range): string[] {
  let fromD = new Date(range.from); fromD.setHours(0, 0, 0, 0);
  let toD = new Date(range.to); toD.setHours(0, 0, 0, 0);
  if (fromD > toD) fromD = new Date(toD);
  const out: string[] = [];
  const d = new Date(fromD);
  while (d <= toD) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${y}${m}${dd}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function clampRange(r: Range, opts: { allowFuture?: boolean } = {}): Range {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const fromFixed = from > to ? new Date(to) : from;
  fromFixed.setHours(0,0,0,0); to.setHours(23,59,59,999);
  return { from: fromFixed, to };
}

async function fetchFunnelCounts(range: Range, opts: { eventIds?: string[] } = {}): Promise<FunnelCounts> {
  const { eventIds } = opts;
  const keys = dateKeysForRange(range);
  if (DEBUG) console.debug('[funnel:read] dateKeys', keys);
  let views = 0, carts = 0, started = 0, success = 0;
  for (const k of keys) {
    try {
      const sub = collection(firebaseDb as Firestore, "metrics_funnel", k, "events");
      const snap = await getDocs(sub);
      if (DEBUG) {
        console.debug(`[funnel:read] day ${k} → docs:`, snap.size);
        const ids: string[] = [];
        snap.forEach((d) => ids.push(d.id));
        console.debug(`[funnel:read] day ${k} ids:`, ids);
      }
      snap.forEach((d) => {
        const data: any = d.data() || {};
        const evId = String(data.eventId || d.id);
        if (eventIds && eventIds.length && !eventIds.includes(evId)) return;
        views += Number(data.views || 0);
        carts += Number(data.carts || 0);
        started += Number(data.started || 0);
        success += Number(data.success || 0);
      });
    } catch (err) {
      if (DEBUG) console.error('[funnel:read] error for day', k, err);
      // continuar en caso de error de un día
    }
  }
  if (DEBUG) console.debug('[funnel:read] totals', { views, carts, started, success });
  return { views, carts, started, success };
}

// === Demografía desde metrics_funnel ===

// Convierte distintos formatos posibles del doc a nuestros buckets
function accumulateDemographics(dst: { ages: AgeBuckets; genders: GenderCounts }, data: any) {
  const { ages, genders } = dst;
  const N = (v: any) => Number(v || 0);

  // 1) Campos planos esperados
  genders.F += N(data.gender_F);
  genders.M += N(data.gender_M);
  genders.O += N(data.gender_O);
  ages['<18']   += N(data.age_lt18);
  ages['18-24'] += N(data.age_18_24);
  ages['25-34'] += N(data.age_25_34);
  ages['35-44'] += N(data.age_35_44);
  ages['45-54'] += N(data.age_45_54);
  ages['55+']   += N(data.age_55p);

  // 2) Variantes comunes (lowercase / sin underscore / objetos anidados)
  // Genero variantes
  genders.F += N(data.gender_f) + N(data.female) + N(data.genero_F) + (data.genders?.F || 0) + (data.genders?.female || 0);
  genders.M += N(data.gender_m) + N(data.male) + N(data.genero_M) + (data.genders?.M || 0) + (data.genders?.male || 0);
  genders.O += N(data.gender_o) + N(data.other) + N(data.genero_O) + (data.genders?.O || 0) + (data.genders?.other || 0);

  // Edades variantes
  ages['<18']   += N(data.age_lt_18) + (data.ages?.lt18 || 0) + (data.ages?.['<18'] || 0);
  ages['18-24'] += N(data.age_18_24) + N(data.age_18_24) + (data.ages?.['18-24'] || 0) + (data.ages?.age_18_24 || 0);
  ages['25-34'] += N(data.age_25_34) + N(data.age_25_34) + (data.ages?.['25-34'] || 0) + (data.ages?.age_25_34 || 0);
  ages['35-44'] += N(data.age_35_44) + N(data.age_35_44) + (data.ages?.['35-44'] || 0) + (data.ages?.age_35_44 || 0);
  ages['45-54'] += N(data.age_45_54) + N(data.age_45_54) + (data.ages?.['45-54'] || 0) + (data.ages?.age_45_54 || 0);
  ages['55+']   += N(data.age_55p) + N(data.age_55_plus) + (data.ages?.['55+'] || 0) + (data.ages?.age_55p || 0);
}

type FunnelDemographics = { ages: AgeBuckets; genders: GenderCounts };
async function fetchFunnelDemographics(range: Range, opts: { eventIds?: string[] } = {}): Promise<FunnelDemographics> {
  const { eventIds } = opts;
  const keys = dateKeysForRange(range);
  const ages = emptyAgeBuckets();
  const genders = emptyGenderCounts();
  for (const k of keys) {
    try {
      const sub = collection(firebaseDb as Firestore, "metrics_funnel", k, "events");
      // Log filter info at the start of the try block
      if (DEBUG) console.debug(`[funnel:demo] reading events for ${k} with filter`, eventIds);
      const snap = await getDocs(sub);
      if (DEBUG) {
        console.debug(`[funnel:demo] day ${k} → docs:`, snap.size);
      }
      snap.forEach((d) => {
        const data: any = d.data() || {};
        // Insert conditional console.debug for demography values
        if (DEBUG) {
          const probe = {
            id: d.id,
            evId: String(data.eventId || d.id),
            gender_F: data.gender_F, gender_M: data.gender_M, gender_O: data.gender_O,
            age_lt18: data.age_lt18, age_18_24: data.age_18_24, age_25_34: data.age_25_34,
          };
          console.debug('[funnel:demo] doc', probe);
        }
        const evId = String(data.eventId || d.id);
        if (eventIds && eventIds.length && !eventIds.includes(evId)) return;
        accumulateDemographics({ ages, genders }, data);
      });
      // Además, intenta sumar la colección "global" (si existe) para no perder datos agregados por día
      try {
        const subGlobal = collection(firebaseDb as Firestore, "metrics_funnel", k, "global");
        const snapG = await getDocs(subGlobal);
        if (DEBUG) console.debug(`[funnel:demo] day ${k} (global) → docs:`, snapG.size);
        snapG.forEach((d) => {
          const data: any = d.data() || {};
          accumulateDemographics({ ages, genders }, data);
        });
      } catch (e) {
        if (DEBUG) console.debug(`[funnel:demo] day ${k} (global) sin docs`);
      }
    } catch (err) {
      if (DEBUG) console.error('[funnel:demo] error for day', k, err);
    }
  }
  if (DEBUG) console.debug('[funnel:demo] totals', { ages, genders });
  return { ages, genders };
}

// === Demografía directa desde flowCarts (compras pagadas) ===
async function fetchCartDemographics(range: Range, opts: { eventIds?: string[] } = {}): Promise<FunnelDemographics> {
  const ages = emptyAgeBuckets();
  const genders = emptyGenderCounts();
  const { eventIds } = opts;

  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const base = collection(firebaseDb as Firestore, 'flowCarts');

  const take = (a: any) => {
    if (!a) return;
    // Si se entregó lista de eventos a filtrar, omite compras que no los contengan
    if (eventIds && eventIds.length) {
      const items = Array.isArray(a.items) ? a.items : [];
      const hit = items.some((it: any) => eventIds.includes(String(it?.eventId || it?.event?.id || '')));
      if (!hit) return;
    }
    const g = normGender(a.sexo);
    genders[g] += 1;
    let ageVal: number | null = null;
    if (typeof a.edad === 'number') ageVal = a.edad;
    if (ageVal == null && a.fecha_nacimiento) ageVal = calcAge(a.fecha_nacimiento);
    if (ageVal != null) ages[ageToBucket(ageVal)] += 1;
  };

  // Intento 1: status + rango por paidAt (ms)
  let docs: any[] = [];
  try {
    const q = query(
      base,
      where('status', '==', 'paid'),
      where('paidAt', '>=', fromMs),
      where('paidAt', '<=', toMs),
    );
    const snap = await getDocs(q);
    docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    // Fallback: solo status, filtrando fechas en cliente
    try {
      const q2 = query(base, where('status', '==', 'paid'));
      const snap2 = await getDocs(q2);
      docs = snap2.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (e2) {
      const snap3 = await getDocs(base);
      docs = snap3.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    }
  }

  for (const c of docs) {
    const paidAtMs = typeof c.paidAt === 'number' ? c.paidAt : (c.paidAt?.seconds ? c.paidAt.seconds * 1000 : null);
    if (paidAtMs != null && (paidAtMs < fromMs || paidAtMs > toMs)) continue;

    // 1) Comprador (cliente 1): `demographics.buyer` si existe
    const buyer = c?.demographics?.buyer;
    if (buyer) take(buyer);

    // 2) Clientes adicionales: `demographics.attendees` o `attendeesRaw`
    const att = Array.isArray(c?.demographics?.attendees) ? c.demographics.attendees : [];
    if (att.length) {
      att.forEach(take);
    } else if (Array.isArray(c?.attendeesRaw)) {
      c.attendeesRaw.forEach(take);
    }
  }

  return { ages, genders };
}

// === Demografía directa desde tickets (evita depender de metrics_funnel) ===
async function fetchTicketDemographics(range: Range, opts: { eventIds?: string[] } = {}): Promise<FunnelDemographics> {
  const ages = emptyAgeBuckets();
  const genders = emptyGenderCounts();
  const { eventIds } = opts;

  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const base = collection(firebaseDb as Firestore, 'tickets');

  // Intento 1: filtrar en servidor por status y rango de fecha (paidAt en ms). Si falla por índices, caemos a lecturas mínimas y filtrado local.
  let docs: any[] = [];
  try {
    const q = query(
      base,
      where('status', '==', 'paid'),
      where('paidAt', '>=', fromMs),
      where('paidAt', '<=', toMs),
    );
    const snap = await getDocs(q);
    docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    // Fallback 1: solo status
    try {
      const q2 = query(base, where('status', '==', 'paid'));
      const snap2 = await getDocs(q2);
      docs = snap2.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (e2) {
      // Fallback 2: sin filtros (último recurso en proyectos sin índices)
      const snap3 = await getDocs(base);
      docs = snap3.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    }
  }

  for (const t of docs) {
    // Filtro por fecha (client-side si hizo falta)
    const paidAtMs = typeof t.paidAt === 'number' ? t.paidAt : (t.paidAt?.seconds ? (t.paidAt.seconds * 1000) : null);
    if (paidAtMs != null && (paidAtMs < fromMs || paidAtMs > toMs)) continue;

    // Filtro por evento si corresponde
    const evId = String(t.eventId || t.event?.id || '');
    if (eventIds && eventIds.length && !eventIds.includes(evId)) continue;

    // Extraer demografía del bloque attendee que el webhook escribió
    const a = t.attendee || {};
    const gk = normGender(a.sexo);
    genders[gk] += 1;

    let ageVal: number | null = null;
    if (typeof a.edad === 'number') ageVal = a.edad;
    if (ageVal == null && a.fecha_nacimiento) ageVal = calcAge(a.fecha_nacimiento);
    if (ageVal != null) {
      const bucket = ageToBucket(ageVal);
      ages[bucket] += 1;
    }
  }

  return { ages, genders };
}

export default function AnalyticsDashboard() {
  const { user, dbUser } = useAuth();

  // Admin puede ver todo; el resto solo sus eventos (createdBy === uid)
  const isAdmin = useMemo(() => {
    const r = dbUser?.rol;
    const rx = dbUser?.rol_extra;
    return r === "admin" || rx === "admin";
  }, [dbUser?.rol, dbUser?.rol_extra]);

  // scope básico: si no eres admin, filtramos por creador
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["key"]>("hoy");
  const [range, setRange] = useState<Range>(() => rangeOf(30));
  const [loading, setLoading] = useState(false);

  const [payments, setPayments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  // Doc agregado de analytics/events/data/{eventId}
  const [eventAggDoc, setEventAggDoc] = useState<any | null>(null);
  const [funnelCounts, setFunnelCounts] = useState<FunnelCounts>({ views: 0, carts: 0, started: 0, success: 0 });
  const [funnelLoading, setFunnelLoading] = useState(false);

  const paymentsNet = useMemo(
    () => payments.map(p => {
      const net = extractNetAmount(p);
      return { ...p, __netAmount: net, amount: net };
    }),
    [payments]
  );

  const [clubId, setClubId] = useState<string>("");
  const [eventId, setEventId] = useState<string>("");
  const [clubOpts, setClubOpts] = useState<ClubOpt[]>([]);
  const [eventOpts, setEventOpts] = useState<EventOpt[]>([]);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  // Tabla: ordenamiento
  const [sortKey, setSortKey] = useState<"Fecha" | "ID de pago" | "ID de orden" | "Estado" | "Monto neto">("Fecha");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  // Paginación local de la tabla de tickets
  const [visibleRows, setVisibleRows] = useState(10);
  // Mostrar solo pagos exitosos en la tabla (por defecto)
  const [onlyPaidRows, setOnlyPaidRows] = useState(true);
  // Reinicia el conteo visible cuando cambian los datos o el orden
  useEffect(() => { setVisibleRows(10); }, [payments, sortKey, sortDir, clubId, eventId, range.from, range.to]);
  // close sheet on outside tap
  useEffect(() => {
    if (!showFilters) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (sheetRef.current && !sheetRef.current.contains(t)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [showFilters]);

  // Cargar opciones de eventos (y derivar clubes) según alcance del usuario
  useEffect(() => {
    let alive = true;

    async function readColl(collName: string, constraints: any[] = []) {
      try {
        const base = collection(firebaseDb as Firestore, collName);
        const q = constraints.length ? query(base, ...constraints) : query(base);
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, data: d.data() as any }));
      } catch (_) {
        return [] as { id: string; data: any }[]; // fallback silencioso
      }
    }

    (async () => {
      try {
        const uid = user?.uid || "__none__";

        // 1) Trae eventos desde `events` y `evento` (compatibilidad)
        let rows: { id: string; data: any }[] = [];

        if (isAdmin) {
          const [a, b] = await Promise.all([
            readColl("events"),
            readColl("evento"),
          ]);
          rows = [...a, ...b];
        } else {
          // No admin: permitir ambos campos de autoría: producerUid o createdBy
          const [eByProducer_events, eByCreator_events, eByProducer_evento, eByCreator_evento] = await Promise.all([
            readColl("events", [where("producerUid", "==", uid)]),
            readColl("events", [where("createdBy", "==", uid)]),
            readColl("evento", [where("producerUid", "==", uid)]),
            readColl("evento", [where("createdBy", "==", uid)]),
          ]);
          rows = [
            ...eByProducer_events,
            ...eByCreator_events,
            ...eByProducer_evento,
            ...eByCreator_evento,
          ];
        }

        if (!alive) return;

        // 2) Normaliza a EventOpt y quita duplicados por id
        const evs: EventOpt[] = uniqBy(
          rows.map(({ id, data }) => ({
            id,
            name: data?.nombre || data?.name || data?.title || "(Evento)",
            clubId: data?.clubId ?? data?.club?.id ?? null,
            clubName: data?.clubName ?? data?.club?.nombre ?? null,
            producerUid: data?.producerUid ?? data?.createdBy ?? null,
          })),
          (e) => e.id
        );

        setEventOpts(evs.sort((a, b) => a.name.localeCompare(b.name)));

        const clubs = uniqBy(
          evs.filter((e) => e.clubId && e.clubName) as Required<Pick<EventOpt, "clubId" | "clubName">>[],
          (e) => String(e.clubId)
        ).map((e) => ({ id: String(e.clubId), name: String(e.clubName) }));

        setClubOpts(clubs.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (_) {
        // sin crash
      }
    })();

    return () => { alive = false; };
  }, [isAdmin, user?.uid]);

  const scope = useMemo(() => {
    const base: Record<string, any> = isAdmin ? {} : { producerUid: user?.uid || undefined };
    if (clubId) base.clubId = clubId;
    if (eventId) base.eventId = eventId;
    return base;
  }, [isAdmin, user?.uid, clubId, eventId]);

  // Cargar embudo real desde metrics_funnel/{date}/events/{eventId}
  useEffect(() => {
    let alive = true;
    (async () => {
      if (demoLoaded) { setFunnelCounts({ views: 0, carts: 0, started: 0, success: 0 }); return; }
      setFunnelLoading(true);
      try {
        // Determinar eventIds que aplican según filtros
        let filterEventIds: string[] | undefined;
        if (eventId) {
          filterEventIds = [eventId];
        } else if (clubId) {
          const ids = eventOpts.filter(e => e.clubId === clubId).map(e => e.id);
          filterEventIds = ids.length ? ids : undefined;
        } else {
          filterEventIds = undefined; // todos
        }
        if (DEBUG) console.debug('[funnel:read] filterEventIds', filterEventIds);
        const counts = await fetchFunnelCounts(range, { eventIds: filterEventIds });
        if (!alive) return;
        setFunnelCounts(counts);
      } finally {
        if (alive) setFunnelLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(range), clubId, eventId, demoLoaded, eventOpts.length]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      // Si está activado el modo demo, generamos datos ficticios y evitamos ir a Firestore
      if (demoLoaded) {
        const fake = makeFakeData(range, { eventId, clubId });
        if (!alive) return;
        const filtered = applyLocalFilters(fake.payments as any[], fake.items as any[], { eventId, clubId });
        setPayments(filtered.payments);
        setItems(filtered.items);
        setLoading(false);
        return;
      }
      try {
        const [p, it] = await Promise.all([
          fetchPayments(range, scope),
          fetchOrderItems(range, scope),
        ]);
        if (!alive) return;
        const filtered = applyLocalFilters(p, it, { eventId, clubId });
        setPayments(filtered.payments);
        setItems(filtered.items);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(range), JSON.stringify(scope), demoLoaded]);

  // Si hay eventId y no estamos en demo, intenta leer el agregado del evento
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!eventId || demoLoaded) { setEventAggDoc(null); return; }
      try {
        const d = await fetchEventAnalytics(eventId);
        if (!alive) return;
        setEventAggDoc(d);
      } catch {
        if (alive) setEventAggDoc(null);
      }
    })();
    return () => { alive = false; };
  }, [eventId, demoLoaded]);

  const agg = useMemo(() => {
    if (eventAggDoc) return adaptAggFromDoc(eventAggDoc);
    return summarize(paymentsNet, items);
  }, [eventAggDoc, paymentsNet, items]);

  // Derivados para nuevas pestañas
  const buyers = useMemo(() => buildBuyerStats(payments.filter(p => (p.Status || p.status) === "paid")), [payments]);
  const funnel = useMemo(() => {
    if (!demoLoaded) {
      const f = funnelCounts;
      const conv = f.views ? (f.success / f.views) : 0;
      return { views: f.views, cart: f.carts, payStarted: f.started, paid: f.success, failed: Math.max(0, f.started - f.success), conv };
    }
    return buildFunnel(payments, true);
  }, [demoLoaded, funnelCounts, payments]);
  const notif = useMemo(() => buildNotif(demoLoaded), [demoLoaded]);
  const ops = useMemo(() => buildOpsToday(payments, items), [payments, items]);
  const loyalty = useMemo(() => buildLoyalty(buyers), [buyers]);
  const quality = useMemo(() => buildQuality(demoLoaded), [demoLoaded]);

  // Demografía compradores (pagos exitosos)
  const [ageBuckets, setAgeBuckets] = useState<AgeBuckets>(emptyAgeBuckets());
  const [genderCounts, setGenderCounts] = useState<GenderCounts>(emptyGenderCounts());

  // Recalcular demografía ... (prioriza flowCarts, luego tickets, luego metrics_funnel)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (demoLoaded) { setAgeBuckets(emptyAgeBuckets()); setGenderCounts(emptyGenderCounts()); return; }
      // 1) Determinar eventIds aplicables según filtros
      let filterEventIds: string[] | undefined;
      if (eventId) {
        filterEventIds = [eventId];
      } else if (clubId) {
        const ids = eventOpts.filter(e => e.clubId === clubId).map(e => e.id);
        filterEventIds = ids.length ? ids : undefined;
      } else {
        filterEventIds = undefined; // todos
      }

      // 2) Primero intenta directo desde flowCarts (compras pagadas)
      if (DEBUG) console.debug('[demographics:carts] trying direct-from-flowCarts with filter', filterEventIds);
      const fromCarts = await fetchCartDemographics(range, { eventIds: filterEventIds });
      const sumAC = Object.values(fromCarts.ages).reduce((a,b)=>a+b,0);
      const sumGC = Object.values(fromCarts.genders).reduce((a,b)=>a+b,0);
      if ((sumAC + sumGC) > 0) {
        if (!alive) return;
        setAgeBuckets(fromCarts.ages);
        setGenderCounts(fromCarts.genders);
        return;
      }

      // 3) Segundo intento: tickets emitidos
      if (DEBUG) console.debug('[demographics:tickets] fallback to tickets');
      const fromTickets = await fetchTicketDemographics(range, { eventIds: filterEventIds });
      const sumAT = Object.values(fromTickets.ages).reduce((a,b)=>a+b,0);
      const sumGT = Object.values(fromTickets.genders).reduce((a,b)=>a+b,0);
      if ((sumAT + sumGT) > 0) {
        if (!alive) return;
        setAgeBuckets(fromTickets.ages);
        setGenderCounts(fromTickets.genders);
        return;
      }

      // 4) Último recurso: metrics_funnel
      if (DEBUG) console.debug('[demographics:funnel] fallback to metrics_funnel');
      const first = await fetchFunnelDemographics(range, { eventIds: filterEventIds });
      const sumA = Object.values(first.ages).reduce((a,b)=>a+b,0);
      const sumG = Object.values(first.genders).reduce((a,b)=>a+b,0);
      if ((sumA + sumG) === 0 && filterEventIds && filterEventIds.length) {
        if (DEBUG) console.debug('[demographics:funnel] empty with filter, retrying without filter');
        const second = await fetchFunnelDemographics(range, { eventIds: undefined });
        if (!alive) return;
        setAgeBuckets(second.ages);
        setGenderCounts(second.genders);
      } else {
        if (!alive) return;
        setAgeBuckets(first.ages);
        setGenderCounts(first.genders);
      }
    })();
    return () => { alive = false; };
  }, [demoLoaded, JSON.stringify(range), clubId, eventId, eventOpts.length]);

return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Header + filtros */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-extrabold tracking-tight">Administra tu cuenta</h1>
          <p className="text-xs md:text-sm text-white/60 truncate">
            {isAdmin ? "Viendo todos los eventos (Admin)" : "Viendo solo tus eventos creados"}
          </p>
        </div>

        {/* Desktop toolbar */}
        <div className="hidden md:flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              className="px-3 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
              onClick={() => setRange(clampRange(rangeOf(p.days)))}
            >
              {p.label}
            </button>
          ))}
          {/* Filtros por club / evento */}
          <select
            className="bg-white/5 goup-select border border-white/10 rounded px1 text-sm max-w-[240px] py-1 text-sm cursor-pointer"
            value={clubId}
            onChange={(e) => { setClubId(e.target.value); setEventId(""); }}
          >
            <option value="">Todos los clubes</option>
            {clubOpts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="bg-white/5 goup-select border border-white/10 rounded px-2 py-1 text-sm max-w-[240px] cursor-pointer"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            <option value="">Todos los eventos</option>
            {eventOpts.filter((ev) => !clubId || ev.clubId === clubId).map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="px-2 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-xs"
            onClick={() => { setClubId(""); setEventId(""); }}
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            className={`px-2 py-1 rounded border text-xs ${demoLoaded ? "border-[#cbb3ff] bg-[#FE8B02]/20" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
            onClick={() => setDemoLoaded((d) => !d)}
            title="Alterna datos ficticios locales para pruebas"
          >
            {demoLoaded ? "Modo demo: ON" : "Modo demo: OFF"}
          </button>
          {/* Rango custom simple */}
          <input
            type="date"
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
            value={new Date(range.from).toISOString().slice(0, 10)}
            onChange={(e) => setRange((r) => clampRange({ ...r, from: new Date(e.target.value + "T00:00:00") }))}
          />
          <input
            type="date"
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
            value={new Date(range.to).toISOString().slice(0, 10)}
            onChange={(e) => setRange((r) => clampRange({ ...r, to: new Date(e.target.value + "T23:59:59") }))}
          />
        </div>

        {/* Mobile: one button opens bottom sheet */}
        <div className="md:hidden">
          <button
            className="px-3 py-2 rounded-md border border-white/10 bg-white/5 text-sm"
            onClick={() => setShowFilters(true)}
            aria-haspopup="dialog"
            aria-expanded={showFilters}
          >
            Filtros
          </button>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      {showFilters && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" />
          <div ref={sheetRef} className="absolute inset-x-0 bottom-0 bg-neutral-900 rounded-t-2xl border-t border-white/10 p-4 space-y-3 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Filtros</h2>
              <button className="px-2 py-1 text-sm rounded bg-white/10" onClick={() => setShowFilters(false)}>Cerrar</button>
            </div>
            <div className="flex gap-2">
              {presets.map((p) => (
                <button key={p.label} className="flex-1 px-2 py-2 rounded-md border border-white/10 bg-white/5" onClick={() => { setRange(rangeOf(p.days)); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <label className="block text-xs text-white/60">Club</label>
            <select
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-2 text-sm"
              value={clubId}
              onChange={(e) => { setClubId(e.target.value); setEventId(""); }}
            >
              <option value="">Todos los clubes</option>
              {clubOpts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="block text-xs text-white/60">Evento</label>
            <select
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-2 text-sm"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">Todos los eventos</option>
              {eventOpts.filter((ev) => !clubId || ev.clubId === clubId).map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button type="button" className="flex-1 px-3 py-2 rounded border border-white/10 bg-white/5" onClick={() => { setClubId(""); setEventId(""); }}>Limpiar</button>
              <button type="button" className={`flex-1 px-3 py-2 rounded border ${demoLoaded ? "border-[#cbb3ff] bg-[#FE8B02]/20" : "border-white/10 bg-white/5"}`} onClick={() => setDemoLoaded((d) => !d)}>
                {demoLoaded ? "Demo ON" : "Demo OFF"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="bg-white/5 border border-white/10 rounded px-2 py-2 text-sm" value={new Date(range.from).toISOString().slice(0, 10)} onChange={(e) => setRange((r) => clampRange({ ...r, from: new Date(e.target.value + "T00:00:00") }))} />
              <input type="date" className="bg-white/5 border border-white/10 rounded px-2 py-2 text-sm" value={new Date(range.to).toISOString().slice(0, 10)} onChange={(e) => setRange((r) => clampRange({ ...r, to: new Date(e.target.value + "T23:59:59") }))} />
            </div>
            <button className="w-full mt-2 px-3 py-2 rounded-md bg-[#FE8B02] text-white" onClick={() => setShowFilters(false)}>Aplicar</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="w-full overflow-x-auto">
        <div className="inline-flex gap-1 rounded-md border border-white/10 bg-white/5 p-1 sticky top-[56px] z-10">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded text-sm whitespace-nowrap ${activeTab === t.key ? "bg-[#FE8B02]/20 text-[#cbb3ff]" : "hover:bg-white/10"}`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* CONTENIDO por tab */}
      {activeTab === "hoy" && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Monto total de ventas (neto)" value={fmtCLP(agg.gmv)} sub={`${agg.paidCount} pagos exitosos`} />
            <Kpi label="Tickets vendidos" value={agg.tickets}/>
            <Kpi label="Ticket promedio por compra" value={fmtCLP(Math.round(agg.aov))}/>
            <Kpi label="Reembolsos" value={fmtCLP(agg.refunds)} sub={agg.gmv ? pct(agg.refunds/agg.gmv) : "0.0%"}/>
            <Kpi label="Tasa de pagos exitosos" value={pct(agg.successRate)} sub={`${agg.totalPayments} intentos de pago`}/>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className={CHART_CARD}>
              <SalesLine data={agg.daily} />
            </div>
            <div className={CHART_CARD}>
              <Bars
                title="Tickets por tipo"
                data={agg.ticketBar.map(x => ({ name: x.name, "Tickets vendidos": x.qty }))}
                dataKey="Tickets vendidos"
              />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className={CHART_CARD}>
              <Bars
                title="Eventos con mayor venta neta"
                data={agg.topEvents.map(x => ({ name: x.eventId, "Venta neta (CLP)": x.gmv }))}
                dataKey="Venta neta (CLP)"
              />
            </div>
            <div className={TABLE_CARD}>
              {(() => {
                // Si tenemos agregado del evento, usamos topOrders allí (ya viene neto)
                if (eventAggDoc?.topOrders?.length) {
                  const rows = [...eventAggDoc.topOrders]
                    .sort((a: any,b: any) => (b.createdAt || 0) - (a.createdAt || 0))
                    .map((r: any) => {
                      const createdISO = new Date(Number(r.createdAt || 0));
                      return {
                        __created: createdISO ? createdISO.getTime() : 0,
                        Fecha: createdISO ? createdISO.toLocaleString("es-CL") : "—",
                        "ID de pago": r.paymentId || "—",
                        "ID de orden": r.orderId || "—",
                        Estado: r.status || "—",
                        "Monto neto": Math.round(r.net || 0),
                      };
                    });
                  const sorted = [...rows].sort((a: any, b: any) => {
                    const dir = sortDir === "asc" ? 1 : -1;
                    switch (sortKey) {
                      case "Fecha": return dir * ((a.__created || 0) - (b.__created || 0));
                      case "Monto neto": return dir * ((a["Monto neto"] || 0) - (b["Monto neto"] || 0));
                      case "ID de pago": return dir * String(a["ID de pago"] || "").localeCompare(String(b["ID de pago"] || ""), "es");
                      case "ID de orden": return dir * String(a["ID de orden"] || "").localeCompare(String(b["ID de orden"] || ""), "es");
                      case "Estado": return dir * String(a.Estado || "").localeCompare(String(b.Estado || ""), "es");
                      default: return 0;
                    }
                  });
                  const paged = sorted.slice(0, visibleRows);
                  return (
                    <>
                      <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs text-white/70">
                        <div className="flex items-center gap-2">
                          <span>Ordenar por</span>
                          <select
                            className="bg-white/5 border border-white/10 rounded px-2 py-1"
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value as any)}
                            aria-label="Ordenar por"
                          >
                            <option>Fecha</option>
                            <option>ID de pago</option>
                            <option>ID de orden</option>
                            <option>Estado</option>
                            <option>Monto neto</option>
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1 rounded border border-white/10 bg-white/5"
                            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                            aria-label="Cambiar dirección de orden"
                            title="Cambiar dirección de orden"
                          >
                            {sortDir === "asc" ? "Asc ↑" : "Desc ↓"}
                          </button>
                        </div>
                        <Link to="/admin/ventas" className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 border border-white/10 text-white">
                          Ir a todos los tickets
                        </Link>
                      </div>
                      <DataTable
                        rows={paged}
                        columns={[
                          { key: "Fecha", title: "Fecha" },
                          { key: "ID de pago", title: "ID de pago" },
                          { key: "ID de orden", title: "ID de orden" },
                          { key: "Estado", title: "Estado" },
                          { key: "Monto neto", title: "Monto neto", render: (r: any) => fmtCLP(r["Monto neto"]) },
                        ]}
                      />
                      {sorted.length > visibleRows && (
                        <div className="mt-3 flex justify-center">
                          <button
                            type="button"
                            onClick={() => setVisibleRows(v => v + 10)}
                            className="px-4 py-2 text-sm rounded bg-white/10 hover:bg-white/15 border border-white/10"
                          >
                            Mostrar 10 más
                          </button>
                        </div>
                      )}
                    </>
                  );
                }
                // Normaliza filas para la tabla independientemente del origen
                const normalize = (p: any) => {
                  const createdRaw = p.Created_at ?? p.createdAt ?? p.paidAt ?? p.updatedAt ?? p.date;
                  const createdISO = typeof createdRaw === "number" ? new Date(createdRaw) : (createdRaw ? new Date(createdRaw) : null);
                  const paymentId = p.PaymentID ?? p.paymentId ?? String(p.FlowOrder ?? p.flowOrder ?? p.token ?? p.orderId ?? "—");
                  const orderId = p.CommerceOrder ?? p.commerceOrder ?? p.orderId ?? p.OrderId ?? "—";
                  const status = p.Status ?? p.status ?? (p.paidAt ? "paid" : p.pending ? "pending" : "—");
                  const amountNum = extractNetAmount(p); // neto = bruto - fee (explícito o 12% fallback)
                  return {
                    __created: createdISO ? createdISO.getTime() : 0,
                    Fecha: createdISO ? createdISO.toLocaleString("es-CL") : "—",
                    "ID de pago": paymentId,
                    "ID de orden": orderId,
                    Estado: status,
                    "Monto neto": amountNum,
                  };
                };

                // Aplicar filtro por estado a nivel de tabla (por defecto solo "paid")
                const tableSource = onlyPaidRows
                  ? payments.filter((p: any) => (p.Status || p.status) === "paid")
                  : payments;
                const baseRows = tableSource.slice(-50).map(normalize);

                const rows = [...baseRows].sort((a: any, b: any) => {
                  const dir = sortDir === "asc" ? 1 : -1;
                  switch (sortKey) {
                    case "Fecha":
                      return dir * ((a.__created || 0) - (b.__created || 0));
                    case "Monto neto":
                      return dir * ((a["Monto neto"] || 0) - (b["Monto neto"] || 0));
                    case "ID de pago":
                      return dir * String(a["ID de pago"] || "").localeCompare(String(b["ID de pago"] || ""), "es");
                    case "ID de orden":
                      return dir * String(a["ID de orden"] || "").localeCompare(String(b["ID de orden"] || ""), "es");
                    case "Estado":
                      return dir * String(a.Estado || "").localeCompare(String(b.Estado || ""), "es");
                    default:
                      return 0;
                  }
                });
                const paged = rows.slice(0, visibleRows);

                return (
                  <>
                    <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs text-white/70">
                      <div className="flex items-center gap-2">
                        <span>Ordenar por</span>
                        <select
                          className="bg-white/5 border border-white/10 rounded px-2 py-1"
                          value={sortKey}
                          onChange={(e) => setSortKey(e.target.value as any)}
                          aria-label="Ordenar por"
                        >
                          <option>Fecha</option>
                          <option>ID de pago</option>
                          <option>ID de orden</option>
                          <option>Estado</option>
                          <option>Monto neto</option>
                        </select>
                        <button
                          type="button"
                          className="px-2 py-1 rounded border border-white/10 bg-white/5"
                          onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                          aria-label="Cambiar dirección de orden"
                          title="Cambiar dirección de orden"
                        >
                          {sortDir === "asc" ? "Asc ↑" : "Desc ↓"}
                        </button>
                        <label className="ml-2 inline-flex items-center gap-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="accent-[#FE8B02]"
                            checked={!onlyPaidRows}
                            onChange={(e) => setOnlyPaidRows(!e.target.checked ? true : false)}
                          />
                          <span>Incluir pendientes/fallidos</span>
                        </label>
                      </div>
                      <Link
                        to="/admin/ventas"
                        className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 border border-white/10 text-white"
                      >
                        Ir a todos los tickets
                      </Link>
                    </div>
                    <DataTable
                      rows={paged}
                      columns={[
                        { key: "Fecha", title: "Fecha" },
                        { key: "ID de pago", title: "ID de pago" },
                        { key: "ID de orden", title: "ID de orden" },
                        { key: "Estado", title: "Estado" },
                        { key: "Monto neto", title: "Monto neto", render: (r: any) => fmtCLP(r["Monto neto"]) },
                      ]}
                    />
                    {rows.length > visibleRows && (
                      <div className="mt-3 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setVisibleRows(v => v + 10)}
                          className="px-4 py-2 text-sm rounded bg-white/10 hover:bg-white/15 border border-white/10"
                        >
                          Mostrar 10 más
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </section>
      )}

      {activeTab === "ventas" && (
        <section className="space-y-6">
          <div className={CHART_CARD}>
            <SalesLine data={agg.daily} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className={CHART_CARD}>
              <Bars
                title="Tickets por tipo"
                data={agg.ticketBar.map(x => ({ name: x.name, "Tickets vendidos": x.qty }))}
                dataKey="Tickets vendidos"
              />
            </div>
            <div className={CHART_CARD}>
              <Bars
                title="Eventos con mayor venta neta"
                data={agg.topEvents.map(x => ({ name: x.eventId, "Venta neta (CLP)": x.gmv }))}
                dataKey="Venta neta (CLP)"
              />
            </div>
          </div>
          {/* Segmentación de compradores (solo pagos exitosos) */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className={CHART_CARD}>
              <Bars
                title="Compras por rango de edad"
                data={[
                  { name: '<18', Compras: ageBuckets['<18'] },
                  { name: '18-24', Compras: ageBuckets['18-24'] },
                  { name: '25-34', Compras: ageBuckets['25-34'] },
                  { name: '35-44', Compras: ageBuckets['35-44'] },
                  { name: '45-54', Compras: ageBuckets['45-54'] },
                  { name: '55+', Compras: ageBuckets['55+'] },
                ]}
                dataKey="Compras"
              />
            </div>
            <div className={CHART_CARD}>
              <Bars
                title="Compras por sexo"
                data={[
                  { name: 'Femenino', Compras: genderCounts.F },
                  { name: 'Masculino', Compras: genderCounts.M },
                  { name: 'Otro / N/D', Compras: genderCounts.O },
                ]}
                dataKey="Compras"
              />
            </div>
          </div>
        </section>
      )}

      {activeTab === "clientes" && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Compradores únicos" value={buyers.uniques} />
            <Kpi label="Recurrentes" value={buyers.repeaters} sub={buyers.uniques ? ((buyers.repeaters / buyers.uniques) * 100).toFixed(1) + "%" : "0%"} />
            <Kpi label="Ticket promedio por compra" value={fmtCLP(Math.round(agg.aov))} />
            <Kpi label="Cliente con mayor gasto" value={buyers.top[0] ? fmtCLP(Math.round(buyers.top[0].amount)) : "$0"} sub={buyers.top[0]?.email || "—"} />
          </div>

          <div className={CHART_CARD}>
            <Bars
              title="Compradores con mayor gasto"
              data={buyers.top.map(b => ({ name: b.email || b.buyerKey, "Monto gastado (CLP)": Math.round(b.amount) }))}
              dataKey="Monto gastado (CLP)"
            />
          </div>

          <div className={TABLE_CARD}>
            <DataTable
              rows={buyers.rows.sort((a,b)=> b.amount - a.amount).slice(0,50)}
              columns={[
                { key: "email", title: "Cliente" },
                { key: "count", title: "Compras" },
                { key: "amount", title: "GMV", render: (r) => fmtCLP(Math.round(r.amount)) },
                { key: "lastAt", title: "Última compra", render: (r) => r.lastAt ? new Date(r.lastAt).toLocaleString("es-CL") : "—" },
              ]}
            />
          </div>
        </section>
      )}

      {activeTab === "embudos" && (
        <section className="space-y-6">
          {(!demoLoaded && funnelLoading) ? <div className="text-xs text-white/50">Cargando métricas del embudo…</div> : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Vistas del evento" value={funnel.views} />
            <Kpi label="Carritos creados" value={funnel.cart} />
            <Kpi label="Pago iniciado" value={funnel.payStarted} />
            <Kpi label="Pagos exitosos" value={funnel.paid} />
            <Kpi label="Tasa de conversión" value={pct(funnel.conv)} />
          </div>
          {DEBUG ? (
            <div className="text-[11px] text-white/50">
              Debug embudo activo: revisa la consola del navegador para ver <code>dateKeys</code>, <code>filterEventIds</code> y totales leídos.
            </div>
          ) : null}

          <div className={CHART_CARD}>
            <Bars
              title="Embudo (conteos)"
              data={[
                { name: "Vistas del evento", Conteo: funnel.views },
                { name: "Carritos creados", Conteo: funnel.cart },
                { name: "Pago iniciado", Conteo: funnel.payStarted },
                { name: "Pagos exitosos", Conteo: funnel.paid },
              ]}
              dataKey="Conteo"
            />
          </div>

          <div className={TABLE_CARD}>
            <DataTable
              rows={[{ step: "Pagos fallidos", value: funnel.failed }]}
              columns={[
                { key: "step", title: "Paso" },
                { key: "value", title: "Conteo" },
              ]}
            />
          </div>
        </section>
      )}

      {activeTab === "notif" && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Notificaciones enviadas" value={notif.sent} />
            <Kpi label="Aperturas" value={notif.opened} sub={notif.openRate} />
            <Kpi label="Clicks" value={notif.clicked} sub={notif.ctr} />
            <Kpi label="Compras atribuidas" value={notif.purchases} sub={notif.cvr} />
          </div>
          {!demoLoaded && <div className="text-xs text-white/50">Activa Modo demo o registra métricas de notificaciones (send/open/click) para ver datos reales.</div>}
        </section>
      )}

      {activeTab === "operacion" && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi label="Tickets (hoy)" value={ops.ticketsToday} />
            <Kpi label="Check-ins (hoy)" value={ops.checkins} />
            <Kpi label="Relación asistencia sobre ventas (hoy)" value={pct(ops.ratio)} />
          </div>
          <div className="text-xs text-white/50">Para check-ins en tiempo real conecta tu lector QR y guarda scans en Firestore (p.ej. collection tickets_scans).</div>
        </section>
      )}

      {activeTab === "fidel" && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi label="Clientes recurrentes" value={loyalty.repeaters} />
            <Kpi label="Share recurrente" value={pct(loyalty.share)} />
            <Kpi label="Ticket promedio por compra" value={fmtCLP(Math.round(agg.aov))} />
          </div>
          <div className={CHART_CARD}>
            <Bars title="Top por frecuencia" data={loyalty.top.map(r => ({ name: r.email || r.buyerKey, freq: r.count }))} dataKey="freq" />
          </div>
        </section>
      )}

      {activeTab === "calidad" && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi label="NPS" value={quality.nps === null ? "—" : quality.nps} sub={quality.nps === null ? "Sin encuesta" : "Últimos 30 días"} />
            <Kpi label="Respuestas" value={quality.responses} />
          </div>
          <div className="text-xs text-white/60 space-y-1">
            <p><strong>NPS (Net Promoter Score)</strong>: indicador de satisfacción que va de -100 a 100. Se calcula con la pregunta “¿Qué probabilidad hay de que recomiendes este evento/club?” (0–10).</p>
            <p><strong>Respuestas</strong>: cantidad de encuestas recibidas utilizadas para calcular el NPS.</p>
          </div>
          {!demoLoaded && <div className="text-xs text-white/50">Activa Modo demo o integra encuestas post-evento para ver NPS/Reseñas.</div>}
        </section>
      )}

      <div className="text-[11px] text-white/50 space-y-1 border-t border-white/10 pt-3">
        <div className="font-semibold text-white/60">Glosario rápido</div>
        <div>• <strong>Tickets vendidos</strong>: número de entradas vendidas.</div>
        <div>• <strong>Venta neta (CLP)</strong>: monto vendido descontando el cargo por servicio.</div>
        <div>* En tarjetas y tablas, el monto mostrado es neto (monto cobrado menos cargo por servicio).</div>
        <div>• <strong>Monto gastado (CLP)</strong>: total pagado por un cliente específico.</div>
        <div>• <strong>Conteo</strong>: cantidad total de acciones en esa etapa (vistas, carritos, pagos).</div>
      </div>

      <div className="text-[11px] text-white/40">Alcance: {isAdmin ? "Admin (todos)" : `Tus eventos`} {clubId ? `· club=${clubId}` : ""} {eventId ? `· evento=${eventId}` : ""} {demoLoaded ? "· Modo demo" : ""} · filtros aplicados en servidor y cliente</div>

      {loading ? <div className="text-white/60 text-sm">Cargando…</div> : null}
    </div>
  );
}