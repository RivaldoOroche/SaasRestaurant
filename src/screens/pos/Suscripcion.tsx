import { useSubscription, useMyPlanRequest, useSubscriptionActions } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

const USAGE = [
  { metric: "Sucursales", cur: 3, cap: 3 },
  { metric: "Usuarios", cur: 12, cap: 15 },
  { metric: "Pedidos este mes", cur: 8200, cap: 10000 },
];

const TIERS = [
  { tier: "Básico", price: 699, features: "POS + 1 sucursal" },
  { tier: "Pro", price: 1499, features: "POS + inventario + reportes + 3 sucursales" },
  { tier: "Enterprise", price: 4800, features: "Todo + multi-sucursal + soporte" },
];

export function Suscripcion() {
  const { data: sub } = useSubscription();
  const { data: pending } = useMyPlanRequest();
  const { requestPlanChange } = useSubscriptionActions();
  const plan = sub?.plan ?? "Pro";
  const price = sub?.price ?? 1499;

  return (
    <div className="p-6 mob:p-4 max-w-4xl">
      <ScreenHeader title="Plan" subtitle="Tu suscripción a Wayra POS" />

      <Card className="mb-4">
        <CardBody className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">Plan {plan}</h3>
              <Badge tone={sub?.status === "Suspendido" ? "warning" : "accent"}>{sub?.status ?? "Activo"}</Badge>
            </div>
            <p className="text-muted text-sm mt-0.5">Renueva el 01 de cada mes</p>
          </div>
          <p className="text-2xl font-mono font-bold">
            {formatMoney(price)}
            <span className="text-sm text-muted font-sans">/mes</span>
          </p>
        </CardBody>
      </Card>

      {pending && (
        <Card className="mb-4 border-accent/50">
          <CardBody className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Cambio de plan solicitado</p>
              <p className="text-muted text-sm">Pediste pasar a <b>{pending.toPlan}</b>. Está pendiente de aprobación por Wayra POS.</p>
            </div>
            <Badge tone="warning">Pendiente</Badge>
          </CardBody>
        </Card>
      )}

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

      <p className="text-xs uppercase tracking-wide text-muted mb-2">Cambiar de plan</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
        {TIERS.map((t) => {
          const current = t.tier === plan;
          return (
            <Card key={t.tier} className={cn(current && "border-accent/50")}>
              <CardBody className="flex flex-col h-full">
                <h4 className="font-bold">{t.tier}</h4>
                <p className="text-lg font-mono font-bold mt-1">{formatMoney(t.price)}</p>
                <p className="text-muted text-xs mt-1 flex-1">{t.features}</p>
                {current ? (
                  <p className="text-accent text-xs mt-3">Tu plan actual</p>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    disabled={!!pending || requestPlanChange.isPending}
                    onClick={() => requestPlanChange.mutate(t.tier)}
                  >
                    {t.price > (TIERS.find((x) => x.tier === plan)?.price ?? 0) ? "Solicitar mejora" : "Solicitar cambio"}
                  </Button>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
      <p className="text-muted text-xs">
        El cambio de plan lo confirma Wayra POS y se refleja en tu próxima facturación. Sin permanencia.
      </p>
    </div>
  );
}
