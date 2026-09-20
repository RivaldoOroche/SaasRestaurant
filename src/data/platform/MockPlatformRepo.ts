import type { PlatformRepo } from "./PlatformRepo";
import type { Tenant, PlanTier, NewTenantInput, SaasCharge } from "./model";
import { MOCK_TENANT_ID } from "@/auth/session";

const PLAN_PRICE: Record<PlanTier, number> = { Básico: 699, Pro: 1499, Enterprise: 4800 };

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
  return `https://app.wayrapos.pe/${slug}?onboard=${token}`;
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
  private listeners = new Set<() => void>();

  private emit() {
    this.listeners.forEach((l) => l());
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
        price: PLAN_PRICE[tier],
        features:
          tier === "Básico"
            ? "POS + 1 sucursal"
            : tier === "Pro"
              ? "POS + inventario + reportes + 3 sucursales"
              : "Todo + multi-sucursal + soporte prioritario",
        subscribers: rows.length,
        mrr: rows.reduce((s, t) => s + t.mrr, 0),
      };
    });
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
    return [
      { id: uid("tk"), tenant: "Sushi Nami", subject: "Impresora no responde", priority: "Alta", status: "Abierto", ago: "hace 2h" },
      { id: uid("tk"), tenant: "Cevichería El Muelle", subject: "Duda sobre reportes por mesero", priority: "Media", status: "Abierto", ago: "hace 5h" },
      { id: uid("tk"), tenant: "Tacos El Farol", subject: "Solicitud de nueva sucursal", priority: "Baja", status: "Abierto", ago: "ayer" },
      { id: uid("tk"), tenant: "La Higuera", subject: "Capacitación de personal", priority: "Baja", status: "Resuelto", ago: "hace 3 días" },
    ];
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
    this.emit();
    return { tenant, link: tenant.link! };
  }

  async setTenantPlan(id: string, plan: PlanTier) {
    const t = this.tenants.find((x) => x.id === id);
    if (!t) return;
    t.plan = plan;
    if (t.status === "Activo") t.mrr = PLAN_PRICE[plan];
    this.emit();
  }

  async toggleSuspend(id: string) {
    const t = this.tenants.find((x) => x.id === id);
    if (!t) return;
    if (t.status === "Suspendido") {
      t.status = "Activo";
      t.mrr = PLAN_PRICE[t.plan];
    } else {
      t.status = "Suspendido";
      t.mrr = 0;
    }
    this.emit();
  }

  async chargeTenant(id: string, method: string): Promise<SaasCharge> {
    const t = this.tenants.find((x) => x.id === id);
    const base = t ? Math.round((PLAN_PRICE[t.plan] / 1.18) * 100) / 100 : 0;
    const total = t ? PLAN_PRICE[t.plan] : 0;
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
