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
  cohort?: string; // mes de alta (YYYY-MM) para el análisis de cohortes
}

/** Fila de cohorte: tenants dados de alta el mismo mes y su retención actual. */
export interface Cohort {
  cohort: string; // YYYY-MM
  size: number;
  active: number;
  retainedPct: number;
  mrr: number;
}

export interface RevenuePoint {
  month: string; // YYYY-MM
  amount: number;
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
  billingProvider?: string; // sunat_directo | nubefact | bizlinks | efact
  sunatMode?: string; // beta | produccion
  solUser?: string; // usuario SOL (no secreto)
  billingEndpoint?: string; // endpoint del OSE/API (no secreto)
}

/** Solicitud de cambio de plan hecha por un tenant (autoservicio). */
export interface PlanRequest {
  id: string;
  tenantId: string;
  tenant: string;
  fromPlan: PlanTier;
  toPlan: PlanTier;
  status: string;
  requestedAt: string;
}

/** Etiquetas legibles para la auditoría de configuración. */
export const AUDIT_TABLE_LABELS: Record<string, string> = {
  business_settings: "Configuración del negocio",
  payment_credentials: "Credenciales de pago",
  fiscal_credentials: "Credenciales fiscales (SUNAT)",
  role_permissions: "Permisos por rol",
  platform_settings: "Emisor de la plataforma",
  platform_fiscal_credentials: "Credenciales fiscales de la plataforma",
};
export const AUDIT_OP_LABELS: Record<string, string> = {
  INSERT: "Creado",
  UPDATE: "Modificado",
  DELETE: "Eliminado",
};
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  tax_rate: "IGV / impuesto",
  currency: "Moneda",
  ruc: "RUC",
  razon_social: "Razón social",
  billing_provider: "Proveedor de facturación",
  sunat_mode: "Modo SUNAT",
  sol_user: "Usuario SOL",
  billing_endpoint: "Endpoint de facturación",
  card_provider: "Proveedor de tarjeta",
  card_public_key: "Llave pública de tarjeta",
  secret_key: "Llave secreta",
  webhook_secret: "Secreto de webhook",
  public_key: "Llave pública",
  merchant_id: "Merchant ID",
  sol_pass: "Clave SOL",
  cert_pem: "Certificado",
  key_pem: "Llave privada",
  api_token: "Token de API",
  screens: "Pantallas permitidas",
  yape_number: "Número Yape",
  plin_number: "Número Plin",
  address: "Dirección",
  direccion: "Dirección",
  billing_email: "Correo de facturación",
};

/** Entrada de auditoría de cambios de configuración sensibles. */
export interface ConfigAuditEntry {
  id: string;
  tenant: string; // nombre del tenant, o "Plataforma"
  table: string; // tabla afectada (etiqueta legible)
  op: string; // "Creado" | "Modificado" | "Eliminado"
  email: string; // quién lo hizo
  keys: string[]; // campos modificados (secretos aparecen enmascarados)
  at: string; // ISO
}

/** Entrada de auditoría de accesos. */
export interface AccessEntry {
  id: string;
  email: string;
  role: string;
  event: string;
  userAgent: string;
  at: string; // ISO
}

/** Credenciales secretas del emisor de la plataforma (solo escritura). */
export interface PlatformFiscalCredentialsInput {
  provider: string;
  solPass?: string;
  certPem?: string;
  keyPem?: string;
  apiToken?: string;
}

export interface NewTenantInput {
  name: string;
  ownerName: string;
  plan: PlanTier;
}

export type ChargeStatus = "pendiente" | "aprobada" | "rechazada" | "cobrada" | "fallida";

/** Propuesta de cobro de suscripción, pendiente de aprobación del dueño SaaS. */
export interface ChargeProposal {
  id: string;
  tenantId: string;
  tenant: string; // nombre del tenant
  ownerName: string;
  plan: PlanTier;
  base: number;
  igv: number;
  total: number;
  ruc?: string; // datos a validar antes de facturar
  razonSocial?: string;
  period: string; // "YYYY-MM"
  status: ChargeStatus;
  note?: string;
  proposedAt: string; // ISO
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
