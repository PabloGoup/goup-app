// src/pages/AdminSales.tsx
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  documentId,
} from "firebase/firestore";
import { onAuthStateChanged, getAuth } from "firebase/auth";
import { db as firebaseDb } from "@/lib/firebase";

// ===== Tipos =====
export type Ticket = {
  id?: string;
  orderId: string;
  status: string; // paid | pending | failed | refunded | ...
  email?: string;
  eventId: string;
  ticketName?: string;
  amount?: number;
  currency?: string;
  paidAt?: number; // ms
  createdAt?: number; // ms
  subject?: string; // puede venir el nombre del evento
};

type UserRole = {
  admin?: boolean;
  // otros flags si existen
};

// ===== Helpers =====
function groupByEvent(rows: Ticket[]) {
  const map: Record<string, Ticket[]> = {};
  for (const r of rows) {
    const k = r.eventId || "__unknown__";
    (map[k] ||= []).push(r);
  }
  // ordena cada grupo por fecha (paidAt || createdAt) desc
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => {
      const ta = a.paidAt ?? a.createdAt ?? 0;
      const tb = b.paidAt ?? b.createdAt ?? 0;
      return tb - ta;
    });
  }
  return map;
}

function useAuthGate() {
  const [uid, setUid] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      try {
        if (!user) {
          setUid(null);
          setRole(null);
          return;
        }
        setUid(user.uid);
        // leemos usersWeb/{uid} para saber si es admin
        try {
          const uref = doc(firebaseDb, "usersWeb", user.uid);
          const usnap = await getDoc(uref);
          const data = usnap.exists() ? (usnap.data() as any) : null;
          setRole({ admin: Boolean(data?.admin) });
        } catch {
          setRole({ admin: false });
        }
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  return { uid, role, loading };
}

export default function AdminSales() {
  const { uid, role, loading: authLoading } = useAuthGate();
  const [rows, setRows] = useState<Ticket[]>([]);
  const [evNames, setEvNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const isAdmin = Boolean(role?.admin);

  useEffect(() => {
    (async () => {
      if (authLoading) return; // espera auth
      setLoading(true);
      try {
        if (!uid) throw new Error("Debes iniciar sesión.");

        // 1) Determinar eventos permitidos
        let allowedEventIds: string[] | null = null;
        if (!isAdmin) {
          const evs: string[] = [];
          // Evento donde ownerUid == uid
          try {
            const q1 = query(collection(firebaseDb, "evento"), where("ownerUid", "==", uid));
            const s1 = await getDocs(q1);
            s1.docs.forEach((d) => evs.push(d.id));
          } catch {}
          // Evento donde producers array-contiene uid (si existiera ese campo)
          try {
            const q2 = query(collection(firebaseDb, "evento"), where("producers", "array-contains", uid));
            const s2 = await getDocs(q2);
            s2.docs.forEach((d) => {
              if (!evs.includes(d.id)) evs.push(d.id);
            });
          } catch {}
          allowedEventIds = evs;
        }

        // 2) Leer tickets
        let tickets: Ticket[] = [];
        if (isAdmin) {
          // Admin: trae todos (ordenaremos en memoria)
          const q = query(collection(firebaseDb, "tickets"));
          const snap = await getDocs(q);
          tickets = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Ticket[];
        } else {
          if (!allowedEventIds || allowedEventIds.length === 0) {
            setRows([]);
            setEvNames({});
            setLoading(false);
            return;
          }
          // Firestore permite hasta 10 ids por 'in' ⇒ paginar en chunks de 10
          const chunks: string[][] = [];
          for (let i = 0; i < allowedEventIds.length; i += 10) {
            chunks.push(allowedEventIds.slice(i, i + 10));
          }
          for (const c of chunks) {
            const q = query(
              collection(firebaseDb, "tickets"),
              where("eventId", "in", c)
            );
            const s = await getDocs(q);
            tickets.push(
              ...s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
            );
          }
        }

        // 3) Nombres de eventos (para los que vemos)
        const eventIds = Array.from(new Set(tickets.map((t) => t.eventId).filter(Boolean)));
        const evMap: Record<string, string> = {};
        // Intento 1: leer de colección `evento`
        try {
          const chunks: string[][] = [];
          for (let i = 0; i < eventIds.length; i += 10) chunks.push(eventIds.slice(i, i + 10));
          for (const c of chunks) {
            const q = query(collection(firebaseDb, "evento"), where(documentId(), "in", c));
            const s = await getDocs(q);
            s.docs.forEach((d) => {
              const name = (d.data() as any)?.name || (d.data() as any)?.eventName || "Evento";
              evMap[d.id] = name;
            });
          }
        } catch {}
        // fallback: usar subject si no encontramos nombre
        tickets.forEach((t) => {
          if (!evMap[t.eventId]) evMap[t.eventId] = t.subject || "Evento";
        });

        // 4) Orden general por fecha (desc)
        tickets.sort((a, b) => (b.paidAt ?? b.createdAt ?? 0) - (a.paidAt ?? a.createdAt ?? 0));

        setRows(tickets);
        setEvNames(evMap);
      } catch (err) {
        console.warn("[AdminSales] error", err);
        setRows([]);
        setEvNames({});
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, isAdmin, authLoading]);

  const grouped = useMemo(() => groupByEvent(rows), [rows]);

  if (authLoading || loading) return <div className="p-6">Cargando…</div>;
  if (!uid) return <div className="p-6">Debes iniciar sesión para ver las ventas.</div>;
  if (!isAdmin && Object.keys(grouped).length === 0)
    return (
      <div className="p-6">
        No tienes eventos asignados o aún no hay tickets.
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Tickets (todos los estados)</h1>

      {Object.keys(grouped).map((evId) => (
        <div key={evId} className="space-y-3">
          <h2 className="text-xl font-semibold">
            {evNames[evId] || "Evento"} <span className="text-white/50">({grouped[evId].length})</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-y-2">
              <thead className="text-left text-white/70">
                <tr>
                  <th>Fecha</th>
                  <th>Orden</th>
                  <th>Email</th>
                  <th>Ticket</th>
                  <th>Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {grouped[evId].map((o, i) => (
                  <tr key={o.id || i} className="bg-white/5">
                    <td className="px-3 py-2">
                      {o.paidAt || o.createdAt
                        ? new Date(o.paidAt ?? o.createdAt!).toLocaleString("es-CL")
                        : "—"}
                    </td>
                    <td className="px-3 py-2">{o.orderId}</td>
                    <td className="px-3 py-2">{o.email || "—"}</td>
                    <td className="px-3 py-2">{o.ticketName || "—"}</td>
                    <td className="px-3 py-2">
                      {o.currency ? `${o.currency} ` : ""}
                      {o.amount != null ? Math.round(o.amount).toLocaleString("es-CL") : "—"}
                    </td>
                    <td className="px-3 py-2 uppercase tracking-wide">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}