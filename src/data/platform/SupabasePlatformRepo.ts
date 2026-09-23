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
} from "./model";
import { deriveRetentionMetrics } from "./retention";
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

  async getPlatformSettings(): Promise<PlatformSettings> {
    const { data } = await this.sb.from("platform_settings").select("*").eq("id", true).maybeSingle();
    return {
      razonSocial: data?.razon_social ?? "",
      ruc: data?.ruc ?? "",
      direccion: data?.direccion ?? "",
      billingEmail: data?.billing_email ?? "",
    };
  }
  async updatePlatformSettings(patch: Partial<PlatformSettings>): Promise<void> {
    const row: Database["public"]["Tables"]["platform_settings"]["Update"] = { id: true };
    if (patch.razonSocial !== undefined) row.razon_social = patch.razonSocial;
    if (patch.ruc !== undefined) row.ruc = patch.ruc;
    if (patch.direccion !== undefined) row.direccion = patch.direccion;
    if (patch.billingEmail !== undefined) row.billing_email = patch.billingEmail;
    await this.sb.from("platform_settings").upsert(row, { onConflict: "id" });
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
      body: { token, email: credentials.email, password: credentials.password, ownerName: input.ownerName },
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
