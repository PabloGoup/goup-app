// src/api/submit.ts
export async function post(req: Request): Promise<Response> {
    const body = await req.json();
    console.log("Datos recibidos del formulario:", body);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }