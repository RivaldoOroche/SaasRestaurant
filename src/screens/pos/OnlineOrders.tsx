import { useOnlineOrders } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";

const CHANNEL_COLOR: Record<string, string> = {
  Rappi: "#ff4f6d",
  PedidosYa: "#e63946",
  WhatsApp: "#3f7d5c",
  Web: "#9184d9",
};

const STATUS_LABEL: Record<string, string> = { nuevo: "Nuevo", prep: "En preparación", camino: "En camino" };

export function OnlineOrders() {
  const { data: orders = [] } = useOnlineOrders();

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader title="En línea" subtitle="Pedidos de delivery y canales digitales" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {orders.map((o) => (
          <Card key={o.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ background: CHANNEL_COLOR[o.channel] ?? "#9184d9" }}
              >
                {o.channel}
              </span>
              <Badge tone={o.status === "nuevo" ? "accent" : "neutral"}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
            </div>
            <p className="font-semibold">{o.name}</p>
            <p className="text-muted text-sm">{o.items}</p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-muted text-xs">ETA {o.eta}</span>
              <span className="font-mono font-semibold">{formatMoney(o.total)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
