import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

// The tenant's own subscription (their view as a customer of Wayra POS).
const USAGE = [
  { metric: "Sucursales", cur: 3, cap: 3 },
  { metric: "Usuarios", cur: 12, cap: 15 },
  { metric: "Pedidos este mes", cur: 8200, cap: 10000 },
];

const INVOICES = [
  { date: "01 Set 2026", amount: 1499, status: "Pagada" },
  { date: "01 Ago 2026", amount: 1499, status: "Pagada" },
  { date: "01 Jul 2026", amount: 1499, status: "Pagada" },
];

const TIERS = [
  { tier: "Básico", price: 699, features: "POS + 1 sucursal" },
  { tier: "Pro", price: 1499, features: "POS + inventario + reportes + 3 sucursales" },
  { tier: "Enterprise", price: 4800, features: "Todo + multi-sucursal + soporte" },
];

export function Suscripcion() {
  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader title="Plan" subtitle="Tu suscripción a Wayra POS" />

      <Card className="mb-4">
        <CardBody className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">Plan Pro</h3>
              <Badge tone="accent">Activo</Badge>
            </div>
            <p className="text-muted text-sm mt-0.5">Renueva el 01 de cada mes</p>
          </div>
          <p className="text-2xl font-mono font-bold">
            {formatMoney(1499)}
            <span className="text-sm text-muted font-sans">/mes</span>
          </p>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody>
          <h3 className="font-semibold mb-3">Uso del plan</h3>
          <div className="space-y-3">
            {USAGE.map((u) => (
              <div key={u.metric}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{u.metric}</span>
                  <span className="font-mono text-muted">
                    {u.cur.toLocaleString("es-PE")}/{u.cap.toLocaleString("es-PE")}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-chip-bg overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", u.cur / u.cap >= 1 ? "bg-warning" : "bg-accent")}
                    style={{ width: `${Math.min(100, (u.cur / u.cap) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {TIERS.map((t) => (
          <Card key={t.tier} className={cn(t.tier === "Pro" && "border-accent/50")}>
            <CardBody>
              <h4 className="font-bold">{t.tier}</h4>
              <p className="text-lg font-mono font-bold mt-1">{formatMoney(t.price)}</p>
              <p className="text-muted text-xs mt-1">{t.features}</p>
              {t.tier === "Pro" && <p className="text-accent text-xs mt-2">Tu plan actual</p>}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody>
          <h3 className="font-semibold mb-3">Facturas recientes</h3>
          <div className="divide-y divide-border-soft">
            {INVOICES.map((inv) => (
              <div key={inv.date} className="flex items-center justify-between py-2.5 text-sm">
                <span>{inv.date}</span>
                <Badge tone="success">{inv.status}</Badge>
                <span className="font-mono">{formatMoney(inv.amount)}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
