// /api/tickets/lookup.ts
export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
  
    const code = req.query.code;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing code' });
      return;
    }
  
    // BACKEND_BASE: define esta env en Vercel (por ahora tu ngrok https o tu API real)
    const base = process.env.BACKEND_BASE;
    if (!base) {
      res.status(500).json({ error: 'Missing BACKEND_BASE env' });
      return;
    }
  
    try {
      const r = await fetch(`${base}/api/tickets/lookup?code=${encodeURIComponent(code)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const text = await r.text();
      // Intenta parsear JSON; si viene HTML, propaga error legible
      try {
        const json = JSON.parse(text);
        res.status(r.status).json(json);
      } catch {
        res.status(502).json({ error: 'Upstream did not return JSON', body: text.slice(0, 500) });
      }
    } catch (err: any) {
      res.status(502).json({ error: 'Upstream fetch failed', message: err?.message });
    }
  }