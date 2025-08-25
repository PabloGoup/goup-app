// src/pages/CheckIn.tsx
import React, { useEffect, useRef, useState } from "react";

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
  };
  error?: string;
};

export default function CheckIn() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<Lookup | null>(null);

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
        setMsg("✅ Ticket marcado como USADO");
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
          <div><b>ID:</b> {result.ticket.id}</div>
          <div><b>Estado:</b> {result.ticket.status}</div>
          {result.ticket.usedAt ? <div><b>Usado:</b> {new Date(result.ticket.usedAt).toLocaleString("es-CL")}</div> : null}
          <div className="text-white/70 mt-2">
            <div>Orden: {result.ticket.orderId || "—"}</div>
            <div>Evento: {result.ticket.eventId || "—"}</div>
            <div>Tipo ticket: {result.ticket.ticketTypeId || "—"}</div>
          </div>
        </div>
      )}
    </main>
  );
}