import { useState } from "react";
import { usePlans, usePlatformActions } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { PlanInfo, PlanTier } from "@/data/platform/model";

export function Planes() {
  const { data: plans = [] } = usePlans();
  const [edit, setEdit] = useState<PlanInfo | null>(null);

  return (
    <div className="p-6 mob:p-4 max-w-5xl">
      <ScreenHeader title="Planes" subtitle="Precios, beneficios y suscriptores por plan" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map((p) => (
          <Card key={p.tier} className={cn(p.tier === "Pro" && "border-accent/50")}>
            <CardBody>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{p.tier}</h3>
                {p.tier === "Pro" && <span className="text-xs text-accent">Popular</span>}
              </div>
              <p className="text-2xl font-bold font-mono mt-1">
                {formatMoney(p.price)}
                <span className="text-sm text-muted font-sans">/mes</span>
              </p>
              <p className="text-muted text-sm mt-2 min-h-[2.5rem]">{p.features}</p>
              <div className="border-t border-border-soft my-3" />
              <div className="flex justify-between text-sm">
                <span className="text-muted">Suscriptores</span>
                <span className="font-mono">{p.subscribers}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted">MRR</span>
                <span className="font-mono">{formatMoney(p.mrr)}</span>
              </div>
              <Button size="sm" variant="secondary" className="w-full mt-3" onClick={() => setEdit(p)}>
                Editar plan
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      {edit && <EditPlanModal plan={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditPlanModal({ plan, onClose }: { plan: PlanInfo; onClose: () => void }) {
  const { updatePlan } = usePlatformActions();
  const [price, setPrice] = useState(plan.price);
  const [features, setFeatures] = useState(plan.features);

  function guardar() {
    updatePlan.mutate(
      { tier: plan.tier as PlanTier, patch: { price, features } },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal open onClose={onClose} labelledBy="plan-title" className="max-w-md">
      <div className="p-5 space-y-4">
        <h2 id="plan-title" className="text-lg font-bold">Editar plan {plan.tier}</h2>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted mb-1.5 block">Precio mensual (S/)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
            className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted mb-1.5 block">Beneficios</label>
          <textarea
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            rows={3}
            placeholder="POS + inventario + reportes…"
            className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
          />
        </div>
        <p className="text-muted text-xs">
          Cambiar el precio actualiza el MRR de los tenants activos de este plan.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={updatePlan.isPending}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}
