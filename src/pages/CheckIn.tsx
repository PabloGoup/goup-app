// src/pages/CheckIn.tsx
import React, { useEffect, useRef, useState } from "react";
import { getFirestore, doc, getDoc } from "firebase/firestore";

// ========= CONFIG =========
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_FLOW_SERVER_BASE ||
  "http://localhost:8788";

// Lookup response shape
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
  // UI state
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<Lookup | null>(null);

  // Hydration helpers (fetch extra data if missing)
  const [hydratedEventDateFor, setHydratedEventDateFor] = useState<string | null>(null);
  const [hydratedTicketFor, setHydratedTicketFor] = useState<string | null>(null);

  // ====== CAMERA / SCANNER STATE ======
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const usingDetectorRef = useRef<boolean>(false);
  const zxingReaderRef = useRef<any>(null);
  const [scanning, setScanning] = useState(false);
  const lastScannedRef = useRef<string | null>(null);

  // --- helpers to stop everything ---
  function stopScanner() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset();
      } catch {}
      zxingReaderRef.current = null;
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      streamRef.current = null;
    }
    setScanning(false);
  }

  // --- main start logic; supports iOS/Android/desktop ---
  async function startScanner() {
    try {
      stopScanner();

      // Request camera (rear if available)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      // Attach to <video>
      if (!videoRef.current) return;
      const video = videoRef.current;
      video.setAttribute("playsinline", ""); // iOS Safari needs this
      video.muted = true;
      video.srcObject = stream;
      await video.play();

      // Prefer native BarcodeDetector when available
      // @ts-ignore
      const hasDetector = typeof window !== "undefined" && !!(window as any).BarcodeDetector;
      if (hasDetector) {
        usingDetectorRef.current = true;
        // @ts-ignore
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const loop = async () => {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes && barcodes.length) {
              const raw = barcodes[0].rawValue || barcodes[0].raw || "";
              if (raw && raw !== lastScannedRef.current) {
                lastScannedRef.current = raw;
                setCode(raw); // overwrite previous code
              }
            }
          } catch {}
          rafRef.current = requestAnimationFrame(loop);
        };
        setScanning(true);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Fallback: ZXing for iOS Safari & older Android
      usingDetectorRef.current = false;
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      zxingReaderRef.current = reader;
      setScanning(true);
      await reader.decodeFromVideoDevice(
        undefined,
        video,
        (res) => {
          if (res) {
            const text = res.getText();
            if (text && text !== lastScannedRef.current) {
              lastScannedRef.current = text;
              setCode(text);
            }
          }
        }
      );
    } catch (e) {
      console.warn("No se pudo inicializar la cámara", e);
     
    }
  }

  // Start on mount; keep active. Do NOT stop after check-in.
  useEffect(() => {
    startScanner();
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== HYDRATE EVENT DATE (if missing) ======
  useEffect(() => {
    (async () => {
      const evId = result?.ticket?.eventId;
      const missing = !result?.ticket?.eventStart && !!evId;
      if (!missing) return;
      if (hydratedEventDateFor === evId) return;
      try {
        const db = getFirestore();
        const ref = doc(db, "evento", evId!);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d: any = snap.data();
          let raw = d?.start ?? d?.fechaInicio ?? d?.dateStart ?? d?.startDate ?? d?.schedule?.start ?? null;
          let iso: string | null = null;
          if (raw) {
            if (typeof raw === "string") iso = raw;
            else if (raw?.toDate) iso = raw.toDate().toISOString();
            else if (typeof raw?.seconds === "number") iso = new Date(raw.seconds * 1000).toISOString();
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

  // ====== HYDRATE TICKET FIELDS (buyer, event name) IF MISSING ======
  useEffect(() => {
    (async () => {
      const tid = result?.ticket?.id;
      if (!tid) return;
      const needsBuyer = !result?.ticket?.buyerName || !result?.ticket?.buyerRut || !result?.ticket?.eventName || !result?.ticket?.eventStart;
      if (!needsBuyer) return;
      if (hydratedTicketFor === tid) return;
      try {
        const db = getFirestore();
        const ref = doc(db, "tickets", tid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d: any = snap.data();
          const buyerName = d?.buyerName ?? d?.attendee?.nombre ?? d?.attendeesRaw?.[0]?.nombre ?? null;
          const buyerRut = d?.buyerRut ?? d?.attendee?.rut ?? d?.attendeesRaw?.[0]?.rut ?? null;
          const eventName = d?.eventName ?? null;
          let eventStart: string | null = d?.eventStart ?? null;
          if (!eventStart) {
            const raw = d?.event?.start ?? d?.schedule?.start ?? null;
            if (typeof raw === "string") eventStart = raw;
            else if (raw?.toDate) eventStart = raw.toDate().toISOString();
            else if (typeof raw?.seconds === "number") eventStart = new Date(raw.seconds * 1000).toISOString();
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
        console.warn("No se pudo hidratar datos del ticket", err);
      }
    })();
  }, [result?.ticket?.id, result?.ticket?.buyerName, result?.ticket?.buyerRut, result?.ticket?.eventName, result?.ticket?.eventStart, hydratedTicketFor]);

  // ====== API: lookup & checkin ======
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
        // Refresh; camera remains ON
        await doLookup(c);
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
    lastScannedRef.current = null;
  }

  const prettyStatus =
    result?.ticket?.status === "used"
      ? "Utilizado"
      : result?.ticket?.status === "valid"
      ? "Valido"
      : result?.ticket?.status === "void"
      ? "Anulado"
      : "—";

  return (
    <main className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-3">Check-in de tickets</h1>

      <div className="rounded-lg border border-white/10 p-3 mb-4">
        <div className="text-sm mb-2">Escanear con cámara (si está disponible)</div>
        <video ref={videoRef} className="w-full rounded bg-black/40" playsInline muted />
        <div className="mt-2 flex gap-2">
          {!scanning ? (
            <button className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15" onClick={startScanner}>Iniciar cámara</button>
          ) : (
            <button className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15" onClick={startScanner}>Reiniciar cámara</button>
          )}
          <button className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15" onClick={stopScanner}>Detener cámara</button>
        </div>
        <div className="mt-2 text-xs text-white/60">
          {scanning
            ? "Escaneando… (apunta el QR y el código se completará)"
            : "La cámara está detenida. Puedes iniciarla nuevamente cuando quieras."}
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
          <button className="mt-3 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15" onClick={doClear}>Limpiar</button>
        </div>
      )}
    </main>
  );
}