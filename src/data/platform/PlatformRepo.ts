import type {
  Tenant,
  PlatformSummary,
  PlanInfo,
  SaasInvoice,
  SupportTicket,
  Retention,
  NewTenantInput,
  SaasCharge,
  PlanTier,
} from "./model";

/** Platform-owner (SaaS) data access. Separate from the tenant Repo. */
export interface PlatformRepo {
  getSummary(): Promise<PlatformSummary>;
  getTenants(): Promise<Tenant[]>;
  getPlans(): Promise<PlanInfo[]>;
  updatePlan(tier: PlanTier, patch: { price?: number; features?: string }): Promise<void>;
  getInvoices(): Promise<SaasInvoice[]>;
  getTickets(): Promise<SupportTicket[]>;
  getRetention(): Promise<Retention>;
  createTenant(input: NewTenantInput): Promise<{ tenant: Tenant; link: string }>;
  setTenantPlan(id: string, plan: PlanTier): Promise<void>;
  toggleSuspend(id: string): Promise<void>;
  /** Cobra la suscripción del tenant. Con method "tarjeta" y un token de la
   *  pasarela de la plataforma, ejecuta el cargo real vía Edge Function. */
  chargeTenant(id: string, method: string, token?: string): Promise<SaasCharge>;
  subscribe(cb: () => void): () => void;
}
