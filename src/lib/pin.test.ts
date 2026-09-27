import { describe, it, expect, beforeEach } from "vitest";
import { matchPin, pinVerifier, pinLockSeconds, registerPinFailure, resetPinFailures } from "./pin";

describe("PIN del personal (verificación sin internet)", () => {
  it("el verificador no contiene el PIN y depende de la persona", async () => {
    const a = await pinVerifier("1234", "staff-a");
    const b = await pinVerifier("1234", "staff-b");
    expect(a).toMatch(/^pbkdf2\$60000\$/);
    expect(a).not.toContain("1234");
    expect(a).not.toBe(b); // misma clave, distinta persona → distinto verificador
  });

  it("identifica a quién pertenece el PIN", async () => {
    const staff = [
      { id: "ana", name: "Ana", verifier: await pinVerifier("3333", "ana") },
      { id: "sin-pin", name: "Luis", verifier: null },
      { id: "carlos", name: "Carlos", verifier: await pinVerifier("4444", "carlos") },
    ];
    expect((await matchPin("4444", staff))?.name).toBe("Carlos");
    expect(await matchPin("9999", staff)).toBeNull();
  });

  describe("bloqueo por intentos", () => {
    const store = new Map<string, string>();
    beforeEach(() => {
      store.clear();
      globalThis.localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      } as Storage;
      resetPinFailures();
    });

    it("4 fallos no bloquean; el 5.º bloquea 30 s y luego crece", () => {
      const t = 1_000_000;
      for (let i = 0; i < 4; i++) expect(registerPinFailure(t)).toBe(0);
      expect(registerPinFailure(t)).toBe(30);
      expect(pinLockSeconds(t + 29_000)).toBe(1);
      expect(pinLockSeconds(t + 30_000)).toBe(0);
      expect(registerPinFailure(t + 31_000)).toBe(60);
    });
  });
});
