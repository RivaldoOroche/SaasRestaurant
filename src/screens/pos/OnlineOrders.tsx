import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Qr } from "@/components/Qr";

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "carta";
}

export function OnlineOrders() {
  const { session } = useAuth();
  const slug = slugify(session?.tenantName ?? "La Higuera");
  const cartaUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/carta/${slug}`;

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader title="En línea" subtitle="Carta digital y canales en línea" />

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

      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <span className="text-3xl" aria-hidden="true">🛵</span>
          <div className="flex-1 min-w-[12rem]">
            <h3 className="font-semibold">Pedidos a domicilio y de apps</h3>
            <p className="text-muted text-sm mt-0.5">
              Teléfono, WhatsApp, web, Rappi y PedidosYa se gestionan en el tablero de Delivery: zonas, repartidores y
              seguimiento para el cliente.
            </p>
          </div>
          <Link to="/pos/delivery">
            <Button size="sm">Ir a Delivery →</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
