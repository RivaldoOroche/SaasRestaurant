// Monitoreo de Edge Functions sin dependencias: envía a Sentry (API de
// "envelopes") los errores no controlados y las respuestas 5xx.
// Se activa con el secret SENTRY_DSN; sin él no hace nada.
// No se envían cuerpos de petición ni cabeceras (pueden llevar datos personales
// o credenciales): solo función, método, ruta, estado y el mensaje de error.

type Handler = (req: Request) => Promise<Response>;

export interface Dsn {
  key: string;
  host: string;
  projectId: string;
  protocol: string;
}

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return { key: u.username, host: u.host, projectId, protocol: u.protocol.replace(":", "") };
  } catch {
    return null;
  }
}

export function envelopeUrl(d: Dsn): string {
  return `${d.protocol}://${d.host}/api/${d.projectId}/envelope/?sentry_key=${d.key}&sentry_version=7`;
}

const redact = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/\b\d{11}\b/g, "[ruc]")
    .replace(/\b\d{8}\b/g, "[dni]");

export function buildEnvelope(
  d: Dsn,
  ev: { fn: string; message: string; stack?: string; level: "error" | "warning"; method: string; path: string; status?: number; release?: string; environment?: string },
  now = new Date(),
): string {
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: ev.level,
    server_name: `edge:${ev.fn}`,
    release: ev.release,
    environment: ev.environment ?? "production",
    transaction: `${ev.method} /${ev.fn}`,
    tags: { function: ev.fn, status: String(ev.status ?? "") },
    exception: {
      values: [
        {
          type: ev.status ? `HTTP ${ev.status}` : "Error",
          value: redact(ev.message).slice(0, 1000),
          stacktrace: ev.stack ? { frames: ev.stack.split("\n").slice(1, 15).map((l) => ({ function: l.trim() })).reverse() } : undefined,
        },
      ],
    },
    request: { method: ev.method, url: ev.path },
  };
  const header = { event_id: eventId, sent_at: now.toISOString(), dsn: `${d.protocol}://${d.key}@${d.host}/${d.projectId}` };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
}

type Env = { get(k: string): string | undefined };
const env = (): Env | undefined => (globalThis as { Deno?: { env: Env } }).Deno?.env;

async function send(body: string, d: Dsn) {
  try {
    await fetch(envelopeUrl(d), { method: "POST", body, headers: { "Content-Type": "application/x-sentry-envelope" } });
  } catch {
    /* el monitoreo nunca rompe la función */
  }
}

/** Envuelve el handler: captura excepciones y respuestas 5xx. */
export function withMonitoring(fn: string, handler: Handler, fetchImpl?: (body: string, d: Dsn) => Promise<void>): Handler {
  return async (req) => {
    const dsn = parseDsn(env()?.get("SENTRY_DSN"));
    const path = new URL(req.url).pathname;
    const base = { fn, method: req.method, path, release: env()?.get("APP_VERSION"), environment: env()?.get("APP_ENV") };
    const report = (b: string) => (dsn ? (fetchImpl ?? send)(b, dsn) : Promise.resolve());
    try {
      const res = await handler(req);
      if (res.status >= 500 && dsn) {
        const text = await res.clone().text().catch(() => "");
        let message = text;
        try {
          message = (JSON.parse(text) as { error?: string }).error ?? text;
        } catch {
          /* cuerpo no JSON */
        }
        await report(buildEnvelope(dsn, { ...base, level: "error", status: res.status, message: message || `HTTP ${res.status}` }));
      }
      return res;
    } catch (e) {
      const err = e as Error;
      console.error(`[${fn}]`, err);
      if (dsn) await report(buildEnvelope(dsn, { ...base, level: "error", message: err?.message ?? String(e), stack: err?.stack }));
      return new Response(JSON.stringify({ error: "Error interno. Ya fue reportado." }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  };
}
