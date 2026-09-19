import { useState } from "react";
import { useInvoices, usePlans, useTenants, usePlatformActions } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";
import { SaasInvoiceView } from "./Tenants";
import type { SaasCharge } from "@/data/platform/model";

export function Ingresos() {
  const { data: plans = [] } = usePlans();
  const { data: invoices = [] } = useInvoices();
  const { data: tenants = [] } = useTenants();
  const { charge } = usePlatformActions();
  const [invoice, setInvoice] = useState<SaasCharge | null>(null);
  const maxMrr = Math.max(1, ...plans.map((p) => p.mrr));

  async function billTenant(name: string) {
    const t = tenants.find((x) => x.name === name);
    if (t) setInvoice(await charge.mutateAsync({ id: t.id, method: "tarjeta" }));
  }

  return (
    <div className="p-6 max-w-5xl">
      <ScreenHeader title="Ingresos" subtitle="MRR por plan y cobranza del mes" />

      <Card className="mb-4">
        <CardBody>
          <h3 className="font-semibold mb-3">MRR por plan</h3>
          <div className="space-y-3">
            {plans.map((p) => (
              <div key={p.tier}>
                <div className="flex justify-between text-sm mb-1">
                  <span>
                    {p.tier} <span className="text-muted">· {p.subscribers} tenants</span>
                  </span>
                  <span className="font-mono">{formatMoney(p.mrr)}</span>
                </div>
                <div className="h-2 rounded-full bg-chip-bg overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(p.mrr / maxMrr) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-semibold mb-3">Cobranza del mes</h3>
          <div className="divide-y divide-border-soft">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 py-2.5">
                <span className="flex-1 text-sm">{inv.tenant}</span>
                <span className="text-muted text-xs">{inv.date}</span>
                <Badge tone={inv.status === "Pagada" ? "success" : "warning"}>{inv.status}</Badge>
                <span className="font-mono text-sm w-24 text-right">{formatMoney(inv.amount)}</span>
                <Button size="sm" variant="secondary" onClick={() => billTenant(inv.tenant)}>
                  Factura
                </Button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {invoice && <SaasInvoiceView charge={invoice} onClose={() => setInvoice(null)} />}
    </div>
  );
}
