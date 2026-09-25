// Web Push (RFC 8030/8291/8188) autocontenido sobre Web Crypto (Deno).
// Implementa el cifrado aes128gcm del payload y el JWT VAPID (ES256), sin
// dependencias externas, para enviar notificaciones a un endpoint de push.
//
// Uso:
//   await sendWebPush(subscription, JSON.stringify(payload), {
//     vapidPublic, vapidPrivate, subject: "mailto:soporte@wayrapos.pe",
//   });
//
// Claves VAPID: par ECDSA P-256. vapidPublic en base64url (65 bytes, sin comprimir),
// vapidPrivate en base64url (32 bytes, el escalar d). Generables con web-push o
// con generateVapidKeys() de abajo.

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidOptions {
  vapidPublic: string;
  vapidPrivate: string;
  subject: string; // mailto: o https://
  ttl?: number;
}

// ---------------------------------------------------------------------------
// base64url helpers
// ---------------------------------------------------------------------------
export function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64url(b: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// HKDF (SHA-256)
// ---------------------------------------------------------------------------
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ---------------------------------------------------------------------------
// VAPID JWT (ES256)
// ---------------------------------------------------------------------------
function derToJose(der: Uint8Array): Uint8Array {
  // Convierte firma ECDSA DER a JOSE (r||s de 32 bytes cada uno).
  let offset = 3;
  const rLen = der[offset];
  offset += 1;
  let r = der.slice(offset, offset + rLen);
  offset += rLen + 1;
  const sLen = der[offset];
  offset += 1;
  let s = der.slice(offset, offset + sLen);
  const trim = (x: Uint8Array) => (x.length > 32 ? x.slice(x.length - 32) : x);
  const pad = (x: Uint8Array) => {
    x = trim(x);
    if (x.length === 32) return x;
    const out = new Uint8Array(32);
    out.set(x, 32 - x.length);
    return out;
  };
  r = pad(r);
  s = pad(s);
  return concat(r, s);
}

async function importVapidPrivate(vapidPublic: string, vapidPrivate: string): Promise<CryptoKey> {
  // JWK a partir de la clave pública (x,y) y privada (d).
  const pub = b64urlToBytes(vapidPublic); // 65 bytes: 0x04 || x(32) || y(32)
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d: vapidPrivate,
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function makeVapidJwt(audience: string, opts: VapidOptions): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: opts.subject };
  const enc = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const key = await importVapidPrivate(opts.vapidPublic, opts.vapidPrivate);
  const der = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned)),
  );
  // Web Crypto ya devuelve JOSE (raw) en algunos runtimes; detecta DER (empieza 0x30).
  const sig = der[0] === 0x30 ? derToJose(der) : der;
  return `${unsigned}.${bytesToB64url(sig)}`;
}

// ---------------------------------------------------------------------------
// Cifrado del payload (aes128gcm, RFC 8291)
// ---------------------------------------------------------------------------
async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  // Par efímero ECDH del emisor (as = application server).
  const asPair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asPair.publicKey)); // 65 bytes

  // Clave pública del cliente (ua = user agent).
  const uaPublic = await crypto.subtle.importKey(
    "raw",
    p256dh,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublic }, asPair.privateKey, 256),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK combinado con el auth secret (RFC 8291 §3.4).
  const authInfo = new TextEncoder().encode("WebPush: info\0");
  const keyInfo = concat(authInfo, p256dh, asPublicRaw);
  const ikm = await hkdf(authSecret, sharedBits, keyInfo, 32);

  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Registro único: plaintext || 0x02 (delimitador de último registro).
  const record = concat(plaintext, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, record),
  );

  // Cabecera de contenido aes128gcm: salt(16) || rs(4, big-endian) || idlen(1) || keyid(as_public).
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  return concat(header, ct);
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------
export interface SendResult {
  ok: boolean;
  status: number;
  endpoint: string;
  gone?: boolean; // 404/410: la suscripción caducó, hay que borrarla
  error?: string;
}

export async function sendWebPush(
  sub: PushSubscription,
  payload: string,
  opts: VapidOptions,
): Promise<SendResult> {
  try {
    const url = new URL(sub.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt = await makeVapidJwt(audience, opts);

    const body = await encryptPayload(
      new TextEncoder().encode(payload),
      b64urlToBytes(sub.keys.p256dh),
      b64urlToBytes(sub.keys.auth),
    );

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: String(opts.ttl ?? 2419200),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: `vapid t=${jwt}, k=${opts.vapidPublic}`,
      },
      body,
    });
    const gone = res.status === 404 || res.status === 410;
    return {
      ok: res.ok,
      status: res.status,
      endpoint: sub.endpoint,
      gone,
      error: res.ok ? undefined : `${res.status} ${await res.text().catch(() => "")}`.trim(),
    };
  } catch (e) {
    return { ok: false, status: 0, endpoint: sub.endpoint, error: String((e as Error).message ?? e) };
  }
}

/** Genera un par de claves VAPID (para configurar el proyecto una sola vez). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: bytesToB64url(pubRaw), privateKey: jwk.d as string };
}
