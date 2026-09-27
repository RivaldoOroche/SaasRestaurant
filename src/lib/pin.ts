// PIN del personal: verificación local (funciona sin internet).
//
// El equipo del local queda vinculado con la cuenta del dueño; el personal
// entra y cambia de turno con un PIN de 4 dígitos. Para verificarlo sin red,
// el equipo guarda un verificador PBKDF2-SHA256 (sal = id del trabajador,
// 60 000 iteraciones), nunca el PIN. Tras varios intentos fallidos el teclado
// se bloquea con espera creciente para frenar pruebas a ciegas.

const ITERATIONS = 60_000;
const enc = new TextEncoder();

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export async function pinVerifier(pin: string, staffId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(`wayra-pin:${staffId}`), iterations: ITERATIONS },
    key,
    256,
  );
  return `pbkdf2$${ITERATIONS}$${toB64(bits)}`;
}

export interface PinCandidate {
  id: string;
  verifier: string | null;
}

/** Devuelve el trabajador cuyo PIN coincide, o null. */
export async function matchPin<T extends PinCandidate>(pin: string, staff: T[]): Promise<T | null> {
  for (const s of staff) {
    if (s.verifier && (await pinVerifier(pin, s.id)) === s.verifier) return s;
  }
  return null;
}

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

/**
 * Cada PIN identifica a UNA persona: si dos compartieran PIN, al ingresar
 * entraría siempre la primera. Lanza un error legible si ya está en uso.
 */
export async function assertPinFree(pin: string, others: (PinCandidate & { name: string })[], exceptId?: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error("El PIN debe tener 4 dígitos.");
  const taken = await matchPin(pin, others.filter((o) => o.id !== exceptId));
  if (taken) throw new Error(`Ese PIN ya lo usa ${taken.name}. Elige otro.`);
}

// ---- Bloqueo por intentos fallidos (por equipo) ----
const KEY = "wayra-pin-fails";
const FREE_ATTEMPTS = 5;

interface Fails {
  count: number;
  until: number;
}

function read(): Fails {
  try {
    return { count: 0, until: 0, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Fails>) };
  } catch {
    return { count: 0, until: 0 };
  }
}
function write(f: Fails) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

/** Segundos que faltan para poder intentar de nuevo (0 = libre). */
export function pinLockSeconds(now = Date.now()): number {
  return Math.max(0, Math.ceil((read().until - now) / 1000));
}

/** Registra un fallo; desde el 5.º bloquea 30 s, luego 60, 120… (máx. 15 min). */
export function registerPinFailure(now = Date.now()): number {
  const f = read();
  f.count += 1;
  if (f.count >= FREE_ATTEMPTS) {
    const secs = Math.min(900, 30 * 2 ** (f.count - FREE_ATTEMPTS));
    f.until = now + secs * 1000;
  }
  write(f);
  return pinLockSeconds(now);
}

export function resetPinFailures() {
  write({ count: 0, until: 0 });
}
