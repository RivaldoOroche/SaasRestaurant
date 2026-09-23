import type { PlanTier, TenantStatus } from "@/types/database";

export type { PlanTier, TenantStatus };

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  plan: PlanTier;
  mrr: number;
  status: TenantStatus;
  since: string;
  branches: number;
  users: number;
  isYou: boolean; // La Higuera, the demo tenant
  link: string | null;
}

export interface PlatformSummary {
  mrr: number;
  arr: number;
  activeTenants: number;
  totalTenants: number;
  churnPct: number;
  mrrByMonth: { label: string; value: number }[];
  mrrByPlan: { plan: PlanTier; value: number; count: number }[];
  recentSignups: { name: string; plan: PlanTier; when: string }[];
}

export interface PlanInfo {
  tier: PlanTier;
  price: number;
  features: string;
  subscribers: number;
  mrr: number;
}

export interface SaasInvoice {
  id: string;
  tenant: string;
  amount: number;
  date: string;
  status: string;
}

export interface SupportTicket {
  id: string;
  tenant: string;
  subject: string;
  priority: string;
  status: string;
  ago: string;
}

export type ActivityLevel = "info" | "warning" | "error";
export type ActivityCategory =
  | "venta"
  | "sunat"
  | "inventario"
  | "caja"
  | "acceso"
  | "carta"
  | "soporte"
  | "plan"
  | "pago"
  | "sistema";

/** Entrada de la bitácora global (cross-tenant) para el dueño del SaaS. */
export interface PlatformActivity {
  id: string;
  tenant: string; // nombre del tenant, o "Plataforma" para eventos del SaaS
  actor: string; // quién lo hizo (staff / Sistema / SUNAT / Caja…)
  category: ActivityCategory;
  level: ActivityLevel;
  message: string;
  at: string; // ISO — la UI formatea fecha y hora
}

export interface Retention {
  nrr: number;
  churnPct: number;
  ltv: number;
  cac: number;
  lifetimeMonths: number;
  waterfall: { label: string; value: number; kind: "base" | "add" | "sub" }[];
  trials: { name: string; days: string; progress: number; risk: "low" | "mid" | "high" }[];
  dunning: { tenant: string; amount: number; reason: string; tries: string; status: string }[];
  usage: { tenant: string; metric: string; cur: number; cap: number }[];
  health: { svc: string; up: string; ok: boolean }[];
}

/** Datos del emisor del SaaS (tu empresa) para facturar a los tenants. */
export interface PlatformSettings {
  razonSocial: string;
  ruc: string;
  direccion: string;
  billingEmail: string;
}

export interface NewTenantInput {
  name: string;
  ownerName: string;
  plan: PlanTier;
}

export interface SaasCharge {
  folio: string;
  tenant: string;
  ownerName: string;
  plan: PlanTier;
  base: number;
  igv: number;
  total: number;
  method: string;
  date: string;
}
