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
  getInvoices(): Promise<SaasInvoice[]>;
  getTickets(): Promise<SupportTicket[]>;
  getRetention(): Promise<Retention>;
  createTenant(input: NewTenantInput): Promise<{ tenant: Tenant; link: string }>;
  setTenantPlan(id: string, plan: PlanTier): Promise<void>;
  toggleSuspend(id: string): Promise<void>;
  chargeTenant(id: string, method: string): Promise<SaasCharge>;
  subscribe(cb: () => void): () => void;
}
