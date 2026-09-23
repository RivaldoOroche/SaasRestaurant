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
} from "./model";
import { MOCK_TENANT_ID } from "@/auth/session";

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

const SEED_TENANTS: Tenant[] = [
  { id: MOCK_TENANT_ID, name: "La Higuera", slug: "la-higuera", ownerName: "Mónica R.", plan: "Pro", mrr: 1499, status: "Activo", since: "Mar 2025", branches: 3, users: 12, isYou: true, link: null },
  { id: uid("t"), name: "Cevichería El Muelle", slug: "cevicheria-el-muelle", ownerName: "Andrés Ríos", plan: "Enterprise", mrr: 4800, status: "Activo", since: "Jun 2024", branches: 11, users: 64, isYou: false, link: null },
  { id: uid("t"), name: "Sushi Nami", slug: "sushi-nami", ownerName: "Keiko Tanaka", plan: "Pro", mrr: 1499, status: "Activo", since: "Nov 2025", branches: 2, users: 9, isYou: false, link: null },
  { id: uid("t"), name: "Tacos El Farol", slug: "tacos-el-farol", ownerName: "Raúl Méndez", plan: "Básico", mrr: 699, status: "Activo", since: "Ene 2025", branches: 1, users: 3, isYou: false, link: null },
  { id: uid("t"), name: "Café Aurora", slug: "cafe-aurora", ownerName: "Paula Vega", plan: "Pro", mrr: 0, status: "Prueba", since: "Feb 2026", branches: 1, users: 4, isYou: false, link: null },
  { id: uid("t"), name: "Brasas del Sur", slug: "brasas-del-sur", ownerName: "Jorge Salas", plan: "Básico", mrr: 0, status: "Suspendido", since: "Set 2025", branches: 1, users: 2, isYou: false, link: null },
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
  private settings: PlatformSettings = {
    razonSocial: "Wayra POS S.A.C.",
    ruc: "20601234567",
    direccion: "Av. Javier Prado 1234, San Isidro, Lima",
    billingEmail: "facturacion@wayrapos.pe",
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

  async getPlatformSettings() {
    return { ...this.settings };
  }
  async updatePlatformSettings(patch: Partial<PlatformSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.log("Plataforma", "Plataforma", "sistema", "info", "Actualizó los datos del emisor del SaaS");
    this.emit();
  }

  async getRetention() {
    const mrrK = this.tenants.reduce((s, t) => s + t.mrr, 0) / 1000;
    return {
      nrr: 103,
      churnPct: 1.8,
      ltv: 34000,
      cac: 7400,
      lifetimeMonths: 31,
      waterfall: [
        { label: "Inicial", value: 8.5, kind: "base" as const },
        { label: "Nuevo", value: 1.4, kind: "add" as const },
        { label: "Expansión", value: 0.6, kind: "add" as const },
        { label: "Contracción", value: 0.3, kind: "sub" as const },
        { label: "Perdido", value: 0.3, kind: "sub" as const },
        { label: "Final", value: mrrK, kind: "base" as const },
      ],
      trials: [
        { name: "Café Aurora", days: "vence en 3 días", progress: 72, risk: "low" as const },
        { name: "Bistró Nórdico", days: "vence en 8 días", progress: 40, risk: "mid" as const },
        { name: "Wok & Co.", days: "vence hoy", progress: 18, risk: "high" as const },
      ],
      dunning: [
        { tenant: "Brasas del Sur", amount: 699, reason: "Tarjeta rechazada", tries: "3 intentos", status: "Suspendido" },
        { tenant: "Tacos El Farol", amount: 699, reason: "Tarjeta por expirar", tries: "1 intento", status: "En riesgo" },
      ],
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
    };
    this.tenants.unshift(tenant);
    this.log(tenant.name, "Plataforma", "plan", "info", `Tenant creado · plan ${input.plan} (prueba 14 días)`);
    this.emit();
    return { tenant, link: tenant.link! };
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
}
