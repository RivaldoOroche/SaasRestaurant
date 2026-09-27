import { useSubscription, useMyPlanRequest, useSubscriptionActions, useBranchQuota, useStaff } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { PLANS, annualMonthly, annualSavings, branchLimitLabel, planInfo } from "@/lib/plans";

export function Suscripcion() {
  const { data: sub } = useSubscription();
  const { data: pending } = useMyPlanRequest();
  const { requestPlanChange } = useSubscriptionActions();
  const { data: quota } = useBranchQuota();
  const { data: staff = [] } = useStaff();
  const plan = sub?.plan ?? "Pro";
  const basePrice = sub?.price ?? planInfo(plan).price;
  // Total real del mes: plan + sucursales adicionales (Enterprise).
  const price = quota?.monthlyTotal ?? basePrice;
  const usedBranches = quota?.used ?? 0;
  const maxLocales = quota?.max == null ? null : quota.max + 1;
  const usage = [
    {
      metric:
        quota?.included != null
          ? `Locales activos (${quota.included + 1} incluidos${quota.extraPrice != null ? `, luego ${formatMoney(quota.extraPrice)} c/u` : ""})`
          : "Locales activos",
      cur: usedBranches + 1,
      cap: maxLocales,
    },
    { metric: "Personal activo", cur: staff.filter((m) => m.active).length, cap: null },
  ];

  return (
    <div className="p-6 mob:p-4 max-w-4xl">
      <ScreenHeader title="Plan" subtitle="Tu suscripción a Wayra POS" />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold">Plan {plan}</h3>
              <Badge tone={sub?.status === "Suspendido" ? "warning" : "accent"}>{sub?.status ?? "Activo"}</Badge>
            </div>
            <p className="text-muted text-sm mt-0.5">Renueva el 01 de cada mes</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-mono font-bold whitespace-nowrap">
              {formatMoney(price)}
              <span className="text-sm text-muted font-sans">/mes</span>
            </p>
            {quota && quota.extra > 0 && quota.extraPrice !== null && (
              <p className="text-xs text-muted">
                {formatMoney(basePrice)} + {quota.extra} {quota.extra === 1 ? "sucursal adicional" : "sucursales adicionales"} ×{" "}
                {formatMoney(quota.extraPrice)}
              </p>
            )}
          </div>
        </CardBody>
        <CardBody className="border-t border-border-soft pt-3 text-sm text-muted">
          💡 Pagando el año completo pagas 10 meses y usas 12 (
          <strong className="text-success">{formatMoney(annualMonthly(planInfo(plan)))} al mes</strong> en tu plan). Con Yape o
          transferencia no hay recargos. Wayra no cobra por comprobante: directo a SUNAT cuesta S/ 0 y, si usas un OSE, pagas solo su tarifa.
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
            {usage.map((u) => (
              <div key={u.metric}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{u.metric}</span>
                  <span className="font-mono text-muted">
                    {u.cap === null ? `${u.cur} · sin límite` : `${u.cur}/${u.cap}`}
                  </span>
                </div>
                {u.cap !== null && (
                  <div className="h-2 rounded-full bg-chip-bg overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", u.cur >= u.cap ? "bg-warning" : "bg-accent")}
                      style={{ width: `${Math.min(100, (u.cur / Math.max(1, u.cap)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <p className="text-xs uppercase tracking-wide text-muted mb-2">Cambiar de plan</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
        {PLANS.map((t) => {
          const current = t.tier === plan;
          // Bajar de plan exige no tener más sucursales activas que las permitidas.
          const tooMany = t.maxBranches !== null && usedBranches > t.maxBranches;
          return (
            <Card key={t.tier} className={cn(current && "border-accent/50")}>
              <CardBody className="flex flex-col h-full">
                <h4 className="font-bold">{t.tier}</h4>
                <p className="text-lg font-mono font-bold mt-1">
                  {formatMoney(t.price)}
                  <span className="text-xs text-muted font-sans">/mes</span>
                </p>
                <p className="text-[11px] text-success">
                  {formatMoney(annualMonthly(t))}/mes pagando anual · ahorras {formatMoney(annualSavings(t))} al año
                </p>
                <p className="text-xs mt-2 font-semibold">{branchLimitLabel(t)}</p>
                <p className="text-muted text-xs mt-1">{t.features}</p>
                <p className="text-muted text-xs mt-1 flex-1">{t.support}</p>
                {current ? (
                  <p className="text-accent text-xs mt-3">Tu plan actual</p>
                ) : tooMany ? (
                  <p className="text-warning text-xs mt-3">
                    Tienes {usedBranches} {usedBranches === 1 ? "sucursal activa" : "sucursales activas"}; desactiva{" "}
                    {usedBranches - (t.maxBranches ?? 0)} para cambiar a este plan.
                  </p>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    disabled={!!pending || requestPlanChange.isPending}
                    onClick={() => requestPlanChange.mutate(t.tier)}
                  >
                    {t.price > planInfo(plan).price ? "Solicitar mejora" : "Solicitar cambio"}
                  </Button>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
      <p className="text-muted text-xs">
        Precios finales con IGV incluido. Wayra no cobra por comprobante. El cambio de plan lo confirma Wayra POS y se refleja en tu próxima
        facturación. Sin permanencia: puedes cancelar cuando quieras.
      </p>
    </div>
  );
}
