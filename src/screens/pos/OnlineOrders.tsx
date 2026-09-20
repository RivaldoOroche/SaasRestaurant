import { useOnlineOrders } from "@/data/hooks";
import { useAuth } from "@/auth/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Qr } from "@/components/Qr";
import { formatMoney } from "@/lib/money";

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "carta";
}

const CHANNEL_COLOR: Record<string, string> = {
  Rappi: "#ff4f6d",
  PedidosYa: "#e63946",
  WhatsApp: "#3f7d5c",
  Web: "#9184d9",
};

const STATUS_LABEL: Record<string, string> = { nuevo: "Nuevo", prep: "En preparación", camino: "En camino" };

export function OnlineOrders() {
  const { data: orders = [] } = useOnlineOrders();
  const { session } = useAuth();
  const slug = slugify(session?.tenantName ?? "La Higuera");
  const cartaUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/carta/${slug}`;

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader title="En línea" subtitle="Pedidos de delivery y canales digitales" />

      <Card className="mb-4">
        <CardBody className="flex items-center gap-4">
          <div className="shrink-0 border border-border rounded-md p-1.5 bg-white">
            <Qr value={cartaUrl} size={96} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">Carta digital (QR de mesa)</h3>
            <p className="text-muted text-sm mt-0.5">
              Imprime este QR para que los clientes vean la carta desde su celular.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <input
                readOnly
                value={cartaUrl}
                className="flex-1 rounded-md bg-chip-bg border border-border px-2 py-1.5 text-xs font-mono"
              />
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(cartaUrl)}>
                Copiar
              </Button>
              <a href={cartaUrl} target="_blank" rel="noreferrer">
                <Button size="sm">Abrir</Button>
              </a>
            </div>
          </div>
        </CardBody>
      </Card>

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
