import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformRepo } from "./PlatformRepo";
import type {
  Tenant,
  PlanTier,
  NewTenantInput,
  SaasCharge,
  PlatformSummary,
  Retention,
  PlatformActivity,
  ActivityCategory,
  ActivityLevel,
  PlatformSettings,
  PlatformFiscalCredentialsInput,
  ChargeProposal,
  ChargeStatus,
  Cohort,
  RevenuePoint,
  AccessEntry,
} from "./model";
import { deriveRetentionMetrics, deriveCohorts } from "./retention";
import type { Database, Row } from "@/types/database";
import { MockPlatformRepo } from "./MockPlatformRepo";

const PLAN_PRICE: Record<PlanTier, number> = { Básico: 699, Pro: 1499, Enterprise: 4800 };

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "cliente"
  );
}

/** Deriva categoría y nivel de la bitácora a partir del texto del evento. */
function mapActivity(id: string, tenant: string, actor: string, message: string, at: string): PlatformActivity {
  const m = message.toLowerCase();
  let category: ActivityCategory = "sistema";
  if (/(cobr|venta|mesa|pag)/.test(m)) category = "venta";
  if (/(pago|suscrip|tarjeta|cobro)/.test(m)) category = "pago";
  if (/(sunat|comprobante|boleta|factura|resumen|baja)/.test(m)) category = "sunat";
  if (/(inventario|insumo|stock|86)/.test(m)) category = "inventario";
  if (/(caja|arqueo|cierre|anul)/.test(m)) category = "caja";
  if (/(pin|sesión|sesion|acceso|ingres)/.test(m)) category = "acceso";
  if (/(carta|plato|precio|menú|menu)/.test(m)) category = "carta";
  if (/(plan|tenant|sucursal|personal)/.test(m)) category = "plan";
  if (/(ticket|soporte)/.test(m)) category = "soporte";
  let level: ActivityLevel = "info";
  if (/(rechaz|error|fall|agotad|sin conexión|sin conexion|vencid|suspend)/.test(m)) level = "error";
  else if (/(bajo|riesgo|intento|advert|par )/.test(m)) level = "warning";
  return { id, tenant, actor, category, level, message, at };
}

function mapTenant(r: Row<"tenants">): Tenant {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    ownerName: r.owner_name,
    plan: r.plan,
    mrr: Number(r.mrr),
    status: r.status,
    since: new Date(r.since).toLocaleDateString("es-PE", { month: "short", year: "numeric" }),
    branches: 1,
    users: 1,
    isYou: r.slug === "la-higuera",
    link: null,
    cohort: (r.since ?? r.created_at ?? "").slice(0, 7) || undefined,
  };
}

/**
 * Real backend platform repo. Tenants/plans/invoices/tickets come from the DB;
 * retention analytics (cohort churn/NRR/dunning) are representative here and
 * belong to a proper analytics job (see plan) — reused from the mock repo.
 */
export class SupabasePlatformRepo implements PlatformRepo {
  private mock = new MockPlatformRepo();
  constructor(private sb: SupabaseClient<Database>) {}

  async getTenants(): Promise<Tenant[]> {
    const { data, error } = await this.sb.from("tenants").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map(mapTenant);
  }

  async getSummary(): Promise<PlatformSummary> {
    const tenants = await this.getTenants();
    const active = tenants.filter((t) => t.status === "Activo");
    const mrr = tenants.reduce((s, t) => s + t.mrr, 0);
    const byPlan = (["Básico", "Pro", "Enterprise"] as PlanTier[]).map((plan) => {
      const rows = active.filter((t) => t.plan === plan);
      return { plan, value: rows.reduce((s, t) => s + t.mrr, 0), count: rows.length };
    });
    const base = await this.mock.getSummary();
    return {
      ...base,
      mrr,
      arr: mrr * 12,
      activeTenants: active.length,
      totalTenants: tenants.length,
      mrrByPlan: byPlan,
    };
  }

  async getPlans() {
    const [tenants, { data: planRows }] = await Promise.all([
      this.getTenants(),
      this.sb.from("subscription_plans").select("tier, price, features"),
    ]);
    const cfg = new Map((planRows ?? []).map((p) => [p.tier as PlanTier, p]));
    return (["Básico", "Pro", "Enterprise"] as PlanTier[]).map((tier) => {
      const rows = tenants.filter((t) => t.plan === tier && t.status === "Activo");
      const p = cfg.get(tier);
      return {
        tier,
        price: p ? Number(p.price) : PLAN_PRICE[tier],
        features: p?.features ?? "",
        subscribers: rows.length,
        mrr: rows.reduce((s, t) => s + t.mrr, 0),
      };
    });
  }

  private async priceOf(tier: PlanTier): Promise<number> {
    const { data } = await this.sb.from("subscription_plans").select("price").eq("tier", tier).maybeSingle();
    return data ? Number(data.price) : PLAN_PRICE[tier];
  }

  async updatePlan(tier: PlanTier, patch: { price?: number; features?: string }): Promise<void> {
    await this.sb.from("subscription_plans").upsert(
      { tier, price: patch.price, features: patch.features },
      { onConflict: "tier" },
    );
    // Actualiza el MRR de los tenants activos de ese plan si cambió el precio.
    if (patch.price !== undefined) {
      await this.sb.from("tenants").update({ mrr: patch.price }).eq("plan", tier).eq("status", "Activo");
    }
  }

  private async tenantNames(): Promise<Map<string, string>> {
    const { data } = await this.sb.from("tenants").select("id, name");
    return new Map((data ?? []).map((t) => [t.id, t.name]));
  }

  async getInvoices() {
    const [{ data }, names] = await Promise.all([
      this.sb.from("saas_invoices").select("*").order("issued_at", { ascending: false }),
      this.tenantNames(),
    ]);
    return (data ?? []).map((r) => ({
      id: r.id,
      tenant: names.get(r.tenant_id) ?? "",
      amount: Number(r.amount),
      date: new Date(r.issued_at).toLocaleDateString("es-PE"),
      status: r.paid ? "Pagada" : "Vencida",
    }));
  }

  async getTickets() {
    const [{ data }, names] = await Promise.all([
      this.sb.from("support_tickets").select("*").order("created_at", { ascending: false }),
      this.tenantNames(),
    ]);
    return (data ?? []).map((r) => ({
      id: r.id,
      tenant: names.get(r.tenant_id) ?? "",
      subject: r.subject,
      priority: r.priority,
      status: r.status,
      ago: new Date(r.created_at).toLocaleDateString("es-PE"),
    }));
  }

  async updateTicket(id: string, patch: { status?: string; priority?: string }): Promise<void> {
    const { error } = await this.sb.from("support_tickets").update(patch).eq("id", id);
    if (error) throw error;
    await this.sb.from("platform_activity").insert({
      actor: "Soporte",
      message: `Ticket actualizado · ${patch.status ?? patch.priority ?? ""}`,
    });
  }

  async getActivity(): Promise<PlatformActivity[]> {
    const [{ data: logs }, { data: plat }] = await Promise.all([
      this.sb
        .from("activity_log")
        .select("id, actor, message, created_at, tenant:tenants(name)")
        .order("created_at", { ascending: false })
        .limit(250),
      this.sb.from("platform_activity").select("id, actor, message, created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const entries: PlatformActivity[] = [];
    for (const l of logs ?? []) {
      const rel = l.tenant as unknown as { name: string } | { name: string }[] | null;
      const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
      entries.push(mapActivity(l.id, name ?? "—", l.actor, l.message, l.created_at));
    }
    for (const p of plat ?? []) {
      entries.push(mapActivity(p.id, "Plataforma", p.actor, p.message, p.created_at));
    }
    return entries.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 300);
  }

  async getAccessLog(): Promise<AccessEntry[]> {
    const { data } = await this.sb.from("access_log").select("*").order("at", { ascending: false }).limit(50);
    return (data ?? []).map((r) => ({
      id: r.id,
      email: r.email ?? "—",
      role: r.role ?? "—",
      event: r.event,
      userAgent: r.user_agent ?? "",
      at: r.at,
    }));
  }

  async getPlatformSettings(): Promise<PlatformSettings> {
    const { data } = await this.sb.from("platform_settings").select("*").eq("id", true).maybeSingle();
    return {
      razonSocial: data?.razon_social ?? "",
      ruc: data?.ruc ?? "",
      direccion: data?.direccion ?? "",
      billingEmail: data?.billing_email ?? "",
      billingProvider: data?.billing_provider ?? "sunat_directo",
      sunatMode: data?.sunat_mode ?? "beta",
      solUser: data?.sol_user ?? "",
      billingEndpoint: data?.billing_endpoint ?? "",
    };
  }
  async updatePlatformSettings(patch: Partial<PlatformSettings>): Promise<void> {
    const row: Database["public"]["Tables"]["platform_settings"]["Update"] = { id: true };
    if (patch.razonSocial !== undefined) row.razon_social = patch.razonSocial;
    if (patch.ruc !== undefined) row.ruc = patch.ruc;
    if (patch.direccion !== undefined) row.direccion = patch.direccion;
    if (patch.billingEmail !== undefined) row.billing_email = patch.billingEmail;
    if (patch.billingProvider !== undefined) row.billing_provider = patch.billingProvider;
    if (patch.sunatMode !== undefined) row.sunat_mode = patch.sunatMode;
    if (patch.solUser !== undefined) row.sol_user = patch.solUser;
    if (patch.billingEndpoint !== undefined) row.billing_endpoint = patch.billingEndpoint;
    await this.sb.from("platform_settings").upsert(row, { onConflict: "id" });
  }
  async setPlatformFiscalCredentials(input: PlatformFiscalCredentialsInput): Promise<void> {
    const row: Database["public"]["Tables"]["platform_fiscal_credentials"]["Insert"] = { id: true, provider: input.provider };
    if (input.solPass !== undefined) row.sol_pass = input.solPass;
    if (input.certPem !== undefined) row.cert_pem = input.certPem;
    if (input.keyPem !== undefined) row.key_pem = input.keyPem;
    if (input.apiToken !== undefined) row.api_token = input.apiToken;
    row.updated_at = new Date().toISOString();
    await this.sb.from("platform_fiscal_credentials").upsert(row, { onConflict: "id" });
  }

  async getRetention(): Promise<Retention> {
    const [base, tenants] = await Promise.all([this.mock.getRetention(), this.getTenants()]);
    const m = deriveRetentionMetrics(tenants);
    const dunning = tenants
      .filter((t) => t.status === "Suspendido")
      .map((t) => ({ tenant: t.name, amount: t.mrr, reason: "Cobro de suscripción fallido", tries: "3 intentos", status: "Suspendido" }));
    const trials = tenants
      .filter((t) => t.status === "Prueba")
      .map((t) => ({ name: t.name, days: "en periodo de prueba", progress: 50, risk: "mid" as const }));
    return {
      ...base,
      nrr: m.nrr,
      churnPct: m.churnPct,
      ltv: m.ltv,
      cac: m.cac,
      lifetimeMonths: m.lifetimeMonths,
      dunning: dunning.length ? dunning : base.dunning,
      trials: trials.length ? trials : base.trials,
    };
  }

  /** Emite un token de invitación de un solo uso y devuelve el link (token en claro
   *  solo aquí; en la base se guarda su hash). Invalida los links pendientes previos. */
  private async issueOnboardingLink(tenantId: string, slug: string): Promise<string> {
    // Invalida cualquier link pendiente anterior de este tenant.
    await this.sb
      .from("onboarding_links")
      .update({ used_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .is("used_at", null);
    const token = crypto.randomUUID();
    const tokenHash = await sha256Hex(token);
    const expires = new Date(Date.now() + 14 * 864e5).toISOString();
    await this.sb.from("onboarding_links").insert({ tenant_id: tenantId, token_hash: tokenHash, expires_at: expires });
    const origin = typeof window !== "undefined" ? window.location.origin : "https://app.wayrapos.pe";
    return `${origin}/onboarding/${slug}?token=${token}`;
  }

  async createTenant(input: NewTenantInput) {
    const slug = slugify(input.name);
    const { data, error } = await this.sb
      .from("tenants")
      .insert({ name: input.name, slug, owner_name: input.ownerName, plan: input.plan, mrr: 0, status: "Prueba" })
      .select("*")
      .single();
    if (error) throw error;
    const link = await this.issueOnboardingLink(data.id, slug);
    return { tenant: { ...mapTenant(data), link }, link };
  }

  async createTenantWithOwner(input: NewTenantInput, credentials: { email: string; password: string }) {
    // Reutiliza el flujo de onboarding: crea el tenant + un token, y la Edge
    // Function `onboarding-complete` crea el usuario dueño, su membership,
    // business_settings y la siembra inicial, marcando el token como usado.
    const { tenant, link } = await this.createTenant(input);
    const token = new URL(link).searchParams.get("token");
    if (!token) throw new Error("No se pudo generar el token de alta");
    const { data, error } = await this.sb.functions.invoke("onboarding-complete", {
      // Contraseña temporal fijada por el dueño del SaaS → forzar cambio al ingresar.
      body: { token, email: credentials.email, password: credentials.password, ownerName: input.ownerName, mustChangePassword: true },
    });
    if (error) throw new Error(error.message);
    const r = data as { success?: boolean; error?: string };
    if (!r.success) throw new Error(r.error ?? "No se pudo crear la cuenta del dueño");
    return { tenant: { ...tenant, link: null }, email: credentials.email };
  }

  async regenerateLink(id: string) {
    const { data, error } = await this.sb.from("tenants").select("slug").eq("id", id).single();
    if (error || !data) throw error ?? new Error("Tenant no encontrado");
    const link = await this.issueOnboardingLink(id, data.slug);
    return { link };
  }

  async setTenantPlan(id: string, plan: PlanTier) {
    const { data } = await this.sb.from("tenants").select("status").eq("id", id).maybeSingle();
    const mrr = data?.status === "Activo" ? await this.priceOf(plan) : 0;
    await this.sb.from("tenants").update({ plan, mrr }).eq("id", id);
  }

  async toggleSuspend(id: string) {
    const { data } = await this.sb.from("tenants").select("status, plan").eq("id", id).maybeSingle();
    if (!data) return;
    const suspend = data.status !== "Suspendido";
    const mrr = suspend ? 0 : await this.priceOf(data.plan);
    await this.sb.from("tenants").update({ status: suspend ? "Suspendido" : "Activo", mrr }).eq("id", id);
  }

  async chargeTenant(id: string, method: string, token?: string): Promise<SaasCharge> {
    const { data: t, error } = await this.sb.from("tenants").select("*").eq("id", id).single();
    if (error || !t) throw error ?? new Error("Tenant no encontrado");
    const total = await this.priceOf(t.plan);
    const base = Math.round((total / 1.18) * 100) / 100;
    const folio = `NP-F001-${Math.floor(1000 + Math.random() * 9000)}`;

    // Con tarjeta y token, ejecuta el cargo real con la pasarela de la plataforma.
    if (method === "tarjeta" && token) {
      const { data: res, error: fnErr } = await this.sb.functions.invoke("saas-cobrar", {
        body: { tenantId: id, token, amount: total, folio },
      });
      if (fnErr) throw new Error(fnErr.message);
      const r = res as { success?: boolean; error?: string };
      if (!r.success) throw new Error(r.error ?? "El cargo de la suscripción fue rechazado");
      // La Edge Function registra la factura y activa el tenant.
    } else {
      await this.sb.from("saas_invoices").insert({
        tenant_id: id,
        folio,
        amount: total,
        igv: Math.round((total - base) * 100) / 100,
        method: method as "efectivo" | "tarjeta" | "transferencia",
        paid: true,
      });
      await this.sb.from("tenants").update({ status: "Activo", mrr: total }).eq("id", id);
    }

    return {
      folio,
      tenant: t.name,
      ownerName: t.owner_name,
      plan: t.plan,
      base,
      igv: Math.round((total - base) * 100) / 100,
      total,
      method,
      date: new Date().toLocaleDateString("es-PE"),
    };
  }

  async getCohorts(): Promise<Cohort[]> {
    const tenants = await this.getTenants();
    return deriveCohorts(tenants);
  }

  async getRevenueSeries(): Promise<RevenuePoint[]> {
    // Ingresos reales por mes desde las facturas de suscripción cobradas.
    const { data } = await this.sb.from("saas_invoices").select("amount, issued_at, paid").eq("paid", true);
    const map = new Map<string, number>();
    for (const r of data ?? []) {
      const month = new Date(r.issued_at).toISOString().slice(0, 7);
      map.set(month, (map.get(month) ?? 0) + Number(r.amount));
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }));
  }

  // --- Cobros de suscripción con aprobación (dunning) ---

  private period(): string {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  private async fiscalOf(tenantId: string): Promise<{ ruc?: string; razonSocial?: string }> {
    const { data } = await this.sb
      .from("business_settings")
      .select("ruc, razon_social")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return { ruc: data?.ruc ?? undefined, razonSocial: data?.razon_social ?? undefined };
  }

  async getChargeProposals(): Promise<ChargeProposal[]> {
    const [{ data }, names] = await Promise.all([
      this.sb.from("subscription_charges").select("*").order("proposed_at", { ascending: false }).limit(100),
      this.tenantNames(),
    ]);
    const owners = new Map<string, { name: string; owner_name: string }>();
    const { data: trows } = await this.sb.from("tenants").select("id, name, owner_name");
    for (const t of trows ?? []) owners.set(t.id, { name: t.name, owner_name: t.owner_name });
    return (data ?? []).map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      tenant: names.get(r.tenant_id) ?? "",
      ownerName: owners.get(r.tenant_id)?.owner_name ?? "",
      plan: r.plan,
      base: Number(r.base),
      igv: Number(r.igv),
      total: Number(r.total),
      ruc: r.ruc ?? undefined,
      razonSocial: r.razon_social ?? undefined,
      period: r.period,
      status: r.status as ChargeStatus,
      note: r.note ?? undefined,
      proposedAt: r.proposed_at,
    }));
  }

  private async insertProposal(tenantId: string, period: string): Promise<ChargeProposal | null> {
    const { data: t } = await this.sb.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    if (!t) return null;
    // Idempotencia: no dupliques una propuesta abierta o ya cobrada del periodo.
    const { data: open } = await this.sb
      .from("subscription_charges")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("period", period)
      .in("status", ["pendiente", "aprobada", "cobrada"])
      .maybeSingle();
    if (open) return null;
    const total = await this.priceOf(t.plan);
    const base = Math.round((total / 1.18) * 100) / 100;
    const fiscal = await this.fiscalOf(tenantId);
    const { data, error } = await this.sb
      .from("subscription_charges")
      .insert({
        tenant_id: tenantId,
        plan: t.plan,
        base,
        igv: Math.round((total - base) * 100) / 100,
        total,
        ruc: fiscal.ruc ?? null,
        razon_social: fiscal.razonSocial ?? t.name,
        period,
        status: "pendiente",
      })
      .select("*")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      tenantId,
      tenant: t.name,
      ownerName: t.owner_name,
      plan: t.plan,
      base: Number(data.base),
      igv: Number(data.igv),
      total: Number(data.total),
      ruc: data.ruc ?? undefined,
      razonSocial: data.razon_social ?? undefined,
      period,
      status: "pendiente",
      proposedAt: data.proposed_at,
    };
  }

  async proposeCharge(tenantId: string): Promise<ChargeProposal> {
    const prop = await this.insertProposal(tenantId, this.period());
    if (prop) return prop;
    // Ya había una abierta: devuélvela.
    const all = await this.getChargeProposals();
    const existing = all.find((c) => c.tenantId === tenantId && c.period === this.period());
    if (!existing) throw new Error("No se pudo crear la propuesta de cobro");
    return existing;
  }

  async runDunning(): Promise<{ proposed: number }> {
    const period = this.period();
    const { data: tenants } = await this.sb.from("tenants").select("id, status").in("status", ["Activo", "Suspendido"]);
    let proposed = 0;
    for (const t of tenants ?? []) {
      const prop = await this.insertProposal(t.id, period);
      if (prop) proposed++;
    }
    if (proposed > 0) {
      await this.sb.from("platform_activity").insert({ actor: "Plataforma", message: `Dunning: ${proposed} cobro(s) propuesto(s) para ${period}` });
    }
    return { proposed };
  }

  async updateChargeProposal(id: string, patch: { ruc?: string; razonSocial?: string; note?: string }): Promise<void> {
    const row: { ruc?: string; razon_social?: string; note?: string } = {};
    if (patch.ruc !== undefined) row.ruc = patch.ruc;
    if (patch.razonSocial !== undefined) row.razon_social = patch.razonSocial;
    if (patch.note !== undefined) row.note = patch.note;
    const { error } = await this.sb.from("subscription_charges").update(row).eq("id", id);
    if (error) throw error;
  }

  async approveCharge(id: string, method = "tarjeta", token?: string): Promise<SaasCharge> {
    const { data: c, error } = await this.sb.from("subscription_charges").select("*").eq("id", id).single();
    if (error || !c) throw error ?? new Error("Propuesta no encontrada");
    if (c.status === "cobrada") throw new Error("Este cobro ya fue ejecutado");
    const ruc = (c.ruc ?? "").replace(/\D/g, "");
    if (ruc.length !== 11) throw new Error("Completa un RUC válido (11 dígitos) antes de aprobar el cobro.");
    if (!c.razon_social?.trim()) throw new Error("Completa la razón social antes de aprobar el cobro.");
    await this.sb.from("subscription_charges").update({ status: "aprobada", decided_at: new Date().toISOString() }).eq("id", id);
    try {
      const charge = await this.chargeTenant(c.tenant_id, method, token);
      await this.sb.from("subscription_charges").update({ status: "cobrada" }).eq("id", id);
      return charge;
    } catch (e) {
      await this.sb.from("subscription_charges").update({ status: "fallida", note: String((e as Error).message ?? e) }).eq("id", id);
      throw e;
    }
  }

  async rejectCharge(id: string, reason: string): Promise<void> {
    const { error } = await this.sb
      .from("subscription_charges")
      .update({ status: "rechazada", note: reason, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  subscribe(cb: () => void): () => void {
    const ch = this.sb
      .channel("platform")
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants" }, cb)
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }
}
