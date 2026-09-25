import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Prueba estática de seguridad sobre las migraciones (sin base de datos):
// verifica que RLS esté habilitado donde debe y que las tablas de credenciales
// secretas sean de SOLO ESCRITURA (sin política SELECT), de modo que un secreto
// nunca pueda leerse de vuelta desde el cliente.

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const SQL = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n");

function hasRLS(table: string): boolean {
  // Habilitación directa o vía el arreglo tenant_tables del loop en 0002_rls.
  const direct = new RegExp(`alter table ${table}\\s+enable row level security`, "i").test(SQL);
  const inLoop = new RegExp(`'${table}'`).test(SQL);
  return direct || inLoop;
}

function policiesFor(table: string): string[] {
  const re = new RegExp(`create policy\\s+\\w+\\s+on ${table}\\b[\\s\\S]*?;`, "gi");
  return SQL.match(re) ?? [];
}

describe("RLS — habilitación en tablas sensibles", () => {
  const tenantTables = [
    "orders", "order_lines", "comprobantes", "business_settings",
    "customers", "restaurant_tables", "kitchen_tickets", "inventory_items",
    "role_permissions", "reservations",
  ];
  for (const t of tenantTables) {
    it(`${t} tiene RLS habilitado`, () => {
      expect(hasRLS(t)).toBe(true);
    });
  }
});

describe("RLS — credenciales secretas de SOLO ESCRITURA (sin SELECT)", () => {
  const secretTables = ["payment_credentials", "fiscal_credentials", "platform_fiscal_credentials"];
  for (const t of secretTables) {
    it(`${t} tiene RLS y ninguna política SELECT`, () => {
      expect(hasRLS(t)).toBe(true);
      const pols = policiesFor(t);
      expect(pols.length).toBeGreaterThan(0);
      const selectPolicies = pols.filter((p) => /for\s+select/i.test(p) || /for\s+all/i.test(p));
      expect(selectPolicies).toEqual([]);
    });
  }
});

describe("RLS — delivery", () => {
  for (const t of ["delivery_orders", "delivery_zones", "delivery_drivers"]) {
    it(`${t} tiene RLS habilitado`, () => expect(hasRLS(t)).toBe(true));
  }
  it("zonas y repartidores solo los modifica gerencia (can_manage)", () => {
    for (const t of ["delivery_zones", "delivery_drivers"]) {
      const writes = policiesFor(t).filter((p) => /for\s+(insert|update|delete)/i.test(p));
      expect(writes.length).toBe(3);
      for (const p of writes) expect(p).toMatch(/app\.can_manage/);
    }
  });
  it("los pedidos no se pueden borrar (se cancelan con motivo)", () => {
    const deletes = policiesFor("delivery_orders").filter((p) => /for\s+(delete|all)/i.test(p));
    expect(deletes).toEqual([]);
  });
  it("el seguimiento público no expone dirección, teléfono ni montos", () => {
    const fn = SQL.match(/function public\.public_delivery_status[\s\S]*?\$\$;/i)?.[0] ?? "";
    expect(fn).not.toBe("");
    const selected = fn.slice(fn.indexOf("jsonb_build_object"), fn.indexOf("from delivery_orders"));
    for (const secret of ["address", "customer_phone", "customer_name", "reference", "total", "cash_for", "tracking_token"]) {
      expect(selected).not.toMatch(new RegExp(`\\bd\\.${secret}\\b`));
    }
    expect(fn).toMatch(/length\(p_token\)\s*>=\s*16/);
  });
});

describe("RLS — auditorías protegidas y de solo lectura para el cliente", () => {
  it("config_audit tiene RLS y no permite INSERT/UPDATE/DELETE por el cliente", () => {
    expect(hasRLS("config_audit")).toBe(true);
    const pols = policiesFor("config_audit");
    const writePolicies = pols.filter((p) => /for\s+(insert|update|delete|all)/i.test(p));
    expect(writePolicies).toEqual([]);
  });
  it("push_subscriptions tiene RLS habilitado", () => {
    expect(hasRLS("push_subscriptions")).toBe(true);
  });
});
