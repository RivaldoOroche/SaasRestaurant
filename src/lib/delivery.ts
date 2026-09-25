// Reglas de negocio del delivery, puras y testeables (sin UI ni red).
import type {
  DeliveryChannel,
  DeliveryItem,
  DeliveryOrder,
  DeliveryStatus,
  DeliveryZone,
  NewDeliveryInput,
} from "@/data/model";

/** Flujo normal de un pedido. "cancelado" es una salida lateral. */
export const DELIVERY_FLOW: DeliveryStatus[] = ["recibido", "preparando", "listo", "en_camino", "entregado"];
const FINAL: DeliveryStatus[] = ["entregado", "cancelado"];

export function isFinal(s: DeliveryStatus): boolean {
  return FINAL.includes(s);
}

/** Siguiente estado en el flujo, o null si ya terminó. */
export function nextStatus(s: DeliveryStatus): DeliveryStatus | null {
  const i = DELIVERY_FLOW.indexOf(s);
  return i >= 0 && i < DELIVERY_FLOW.length - 1 ? DELIVERY_FLOW[i + 1] : null;
}

/** Solo se avanza un paso a la vez, o se cancela mientras no haya terminado. */
export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  if (isFinal(from)) return false;
  if (to === "cancelado") return true;
  return nextStatus(from) === to;
}

/** En Rappi / PedidosYa reparte el rider de la app: no se asigna repartidor propio. */
export function isAggregator(channel: DeliveryChannel): boolean {
  return channel === "rappi" || channel === "pedidosya";
}

/** Despachar un pedido propio exige repartidor asignado. */
export function needsDriver(channel: DeliveryChannel, to: DeliveryStatus): boolean {
  return to === "en_camino" && !isAggregator(channel);
}

export interface TransitionOpts {
  driverId?: string | null;
  cancelReason?: string;
}

/**
 * Cambios a aplicar al pasar un pedido a `to`. Lanza un Error legible si la
 * transición no es válida. Lo usan ambos repos (demo y Supabase), así las
 * reglas son idénticas en los dos.
 */
export function transitionPatch(
  o: Pick<DeliveryOrder, "status" | "channel" | "driverId">,
  to: DeliveryStatus,
  opts: TransitionOpts,
  nowIso: string,
): Partial<DeliveryOrder> {
  if (!canTransition(o.status, to)) throw new Error(`No se puede pasar de «${o.status}» a «${to}».`);
  const patch: Partial<DeliveryOrder> = { status: to };
  if (to === "preparando") patch.acceptedAt = nowIso;
  if (to === "listo") patch.readyAt = nowIso;
  if (to === "en_camino") {
    const driver = opts.driverId ?? o.driverId;
    if (needsDriver(o.channel, to) && !driver) throw new Error("Asigna un repartidor para despachar.");
    patch.driverId = driver ?? null;
    patch.dispatchedAt = nowIso;
  }
  if (to === "entregado") patch.deliveredAt = nowIso;
  if (to === "cancelado") {
    const reason = opts.cancelReason?.trim();
    if (!reason) throw new Error("Indica el motivo de la cancelación.");
    patch.cancelReason = reason;
    patch.cancelledAt = nowIso;
  }
  return patch;
}

/** Etiqueta de la comanda en el KDS para un pedido de delivery. */
export function kitchenLabel(code: string): string {
  return `🛵 ${code}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function deliveryTotals(items: DeliveryItem[], fee: number): { subtotal: number; fee: number; total: number } {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
  const f = round2(Math.max(0, fee));
  return { subtotal, fee: f, total: round2(subtotal + f) };
}

/** Vuelto que debe llevar el repartidor (solo efectivo con "paga con"). */
export function changeDue(total: number, payMethod: string, cashFor: number | null): number {
  if (payMethod !== "efectivo" || cashFor == null) return 0;
  return round2(Math.max(0, cashFor - total));
}

/** Celular peruano: 9 dígitos empezando en 9 (se ignoran espacios y +51). */
export function normalizePhonePe(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, "");
  return /^9\d{8}$/.test(digits) ? digits : null;
}

/** Valida un pedido nuevo. Devuelve el mensaje de error o null si es válido. */
export function validateNewDelivery(input: NewDeliveryInput, zones: DeliveryZone[]): string | null {
  const agg = isAggregator(input.channel);
  if (!input.customerName.trim()) return "Ingresa el nombre del cliente.";
  if (input.items.length === 0) return "Agrega al menos un producto.";
  if (input.items.some((i) => !(i.qty > 0) || !(i.price >= 0))) return "Revisa cantidades y precios.";
  if (!agg) {
    if (!normalizePhonePe(input.customerPhone)) return "Ingresa un celular válido (9 dígitos, empieza en 9).";
    if (!input.address.trim()) return "Ingresa la dirección de entrega.";
    const zone = zones.find((z) => z.id === input.zoneId);
    if (!zone) return "Elige la zona de reparto.";
    if (!zone.active) return "Esa zona no está activa.";
  }
  if (agg && input.payMethod !== "pagado_app") return "Los pedidos de apps se cobran en la app.";
  if (input.payMethod === "efectivo" && input.cashFor != null) {
    const zone = zones.find((z) => z.id === input.zoneId);
    const { total } = deliveryTotals(input.items, zone?.fee ?? 0);
    if (input.cashFor < total) return "El monto con el que paga es menor al total.";
  }
  return null;
}

export function minutesSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

/** Atrasado: sigue activo y ya pasó el tiempo estimado de la zona. */
export function isLate(o: Pick<DeliveryOrder, "status" | "createdAt" | "etaMin">, now: number = Date.now()): boolean {
  return !isFinal(o.status) && minutesSince(o.createdAt, now) > o.etaMin;
}

/** Enlace de WhatsApp (Perú, +51) con mensaje prellenado. */
export function whatsappLink(phone: string, text: string): string | null {
  const p = normalizePhonePe(phone);
  return p ? `https://wa.me/51${p}?text=${encodeURIComponent(text)}` : null;
}

export function trackingUrl(origin: string, token: string): string {
  return `${origin}/seguimiento/${token}`;
}
