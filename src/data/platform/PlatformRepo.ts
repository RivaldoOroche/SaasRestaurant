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
  PlatformActivity,
  PlatformSettings,
  ChargeProposal,
} from "./model";

/** Platform-owner (SaaS) data access. Separate from the tenant Repo. */
export interface PlatformRepo {
  getSummary(): Promise<PlatformSummary>;
  getTenants(): Promise<Tenant[]>;
  getPlans(): Promise<PlanInfo[]>;
  updatePlan(tier: PlanTier, patch: { price?: number; features?: string }): Promise<void>;
  getInvoices(): Promise<SaasInvoice[]>;
  getTickets(): Promise<SupportTicket[]>;
  updateTicket(id: string, patch: { status?: string; priority?: string }): Promise<void>;
  /** Bitácora global (cross-tenant) para monitoreo del dueño del SaaS. */
  getActivity(): Promise<PlatformActivity[]>;
  /** Datos del emisor del SaaS (tu empresa). */
  getPlatformSettings(): Promise<PlatformSettings>;
  updatePlatformSettings(patch: Partial<PlatformSettings>): Promise<void>;
  getRetention(): Promise<Retention>;
  createTenant(input: NewTenantInput): Promise<{ tenant: Tenant; link: string }>;
  /** Alta rápida: crea el tenant y también la cuenta del dueño con una contraseña
   *  temporal (sin enviar link). El dueño entra de inmediato con correo + clave. */
  createTenantWithOwner(
    input: NewTenantInput,
    credentials: { email: string; password: string },
  ): Promise<{ tenant: Tenant; email: string }>;
  /** Genera un nuevo link de invitación para el tenant e invalida los anteriores. */
  regenerateLink(id: string): Promise<{ link: string }>;
  setTenantPlan(id: string, plan: PlanTier): Promise<void>;
  toggleSuspend(id: string): Promise<void>;
  /** Cobra la suscripción del tenant. Con method "tarjeta" y un token de la
   *  pasarela de la plataforma, ejecuta el cargo real vía Edge Function.
   *  Se usa desde la aprobación de un cobro (no cobra sin validar). */
  chargeTenant(id: string, method: string, token?: string): Promise<SaasCharge>;

  // --- Cobros de suscripción con aprobación (dunning) ---
  /** Propuestas de cobro (pendientes de aprobar + históricas recientes). */
  getChargeProposals(): Promise<ChargeProposal[]>;
  /** Genera una propuesta de cobro para un tenant (no cobra todavía). */
  proposeCharge(tenantId: string): Promise<ChargeProposal>;
  /** Corre el dunning: propone cobros para los tenants a los que toca facturar.
   *  Devuelve cuántas propuestas nuevas se generaron. */
  runDunning(): Promise<{ proposed: number }>;
  /** Edita los datos a facturar de una propuesta antes de aprobarla. */
  updateChargeProposal(id: string, patch: { ruc?: string; razonSocial?: string; note?: string }): Promise<void>;
  /** Aprueba y EJECUTA el cobro (valida los datos de la factura primero). */
  approveCharge(id: string, method?: string, token?: string): Promise<SaasCharge>;
  /** Rechaza una propuesta de cobro (no se factura). */
  rejectCharge(id: string, reason: string): Promise<void>;

  subscribe(cb: () => void): () => void;
}
