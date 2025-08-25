// src/pages/MisTickets.tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";

/* ===== Tipos ===== */
type UserTicket = {
  // campos persistidos por ítem en `orders`
  orderId: string;
  status?: "paid" | "pending" | "failed" | "canceled";
  eventId?: string | null;
  eventName?: string | null;     // enriquecido
  eventImage?: string | null;    // enriquecido (flyer)
  ticketId?: string | null;
  ticketName?: string | null;
  price: number;                 // precio unitario del ítem
  qty?: number;                  // cantidad (línea)
  amount?: number;               // price * qty (si viene)
  currency: string;              // CLP/USD…
  paidAt?: number | null;
  createdAt?: number | null;

  // extras útiles para depurar/mostrar
  raw?: Record<string, any> | null;
};

/* ===== Helpers ===== */
const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const placeholder = "https://placehold.co/80x80/101013/FFF?text=EV";

/* ===== Tipos/Helpers para QR ===== */
type TicketQR = {
  id: string;
  text: string;
  dataUrl: string;
  status: "valid" | "used" | "void";
  usedAt?: number | null;
};

async function generateQrDataUrl(text: string): Promise<string> {
  if (!text) return "";
  try {
    // Intento local: usar la librería 'qrcode' si está instalada
    const QR = await import("qrcode");
    const url = await QR.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 4,
    });
    return url;
  } catch {
    // Fallback: servicio de imagen (solo visualización)
    const enc = encodeURIComponent(text);
    return `https://quickchart.io/qr?size=300&text=${enc}`;
  }
}

/* ===== Collage helpers (portada por orden) ===== */
// Devuelve hasta 4 imágenes únicas por evento dentro del grupo
function buildOrderImages(group: UserTicket[], placeholderUrl: string) {
  const seen = new Set<string>();
  const imgs: string[] = [];
  for (const g of group) {
    const key = g.eventId || `${g.eventName ?? g.ticketName ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      imgs.push(g.eventImage || placeholderUrl);
      if (imgs.length >= 4) break;
    }
  }
  if (imgs.length === 0) imgs.push(placeholderUrl);
  return imgs;
}

// Renderiza 1, 2, 3 o 4 imágenes en un collage cuadrado
function OrderCover({ images }: { images: string[] }) {
  const imgs = (images || []).filter(Boolean);
  const n = imgs.length;

  // contenedor cuadrado flexible (debe vivir dentro de un wrapper que defina tamaño)
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div className="relative w-full h-full">
      {children}
    </div>
  );

  if (n <= 1) {
    return (
      <Wrap>
        <img src={imgs[0]} alt="Orden" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      </Wrap>
    );
  }

  if (n === 2) {
    return (
      <Wrap>
        <div className="absolute inset-0 grid grid-cols-2">
          {imgs.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt={`img-${i}`} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </Wrap>
    );
  }

  if (n === 3) {
    // 2 arriba, 1 abajo
    return (
      <Wrap>
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          <div className="relative">
            <img src={imgs[0]} alt="img-0" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <div className="relative">
            <img src={imgs[1]} alt="img-1" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <div className="relative col-span-2">
            <img src={imgs[2]} alt="img-2" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        </div>
      </Wrap>
    );
  }

  // 4 o más: cuadrícula 2x2 (+badge si hay más)
  return (
    <Wrap>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
        {imgs.slice(0, 4).map((src, i) => (
          <div key={i} className="relative">
            <img src={src} alt={`img-${i}`} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        ))}
      </div>
      {images.length > 4 && (
        <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-xs">
          +{images.length - 4}
        </div>
      )}
    </Wrap>
  );
}

const getQty = (t: UserTicket) => Math.max(1, Number(t.qty ?? 1));
const getSubtotal = (t: UserTicket) =>
  Math.round(
    Number.isFinite(t.amount as any)
      ? (t.amount as number)
      : Math.round(t.price || 0) * getQty(t)
  );

function fmtDate(ts?: number | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("es-CL");
  } catch {
    return "—";
  }
}

/* =======================================================================
 * Componente
 * ======================================================================= */
export default function MisTickets() {
  const { user } = useAuth();
  const [items, setItems] = useState<UserTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState<UserTicket | null>(null);

  // QR state
  const [qrLoading, setQrLoading] = useState(false);
  const [qrList, setQrList] = useState<TicketQR[]>([]);
  const [expandedQrs, setExpandedQrs] = useState<Record<string, boolean>>({});

  // Agrupa por orderId para la vista “Orden de compra”
  const groups = useMemo(() => {
    const by: Record<string, UserTicket[]> = {};
    for (const it of items) {
      const key = it.orderId || "SIN_ORDEN";
      (by[key] ||= []).push(it);
    }
    return by;
  }, [items]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      try {
        const out: UserTicket[] = [];

        // === Modelo NUEVO: 1 doc por ítem en `orders`
        // Query 1: por buyerUid
        const q1 = query(
          collection(firebaseDb, "orders"),
          where("buyerUid", "==", user.uid)
        );
        const snap1 = await getDocs(q1);
        snap1.forEach((d) => {
          const x = d.data() as any;
          if (x.status !== "paid") return; // solo pagados
          out.push({
            orderId: x.orderId,
            status: x.status,
            eventId: x.eventId || null,
            ticketId: x.ticketId || null,
            ticketName: x.ticketName || "Ticket",
            price: Math.round(Number(x.price ?? 0)),
            qty: Number(x.qty ?? 1),
            amount: Number(x.amount ?? undefined),
            currency: x.currency || "CLP",
            paidAt: x.paidAt ?? x.updatedAt ?? x.createdAt ?? null,
            createdAt: x.createdAt ?? null,
            raw: { id: d.id, ...x },
          });
        });

        // Query 2: por email (por si buyerUid no se guardó o usuario cambió)
        if (user.email) {
          const q2 = query(
            collection(firebaseDb, "orders"),
            where("email", "==", user.email)
          );
          const snap2 = await getDocs(q2);
          snap2.forEach((d) => {
            const x = d.data() as any;
            if (x.status !== "paid") return;
            out.push({
              orderId: x.orderId,
              status: x.status,
              eventId: x.eventId || null,
              ticketId: x.ticketId || null,
              ticketName: x.ticketName || "Ticket",
              price: Math.round(Number(x.price ?? 0)),
              qty: Number(x.qty ?? 1),
              amount: Number(x.amount ?? undefined),
              currency: x.currency || "CLP",
              paidAt: x.paidAt ?? x.updatedAt ?? x.createdAt ?? null,
              createdAt: x.createdAt ?? null,
              raw: { id: d.id, ...x },
            });
          });
        }

        // De-duplicar por (orderId + ticketId + paidAt + price + qty)
        // (evita repetir si el ítem aparece por UID y por email)
        const uniqKey = (t: UserTicket) =>
          [
            t.orderId,
            t.eventId ?? "-",
            t.ticketId ?? "-",
            t.ticketName ?? "-",
            t.paidAt ?? "-",
            Math.round(t.price || 0),
            getQty(t),
          ].join("|");

        const seen = new Set<string>();
        const dedup = out.filter((t) => {
          const k = uniqKey(t);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        // Enriquecer con nombre e imagen del evento
        const cache = new Map<string, { name: string | null; flyer: string | null }>();
        const enriched = await Promise.all(
          dedup.map(async (r) => {
            if (!r.eventId) return r;
            if (!cache.has(r.eventId)) {
              try {
                const evRef = doc(firebaseDb, "evento", r.eventId);
                const evSnap = await getDoc(evRef);
                if (evSnap.exists()) {
                  const ev = evSnap.data() as any;
                  cache.set(r.eventId, {
                    name: ev.nombre || null,
                    flyer: ev.flyer || ev.imgSec || null,
                  });
                } else {
                  cache.set(r.eventId, { name: null, flyer: null });
                }
              } catch {
                cache.set(r.eventId, { name: null, flyer: null });
              }
            }
            const ev = cache.get(r.eventId)!;
            return { ...r, eventName: ev.name, eventImage: ev.flyer };
          })
        );

        // Ordenar por fecha de pago (desc)
        enriched.sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0));
        setItems(enriched);
      } catch (e) {
        console.error("MisTickets: error cargando", e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Abre detalle y carga QRs del ítem
  async function openDetail(t: UserTicket) {
    setDetail(t);
    setQrLoading(true);
    setQrList([]);
    try {
      let qrDocs: { id: string; text: string; status: "valid" | "used" | "void"; usedAt?: number | null }[] = [];

      // 0) Preferimos listar explícitamente por ticketIds (si vienen en el detalle)
      const explicitIds = ((t as any)?.raw?.ticketIds as string[] | undefined)?.filter(Boolean) || [];
      if (explicitIds.length > 0) {
        const docs = await Promise.all(
          explicitIds.map(async (id) => {
            try {
              const dref = doc(firebaseDb, "tickets", id);
              const dsnap = await getDoc(dref);
              if (!dsnap.exists()) return null;
              const data = dsnap.data() as any;
              const text =
                data?.qr?.text ||
                data?.qrText ||
                data?.code ||
                data?.qr ||
                "";
              const status = (data?.status as string) || (data?.usedAt ? "used" : "valid");
              const usedAt = (typeof data?.usedAt === "number" ? data.usedAt : null) as number | null;
              return text
                ? {
                    id: dsnap.id,
                    text,
                    status: status === "void" ? "void" : status === "used" ? "used" : "valid",
                    usedAt,
                  }
                : null;
            } catch {
              return null;
            }
          })
        );
        qrDocs = docs.filter(Boolean) as {
          id: string;
          text: string;
          status: "valid" | "used" | "void";
          usedAt?: number | null;
        }[];
      }

      // 1) Si no había ticketIds o ninguno útil, intentar por orderItemId (raw.id del ítem en `orders`)
      if (qrDocs.length === 0) {
        const orderItemId = (t as any)?.raw?.id as string | undefined;
        if (orderItemId) {
          const q1 = query(
            collection(firebaseDb, "tickets"),
            where("orderItemId", "==", orderItemId)
          );
          const s1 = await getDocs(q1);
          qrDocs = s1.docs
            .map((d) => {
              const data = d.data() as any;
              const text =
                data?.qr?.text ||
                data?.qrText ||
                data?.code ||
                data?.qr ||
                "";
              const status = (data?.status as string) || (data?.usedAt ? "used" : "valid");
              const usedAt = (typeof data?.usedAt === "number" ? data.usedAt : null) as number | null;
              return text
                ? {
                    id: d.id,
                    text,
                    status: status === "void" ? "void" : status === "used" ? "used" : "valid",
                    usedAt,
                  }
                : null;
            })
            .filter(Boolean) as any;
        }
      }

      // 2) Último fallback: por orderId + (ticketTypeId | ticketId)
      if (qrDocs.length === 0) {
        const q2 = query(
          collection(firebaseDb, "tickets"),
          where("orderId", "==", t.orderId)
        );
        const s2 = await getDocs(q2);
        const typeId = (t.ticketId as string) || (t as any)?.ticketTypeId || null;
        qrDocs = s2.docs
          .map((d) => {
            const data = d.data() as any;
            const text =
              data?.qr?.text ||
              data?.qrText ||
              data?.code ||
              data?.qr ||
              "";
            const status = (data?.status as string) || (data?.usedAt ? "used" : "valid");
            const usedAt = (typeof data?.usedAt === "number" ? data.usedAt : null) as number | null;
            const matchType =
              !typeId ||
              data?.ticketTypeId === typeId ||
              data?.ticketId === typeId;
            return matchType && text
              ? {
                  id: d.id,
                  text,
                  status: status === "void" ? "void" : status === "used" ? "used" : "valid",
                  usedAt,
                }
              : null;
          })
          .filter(Boolean) as any;
      }

      // 3) Generar imágenes (dataURL local o URL de fallback)
      const imgs = await Promise.all(
        qrDocs.map(async (q: any) => ({
          id: q.id,
          text: q.text,
          status: q.status as "valid" | "used" | "void",
          usedAt: q.usedAt ?? null,
          dataUrl: await generateQrDataUrl(q.text),
        }))
      );

      setQrList(imgs);
    } catch (e) {
      console.warn("QR load error:", e);
      setQrList([]);
    } finally {
      setQrLoading(false);
    }
  }

  if (!user) {
    return <div className="p-6">Inicia sesión para ver tus tickets.</div>;
  }

  const selectedOrderId = searchParams.get("orden");

  /* =========================
   * Vista: Orden de compra
   * ========================= */
  if (selectedOrderId) {
    const group = groups[selectedOrderId] || [];
    const total = group.reduce((acc, t) => acc + getSubtotal(t), 0);
    const totalQty = group.reduce((acc, t) => acc + getQty(t), 0);
    const created =
      group
        .map((t) =>
          t.paidAt || t.createdAt
            ? new Date((t.paidAt || t.createdAt) as number)
            : null
        )
        .filter(Boolean)
        .sort((a: any, b: any) => a - b)[0] || null;

    return (
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Orden de compra <span className="text-[#8e2afc]">{selectedOrderId}</span>
          </h1>
          <button
            className="px-4 py-2 rounded-md border border-white/15 hover:bg-white/10 w-full sm:w-auto"
            onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.delete("orden");
              setSearchParams(p, { replace: true });
              window.scrollTo(0, 0);
            }}
          >
            Volver a mis tickets
          </button>
        </div>

        <div className="rounded-lg border border-white/15 bg-white/[0.03] p-4 md:p-6 mb-6">
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-white/60">Creada</div>
              <div className="font-medium">
                {created ? (created as Date).toLocaleString("es-CL") : "—"}
              </div>
            </div>
            <div>
              <div className="text-white/60">Ítems / Cantidad total</div>
              <div className="font-medium">
                {group.length} / {totalQty}
              </div>
            </div>
            <div>
              <div className="text-white/60">Subtotal</div>
              <div className="font-extrabold tracking-tight">
                {CLP.format(Math.round(total))}
              </div>
            </div>
          </div>
        </div>

        <ul className="grid gap-4">
          {group.map((t, i) => {
            const qty = getQty(t);
            const subtotal = getSubtotal(t);
            return (
              <li
                key={`${selectedOrderId}-${i}`}
                className="rounded-lg border border-white/15 bg-white/[0.03] p-4 flex gap-4"
              >
                <div className="w-20 h-20 rounded overflow-hidden border border-white/10 bg-white/5 shrink-0">
                  <img
                    src={t.eventImage || placeholder}
                    alt={t.eventName || t.ticketName || "Evento"}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">
                    {t.eventName || "Evento"}
                  </div>
                  <div className="text-sm text-white/70 truncate">
                    {t.ticketName || "Ticket"}
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    Cantidad: {qty} • Precio: {CLP.format(Math.round(t.price || 0))} • Subtotal:{" "}
                    {CLP.format(subtotal)}
                  </div>
                </div>
                <div className="flex items-center">
                  <button
                    className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 text-sm text-center"
                    onClick={() => openDetail(t)}
                  >
                    Ver detalle de ticket
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {detail && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setDetail(null)}
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-xl border border-white/15 bg-[#0b0b0f] shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0b0b0f]">
                  <h2 className="font-semibold">Detalle del ticket</h2>
                  <button
                    className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-sm"
                    onClick={() => setDetail(null)}
                  >
                    Cerrar
                  </button>
                </div>

                <div className="p-4 grid gap-4 overflow-y-auto flex-1">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-md overflow-hidden border border-white/10 bg-white/5 shrink-0">
                      <img
                        src={detail.eventImage || "https://placehold.co/80x80/101013/FFF?text=EV"}
                        alt={detail.eventName || detail.ticketName || "Evento"}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {detail.eventName || "Evento"}
                      </div>
                      <div className="text-sm text-white/70 truncate">
                        {detail.ticketName || "Ticket"}
                      </div>
                      <div className="text-xs text-white/50 mt-1">
                        Orden {detail.orderId}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <KV k="Precio unitario" v={CLP.format(Math.round(detail.price || 0))} />
                    <KV k="Cantidad" v={String(Math.max(1, Number(detail.qty || 1)))} />
                    <KV
                      k="Subtotal"
                      v={CLP.format(
                        Math.round(
                          Number.isFinite(detail.amount as any)
                            ? (detail.amount as number)
                            : Math.round(detail.price || 0) * Math.max(1, Number(detail.qty || 1))
                        )
                      )}
                    />
                    <KV k="Moneda" v={detail.currency || "CLP"} />
                    <KV k="Pagado" v={fmtDate(detail.paidAt ?? null)} />
                    <KV k="Creado" v={fmtDate(detail.createdAt ?? null)} />
                    <KV k="Evento ID" v={detail.eventId || "—"} />
                    <KV k="Ticket ID" v={detail.ticketId || "—"} />
                  </div>

                  {/* QRs del ticket */}
                  <div className="mt-2">
                    <div className="text-sm font-semibold mb-2">Códigos QR (estado)</div>
                    {qrLoading ? (
                      <div className="text-sm text-white/70">Generando códigos…</div>
                    ) : qrList.length === 0 ? (
                      <div className="text-sm text-white/60">
                        No se encontraron códigos para este ticket.
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-6">
                        {qrList.map((q, i) => {
                          const expanded = !!expandedQrs[q.id];
                          const short =
                            q.text.length > 24 ? `${q.text.slice(0, 10)}…${q.text.slice(-10)}` : q.text;

                          return (
                            <li
                              key={q.id}
                              className="relative rounded-md border border-white/10 bg-black/40 overflow-hidden flex flex-col p-0"
                            >
                              <span
                                className={`absolute top-2 left-2 border text-[10px] px-2 py-0.5 rounded-full ${qrStatusClasses(
                                  q.status
                                )}`}
                              >
                                {qrStatusLabel(q.status)}
                              </span>

                              {/* Cabecera: Ticket N */}
                              <div className="w-full text-center text-xs font-medium pt-2 pb-1 px-2">
                                Ticket {i + 1}
                              </div>

                              {/* Imagen QR: ocupa el ancho completo de la card */}
                              <img
                                src={q.dataUrl}
                                alt={`QR ${i + 1}`}
                                className="w-[80%] max-w-[250px] mx-auto h-auto block"
                              />

                              {/* Código + acciones */}
                              <div className="px-2 pt-2 pb-3 flex flex-col items-center gap-1">
                                <div className="text-[11px] text-white/80 break-all text-center font-mono select-all">
                                  {expanded ? q.text : short}
                                </div>
                                <div className="mt-1 flex items-center justify-center gap-2">
                                  <button
                                    className="px-2 py-1 text-[11px] rounded bg-white/10 hover:bg-white/15"
                                    onClick={() => navigator.clipboard.writeText(q.text)}
                                  >
                                    Copiar
                                  </button>
                                  <a
                                    href={q.dataUrl}
                                    download={`qr-ticket-${i + 1}.png`}
                                    className="px-2 py-1 text-[11px] rounded bg-white/10 hover:bg-white/15"
                                  >
                                    Descargar PNG
                                  </a>
                                  <button
                                    className="px-2 py-1 text-[11px] rounded bg-white/10 hover:bg-white/15"
                                    onClick={() =>
                                      setExpandedQrs((s) => ({ ...s, [q.id]: !s[q.id] }))
                                    }
                                  >
                                    {expanded ? "Ver menos" : "Ver completo"}
                                  </button>
                                </div>

                                {q.usedAt ? (
                                  <div className="mt-1 text-[10px] text-white/60 text-center">
                                    Usado el {new Date(q.usedAt).toLocaleString("es-CL")}
                                  </div>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Extras del raw si están disponibles */}
                  {detail.raw && (
                    <div className="mt-2">
                      <details className="text-sm text-white/80">
                        <summary className="cursor-pointer select-none text-white/70">Ver datos completos (raw)</summary>
                        <pre className="mt-2 max-h-64 overflow-auto text-xs bg-black/40 p-2 rounded">
{JSON.stringify(detail.raw, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  /* =========================
   * Vista: listado agrupado
   * ========================= */
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#b688ff]">
          Mis tickets
        </h1>
        <p className="text-foreground/70 mt-2">Tus compras de entradas en GoUp.</p>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
              <div className="aspect-square bg-white/10 animate-pulse" />
              <div className="p-3">
                <div className="h-4 w-2/3 bg-white/10 rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-white/10 rounded mt-2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : Object.keys(groups).length === 0 ? (
        <p className="text-foreground/70">Aún no has comprado tickets.</p>
      ) : (
        <>
          {/* Mobile */}
          <div className="md:hidden">
            <ul className="grid gap-3">
              {Object.entries(groups).map(([orderId, group]) => {
                const first = group[0];
                const total = group.reduce((acc, t) => acc + getSubtotal(t), 0);
                const totalQty = group.reduce((acc, t) => acc + getQty(t), 0);
                const created =
                  first?.paidAt || first?.createdAt
                    ? new Date((first.paidAt || first.createdAt) as number)
                    : null;

                return (
                  <li
                    key={orderId}
                    className="rounded-xl border border-white/10 bg-white/[0.04] p-4 flex items-center gap-3"
                  >
                    <div className="w-14 h-14 rounded-md overflow-hidden border border-white/10">
                      <OrderCover images={buildOrderImages(group, placeholder)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">Orden {orderId}</div>
                      <div className="text-sm text-white/70 truncate">
                        {group
                          .slice(0, 2)
                          .map((t) => t.eventName || t.ticketName)
                          .join(" • ")}
                        {group.length > 2 ? " • …" : ""}
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        {created ? `Pagado ${created.toLocaleString("es-CL")}` : "—"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{CLP.format(Math.round(total))}</div>
                      <button
                        className="mt-2 px-3 py-1.5 rounded-md bg-[#8e2afc] hover:bg-[#7b1fe0] text-xs"
                        onClick={() => {
                          const p = new URLSearchParams(searchParams);
                          p.set("orden", orderId);
                          setSearchParams(p, { replace: false });
                          window.scrollTo(0, 0);
                        }}
                      >
                        Orden de compra
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Desktop */}
          <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 gap-5">
            {Object.entries(groups).map(([orderId, group]) => {
              const first = group[0];
              const total = group.reduce((acc, t) => acc + getSubtotal(t), 0);
              const totalQty = group.reduce((acc, t) => acc + getQty(t), 0);
              return (
                <div key={orderId} className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden flex flex-col">
                  <div className="aspect-square">
                    <OrderCover images={buildOrderImages(group, placeholder)} />
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <div className="font-semibold truncate">Orden {orderId}</div>
                    <div className="text-sm text-white/70 truncate">
                      {group
                        .slice(0, 2)
                        .map((t) => t.eventName || t.ticketName)
                        .join(" • ")}
                      {group.length > 2 ? " • …" : ""}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="font-semibold">{CLP.format(Math.round(total))}</div>
                      <button
                        className="px-3 py-1.5 rounded-md bg-[#8e2afc] hover:bg-[#7b1fe0] text-xs"
                        onClick={() => {
                          const p = new URLSearchParams(searchParams);
                          p.set("orden", orderId);
                          setSearchParams(p, { replace: false });
                          window.scrollTo(0, 0);
                        }}
                      >
                        Orden de compra
                      </button>
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      Items: {group.length} • Cantidad total: {totalQty}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

function KV({ k, v }: { k: string; v?: any }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-1">
      <span className="text-white/60">{k}</span>
      <span className="text-right break-words">{v ?? "—"}</span>
    </div>
  );
}
// Helpers para mostrar estado QR
function qrStatusLabel(s: "valid" | "used" | "void") {
  if (s === "used") return "Usado";
  if (s === "void") return "Anulado";
  return "Disponible";
}
function qrStatusClasses(s: "valid" | "used" | "void") {
  if (s === "used") return "bg-rose-500/15 text-rose-200 border-rose-400/30";
  if (s === "void") return "bg-white/10 text-white/70 border-white/20";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-400/30";
}