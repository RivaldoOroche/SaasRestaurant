import type { SupabaseClient } from "@supabase/supabase-js";
import type { BackendRepo, BranchInput, TerminalInfo } from "../Repo";
import type {
  Category,
  MenuItem,
  ModifierExtra,
  ModifierPref,
  Branch,
  BranchQuota,
  BranchSales,
  StaffMember,
  StaffRole,
  Order,
  OrderLine,
  KitchenTicket,
  Customer,
  InventoryItem,
  LogEntry,
  BusinessSettings,
  MenuChange,
  Comprobante,
  ResumenDiario,
  BajaResult,
  FiscalCredentialsInput,
  CardCredentialsInput,
  Complaint,
  Reservation,
  WaitlistEntry,
  Subscription,
  MyPlanRequest,
  CardChargeInput,
  CardChargeResult,
  DeliveryZone,
  DeliveryDriver,
  DeliveryOrder,
  DeliveryChannel,
  DeliveryPay,
  DriverVehicle,
  RestaurantTable,
} from "../model";
import type { Database, Row, PlanTier } from "@/types/database";
import type { OpResult, PosOp, PosSnapshot } from "../pos/ops";
import { stubSunatGateway, type SunatGateway, type SunatResult } from "../sunat/gateway";
import { makeFunctionGateway } from "../sunat/functionGateway";
import { decideEmission } from "../sunat/outbox";

/** Error legible a partir de un error de PostgREST (mensajes de los triggers en español). */
function fail(error: { message?: string } | null): never {
  throw new Error(error?.message ?? "Error de base de datos");
}

/** Columnas de la lista de comprobantes (sin XML/CDR, que pesan). */
const CPE_COLS =
  "id, folio, tipo, buyer_ruc, buyer_name, subtotal, igv, total, reference, status, error, issued_at, ref_folio, motivo, order_id";

/**
 * Backend Supabase. El aislamiento por tenant lo garantiza RLS; igual se envía
 * tenant_id en los inserts. Las operaciones del salón van por RPC (pos_apply /
 * pos_snapshot): una llamada por lote, atómica e idempotente.
 */
export class SupabaseRepo implements BackendRepo {
  readonly remote = true;
  private sunat: SunatGateway;
  private betaMode: boolean;

  constructor(
    private sb: SupabaseClient<Database>,
    private tenantId: string,
  ) {
    // VITE_SUNAT_MODE=beta usa la Edge Function real; en otro caso, el stub.
    this.betaMode = import.meta.env.VITE_SUNAT_MODE === "beta";
    this.sunat = this.betaMode ? makeFunctionGateway(sb, tenantId) : stubSunatGateway;
  }

  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.sb
      .from("menu_categories")
      .select("*")
      .order("sort");
    if (error) throw error;
    return (data ?? []).map(mapCategory);
  }

  async getMenuItems(): Promise<MenuItem[]> {
    const { data, error } = await this.sb.from("menu_items").select("*").order("sort");
    if (error) throw error;
    return (data ?? []).map(mapItem);
  }

  async getExtras(): Promise<ModifierExtra[]> {
    const { data, error } = await this.sb.from("modifier_extras").select("*");
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, key: r.key, name: r.name, price: Number(r.price) }));
  }

  async getPrefs(): Promise<ModifierPref[]> {
    const { data, error } = await this.sb.from("modifier_prefs").select("*");
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, key: r.key, name: r.name }));
  }

  async getBranches(): Promise<Branch[]> {
    const { data, error } = await this.sb
      .from("branches")
      .select("id, name, city, parent_id, active, address, phone, sort")
      .order("sort")
      .order("name");
    if (error) fail(error);
    return (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      city: b.city,
      parentId: b.parent_id,
      active: b.active,
      address: b.address,
      phone: b.phone,
    }));
  }

  async addBranch(input: BranchInput): Promise<void> {
    let parentId = input.parentId ?? null;
    if (!parentId) {
      const { data } = await this.sb.from("branches").select("id").is("parent_id", null).maybeSingle();
      parentId = data?.id ?? null;
    }
    const { error } = await this.sb.from("branches").insert({
      tenant_id: this.tenantId,
      parent_id: parentId,
      name: input.name,
      city: input.city,
      address: input.address ?? "",
      phone: input.phone ?? "",
    });
    if (error) fail(error);
  }
  async updateBranch(id: string, patch: Partial<BranchInput & { active: boolean }>): Promise<void> {
    const row: Database["public"]["Tables"]["branches"]["Update"] = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.city !== undefined) row.city = patch.city;
    if (patch.address !== undefined) row.address = patch.address;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.parentId !== undefined) row.parent_id = patch.parentId;
    const { error } = await this.sb.from("branches").update(row).eq("id", id);
    if (error) fail(error);
  }
  /** Los triggers impiden borrar la principal, una con hijas o con historial. */
  async removeBranch(id: string): Promise<void> {
    const { error } = await this.sb.from("branches").delete().eq("id", id);
    if (error) fail(error);
  }
  async getBranchQuota(): Promise<BranchQuota> {
    const { data, error } = await this.sb.rpc("branch_quota", { p_tenant: this.tenantId });
    if (error) fail(error);
    const q = data as { plan: string; used: number; max: number | null; remaining: number | null };
    return { plan: q.plan, used: q.used, max: q.max, remaining: q.remaining };
  }

  // ---- Personal ----
  async getStaff(): Promise<StaffMember[]> {
    const { data, error } = await this.sb
      .from("staff_members")
      .select("id, name, initials, role, active")
      .order("name");
    if (error) throw error;
    return (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      initials: s.initials,
      role: s.role as StaffRole,
      active: s.active,
    }));
  }
  async addStaff(input: { name: string; role: StaffRole; pin: string }): Promise<void> {
    const pin_hash = await sha256Hex(input.pin);
    const { error } = await this.sb.from("staff_members").insert({
      tenant_id: this.tenantId,
      name: input.name,
      initials: initialsOf(input.name),
      role: input.role,
      pin_hash,
      active: true,
    });
    if (error) throw error;
  }
  async updateStaff(id: string, patch: Partial<{ name: string; role: StaffRole; active: boolean }>): Promise<void> {
    const row: Database["public"]["Tables"]["staff_members"]["Update"] = { ...patch };
    if (patch.name) row.initials = initialsOf(patch.name);
    const { error } = await this.sb.from("staff_members").update(row).eq("id", id);
    if (error) throw error;
  }
  async setStaffPin(id: string, pin: string): Promise<void> {
    const pin_hash = await sha256Hex(pin);
    const { error } = await this.sb.from("staff_members").update({ pin_hash }).eq("id", id);
    if (error) throw error;
  }

  async addTable(input: { zone: string; number: number; seats: number; branchId: string | null; count?: number }): Promise<void> {
    const count = Math.max(1, input.count ?? 1);
    const rows = Array.from({ length: count }, (_, i) => ({
      tenant_id: this.tenantId,
      branch_id: input.branchId ?? undefined, // sin sucursal: la principal (trigger)
      zone: input.zone,
      number: input.number + i,
      seats: input.seats,
      status: "libre" as const,
    }));
    const { error } = await this.sb.from("restaurant_tables").insert(rows);
    if (error) fail(error.code === "23505" ? { message: "Ese número de mesa ya existe en la sucursal." } : error);
  }

  async updateTable(id: string, patch: Partial<{ zone: string; number: number; seats: number }>): Promise<void> {
    const { error } = await this.sb.from("restaurant_tables").update(patch).eq("id", id);
    if (error) throw error;
  }

  async removeTable(id: string): Promise<void> {
    const { data: t } = await this.sb.from("restaurant_tables").select("status").eq("id", id).maybeSingle();
    if (t && t.status !== "libre") throw new Error("No se puede eliminar una mesa ocupada");
    const { error } = await this.sb.from("restaurant_tables").delete().eq("id", id);
    if (error) throw error;
  }

  // ---- Operaciones del POS (una llamada por lote) ----
  async snapshot(since: string | null): Promise<PosSnapshot> {
    const { data, error } = await this.sb.rpc("pos_snapshot", { p_tenant: this.tenantId, p_since: since });
    if (error) fail(error);
    return mapSnapshot(data as SnapshotDto);
  }

  async apply(ops: PosOp[]): Promise<OpResult[]> {
    const { data, error } = await this.sb.rpc("pos_apply", {
      p_tenant: this.tenantId,
      p_device: deviceLabel(),
      p_ops: ops,
    });
    if (error) fail(error);
    return data as OpResult[];
  }

  async terminal(deviceId: string): Promise<TerminalInfo> {
    const { data, error } = await this.sb.rpc("pos_terminal", { p_tenant: this.tenantId, p_device: deviceId });
    if (error) fail(error);
    const t = data as { serie_boleta: string; serie_factura: string; last_boleta: number; last_factura: number };
    return { serieBoleta: t.serie_boleta, serieFactura: t.serie_factura, lastBoleta: t.last_boleta, lastFactura: t.last_factura };
  }

  /** Historial de ventas: pedidos + líneas + mesa en UNA consulta (antes, 2 por pedido). */
  async getPaidOrders(branchId?: string | null): Promise<Order[]> {
    let q = this.db
      .from("orders")
      .select("*, order_lines(*), restaurant_tables(number, seats, zone), delivery_orders(code)")
      .eq("status", "cobrada")
      .order("closed_at", { ascending: false })
      .limit(500);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) fail(error);
    return ((data ?? []) as PaidOrderRow[]).map(mapPaidOrder);
  }

  async getBranchSales(): Promise<BranchSales[]> {
    const [{ data: branches, error }, { data: sales, error: sErr }] = await Promise.all([
      this.sb.from("branches").select("id, name, city").order("name"),
      this.sb.rpc("branch_sales", { p_tenant: this.tenantId }),
    ]);
    if (error) fail(error);
    if (sErr) fail(sErr);
    const byBranch = new Map((sales ?? []).map((r) => [r.branch_id, r]));
    return (branches ?? []).map((b) => {
      const t = byBranch.get(b.id);
      return { branchId: b.id, name: b.name, city: b.city, sales: Number(t?.sales ?? 0), orders: t?.orders ?? 0 };
    });
  }

  async setMenuPrice(itemId: string, price: number): Promise<void> {
    const { error } = await this.sb.from("menu_items").update({ price }).eq("id", itemId);
    if (error) throw error;
  }
  async setMenuAvailable(itemId: string, available: boolean): Promise<void> {
    const { error } = await this.sb.from("menu_items").update({ available }).eq("id", itemId);
    if (error) throw error;
  }

  async getCustomers(): Promise<Customer[]> {
    const { data, error } = await this.sb.from("customers").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      visits: c.visits,
      spent: Number(c.spent),
      points: c.points,
      tier: c.tier,
    }));
  }

  /** Catálogo + stock de la sucursal (o la suma de todas). */
  async getInventory(branchId?: string | null): Promise<InventoryItem[]> {
    let sq = this.sb.from("inventory_stock").select("item_id, qty");
    if (branchId) sq = sq.eq("branch_id", branchId);
    const [{ data: items, error }, { data: stock, error: sErr }] = await Promise.all([
      this.sb.from("inventory_items").select("id, name, unit, par, cost").eq("active", true).order("name"),
      sq,
    ]);
    if (error) fail(error);
    if (sErr) fail(sErr);
    const qty = new Map<string, number>();
    for (const s of stock ?? []) qty.set(s.item_id, (qty.get(s.item_id) ?? 0) + Number(s.qty));
    return (items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      stock: Math.round((qty.get(i.id) ?? 0) * 1000) / 1000,
      par: Number(i.par),
      cost: i.cost != null ? Number(i.cost) : undefined,
    }));
  }
  async getRecipes(): Promise<Record<string, { inventoryId: string; qtyPerUnit: number }[]>> {
    const { data, error } = await this.sb.from("recipes").select("menu_item_id, inventory_id, qty_per_unit");
    if (error) throw error;
    const map: Record<string, { inventoryId: string; qtyPerUnit: number }[]> = {};
    for (const r of data ?? []) {
      (map[r.menu_item_id] ??= []).push({ inventoryId: r.inventory_id, qtyPerUnit: Number(r.qty_per_unit) });
    }
    return map;
  }

  async setRecipe(menuItemId: string, lines: { inventoryId: string; qtyPerUnit: number }[]): Promise<void> {
    // Reemplaza la receta: borra las líneas actuales e inserta las nuevas.
    await this.sb.from("recipes").delete().eq("menu_item_id", menuItemId);
    if (lines.length > 0) {
      const { error } = await this.sb.from("recipes").insert(
        lines.map((l) => ({
          tenant_id: this.tenantId,
          menu_item_id: menuItemId,
          inventory_id: l.inventoryId,
          qty_per_unit: l.qtyPerUnit,
        })),
      );
      if (error) throw error;
    }
  }

  async getMenuChanges(): Promise<MenuChange[]> {
    const { data, error } = await this.sb.from("menu_change_requests").select("*").order("created_at");
    if (error) throw error;
    return (data ?? []).map((c) => ({
      id: c.id,
      kind: c.kind,
      itemName: c.item_name,
      detail: c.detail,
      status: c.status as MenuChange["status"],
    }));
  }
  async reviewChange(id: string, approve: boolean, actor: string): Promise<void> {
    await this.sb
      .from("menu_change_requests")
      .update({ status: approve ? "aprobado" : "rechazado" })
      .eq("id", id);
    await this.log(`${actor} ${approve ? "aprobó" : "rechazó"} un cambio de carta`);
  }

  async getComprobantes(): Promise<Comprobante[]> {
    const { data, error } = await this.db
      .from("comprobantes")
      .select(CPE_COLS)
      .order("issued_at", { ascending: false })
      .limit(100);
    if (error) fail(error);
    return ((data ?? []) as Row<"comprobantes">[]).map(mapComprobante);
  }

  async getComprobanteDocs(id: string): Promise<{ signedXml: string | null; cdr: string | null }> {
    const { data, error } = await this.sb.from("comprobantes").select("signed_xml, cdr").eq("id", id).maybeSingle();
    if (error) fail(error);
    return { signedXml: data?.signed_xml ?? null, cdr: data?.cdr ?? null };
  }

  /**
   * Aplica el resultado de una emisión de forma idempotente y con reintentos:
   * - Aceptado → marca `aceptada`, guarda XML/CDR y limpia la cola.
   * - Rechazo definitivo (no transitorio) → `rechazada`, limpia la cola.
   * - Fallo transitorio (red/servidor) → mantiene `encola`, registra el intento
   *   y programa el próximo con backoff exponencial; al agotar los reintentos,
   *   `rechazada`. Reenviar un documento ya aceptado es seguro (SUNAT es
   *   idempotente por serie-correlativo), pero evitamos hacerlo.
   */
  private async settleEmission(cpe: Comprobante, res: SunatResult): Promise<Comprobante> {
    const { data: ob } = await this.sb
      .from("sunat_outbox")
      .select("id, attempts")
      .eq("comprobante_id", cpe.id)
      .maybeSingle();
    const decision = decideEmission(res, ob?.attempts ?? 0);

    if (decision.action === "accept") {
      await this.sb.rpc("set_comprobante_result", {
        cid: cpe.id,
        new_status: "aceptada",
        new_error: null,
        new_xml: res.signedXml ?? null,
        new_cdr: res.cdr ?? null,
      });
      await this.sb.from("sunat_outbox").delete().eq("comprobante_id", cpe.id);
      return { ...cpe, status: "aceptada", error: null, signedXml: res.signedXml ?? cpe.signedXml ?? null, cdr: res.cdr ?? cpe.cdr ?? null };
    }

    if (decision.action === "reject") {
      await this.sb.rpc("set_comprobante_result", {
        cid: cpe.id,
        new_status: "rechazada",
        new_error: decision.error,
        new_xml: res.signedXml ?? null,
        new_cdr: null,
      });
      if (ob) await this.sb.from("sunat_outbox").delete().eq("id", ob.id);
      return { ...cpe, status: "rechazada", error: decision.error };
    }

    // retry: mantiene en cola y programa el próximo intento con backoff.
    if (ob) {
      await this.sb
        .from("sunat_outbox")
        .update({ attempts: decision.attempts, next_attempt_at: decision.nextAttemptAt, last_error: decision.error })
        .eq("id", ob.id);
    } else {
      await this.sb.from("sunat_outbox").insert({
        tenant_id: this.tenantId,
        comprobante_id: cpe.id,
        attempts: decision.attempts,
        next_attempt_at: decision.nextAttemptAt,
        last_error: decision.error,
      });
    }
    await this.sb.rpc("set_comprobante_result", {
      cid: cpe.id,
      new_status: "encola",
      new_error: decision.error,
      new_xml: null,
      new_cdr: null,
    });
    return { ...cpe, status: "encola", error: decision.error };
  }

  async emitNotaCredito(originalId: string, motivo: string, online: boolean): Promise<Comprobante> {
    const { data: orig, error: oErr } = await this.sb
      .from("comprobantes")
      .select("*")
      .eq("id", originalId)
      .single();
    if (oErr) throw oErr;
    const original = mapComprobante(orig);
    if (original.tipo === "NotaCredito") throw new Error("No se puede anular una nota de crédito");
    const serie = original.folio.startsWith("F") ? "FC01" : "BC01";
    const { data: folio, error: folioErr } = await this.sb.rpc("next_folio", {
      tid: this.tenantId,
      p_serie: serie,
    });
    if (folioErr) throw folioErr;
    const { data, error } = await this.sb
      .from("comprobantes")
      .insert({
        tenant_id: this.tenantId,
        order_id: orig.order_id,
        folio,
        tipo: "NotaCredito",
        buyer_ruc: original.buyerRuc,
        buyer_name: original.buyerName,
        subtotal: original.subtotal,
        igv: original.igv,
        total: original.total,
        reference: `Anula ${original.folio}`,
        ref_folio: original.folio,
        motivo,
        status: online ? "enviando" : "encola",
      })
      .select("*")
      .single();
    if (error) throw error;
    let cpe = mapComprobante(data);
    if (online) {
      cpe = await this.settleEmission(cpe, await this.sunat.submit(cpe));
    } else {
      await this.sb.from("sunat_outbox").insert({ tenant_id: this.tenantId, comprobante_id: cpe.id });
    }
    await this.log(`Nota de crédito ${folio} · anula ${original.folio} · ${cpe.status}`);
    return cpe;
  }

  async sendResumenDiario(online: boolean): Promise<ResumenDiario> {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await this.sb
      .from("comprobantes")
      .select("folio, buyer_ruc, subtotal, igv, total, status")
      .eq("tipo", "Boleta")
      .gte("issued_at", `${today}T00:00:00`)
      .lte("issued_at", `${today}T23:59:59.999`);
    const rows = (data ?? []).filter((r) => r.status === "aceptada");
    const total = Math.round(rows.reduce((s, r) => s + Number(r.total), 0) * 100) / 100;
    const folio = `RC-${today.replace(/-/g, "")}-1`;
    const resumen: ResumenDiario = { folio, fecha: today, count: rows.length, total, status: online ? "aceptada" : "encola" };

    // En modo beta enviamos el resumen real (RC) a SUNAT vía Edge Function.
    if (online && this.betaMode && rows.length > 0) {
      const lineas = rows.map((r) => {
        const [serie, correlativo] = r.folio.split("-");
        return {
          tipoDoc: "03",
          serie,
          correlativo,
          clienteTipoDoc: r.buyer_ruc ? "6" : "1",
          clienteNumDoc: r.buyer_ruc || "-",
          gravado: Number(r.subtotal),
          igv: Number(r.igv),
          total: Number(r.total),
        };
      });
      const { data: res, error } = await this.sb.functions.invoke("sunat-lotes", {
        body: { action: "send", kind: "RC", id: folio, fechaReferencia: today, tenantId: this.tenantId, lineas },
      });
      if (error) {
        resumen.status = "rechazada";
      } else {
        const r = res as { accepted?: boolean; ticket?: string; description?: string };
        resumen.status = r.accepted ? "enviando" : "rechazada";
        resumen.ticket = r.ticket ?? null;
      }
    }

    await this.log(`Resumen diario ${folio} · ${rows.length} boleta(s) · ${resumen.status}`);
    return resumen;
  }

  async comunicarBaja(comprobanteId: string, motivo: string, online: boolean): Promise<BajaResult> {
    const { data: cpe, error } = await this.sb.from("comprobantes").select("*").eq("id", comprobanteId).single();
    if (error) throw error;
    const c = mapComprobante(cpe);
    if (c.tipo !== "Factura") throw new Error("La comunicación de baja aplica a facturas");
    const today = new Date().toISOString().slice(0, 10);
    const folio = `RA-${today.replace(/-/g, "")}-1`;
    const [serie, correlativo] = c.folio.split("-");

    const result: BajaResult = { folio, refFolio: c.folio, status: online ? "aceptada" : "encola" };

    if (online && this.betaMode) {
      const { data: res, error: fnErr } = await this.sb.functions.invoke("sunat-lotes", {
        body: {
          action: "send",
          kind: "RA",
          id: folio,
          fechaReferencia: c.issuedAt.slice(0, 10),
          tenantId: this.tenantId,
          lineas: [{ tipoDoc: "01", serie, correlativo, motivo }],
        },
      });
      if (fnErr) result.status = "rechazada";
      else {
        const r = res as { accepted?: boolean; ticket?: string };
        result.status = r.accepted ? "enviando" : "rechazada";
        result.ticket = r.ticket ?? null;
      }
    }

    // Refleja la baja en el comprobante (marca de anulado).
    await this.sb.rpc("set_comprobante_result", {
      cid: comprobanteId,
      new_status: "rechazada",
      new_error: `Dada de baja: ${motivo}`,
      new_xml: null,
      new_cdr: null,
    });
    await this.log(`Comunicación de baja ${folio} · ${c.folio} · ${motivo}`);
    return result;
  }

  async syncSunat(online: boolean): Promise<number> {
    if (!online) return 0;
    const { data: queued } = await this.db.from("comprobantes").select(CPE_COLS).eq("status", "encola");
    const rows = (queued ?? []) as Row<"comprobantes">[];
    if (!rows.length) return 0;
    // Respeta el backoff: no reenvíes los que aún no toca (next_attempt_at futuro).
    const now = new Date().toISOString();
    const { data: obrows } = await this.sb
      .from("sunat_outbox")
      .select("comprobante_id, next_attempt_at")
      .in("comprobante_id", rows.map((r) => r.id));
    const nextMap = new Map((obrows ?? []).map((o) => [o.comprobante_id, o.next_attempt_at]));
    let sent = 0;
    for (const row of rows) {
      const nextAt = nextMap.get(row.id);
      if (nextAt && nextAt > now) continue; // aún no vence el backoff
      const cpe = mapComprobante(row);
      const settled = await this.settleEmission(cpe, await this.sunat.submit(cpe));
      if (settled.status === "aceptada") sent++;
    }
    if (sent > 0) await this.log(`Sincronizó ${sent} comprobante(s) con SUNAT`);
    return sent;
  }

  async retryComprobante(id: string, online: boolean): Promise<void> {
    if (!online) return;
    const { data } = await this.db.from("comprobantes").select(CPE_COLS).eq("id", id).maybeSingle();
    if (!data) return;
    const cpe = mapComprobante(data as Row<"comprobantes">);
    if (cpe.status === "aceptada") return; // ya aceptado: idempotente, nada que reenviar
    await this.settleEmission(cpe, await this.sunat.submit(cpe));
  }

  async getSettings(): Promise<BusinessSettings> {
    const [{ data }, { data: t }] = await Promise.all([
      this.sb.from("business_settings").select("*").eq("tenant_id", this.tenantId).maybeSingle(),
      this.sb.from("tenants").select("slug").eq("id", this.tenantId).maybeSingle(),
    ]);
    return {
      name: data?.name ?? "",
      slug: t?.slug ?? undefined,
      currency: (data?.currency ?? "PEN") as BusinessSettings["currency"],
      taxRate: Number(data?.tax_rate ?? 18),
      taxRegime: (data?.tax_regime ?? "general") as BusinessSettings["taxRegime"],
      tipPresets: data?.tip_presets ?? [10, 15, 18],
      onlineOrders: data?.online_orders ?? true,
      autoTip: data?.auto_tip ?? true,
      yapeNumber: data?.yape_number ?? "",
      plinNumber: data?.plin_number ?? "",
      cardProvider: (data?.card_provider ?? "ninguno") as BusinessSettings["cardProvider"],
      cardPublicKey: data?.card_public_key ?? "",
      ruc: data?.ruc ?? "",
      razonSocial: data?.razon_social ?? "",
      direccionFiscal: data?.address ?? "",
      ubigeo: data?.ubigeo ?? "",
      billingProvider: (data?.billing_provider ?? "ninguno") as BusinessSettings["billingProvider"],
      sunatMode: (data?.sunat_mode ?? "beta") as BusinessSettings["sunatMode"],
      solUser: data?.sol_user ?? "",
      billingEndpoint: data?.billing_endpoint ?? "",
    };
  }
  async updateSettings(patch: Partial<BusinessSettings>): Promise<void> {
    const row: Database["public"]["Tables"]["business_settings"]["Update"] = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.currency !== undefined) row.currency = patch.currency;
    if (patch.taxRate !== undefined) row.tax_rate = patch.taxRate;
    if (patch.taxRegime !== undefined) row.tax_regime = patch.taxRegime;
    if (patch.tipPresets !== undefined) row.tip_presets = patch.tipPresets;
    if (patch.onlineOrders !== undefined) row.online_orders = patch.onlineOrders;
    if (patch.autoTip !== undefined) row.auto_tip = patch.autoTip;
    if (patch.yapeNumber !== undefined) row.yape_number = patch.yapeNumber;
    if (patch.plinNumber !== undefined) row.plin_number = patch.plinNumber;
    if (patch.cardProvider !== undefined) row.card_provider = patch.cardProvider;
    if (patch.cardPublicKey !== undefined) row.card_public_key = patch.cardPublicKey;
    if (patch.ruc !== undefined) row.ruc = patch.ruc;
    if (patch.razonSocial !== undefined) row.razon_social = patch.razonSocial;
    if (patch.direccionFiscal !== undefined) row.address = patch.direccionFiscal;
    if (patch.ubigeo !== undefined) row.ubigeo = patch.ubigeo;
    if (patch.billingProvider !== undefined) row.billing_provider = patch.billingProvider;
    if (patch.sunatMode !== undefined) row.sunat_mode = patch.sunatMode;
    if (patch.solUser !== undefined) row.sol_user = patch.solUser;
    if (patch.billingEndpoint !== undefined) row.billing_endpoint = patch.billingEndpoint;
    await this.sb.from("business_settings").update(row).eq("tenant_id", this.tenantId);
  }

  async setCardCredentials(input: CardCredentialsInput): Promise<void> {
    // Escribe (no lee) las credenciales secretas; solo los campos provistos.
    const row: Database["public"]["Tables"]["payment_credentials"]["Insert"] = {
      tenant_id: this.tenantId,
      provider: input.provider,
      updated_at: new Date().toISOString(),
    };
    if (input.secretKey !== undefined) row.secret_key = input.secretKey;
    if (input.merchantId !== undefined) row.merchant_id = input.merchantId;
    if (input.webhookSecret !== undefined) row.webhook_secret = input.webhookSecret;
    await this.sb.from("payment_credentials").upsert(row);
  }

  async setFiscalCredentials(input: FiscalCredentialsInput): Promise<void> {
    // Escribe (no lee) las credenciales de facturación; upsert por tenant.
    // Solo se envían los campos provistos para no borrar los ya guardados.
    const row: Database["public"]["Tables"]["fiscal_credentials"]["Insert"] = {
      tenant_id: this.tenantId,
      provider: input.provider,
      updated_at: new Date().toISOString(),
    };
    if (input.solPass !== undefined) row.sol_pass = input.solPass;
    if (input.certPem !== undefined) row.cert_pem = input.certPem;
    if (input.keyPem !== undefined) row.key_pem = input.keyPem;
    if (input.apiToken !== undefined) row.api_token = input.apiToken;
    await this.sb.from("fiscal_credentials").upsert(row);
  }

  async chargeCard(input: CardChargeInput): Promise<CardChargeResult> {
    const { data, error } = await this.sb.functions.invoke("pago-tarjeta", {
      body: {
        tenantId: this.tenantId,
        token: input.token,
        amount: input.amount,
        currency: input.currency,
        email: input.email,
        description: input.description ?? "",
      },
    });
    if (error) return { success: false, error: error.message };
    const r = data as { success?: boolean; chargeId?: string; error?: string };
    if (r.success) await this.log(`Cargo con tarjeta ${r.chargeId ?? ""} · S/ ${input.amount.toFixed(2)}`);
    return { success: !!r.success, chargeId: r.chargeId, error: r.error };
  }

  async getComplaints(): Promise<Complaint[]> {
    const { data, error } = await this.sb
      .from("complaints")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((c) => ({
      id: c.id,
      correlativo: c.correlativo,
      consumerName: c.consumer_name,
      consumerDoc: c.consumer_doc,
      consumerDocType: c.consumer_doc_type,
      consumerEmail: c.consumer_email ?? undefined,
      consumerPhone: c.consumer_phone ?? undefined,
      itemType: c.item_type,
      itemAmount: c.item_amount ?? undefined,
      itemDescription: c.item_description ?? undefined,
      claimType: c.claim_type,
      detail: c.detail,
      request: c.request ?? undefined,
      status: c.status,
      response: c.response ?? undefined,
      respondedAt: c.responded_at ?? undefined,
      createdAt: c.created_at,
    }));
  }

  async respondComplaint(id: string, response: string): Promise<void> {
    const { error } = await this.sb
      .from("complaints")
      .update({ status: "respondido", response, responded_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await this.log(`Respondió una hoja del Libro de Reclamaciones`);
  }

  async getReservations(): Promise<Reservation[]> {
    const { data, error } = await this.sb
      .from("reservations")
      .select("*")
      .order("res_date", { ascending: true })
      .order("at_time", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone ?? undefined,
      partySize: r.party_size,
      zone: r.zone,
      date: r.res_date,
      atTime: r.at_time,
      status: r.status as Reservation["status"],
      notes: r.notes ?? undefined,
    }));
  }
  async addReservation(input: Omit<Reservation, "id" | "status">): Promise<void> {
    const { error } = await this.sb.from("reservations").insert({
      tenant_id: this.tenantId,
      name: input.name,
      phone: input.phone ?? null,
      party_size: input.partySize,
      zone: input.zone,
      res_date: input.date,
      at_time: input.atTime,
      notes: input.notes ?? null,
    });
    if (error) throw error;
    await this.log(`Reserva registrada · ${input.name} (${input.partySize}) · ${input.date} ${input.atTime}`);
  }
  async updateReservation(id: string, patch: Partial<Reservation>): Promise<void> {
    const row: Database["public"]["Tables"]["reservations"]["Update"] = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.partySize !== undefined) row.party_size = patch.partySize;
    if (patch.zone !== undefined) row.zone = patch.zone;
    if (patch.date !== undefined) row.res_date = patch.date;
    if (patch.atTime !== undefined) row.at_time = patch.atTime;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.notes !== undefined) row.notes = patch.notes;
    const { error } = await this.sb.from("reservations").update(row).eq("id", id);
    if (error) throw error;
  }
  async removeReservation(id: string): Promise<void> {
    await this.sb.from("reservations").delete().eq("id", id);
  }

  async getWaitlist(): Promise<WaitlistEntry[]> {
    const { data, error } = await this.sb.from("waitlist").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      phone: w.phone ?? undefined,
      partySize: w.party_size,
      waitLabel: w.wait_label,
      status: w.status as WaitlistEntry["status"],
      createdAt: w.created_at,
    }));
  }
  async addWaitlist(input: Omit<WaitlistEntry, "id" | "status" | "createdAt">): Promise<void> {
    const { error } = await this.sb.from("waitlist").insert({
      tenant_id: this.tenantId,
      name: input.name,
      phone: input.phone ?? null,
      party_size: input.partySize,
      wait_label: input.waitLabel,
    });
    if (error) throw error;
    await this.log(`Lista de espera · ${input.name} (${input.partySize})`);
  }
  async updateWaitlist(id: string, patch: Partial<WaitlistEntry>): Promise<void> {
    const row: Database["public"]["Tables"]["waitlist"]["Update"] = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.partySize !== undefined) row.party_size = patch.partySize;
    if (patch.waitLabel !== undefined) row.wait_label = patch.waitLabel;
    if (patch.status !== undefined) row.status = patch.status;
    const { error } = await this.sb.from("waitlist").update(row).eq("id", id);
    if (error) throw error;
  }
  async removeWaitlist(id: string): Promise<void> {
    await this.sb.from("waitlist").delete().eq("id", id);
  }

  async getSubscription(): Promise<Subscription> {
    const { data, error } = await this.sb
      .from("v_tenants")
      .select("plan, status")
      .eq("id", this.tenantId)
      .maybeSingle();
    if (error) fail(error);
    const { data: plan } = await this.sb.from("subscription_plans").select("price").eq("tier", data?.plan ?? "Pro").maybeSingle();
    return { plan: data?.plan ?? "Pro", price: Number(plan?.price ?? 0), status: data?.status ?? "Activo" };
  }
  async getLegalAcceptances(): Promise<Record<string, string>> {
    const { data: u } = await this.sb.auth.getUser();
    if (!u.user) return {};
    const { data, error } = await this.sb
      .from("legal_acceptances")
      .select("document, version, accepted_at")
      .eq("user_id", u.user.id)
      .order("accepted_at");
    if (error) fail(error);
    // La más reciente por documento.
    return Object.fromEntries((data ?? []).map((r) => [r.document, r.version]));
  }
  async acceptLegal(docs: { document: string; version: string }[]): Promise<void> {
    const { data: u } = await this.sb.auth.getUser();
    if (!u.user) throw new Error("No hay sesión activa.");
    const { error } = await this.sb.from("legal_acceptances").upsert(
      docs.map((d) => ({
        user_id: u.user!.id,
        tenant_id: this.tenantId,
        document: d.document,
        version: d.version,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      })),
      { onConflict: "user_id,tenant_id,document,version", ignoreDuplicates: true },
    );
    if (error) fail(error);
  }

  async getMyPlanRequest(): Promise<MyPlanRequest | null> {
    const { data } = await this.sb
      .from("plan_change_requests")
      .select("to_plan, status")
      .eq("tenant_id", this.tenantId)
      .eq("status", "pendiente")
      .maybeSingle();
    return data ? { toPlan: data.to_plan, status: data.status } : null;
  }
  async requestPlanChange(toPlan: string): Promise<void> {
    const { data: t } = await this.sb.from("tenants").select("plan").eq("id", this.tenantId).maybeSingle();
    const { error } = await this.sb.from("plan_change_requests").insert({
      tenant_id: this.tenantId,
      from_plan: (t?.plan ?? "Pro") as PlanTier,
      to_plan: toPlan as PlanTier,
    });
    if (error) throw error;
    await this.log(`Solicitó cambio de plan a ${toPlan}`);
  }

  async getRolePermissions(): Promise<Record<string, string[]>> {
    const { data, error } = await this.sb.from("role_permissions").select("role, screens");
    if (error) throw error;
    const out: Record<string, string[]> = {};
    for (const r of data ?? []) out[r.role] = r.screens ?? [];
    return out;
  }
  async setRolePermissions(role: string, screens: string[]): Promise<void> {
    const { error } = await this.sb
      .from("role_permissions")
      .upsert(
        { tenant_id: this.tenantId, role: role as Database["public"]["Tables"]["role_permissions"]["Row"]["role"], screens, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id,role" },
      );
    if (error) throw error;
    await this.log(`Actualizó permisos del rol ${role}`);
  }

  async getActivityLog(): Promise<LogEntry[]> {
    const { data, error } = await this.sb
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return (data ?? []).map((l) => ({
      id: l.id,
      actor: l.actor,
      message: l.message,
      at: new Date(l.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
    }));
  }

  async savePushSubscription(data: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    const { data: u } = await this.sb.auth.getUser();
    const uid = u.user?.id;
    if (!uid) throw new Error("No hay sesión activa.");
    const { error } = await this.sb.from("push_subscriptions").upsert(
      {
        tenant_id: this.tenantId,
        user_id: uid,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
  }
  async removePushSubscription(endpoint: string): Promise<void> {
    const { error } = await this.sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
  }

  // ---- Delivery ----
  async getDeliveryZones(): Promise<DeliveryZone[]> {
    const { data, error } = await this.sb.from("delivery_zones").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map((z) => ({ id: z.id, name: z.name, fee: Number(z.fee), etaMin: z.eta_min, active: z.active }));
  }
  async saveDeliveryZone(zone: Omit<DeliveryZone, "id"> & { id?: string }): Promise<void> {
    const row = { tenant_id: this.tenantId, name: zone.name, fee: zone.fee, eta_min: zone.etaMin, active: zone.active };
    const { error } = zone.id
      ? await this.sb.from("delivery_zones").update(row).eq("id", zone.id)
      : await this.sb.from("delivery_zones").insert(row);
    if (error) throw error;
  }
  async removeDeliveryZone(id: string): Promise<void> {
    const { error } = await this.sb.from("delivery_zones").delete().eq("id", id);
    if (error) throw error;
  }
  async getDrivers(): Promise<DeliveryDriver[]> {
    const { data, error } = await this.sb.from("delivery_drivers").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      vehicle: d.vehicle as DriverVehicle,
      active: d.active,
    }));
  }
  async saveDriver(driver: Omit<DeliveryDriver, "id"> & { id?: string }): Promise<void> {
    const row = { tenant_id: this.tenantId, name: driver.name, phone: driver.phone, vehicle: driver.vehicle, active: driver.active };
    const { error } = driver.id
      ? await this.sb.from("delivery_drivers").update(row).eq("id", driver.id)
      : await this.sb.from("delivery_drivers").insert(row);
    if (error) throw error;
  }
  async removeDriver(id: string): Promise<void> {
    const { error } = await this.sb.from("delivery_drivers").delete().eq("id", id);
    if (error) throw error;
  }

  private async log(message: string): Promise<void> {
    await this.sb.from("activity_log").insert({ tenant_id: this.tenantId, actor: "POS", message });
  }

  /**
   * Cambios de otros dispositivos. Filtrado por tenant: sin filtro, cada
   * cliente recibiría (y el servidor autorizaría) eventos de TODOS los tenants.
   * Las tablas están en la publicación supabase_realtime (0031).
   */
  onRemoteChange(cb: () => void): () => void {
    const filter = `tenant_id=eq.${this.tenantId}`;
    const channel = this.sb.channel(`pos-${this.tenantId}`);
    for (const table of ["orders", "kitchen_tickets", "restaurant_tables", "delivery_orders"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, cb);
    }
    channel.subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }

  /** Cliente sin tipos para consultas con recursos embebidos. */
  private get db(): SupabaseClient {
    return this.sb as unknown as SupabaseClient;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function mapCategory(r: Row<"menu_categories">): Category {
  return { id: r.id, key: r.key, name: r.name, icon: r.icon, subtitle: r.subtitle, sort: r.sort };
}
function mapItem(r: Row<"menu_items">): MenuItem {
  return {
    id: r.id,
    categoryId: r.category_id,
    name: r.name,
    description: r.description,
    price: Number(r.price),
    emoji: r.emoji,
    badge: r.badge,
    veg: r.is_veg,
    spicy: r.is_spicy,
    gf: r.is_gf,
    meat: r.is_meat,
    available: r.available,
    sort: r.sort,
  };
}
function deviceLabel(): string {
  try {
    return localStorage.getItem("wayra-device-id") ?? "";
  } catch {
    return "";
  }
}

// ---- Estado operativo (pos_snapshot) → modelo de la app ----
interface SnapshotDto {
  server_time: string;
  full: boolean;
  table_ids: string[] | null;
  tables: { id: string; zone: string; number: number; seats: number; status: RestaurantTable["status"]; waiter_id: string | null; branch_id: string }[];
  orders: {
    id: string;
    table_id: string | null;
    table_number: number | null;
    seats: number | null;
    zone: string | null;
    kind: Order["kind"];
    status: Order["status"];
    opened_at: string;
    closed_at: string | null;
    paid_method: string | null;
    paid_total: number | null;
    branch_id: string;
    customer_id: string | null;
    lines: {
      id: string;
      item_id: string | null;
      name: string;
      qty: number;
      unit_price: number;
      extra_price: number;
      modifiers: string;
      split_payer: number | null;
      sent_qty: number;
    }[];
  }[];
  tickets: {
    id: string;
    order_id: string | null;
    table_label: string;
    col: KitchenTicket["col"];
    entered_at: string;
    note: string;
    done: boolean;
    branch_id: string;
    lines: { qty: number; name: string }[];
  }[];
  deliveries: (Omit<Row<"delivery_orders">, "updated_at"> & {
    branch_id: string;
    items: { name: string; qty: number; price: number }[];
    subtotal: number;
    total: number;
    driver_name: string | null;
    created_at: string;
  })[];
}

export function mapSnapshot(d: SnapshotDto): PosSnapshot {
  return {
    serverTime: d.server_time,
    full: d.full,
    tableIds: d.table_ids,
    tables: d.tables.map((t) => ({
      id: t.id,
      zone: t.zone,
      number: t.number,
      seats: t.seats,
      status: t.status,
      waiterId: t.waiter_id,
      branchId: t.branch_id,
    })),
    orders: d.orders.map((o) => ({
      id: o.id,
      tableId: o.table_id,
      tableLabel: o.table_number != null ? String(o.table_number) : "—",
      seats: o.seats ?? 2,
      zone: o.zone ?? "",
      kind: o.kind,
      status: o.status,
      openedAt: o.opened_at,
      closedAt: o.closed_at,
      paidMethod: o.paid_method,
      paidTotal: o.paid_total != null ? Number(o.paid_total) : null,
      branchId: o.branch_id,
      customerId: o.customer_id,
      lines: o.lines.map((l) => ({
        id: l.id,
        orderId: o.id,
        itemId: l.item_id,
        name: l.name,
        qty: l.qty,
        unitPrice: Number(l.unit_price),
        extraPrice: Number(l.extra_price),
        modifiers: l.modifiers,
        splitPayer: l.split_payer,
        sentQty: l.sent_qty,
      })),
    })),
    tickets: d.tickets.map((k) => ({
      id: k.id,
      orderId: k.order_id,
      tableLabel: k.table_label,
      col: k.col,
      enteredAt: new Date(k.entered_at).getTime(),
      note: k.note,
      done: k.done,
      branchId: k.branch_id,
      lines: k.lines,
    })),
    deliveries: d.deliveries.map(mapDelivery),
  };
}

function mapDelivery(r: SnapshotDto["deliveries"][number]): DeliveryOrder {
  return {
    id: r.id,
    code: r.code,
    trackingToken: r.tracking_token,
    channel: r.channel as DeliveryChannel,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    address: r.address,
    reference: r.reference,
    zoneId: r.zone_id,
    zoneName: r.zone_name,
    items: (r.items ?? []).map((i) => ({ name: i.name, qty: Number(i.qty), price: Number(i.price) })),
    subtotal: Number(r.subtotal),
    fee: Number(r.fee),
    total: Number(r.total),
    payMethod: r.pay_method as DeliveryPay,
    cashFor: r.cash_for == null ? null : Number(r.cash_for),
    status: r.status,
    driverId: r.driver_id,
    driverName: r.driver_name,
    notes: r.notes,
    cancelReason: r.cancel_reason,
    etaMin: r.eta_min,
    branchId: r.branch_id,
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
    readyAt: r.ready_at,
    dispatchedAt: r.dispatched_at,
    deliveredAt: r.delivered_at,
    cancelledAt: r.cancelled_at,
  };
}

type PaidOrderRow = Row<"orders"> & {
  order_lines: Row<"order_lines">[];
  restaurant_tables: Pick<Row<"restaurant_tables">, "number" | "seats" | "zone"> | null;
  delivery_orders: { code: string } | null;
};

function mapPaidOrder(o: PaidOrderRow): Order {
  const t = o.restaurant_tables;
  return {
    id: o.id,
    tableId: o.table_id,
    tableLabel: t ? String(t.number) : o.delivery_orders?.code ?? "—",
    seats: t?.seats ?? 0,
    zone: t?.zone ?? (o.kind === "delivery" ? "Delivery" : ""),
    kind: o.kind,
    status: o.status,
    openedAt: o.opened_at,
    closedAt: o.closed_at,
    paidMethod: o.paid_method,
    paidTotal: o.paid_total != null ? Number(o.paid_total) : null,
    branchId: o.branch_id,
    customerId: o.customer_id,
    lines: [...(o.order_lines ?? [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map(mapLine),
  };
}
function mapComprobante(r: Row<"comprobantes">): Comprobante {
  return {
    id: r.id,
    folio: r.folio,
    tipo: r.tipo,
    buyerRuc: r.buyer_ruc,
    buyerName: r.buyer_name,
    subtotal: Number(r.subtotal),
    igv: Number(r.igv),
    total: Number(r.total),
    reference: r.reference,
    status: r.status,
    error: r.error,
    issuedAt: r.issued_at,
    refFolio: r.ref_folio,
    motivo: r.motivo,
    signedXml: r.signed_xml ?? null,
    cdr: r.cdr ?? null,
  };
}
function mapLine(r: Row<"order_lines">): OrderLine {
  return {
    id: r.id,
    orderId: r.order_id,
    itemId: r.menu_item_id,
    name: r.name,
    qty: r.qty,
    unitPrice: Number(r.unit_price),
    extraPrice: Number(r.extra_price),
    modifiers: r.modifiers,
    splitPayer: r.split_payer,
    sentQty: r.sent_qty,
  };
}
