import { usePlans } from "@/data/platform/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

export function Planes() {
  const { data: plans = [] } = usePlans();

  return (
    <div className="p-6 max-w-5xl">
      <ScreenHeader title="Planes" subtitle="Precios y suscriptores por plan" />
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
              <p className="text-muted text-sm mt-2">{p.features}</p>
              <div className="border-t border-border-soft my-3" />
              <div className="flex justify-between text-sm">
                <span className="text-muted">Suscriptores</span>
                <span className="font-mono">{p.subscribers}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted">MRR</span>
                <span className="font-mono">{formatMoney(p.mrr)}</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
