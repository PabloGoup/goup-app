// src/pages/CheckIn.tsx
import React, { useEffect, useRef, useState } from "react";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_FLOW_SERVER_BASE ||
  "http://localhost:8788";

type Lookup = {
  ok: boolean;
  ticket?: {
    id: string;
    status: "valid" | "used" | "void";
    usedAt?: number | null;
    orderId?: string | null;
    eventId?: string | null;
    ticketTypeId?: string | null;
    buyerUid?: string | null;
    email?: string | null;
    eventName?: string | null;
    buyerName?: string | null;
    buyerRut?: string | null;
    eventStart?: string | null;
  };
  error?: string;
};

export default function CheckIn() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<Lookup | null>(null);
  const [hydratedEventDateFor, setHydratedEventDateFor] = useState<string | null>(null);
  const [hydratedTicketFor, setHydratedTicketFor] = useState<string | null>(null);

  // Cámara (BarcodeDetector nativo si está)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    // @ts-ignore
    let detector: any = "BarcodeDetector" in window ? new window["BarcodeDetector"]({ formats: ["qr_code"] }) : null;

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      setScanning(false);
    };

    async function start() {
      try {
        if (!detector) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);

        const tick = async () => {
          if (!videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              const raw = codes[0].rawValue || codes[0].raw || "";
              if (raw) {
                setCode(raw);
                stop();
              }
            }
          } catch {}
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        console.warn("scan error", e);
      }
    }

    start();
    return () => stop();
  }, []);

  useEffect(() => {
    (async () => {
      const evId = result?.ticket?.eventId;
      const missing = !result?.ticket?.eventStart && !!evId;
      if (!missing) return;
      if (hydratedEventDateFor === evId) return; // avoid duplicate fetches
      try {
        const db = getFirestore();
        const ref = doc(db, "evento", evId!);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d: any = snap.data();
          let raw = d?.start ?? d?.fechaInicio ?? d?.dateStart ?? d?.startDate ?? null;
          let iso: string | null = null;
          if (!raw) {
            // some schemas store nested schedule { start }
            raw = d?.schedule?.start ?? null;
          }
          if (raw) {
            if (typeof raw === "string") {
              iso = raw;
            } else if (raw?.toDate) {
              iso = raw.toDate().toISOString();
            } else if (typeof raw?.seconds === "number") {
              iso = new Date(raw.seconds * 1000).toISOString();
            }
          }
          if (iso) {
            setResult((prev) => (prev && prev.ticket ? { ...prev, ticket: { ...prev.ticket, eventStart: iso } } : prev));
            setHydratedEventDateFor(evId!);
          }
        }
      } catch (err) {
        console.warn("No se pudo hidratar fecha del evento", err);
      }
    })();
  }, [result?.ticket?.eventId, result?.ticket?.eventStart, hydratedEventDateFor]);

  useEffect(() => {
    (async () => {
      const tid = result?.ticket?.id;
      if (!tid) return;
      // hydrate only if some key fields are missing
      const needsBuyer = !result?.ticket?.buyerName || !result?.ticket?.buyerRut || !result?.ticket?.eventName || !result?.ticket?.eventStart;
      if (!needsBuyer) return;
      if (hydratedTicketFor === tid) return; // avoid duplicate fetches
      try {
        const db = getFirestore();
        const ref = doc(db, "tickets", tid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d: any = snap.data();
          const buyerName = d?.buyerName ?? d?.attendee?.nombre ?? d?.attendeesRaw?.[0]?.nombre ?? null;
          const buyerRut = d?.buyerRut ?? d?.attendee?.rut ?? d?.attendeesRaw?.[0]?.rut ?? null;
          const eventName = d?.eventName ?? null;
          // Try multiple possible shapes for start date
          let eventStart: string | null = d?.eventStart ?? null;
          if (!eventStart) {
            const raw = d?.event?.start ?? d?.schedule?.start ?? null;
            if (typeof raw === 'string') eventStart = raw;
            else if (raw?.toDate) eventStart = raw.toDate().toISOString();
            else if (typeof raw?.seconds === 'number') eventStart = new Date(raw.seconds * 1000).toISOString();
          }

          setResult((prev) => {
            if (!prev || !prev.ticket) return prev;
            return {
              ...prev,
              ticket: {
                ...prev.ticket,
                buyerName: prev.ticket.buyerName || buyerName || null,
                buyerRut: prev.ticket.buyerRut || buyerRut || null,
                eventName: prev.ticket.eventName || eventName || null,
                eventStart: prev.ticket.eventStart || eventStart || null,
              },
            };
          });
          setHydratedTicketFor(tid);
        }
      } catch (err) {
        console.warn('No se pudo hidratar datos del ticket', err);
      }
    })();
  }, [result?.ticket?.id, result?.ticket?.buyerName, result?.ticket?.buyerRut, result?.ticket?.eventName, result?.ticket?.eventStart, hydratedTicketFor]);

  async function doLookup(c: string) {
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const url = `${API_BASE}/api/tickets/lookup?code=${encodeURIComponent(c.trim())}`;
      const r = await fetch(url);
      const data = (await r.json()) as Lookup;
      setResult(data);
      if (!data.ok) setMsg(data.error || "No encontrado");
    } catch (e: any) {
      setMsg(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  async function doCheckin(c: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/tickets/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setMsg("✅ Ticket marcado como UTILIZADO");
        // refrescar estado
        doLookup(c);
      } else {
        setMsg(`⚠️ ${data?.error || "No se pudo marcar"}`);
      }
    } catch (e: any) {
      setMsg(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  function doClear() {
    setCode("");
    setResult(null);
    setMsg(null);
  }

  const prettyStatus = result?.ticket?.status === 'used' ? 'Utilizado' : (result?.ticket?.status === 'valid' ? 'Valido' : (result?.ticket?.status === 'void' ? 'Anulado' : '—'));

  return (
    <main className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-3">Check-in de tickets</h1>

      <div className="rounded-lg border border-white/10 p-3 mb-4">
        <div className="text-sm mb-2">Escanear con cámara (si está disponible)</div>
        <video ref={videoRef} className="w-full rounded bg-black/40" playsInline muted />
        <div className="mt-2 text-xs text-white/60">
          {scanning ? "Escaneando…" : "Si tu navegador lo permite, al apuntar al QR se completará el código automáticamente."}
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 px-3 py-2 rounded-md bg-black/40 border border-white/10"
          placeholder="Pega o escanea el código del QR"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15" disabled={!code || busy} onClick={() => doLookup(code)}>
          Buscar
        </button>
        <button className="px-3 py-2 rounded-md bg-emerald-500/80 hover:bg-emerald-500 disabled:opacity-50" disabled={!code || busy} onClick={() => doCheckin(code)}>
          Check-in
        </button>
      </div>

      {msg && <div className="mb-3 text-sm">{msg}</div>}

      {result?.ok && result.ticket && (
        <div className="rounded-lg border border-white/10 p-3 text-sm">
          <div><b>Evento:</b> {result.ticket.eventName || "—"}</div>
          <div><b>ID:</b> {result.ticket.id}</div>
          <div><b>Estado:</b> {prettyStatus}</div>
          {result.ticket.usedAt ? <div><b>Usado:</b> {new Date(result.ticket.usedAt).toLocaleString("es-CL")}</div> : null}
          <div><b>Comprador:</b> {result.ticket.buyerName || "—"}</div>
          <div><b>RUT:</b> {result.ticket.buyerRut || "—"}</div>
          <div><b>Fecha del evento:</b> {result.ticket.eventStart ? new Date(result.ticket.eventStart).toLocaleString('es-CL') : '—'}</div>
          <div className="text-white/70 mt-2">
            <div>Orden: {result.ticket.orderId || "—"}</div>
            <div>Evento: {result.ticket.eventId || "—"}</div>
            <div>Tipo ticket: {result.ticket.ticketTypeId || "—"}</div>
          </div>
        </div>
      )}

      <button className="mt-3 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15" onClick={doClear}>
        Limpiar
      </button>
    </main>
  );
}