import type { PlatformRepo } from "./PlatformRepo";
import type {
  Tenant,
  PlanTier,
  NewTenantInput,
  SaasCharge,
  SupportTicket,
  PlatformActivity,
  ActivityCategory,
  ActivityLevel,
  PlatformSettings,
  PlatformFiscalCredentialsInput,
  ChargeProposal,
  PlanRequest,
} from "./model";
import { MOCK_TENANT_ID } from "@/auth/session";
import { deriveRetentionMetrics, deriveCohorts } from "./retention";

function isoAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

/** Bitácora de demo: actividad detallada y variada de varios tenants. */
function seedActivity(): PlatformActivity[] {
  const e = (
    tenant: string,
    actor: string,
    category: ActivityCategory,
    level: ActivityLevel,
    message: string,
    mins: number,
  ): PlatformActivity => ({ id: uid("act"), tenant, actor, category, level, message, at: isoAgo(mins) });
  return [
    e("La Higuera", "Ana Ruiz", "venta", "info", "Cobró Mesa 7 · Yape · S/ 128.00", 3),
    e("La Higuera", "SUNAT", "sunat", "info", "Boleta B001-1042 aceptada por SUNAT", 3),
    e("Cevichería El Muelle", "Sistema", "inventario", "warning", "Stock bajo: Pescado fresco (2.1 kg, par 5 kg)", 6),
    e("Sushi Nami", "Keiko Tanaka", "venta", "info", "Cobró Mesa 3 · Tarjeta · S/ 214.50", 8),
    e("La Higuera", "Carlos Vega", "acceso", "info", "Inició sesión con PIN en Terminal 2", 11),
    e("Tacos El Farol", "SUNAT", "sunat", "error", "Factura F001-0087 rechazada: RUC del cliente inválido", 14),
    e("Cevichería El Muelle", "Caja", "caja", "info", "Cierre de caja turno tarde · diferencia S/ 0.00", 22),
    e("La Higuera", "Sistema", "inventario", "info", "Descontó 4 insumos por venta de Mesa 7", 3),
    e("Sushi Nami", "Sistema", "sistema", "error", "Impresora de cocina sin conexión (reintentando)", 27),
    e("Brasas del Sur", "Plataforma", "pago", "error", "Cobro de suscripción rechazado (3er intento) · tarjeta vencida", 40),
    e("Café Aurora", "Paula Vega", "carta", "info", "Publicó 3 platos nuevos en la carta", 55),
    e("La Higuera", "Iker Solís", "caja", "warning", "Anuló Ceviche clásico de Mesa 5 · motivo: error de toma", 63),
    e("Cevichería El Muelle", "SUNAT", "sunat", "info", "Resumen diario RC-20260923-1 enviado (18 boletas)", 70),
    e("Tacos El Farol", "Raúl Méndez", "acceso", "warning", "3 intentos fallidos de PIN en Terminal 1", 84),
    e("Sushi Nami", "Sistema", "inventario", "error", "Stock agotado: Salmón — 2 platos marcados 86", 96),
    e("La Higuera", "Mónica R.", "plan", "info", "Actualizó datos del emisor (RUC / dirección)", 130),
    e("Café Aurora", "Plataforma", "plan", "info", "Tenant creado · plan Pro (prueba 14 días)", 240),
    e("La Higuera", "Ana Ruiz", "venta", "info", "Cobró Mesa 2 · Efectivo · S/ 64.00", 150),
    e("Cevichería El Muelle", "Sistema", "sistema", "info", "Sincronizó 6 comprobantes en cola con SUNAT", 180),
    e("Brasas del Sur", "Plataforma", "plan", "warning", "Suscripción suspendida por falta de pago", 320),
  ];
}

function seedTickets(): SupportTicket[] {
  return [
    { id: uid("tk"), tenant: "Sushi Nami", subject: "Impresora no responde", priority: "Alta", status: "Abierto", ago: "hace 2h" },
    { id: uid("tk"), tenant: "Cevichería El Muelle", subject: "Duda sobre reportes por mesero", priority: "Media", status: "Abierto", ago: "hace 5h" },
    { id: uid("tk"), tenant: "Tacos El Farol", subject: "Solicitud de nueva sucursal", priority: "Baja", status: "Abierto", ago: "ayer" },
    { id: uid("tk"), tenant: "La Higuera", subject: "Capacitación de personal", priority: "Baja", status: "Resuelto", ago: "hace 3 días" },
  ];
}

const PLAN_PRICE: Record<PlanTier, number> = { Básico: 699, Pro: 1499, Enterprise: 4800 };
const PLAN_FEATURES: Record<PlanTier, string> = {
  Básico: "POS + 1 sucursal",
  Pro: "POS + inventario + reportes + 3 sucursales",
  Enterprise: "Todo + multi-sucursal + soporte prioritario",
};

function uid(p: string) {
  return `${p}-${Math.random().toString(36).slice(2, 10)}`;
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

function makeLink(slug: string): string {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.wayrapos.pe";
  return `${origin}/onboarding/${slug}?token=${token}`;
}

/** RUC de demostración estable por tenant (11 dígitos, empieza en 20). */
function stubRuc(t: Tenant): string {
  if (t.isYou) return "20512345678";
  let h = 0;
  for (const ch of t.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "20" + String(h).padStart(9, "0").slice(0, 9);
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

const SEED_TENANTS: Tenant[] = [
  { id: MOCK_TENANT_ID, name: "La Higuera", slug: "la-higuera", ownerName: "Mónica R.", plan: "Pro", mrr: 1499, status: "Activo", since: "Mar 2025", branches: 3, users: 12, isYou: true, link: null, cohort: "2025-03" },
  { id: uid("t"), name: "Cevichería El Muelle", slug: "cevicheria-el-muelle", ownerName: "Andrés Ríos", plan: "Enterprise", mrr: 4800, status: "Activo", since: "Jun 2024", branches: 11, users: 64, isYou: false, link: null, cohort: "2024-06" },
  { id: uid("t"), name: "Sushi Nami", slug: "sushi-nami", ownerName: "Keiko Tanaka", plan: "Pro", mrr: 1499, status: "Activo", since: "Nov 2025", branches: 2, users: 9, isYou: false, link: null, cohort: "2025-11" },
  { id: uid("t"), name: "Tacos El Farol", slug: "tacos-el-farol", ownerName: "Raúl Méndez", plan: "Básico", mrr: 699, status: "Activo", since: "Ene 2025", branches: 1, users: 3, isYou: false, link: null, cohort: "2025-01" },
  { id: uid("t"), name: "Café Aurora", slug: "cafe-aurora", ownerName: "Paula Vega", plan: "Pro", mrr: 0, status: "Prueba", since: "Feb 2026", branches: 1, users: 4, isYou: false, link: null, cohort: "2026-02" },
  { id: uid("t"), name: "Brasas del Sur", slug: "brasas-del-sur", ownerName: "Jorge Salas", plan: "Básico", mrr: 0, status: "Suspendido", since: "Set 2025", branches: 1, users: 2, isYou: false, link: null, cohort: "2025-09" },
];

export class MockPlatformRepo implements PlatformRepo {
  private tenants: Tenant[] = SEED_TENANTS.map((t) => ({ ...t }));
  private plans: Record<PlanTier, { price: number; features: string }> = {
    Básico: { price: PLAN_PRICE.Básico, features: PLAN_FEATURES.Básico },
    Pro: { price: PLAN_PRICE.Pro, features: PLAN_FEATURES.Pro },
    Enterprise: { price: PLAN_PRICE.Enterprise, features: PLAN_FEATURES.Enterprise },
  };
  private tickets: SupportTicket[] = seedTickets();
  private activity: PlatformActivity[] = seedActivity();
  private charges: ChargeProposal[] = [];
  private settings: PlatformSettings = {
    razonSocial: "Wayra POS S.A.C.",
    ruc: "20601234567",
    direccion: "Av. Javier Prado 1234, San Isidro, Lima",
    billingEmail: "facturacion@wayrapos.pe",
    billingProvider: "sunat_directo",
    sunatMode: "beta",
    solUser: "",
    billingEndpoint: "",
  };
  private listeners = new Set<() => void>();

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private log(tenant: string, actor: string, category: ActivityCategory, level: ActivityLevel, message: string) {
    this.activity.unshift({ id: uid("act"), tenant, actor, category, level, message, at: new Date().toISOString() });
    this.activity = this.activity.slice(0, 300);
  }
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async getTenants() {
    return this.tenants.map((t) => ({ ...t }));
  }

  async getSummary() {
    const active = this.tenants.filter((t) => t.status === "Activo");
    const mrr = this.tenants.reduce((s, t) => s + t.mrr, 0);
    const byPlan = (["Básico", "Pro", "Enterprise"] as PlanTier[]).map((plan) => {
      const rows = this.tenants.filter((t) => t.plan === plan && t.status === "Activo");
      return { plan, value: rows.reduce((s, t) => s + t.mrr, 0), count: rows.length };
    });
    return {
      mrr,
      arr: mrr * 12,
      activeTenants: active.length,
      totalTenants: this.tenants.length,
      churnPct: 1.8,
      mrrByMonth: [
        { label: "Abr", value: 5.4 },
        { label: "May", value: 6.1 },
        { label: "Jun", value: 6.6 },
        { label: "Jul", value: 7.2 },
        { label: "Ago", value: 8.0 },
        { label: "Set", value: mrr / 1000 },
      ],
      mrrByPlan: byPlan,
      recentSignups: [
        { name: "Café Aurora", plan: "Pro" as PlanTier, when: "hace 3 días" },
        { name: "Brasas del Sur", plan: "Básico" as PlanTier, when: "hace 2 sem" },
      ],
    };
  }

  async getPlans() {
    return (["Básico", "Pro", "Enterprise"] as PlanTier[]).map((tier) => {
      const rows = this.tenants.filter((t) => t.plan === tier && t.status === "Activo");
      return {
        tier,
        price: this.plans[tier].price,
        features: this.plans[tier].features,
        subscribers: rows.length,
        mrr: rows.reduce((s, t) => s + t.mrr, 0),
      };
    });
  }

  async updatePlan(tier: PlanTier, patch: { price?: number; features?: string }) {
    if (patch.price !== undefined) this.plans[tier].price = patch.price;
    if (patch.features !== undefined) this.plans[tier].features = patch.features;
    // Reactivar el MRR de los tenants activos de ese plan con el nuevo precio.
    for (const t of this.tenants) {
      if (t.plan === tier && t.status === "Activo") t.mrr = this.plans[tier].price;
    }
    this.log("Plataforma", "Plataforma", "plan", "info", `Plan ${tier} actualizado (precio S/ ${this.plans[tier].price})`);
    this.emit();
  }

  async getInvoices() {
    return this.tenants
      .filter((t) => t.mrr > 0)
      .map((t) => ({
        id: uid("inv"),
        tenant: t.name,
        amount: t.mrr,
        date: "01 Set 2026",
        status: t.status === "Suspendido" ? "Vencida" : "Pagada",
      }));
  }

  async getTickets() {
    return this.tickets.map((t) => ({ ...t }));
  }

  async updateTicket(id: string, patch: { status?: string; priority?: string }) {
    const t = this.tickets.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    this.log(t.tenant, "Soporte", "soporte", "info", `Ticket "${t.subject}" · ${patch.status ?? patch.priority}`);
    this.emit();
  }

  async getActivity() {
    return this.activity.map((a) => ({ ...a }));
  }

  async getAccessLog() {
    return [
      { id: "acc-1", email: "admin@wayrapos.pe", role: "saas", event: "login", userAgent: "Chrome · macOS", at: isoAgo(12) },
      { id: "acc-2", email: "monica@lahiguera.pe", role: "dueno", event: "login", userAgent: "Safari · iPhone", at: isoAgo(180) },
      { id: "acc-3", email: "admin@wayrapos.pe", role: "saas", event: "2fa_enroll", userAgent: "Chrome · macOS", at: isoAgo(1440) },
    ];
  }

  private planRequests: PlanRequest[] = [];
  async getPlanRequests() {
    return this.planRequests.filter((r) => r.status === "pendiente").map((r) => ({ ...r }));
  }
  async decidePlanRequest(id: string, approve: boolean) {
    const r = this.planRequests.find((x) => x.id === id);
    if (!r) return;
    r.status = approve ? "aprobada" : "rechazada";
    if (approve) await this.setTenantPlan(r.tenantId, r.toPlan);
    this.log(r.tenant, "Plataforma", "plan", "info", `Solicitud de cambio a ${r.toPlan} ${approve ? "aprobada" : "rechazada"}`);
    this.emit();
  }

  async getPlatformSettings() {
    return { ...this.settings };
  }
  async updatePlatformSettings(patch: Partial<PlatformSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.log("Plataforma", "Plataforma", "sistema", "info", "Actualizó los datos del emisor del SaaS");
    this.emit();
  }
  async setPlatformFiscalCredentials(input: PlatformFiscalCredentialsInput) {
    // Demo: no se persisten las credenciales secretas (solo se registra).
    this.log("Plataforma", "Plataforma", "sistema", "info", `Actualizó credenciales de facturación del SaaS (${input.provider})`);
    this.emit();
  }

  async getRetention() {
    const m = deriveRetentionMetrics(this.tenants);
    const mrrK = this.tenants.reduce((s, t) => s + t.mrr, 0) / 1000;
    // Cobranza en riesgo (dunning) derivada de tenants suspendidos.
    const dunning = this.tenants
      .filter((t) => t.status === "Suspendido")
      .map((t) => ({
        tenant: t.name,
        amount: this.plans[t.plan].price,
        reason: "Cobro de suscripción fallido",
        tries: "3 intentos",
        status: "Suspendido",
      }));
    // Pruebas activas derivadas de tenants en estado Prueba.
    const trials = this.tenants
      .filter((t) => t.status === "Prueba")
      .map((t) => ({ name: t.name, days: "en periodo de prueba", progress: 50, risk: "mid" as const }));
    return {
      nrr: m.nrr,
      churnPct: m.churnPct,
      ltv: m.ltv,
      cac: m.cac,
      lifetimeMonths: m.lifetimeMonths,
      waterfall: [
        { label: "Inicial", value: 8.5, kind: "base" as const },
        { label: "Nuevo", value: 1.4, kind: "add" as const },
        { label: "Expansión", value: 0.6, kind: "add" as const },
        { label: "Contracción", value: 0.3, kind: "sub" as const },
        { label: "Perdido", value: 0.3, kind: "sub" as const },
        { label: "Final", value: mrrK, kind: "base" as const },
      ],
      trials: trials.length ? trials : [{ name: "—", days: "sin pruebas activas", progress: 0, risk: "low" as const }],
      dunning,
      usage: [
        { tenant: "Cevichería El Muelle", metric: "Sucursales", cur: 11, cap: 12 },
        { tenant: "Sushi Nami", metric: "Usuarios", cur: 9, cap: 10 },
        { tenant: "La Higuera", metric: "Pedidos/mes", cur: 8200, cap: 10000 },
      ],
      health: [
        { svc: "API", up: "99.98%", ok: true },
        { svc: "Base de datos", up: "99.95%", ok: true },
        { svc: "SUNAT (OSE)", up: "99.7%", ok: true },
        { svc: "Pagos", up: "99.99%", ok: true },
      ],
    };
  }

  async getCohorts() {
    return deriveCohorts(this.tenants);
  }

  async getRevenueSeries() {
    // Serie de ingresos derivada del MRR actual (demo): últimos 6 meses.
    const mrr = this.tenants.reduce((s, t) => s + t.mrr, 0);
    const now = new Date();
    const pts = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const factor = 0.7 + (5 - i) * 0.06;
      pts.push({ month: d.toISOString().slice(0, 7), amount: Math.round(mrr * factor) });
    }
    return pts;
  }

  async createTenant(input: NewTenantInput) {
    const slug = slugify(input.name);
    const tenant: Tenant = {
      id: uid("t"),
      name: input.name,
      slug,
      ownerName: input.ownerName,
      plan: input.plan,
      mrr: 0, // starts on 14-day trial
      status: "Prueba",
      since: "hoy",
      branches: 1,
      users: 1,
      isYou: false,
      link: makeLink(slug),
      cohort: currentPeriod(),
    };
    this.tenants.unshift(tenant);
    this.log(tenant.name, "Plataforma", "plan", "info", `Tenant creado · plan ${input.plan} (prueba 14 días)`);
    this.emit();
    return { tenant, link: tenant.link! };
  }

  async createTenantWithOwner(input: NewTenantInput, credentials: { email: string; password: string }) {
    const slug = slugify(input.name);
    const tenant: Tenant = {
      id: uid("t"),
      name: input.name,
      slug,
      ownerName: input.ownerName,
      plan: input.plan,
      mrr: 0,
      status: "Prueba",
      since: "hoy",
      branches: 1,
      users: 1,
      isYou: false,
      link: null, // la cuenta ya existe: no hace falta link de invitación
      cohort: currentPeriod(),
    };
    this.tenants.unshift(tenant);
    this.log(
      tenant.name,
      "Plataforma",
      "plan",
      "info",
      `Tenant creado con cuenta del dueño (${credentials.email}) · plan ${input.plan}`,
    );
    this.emit();
    return { tenant, email: credentials.email };
  }

  async regenerateLink(id: string) {
    const t = this.tenants.find((x) => x.id === id);
    if (!t) throw new Error("Tenant no encontrado");
    t.link = makeLink(t.slug);
    this.log(t.name, "Plataforma", "plan", "info", "Regeneró el link de invitación (los anteriores quedan inválidos)");
    this.emit();
    return { link: t.link };
  }

  async setTenantPlan(id: string, plan: PlanTier) {
    const t = this.tenants.find((x) => x.id === id);
    if (!t) return;
    const prev = t.plan;
    t.plan = plan;
    if (t.status === "Activo") t.mrr = this.plans[plan].price;
    this.log(t.name, "Plataforma", "plan", "info", `Cambió de plan ${prev} a ${plan}`);
    this.emit();
  }

  async toggleSuspend(id: string) {
    const t = this.tenants.find((x) => x.id === id);
    if (!t) return;
    if (t.status === "Suspendido") {
      t.status = "Activo";
      t.mrr = this.plans[t.plan].price;
      this.log(t.name, "Plataforma", "plan", "info", "Suscripción reactivada");
    } else {
      t.status = "Suspendido";
      t.mrr = 0;
      this.log(t.name, "Plataforma", "plan", "warning", "Suscripción suspendida");
    }
    this.emit();
  }

  async chargeTenant(id: string, method: string, _token?: string): Promise<SaasCharge> {
    void _token; // demo: no hay pasarela real
    const t = this.tenants.find((x) => x.id === id);
    const base = t ? Math.round((this.plans[t.plan].price / 1.18) * 100) / 100 : 0;
    const total = t ? this.plans[t.plan].price : 0;
    // El pago activa la suscripción.
    if (t && total > 0) {
      t.status = "Activo";
      t.mrr = this.plans[t.plan].price;
      this.log(t.name, "Plataforma", "pago", "info", `Cobró suscripción · ${method} · S/ ${total.toFixed(2)}`);
      this.emit();
    }
    return {
      folio: `NP-F001-${Math.floor(1000 + Math.random() * 9000)}`,
      tenant: t?.name ?? "",
      ownerName: t?.ownerName ?? "",
      plan: t?.plan ?? "Pro",
      base,
      igv: Math.round((total - base) * 100) / 100,
      total,
      method,
      date: new Date().toLocaleDateString("es-PE"),
    };
  }

  // --- Cobros de suscripción con aprobación (dunning) ---

  private makeProposal(t: Tenant, period: string): ChargeProposal {
    const total = this.plans[t.plan].price;
    const base = Math.round((total / 1.18) * 100) / 100;
    return {
      id: uid("chg"),
      tenantId: t.id,
      tenant: t.name,
      ownerName: t.ownerName,
      plan: t.plan,
      base,
      igv: Math.round((total - base) * 100) / 100,
      total,
      ruc: stubRuc(t),
      razonSocial: t.name,
      period,
      status: "pendiente",
      proposedAt: new Date().toISOString(),
    };
  }

  async getChargeProposals() {
    return this.charges.map((c) => ({ ...c }));
  }

  async proposeCharge(tenantId: string) {
    const t = this.tenants.find((x) => x.id === tenantId);
    if (!t) throw new Error("Tenant no encontrado");
    const period = currentPeriod();
    const open = this.charges.find(
      (c) => c.tenantId === tenantId && c.period === period && (c.status === "pendiente" || c.status === "aprobada"),
    );
    if (open) return { ...open };
    const prop = this.makeProposal(t, period);
    this.charges.unshift(prop);
    this.log(t.name, "Plataforma", "pago", "info", `Cobro de suscripción propuesto (${period}) · pendiente de aprobación`);
    this.emit();
    return { ...prop };
  }

  async runDunning() {
    const period = currentPeriod();
    // Toca cobrar a los activos (renovación) y a los suspendidos (reintento).
    const due = this.tenants.filter((t) => t.status === "Activo" || t.status === "Suspendido");
    let proposed = 0;
    for (const t of due) {
      const open = this.charges.find(
        (c) => c.tenantId === t.id && c.period === period && (c.status === "pendiente" || c.status === "aprobada"),
      );
      if (open) continue;
      // No repetir si ya se cobró este periodo.
      const cobrada = this.charges.find((c) => c.tenantId === t.id && c.period === period && c.status === "cobrada");
      if (cobrada) continue;
      this.charges.unshift(this.makeProposal(t, period));
      proposed++;
    }
    if (proposed > 0) {
      this.log("Plataforma", "Plataforma", "pago", "info", `Dunning: ${proposed} cobro(s) propuesto(s) para ${period}`);
      this.emit();
    }
    return { proposed };
  }

  async updateChargeProposal(id: string, patch: { ruc?: string; razonSocial?: string; note?: string }) {
    const c = this.charges.find((x) => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    this.emit();
  }

  async approveCharge(id: string, method = "tarjeta", token?: string) {
    const c = this.charges.find((x) => x.id === id);
    if (!c) throw new Error("Propuesta no encontrada");
    if (c.status === "cobrada") throw new Error("Este cobro ya fue ejecutado");
    // Validación de la factura antes de cobrar.
    const ruc = (c.ruc ?? "").replace(/\D/g, "");
    if (ruc.length !== 11) throw new Error("Completa un RUC válido (11 dígitos) antes de aprobar el cobro.");
    if (!c.razonSocial?.trim()) throw new Error("Completa la razón social antes de aprobar el cobro.");
    c.status = "aprobada";
    const charge = await this.chargeTenant(c.tenantId, method, token);
    c.status = "cobrada";
    this.log(c.tenant, "Plataforma", "pago", "info", `Cobro aprobado y ejecutado · ${charge.folio} · S/ ${charge.total.toFixed(2)}`);
    this.emit();
    return charge;
  }

  async rejectCharge(id: string, reason: string) {
    const c = this.charges.find((x) => x.id === id);
    if (!c) return;
    c.status = "rechazada";
    c.note = reason;
    this.log(c.tenant, "Plataforma", "pago", "warning", `Cobro rechazado · ${reason}`);
    this.emit();
  }
}
