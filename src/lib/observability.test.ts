import { describe, it, expect } from "vitest";
import { scrub } from "./observability";

describe("observabilidad sin datos personales", () => {
  it("oculta correos, RUC, DNI y celulares", () => {
    expect(scrub("fallo para ana.ruiz@gmail.com")).toBe("fallo para [correo]");
    expect(scrub("RUC 20601234567 inválido")).toBe("RUC [ruc] inválido");
    expect(scrub("DNI 45678912")).toBe("DNI [dni]");
    expect(scrub("cel 987654321")).toBe("cel [telefono]");
    expect(scrub("Mesa 12 · S/ 45.50")).toBe("Mesa 12 · S/ 45.50");
  });
});
