import { describe, it, expect, vi, afterEach } from "vitest";
import { emitirComprobante } from "./emisor.ts";
import type { EmisorConfig } from "./emisor.ts";
import type { Comprobante } from "./types.ts";

const comp: Comprobante = {
  tipo: "03",
  serie: "B001",
  correlativo: "123",
  fechaEmision: "2026-09-23",
  moneda: "PEN",
  igvTasa: 0.18,
  emisor: { ruc: "20512345678", razonSocial: "DEMO SAC", direccion: "AV", ubigeo: "150122" },
  cliente: { tipoDoc: "-", numDoc: "-", nombre: "CLIENTES VARIOS" },
  items: [{ descripcion: "Ceviche", cantidad: 2, valorUnitario: 25 }],
};

afterEach(() => vi.restoreAllMocks());

describe("emisor — proveedor Nubefact", () => {
  it("mapea tipos SUNAT a códigos Nubefact y normaliza la respuesta aceptada", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      sentBody = JSON.parse(init.body);
      expect(init.headers.Authorization).toBe("tok_123");
      return {
        json: async () => ({
          aceptada_por_sunat: true,
          sunat_description: "La Boleta numero B001-123, ha sido aceptada",
          enlace_del_pdf: "https://nubefact.com/pdf",
          cadena_para_codigo_qr: "20512345678|03|B001|123",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const cfg: EmisorConfig = {
      provider: "nubefact",
      mode: "produccion",
      ruc: "20512345678",
      solUser: "",
      solPass: "",
      endpoint: "https://api.nubefact.com/api/v1/xxx",
      apiToken: "tok_123",
    };
    const res = await emitirComprobante(comp, undefined, cfg);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sentBody.tipo_de_comprobante).toBe(2); // boleta
    expect(sentBody.serie).toBe("B001");
    expect(sentBody.numero).toBe(123);
    expect(sentBody.total_gravada).toBe(50); // 2 * 25
    expect(sentBody.total_igv).toBe(9); // 50 * 0.18
    expect(sentBody.total).toBe(59);
    expect(res.accepted).toBe(true);
    expect(res.pdfUrl).toBe("https://nubefact.com/pdf");
    expect(res.qr).toContain("B001");
  });

  it("propaga los errores de Nubefact como no aceptado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ errors: "El comprobante ya existe" }) })) as unknown as typeof fetch,
    );
    const cfg: EmisorConfig = {
      provider: "nubefact",
      mode: "produccion",
      ruc: "20512345678",
      solUser: "",
      solPass: "",
      endpoint: "https://api.nubefact.com/api/v1/xxx",
      apiToken: "tok_123",
    };
    const res = await emitirComprobante(comp, undefined, cfg);
    expect(res.accepted).toBe(false);
    expect(res.description).toContain("ya existe");
  });

  it("falla con code 'config' si falta el endpoint/token", async () => {
    const cfg: EmisorConfig = {
      provider: "nubefact",
      mode: "produccion",
      ruc: "20512345678",
      solUser: "",
      solPass: "",
    };
    const res = await emitirComprobante(comp, undefined, cfg);
    expect(res.accepted).toBe(false);
    expect(res.code).toBe("config");
  });
});

describe("emisor — OSE (efact/bizlinks)", () => {
  it("exige endpoint del OSE antes de firmar", async () => {
    const cfg: EmisorConfig = {
      provider: "efact",
      mode: "produccion",
      ruc: "20512345678",
      solUser: "USER",
      solPass: "PASS",
      certPem: "x",
      keyPem: "y",
    };
    const res = await emitirComprobante(comp, undefined, cfg);
    expect(res.accepted).toBe(false);
    expect(res.code).toBe("config");
    expect(res.description).toContain("efact");
  });
});
