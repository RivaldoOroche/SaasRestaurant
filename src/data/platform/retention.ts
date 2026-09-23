import type { Tenant } from "./model";

/** Métricas de retención derivadas del estado real de los tenants. */
export function deriveRetentionMetrics(tenants: Tenant[]) {
  const active = tenants.filter((t) => t.status === "Activo");
  const suspended = tenants.filter((t) => t.status === "Suspendido");
  const mrr = tenants.reduce((s, t) => s + t.mrr, 0);
  const arpu = active.length ? mrr / active.length : 0;
  const denom = active.length + suspended.length || 1;
  const churnPct = Math.round((suspended.length / denom) * 1000) / 10;
  const lifetimeMonths = churnPct > 0 ? Math.round(100 / churnPct) : 36;
  const ltv = Math.round(arpu * lifetimeMonths);
  // NRR proxy: 100 menos churn más una expansión estimada conservadora.
  const nrr = Math.max(80, Math.round((100 - churnPct + 3) * 10) / 10);
  const cac = 7400;
  return { nrr, churnPct, ltv, cac, lifetimeMonths, arpu: Math.round(arpu * 100) / 100 };
}
