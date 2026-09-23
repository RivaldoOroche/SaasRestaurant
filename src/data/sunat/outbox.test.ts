import { describe, it, expect } from "vitest";
import { decideEmission, backoffMs, SUNAT_MAX_ATTEMPTS } from "./outbox";

describe("decideEmission — cola SUNAT con reintentos", () => {
  it("acepta y no cuenta intentos", () => {
    const d = decideEmission({ accepted: true }, 3);
    expect(d.action).toBe("accept");
    expect(d.status).toBe("aceptada");
    expect(d.error).toBeNull();
  });

  it("rechaza de inmediato un error definitivo (no transitorio)", () => {
    const d = decideEmission({ accepted: false, transient: false, error: "RUC inválido" }, 0);
    expect(d.action).toBe("reject");
    expect(d.status).toBe("rechazada");
    expect(d.error).toBe("RUC inválido");
  });

  it("reintenta con backoff un fallo transitorio", () => {
    const now = 1_000_000;
    const d = decideEmission({ accepted: false, transient: true, error: "timeout" }, 1, now);
    expect(d.action).toBe("retry");
    expect(d.status).toBe("encola");
    expect(d.attempts).toBe(2);
    expect(d.nextAttemptAt).toBe(new Date(now + backoffMs(2)).toISOString());
  });

  it("trata como transitorio cuando transient es indefinido", () => {
    const d = decideEmission({ accepted: false, error: "respuesta rara" }, 0);
    expect(d.action).toBe("retry");
  });

  it("rechaza al agotar los reintentos máximos", () => {
    const d = decideEmission({ accepted: false, transient: true, error: "timeout" }, SUNAT_MAX_ATTEMPTS - 1);
    expect(d.action).toBe("reject");
    expect(d.status).toBe("rechazada");
    expect(d.error).toContain("Reintentos agotados");
  });

  it("backoff es exponencial y tiene tope de 6 h", () => {
    expect(backoffMs(1)).toBe(120_000); // 2 min
    expect(backoffMs(2)).toBe(240_000); // 4 min
    expect(backoffMs(3)).toBe(480_000); // 8 min
    expect(backoffMs(20)).toBe(6 * 3_600_000); // tope 6 h
  });
});
