import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/tickets/lookup?code=...
 * Proxies the request to the upstream Flow/Backend defined by BACKEND_BASE
 * and returns the JSON payload to the client.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const code = (req.query.code as string) || '';
    if (!code) {
      res.status(400).json({ ok: false, error: 'Missing "code" query param' });
      return;
    }

    const base = process.env.BACKEND_BASE;
    if (!base) {
      res.status(500).json({ ok: false, error: 'BACKEND_BASE not configured' });
      return;
    }

    const url = `${base.replace(/\/$/, '')}/api/tickets/lookup?code=${encodeURIComponent(code)}`;

    const upstream = await fetch(url, {
      headers: {
        'accept': 'application/json',
      },
    });

    const contentType = upstream.headers.get('content-type') || '';
    const status = upstream.status;

    // Ensure we only pass-through JSON
    if (!contentType.includes('application/json')) {
      const text = await upstream.text().catch(() => '');
      res.status(502).json({ ok: false, error: 'Upstream did not return JSON', status, preview: text.slice(0, 200) });
      return;
    }

    const data = await upstream.json();
    res.status(status).json(data);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Unexpected error' });
  }
}