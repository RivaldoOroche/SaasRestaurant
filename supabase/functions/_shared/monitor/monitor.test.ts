import { describe, it, expect, vi, afterEach } from "vitest";
import { buildEnvelope, envelopeUrl, parseDsn, withMonitoring } from "./index";

const DSN = "https://abc123@o42.ingest.sentry.io/777";

afterEach(() => {
  delete (globalThis as { Deno?: unknown }).Deno;
});

function fakeDeno(vars: Record<string, string>) {
  (globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => vars[k] } };
}

describe("monitoreo de Edge Functions", () => {
  it("interpreta el DSN y arma la URL de envelopes", () => {
    const d = parseDsn(DSN)!;
    expect(d).toEqual({ key: "abc123", host: "o42.ingest.sentry.io", projectId: "777", protocol: "https" });
    expect(envelopeUrl(d)).toBe("https://o42.ingest.sentry.io/api/777/envelope/?sentry_key=abc123&sentry_version=7");
    expect(parseDsn("no-es-url")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
  });

  it("el envelope no lleva datos personales", () => {
    const body = buildEnvelope(parseDsn(DSN)!, { fn: "sunat-emitir", message: "RUC 20601234567 de ana@x.pe", level: "error", method: "POST", path: "/sunat-emitir" });
    const [header, item, event] = body.trim().split("\n").map((l) => JSON.parse(l));
    expect(header.dsn).toContain("abc123@");
    expect(item.type).toBe("event");
    expect(event.exception.values[0].value).toBe("RUC [ruc] de [correo]");
    expect(event.tags.function).toBe("sunat-emitir");
  });

  it("reporta 5xx y excepciones; deja pasar el resto", async () => {
    fakeDeno({ SENTRY_DSN: DSN });
    const sent: string[] = [];
    const spy = async (b: string) => void sent.push(b);
    const ok = withMonitoring("f", async () => new Response("{}", { status: 200 }), spy);
    const bad = withMonitoring("f", async () => new Response(JSON.stringify({ error: "SUNAT caído" }), { status: 502 }), spy);
    const boom = withMonitoring("f", async () => { throw new Error("kaboom"); }, spy);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const req = () => new Request("https://x.functions.supabase.co/f", { method: "POST" });
    expect((await ok(req())).status).toBe(200);
    expect((await bad(req())).status).toBe(502);
    const r = await boom(req());
    expect(r.status).toBe(500);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("SUNAT caído");
    expect(sent[1]).toContain("kaboom");
  });

  it("sin SENTRY_DSN no envía nada", async () => {
    fakeDeno({});
    const spy = vi.fn(async () => {});
    await withMonitoring("f", async () => new Response("x", { status: 500 }), spy)(new Request("https://x/f"));
    expect(spy).not.toHaveBeenCalled();
  });
});
