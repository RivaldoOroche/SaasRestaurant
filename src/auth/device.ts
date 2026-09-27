// Vinculación del equipo del local. El dueño (o gerente) ingresa una vez con
// correo y contraseña; desde entonces el equipo queda asociado a su restaurante
// y el personal entra y cambia de turno con su PIN, con o sin internet.
// "Bloquear" vuelve al teclado de PIN sin cerrar la sesión del equipo;
// "Desvincular" cierra la sesión por completo.
export interface DevicePairing {
  tenantId: string;
  tenantName: string | null;
  email: string | null;
}

const KEY = "wayra-device-pairing";

export function getPairing(): DevicePairing | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DevicePairing) : null;
  } catch {
    return null;
  }
}

export function setPairing(p: DevicePairing): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function clearPairing(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
