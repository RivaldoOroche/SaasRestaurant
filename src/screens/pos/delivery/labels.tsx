import type { DeliveryChannel, DeliveryPay, DriverVehicle } from "@/data/model";

export const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  web: "Web",
  rappi: "Rappi",
  pedidosya: "PedidosYa",
};
export const CHANNEL_COLOR: Record<DeliveryChannel, string> = {
  telefono: "#6b7280",
  whatsapp: "#3f7d5c",
  web: "#9184d9",
  rappi: "#ff4f6d",
  pedidosya: "#e63946",
};
export const PAY_LABEL: Record<DeliveryPay, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta (POS)",
  pagado_app: "Pagado en app",
};
export const VEHICLE_ICON: Record<DriverVehicle, string> = { moto: "🛵", bici: "🚲", auto: "🚗" };

export function ChannelPill({ channel }: { channel: DeliveryChannel }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: CHANNEL_COLOR[channel] }}>
      {CHANNEL_LABEL[channel]}
    </span>
  );
}
