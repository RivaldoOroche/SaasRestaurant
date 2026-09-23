import { describe, it, expect, vi, afterEach } from "vitest";
import { cobrarTarjeta } from "./gateway.ts";

const input = { amountCents: 5900, currency: "PEN", email: "a@b.pe", token: "tok_test", description: "Mesa 5" };

afterEach(() => vi.restoreAllMocks());

describe("cobrarTarjeta — enrutado por proveedor", () => {
  it("Culqi: cobra con la llave secreta y devuelve el chargeId", async () => {
    const fetchMock = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      expect(url).toContain("culqi.com");
      expect(init.headers.Authorization).toBe("Bearer sk_test_x");
      return { ok: true, status: 200, json: async () => ({ id: "chr_123" }) };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const res = await cobrarTarjeta({ provider: "culqi", secretKey: "sk_test_x" }, input);
    expect(res).toEqual({ success: true, chargeId: "chr_123", provider: "culqi" });
  });

  it("Culqi: propaga el mensaje de error del proveedor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 402, json: async () => ({ user_message: "Tarjeta rechazada" }) })) as unknown as typeof fetch,
    );
    const res = await cobrarTarjeta({ provider: "culqi", secretKey: "sk_test_x" }, input);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Tarjeta rechazada");
  });

  it("Izipay: exige código de tienda y password de API", async () => {
    const res = await cobrarTarjeta({ provider: "izipay" }, input);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Izipay");
  });

  it("Niubiz: autoriza y devuelve el TRANSACTION_ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ dataMap: { STATUS: "Authorized", TRANSACTION_ID: "999" } }) })) as unknown as typeof fetch,
    );
    const res = await cobrarTarjeta({ provider: "niubiz", merchantId: "300123", secretKey: "bearer_x" }, input);
    expect(res).toEqual({ success: true, chargeId: "999", provider: "niubiz" });
  });

  it("Proveedor desconocido: error claro", async () => {
    const res = await cobrarTarjeta({ provider: "otro" }, input);
    expect(res.success).toBe(false);
    expect(res.error).toContain("no soportado");
  });
});
