import { describe, it, expect } from "vitest";
import { b64urlToBytes, bytesToB64url, generateVapidKeys, makeVapidJwt } from "./webpush.ts";

describe("webpush — base64url", () => {
  it("round-trip de bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
    const s = bytesToB64url(bytes);
    expect(s).not.toContain("+");
    expect(s).not.toContain("/");
    expect(s).not.toContain("=");
    expect(Array.from(b64urlToBytes(s))).toEqual(Array.from(bytes));
  });

  it("decodifica una clave VAPID pública de 65 bytes", async () => {
    const { publicKey } = await generateVapidKeys();
    const raw = b64urlToBytes(publicKey);
    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(0x04); // punto sin comprimir
  });
});

describe("webpush — JWT VAPID", () => {
  it("genera un JWT ES256 con 3 segmentos y claims correctos", async () => {
    const { publicKey, privateKey } = await generateVapidKeys();
    const jwt = await makeVapidJwt("https://fcm.googleapis.com", {
      vapidPublic: publicKey,
      vapidPrivate: privateKey,
      subject: "mailto:soporte@wayrapos.pe",
    });
    const parts = jwt.split(".");
    expect(parts.length).toBe(3);
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe("JWT");
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:soporte@wayrapos.pe");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    // La firma JOSE de ES256 son 64 bytes.
    expect(b64urlToBytes(parts[2]).length).toBe(64);
  });
});
