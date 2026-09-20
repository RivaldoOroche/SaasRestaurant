import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repo, PayInput } from "../Repo";
import type {
  Category,
  MenuItem,
  ModifierExtra,
  ModifierPref,
  RestaurantTable,
  Order,
  OrderLine,
  KitchenTicket,
  DraftLine,
  Customer,
  InventoryItem,
  LogEntry,
  BusinessSettings,
  MenuChange,
  OnlineOrder,
  Comprobante,
  EmitComprobanteInput,
} from "../model";
import type { Database, Row } from "@/types/database";
import { stubSunatGateway, type SunatGateway } from "../sunat/gateway";
import { makeFunctionGateway } from "../sunat/functionGateway";

/**
 * Real backend repo. Tenant scoping is enforced by RLS; we still set tenant_id
 * on inserts so rows land in the right tenant. One instance per tenant.
 */
export class SupabaseRepo implements Repo {
  private sunat: SunatGateway;

  constructor(
    private sb: SupabaseClient<Database>,
    private tenantId: string,
  ) {
    // VITE_SUNAT_MODE=beta usa la Edge Function real; en otro caso, el stub.
    this.sunat =
      import.meta.env.VITE_SUNAT_MODE === "beta" ? makeFunctionGateway(sb) : stubSunatGateway;
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

  async getTables(): Promise<RestaurantTable[]> {
    const { data, error } = await this.sb.from("restaurant_tables").select("*").order("number");
    if (error) throw error;
    return (data ?? []).map(mapTable);
  }

  async getOpenOrderForTable(tableId: string): Promise<Order | null> {
    const { data, error } = await this.sb
      .from("orders")
      .select("*")
      .eq("table_id", tableId)
      .not("status", "in", "(cobrada,anulada)")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return this.hydrateOrder(data);
  }

  private async hydrateOrder(o: Row<"orders">): Promise<Order> {
    const [{ data: lines }, { data: table }] = await Promise.all([
      this.sb.from("order_lines").select("*").eq("order_id", o.id).order("created_at"),
      o.table_id
        ? this.sb.from("restaurant_tables").select("*").eq("id", o.table_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      id: o.id,
      tableId: o.table_id,
      tableLabel: table ? String((table as Row<"restaurant_tables">).number) : "—",
      seats: table ? (table as Row<"restaurant_tables">).seats : 2,
      zone: table ? (table as Row<"restaurant_tables">).zone : "",
      status: o.status,
      openedAt: o.opened_at,
      paidMethod: o.paid_method,
      paidTotal: o.paid_total != null ? Number(o.paid_total) : null,
      lines: (lines ?? []).map(mapLine),
    };
  }

  async openOrder(tableId: string): Promise<Order> {
    const existing = await this.getOpenOrderForTable(tableId);
    if (existing) return existing;
    const { data, error } = await this.sb
      .from("orders")
      .insert({ tenant_id: this.tenantId, table_id: tableId, status: "abierta" })
      .select("*")
      .single();
    if (error) throw error;
    await this.sb.from("restaurant_tables").update({ status: "ocupada" }).eq("id", tableId);
    return this.hydrateOrder(data);
  }

  async addLine(orderId: string, line: DraftLine): Promise<void> {
    const { error } = await this.sb.from("order_lines").insert({
      tenant_id: this.tenantId,
      order_id: orderId,
      menu_item_id: line.itemId,
      name: line.name,
      qty: line.qty,
      unit_price: line.unitPrice,
      extra_price: line.extraPrice,
      modifiers: line.modifiers,
    });
    if (error) throw error;
  }

  async setLineQty(lineId: string, qty: number): Promise<void> {
    if (qty <= 0) return this.removeLine(lineId);
    const { error } = await this.sb.from("order_lines").update({ qty }).eq("id", lineId);
    if (error) throw error;
  }

  async removeLine(lineId: string): Promise<void> {
    const { error } = await this.sb.from("order_lines").delete().eq("id", lineId);
    if (error) throw error;
  }

  async clearOrder(orderId: string): Promise<void> {
    const { error } = await this.sb.from("order_lines").delete().eq("order_id", orderId);
    if (error) throw error;
  }

  async sendToKitchen(orderId: string): Promise<void> {
    const order = await this.sb.from("orders").select("*").eq("id", orderId).single();
    if (order.error) throw order.error;
    const hydrated = await this.hydrateOrder(order.data);
    if (hydrated.lines.length === 0) return;
    const { data: ticket, error } = await this.sb
      .from("kitchen_tickets")
      .insert({
        tenant_id: this.tenantId,
        order_id: orderId,
        table_label: `Mesa ${hydrated.tableLabel}`,
        col: "nuevos",
      })
      .select("id")
      .single();
    if (error) throw error;
    await this.sb.from("ticket_lines").insert(
      hydrated.lines.map((l) => ({ ticket_id: ticket.id, qty: l.qty, name: l.name })),
    );
    await this.sb.from("orders").update({ status: "en_cocina" }).eq("id", orderId);
  }

  async getKitchenTickets(): Promise<KitchenTicket[]> {
    const { data, error } = await this.sb
      .from("kitchen_tickets")
      .select("*")
      .neq("col", "entregado")
      .order("entered_at");
    if (error) throw error;
    const tickets = data ?? [];
    const ids = tickets.map((t) => t.id);
    const { data: lines } = ids.length
      ? await this.sb.from("ticket_lines").select("*").in("ticket_id", ids)
      : { data: [] as Row<"ticket_lines">[] };
    return tickets.map((t) => ({
      id: t.id,
      orderId: t.order_id,
      tableLabel: t.table_label,
      col: t.col,
      enteredAt: new Date(t.entered_at).getTime(),
      note: t.note,
      done: t.done,
      lines: (lines ?? []).filter((l) => l.ticket_id === t.id).map((l) => ({ qty: l.qty, name: l.name })),
    }));
  }

  async advanceTicket(ticketId: string): Promise<void> {
    const { data, error } = await this.sb
      .from("kitchen_tickets")
      .select("col")
      .eq("id", ticketId)
      .single();
    if (error) throw error;
    const order = ["nuevos", "preparacion", "listos", "entregado"] as const;
    const idx = order.indexOf(data.col);
    const next = order[Math.min(idx + 1, order.length - 1)];
    const { error: uErr } = await this.sb
      .from("kitchen_tickets")
      .update({ col: next, entered_at: new Date().toISOString(), done: next === "listos" || next === "entregado" })
      .eq("id", ticketId);
    if (uErr) throw uErr;
  }

  async payOrder({ orderId, method, total, customerId, redeem = 0 }: PayInput): Promise<void> {
    const { data: order } = await this.sb.from("orders").select("table_id").eq("id", orderId).single();
    await this.deductInventory(orderId);

    if (customerId) {
      const { data: cust } = await this.sb
        .from("customers")
        .select("points, visits, spent")
        .eq("id", customerId)
        .maybeSingle();
      if (cust) {
        const due = Math.max(0, total - redeem);
        const earned = Math.floor(due / 10);
        await this.sb
          .from("customers")
          .update({
            points: cust.points - redeem + earned,
            visits: cust.visits + 1,
            spent: Number(cust.spent) + due,
          })
          .eq("id", customerId);
        await this.sb.from("loyalty_transactions").insert({
          tenant_id: this.tenantId,
          customer_id: customerId,
          order_id: orderId,
          points_delta: earned - redeem,
        });
      }
    }

    await this.sb
      .from("orders")
      .update({
        status: "cobrada",
        closed_at: new Date().toISOString(),
        paid_method: method as "efectivo" | "tarjeta" | "transferencia",
        paid_total: Math.max(0, total - redeem),
      })
      .eq("id", orderId);
    if (order?.table_id) {
      await this.sb.from("restaurant_tables").update({ status: "libre" }).eq("id", order.table_id);
    }
    await this.log(`Cobró pedido · ${method} · S/ ${total.toFixed(2)}`);
  }

  private async deductInventory(orderId: string): Promise<void> {
    const { data: lines } = await this.sb
      .from("order_lines")
      .select("menu_item_id, qty")
      .eq("order_id", orderId);
    if (!lines || lines.length === 0) return;
    const itemIds = [...new Set(lines.map((l) => l.menu_item_id).filter(Boolean))] as string[];
    if (itemIds.length === 0) return;
    const { data: recipes } = await this.sb
      .from("recipes")
      .select("menu_item_id, inventory_id, qty_per_unit")
      .in("menu_item_id", itemIds);
    if (!recipes || recipes.length === 0) return;

    const need = new Map<string, number>();
    for (const line of lines) {
      for (const r of recipes.filter((x) => x.menu_item_id === line.menu_item_id)) {
        need.set(r.inventory_id, (need.get(r.inventory_id) ?? 0) + Number(r.qty_per_unit) * line.qty);
      }
    }
    for (const [invId, qty] of need) {
      const { data: inv } = await this.sb.from("inventory_items").select("stock").eq("id", invId).maybeSingle();
      if (inv) {
        await this.sb.from("inventory_items").update({ stock: Math.max(0, Number(inv.stock) - qty) }).eq("id", invId);
      }
    }
  }

  async setMenuPrice(itemId: string, price: number): Promise<void> {
    const { error } = await this.sb.from("menu_items").update({ price }).eq("id", itemId);
    if (error) throw error;
  }
  async setMenuAvailable(itemId: string, available: boolean): Promise<void> {
    const { error } = await this.sb.from("menu_items").update({ available }).eq("id", itemId);
    if (error) throw error;
  }

  async getOpenOrders(): Promise<Order[]> {
    const { data, error } = await this.sb
      .from("orders")
      .select("*")
      .not("status", "in", "(cobrada,anulada)")
      .order("opened_at");
    if (error) throw error;
    return Promise.all((data ?? []).map((o) => this.hydrateOrder(o)));
  }

  async getPaidOrders(): Promise<Order[]> {
    const { data, error } = await this.sb
      .from("orders")
      .select("*")
      .eq("status", "cobrada")
      .order("closed_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return Promise.all((data ?? []).map((o) => this.hydrateOrder(o)));
  }

  async voidLine(lineId: string, reason: string, actor: string): Promise<void> {
    const { data: line } = await this.sb
      .from("order_lines")
      .select("name, order_id")
      .eq("id", lineId)
      .maybeSingle();
    await this.sb.from("order_lines").delete().eq("id", lineId);
    if (line) {
      await this.sb.from("void_events").insert({
        tenant_id: this.tenantId,
        order_id: line.order_id,
        line_name: line.name,
        reason,
      });
      await this.log(`${actor} anuló ${line.name} · ${reason}`);
    }
  }

  async transferOrder(orderId: string, toTableId: string): Promise<void> {
    const { data: order } = await this.sb.from("orders").select("table_id").eq("id", orderId).single();
    await this.sb.from("orders").update({ table_id: toTableId }).eq("id", orderId);
    await this.sb.from("restaurant_tables").update({ status: "ocupada" }).eq("id", toTableId);
    if (order?.table_id) {
      await this.sb.from("restaurant_tables").update({ status: "libre" }).eq("id", order.table_id);
    }
    await this.log(`Transfirió pedido a otra mesa`);
  }

  async mergeOrder(orderId: string, intoTableId: string): Promise<void> {
    const target = await this.getOpenOrderForTable(intoTableId);
    const { data: order } = await this.sb.from("orders").select("table_id").eq("id", orderId).single();
    if (!target) return;
    await this.sb.from("order_lines").update({ order_id: target.id }).eq("order_id", orderId);
    await this.sb.from("orders").update({ status: "anulada" }).eq("id", orderId);
    if (order?.table_id) {
      await this.sb.from("restaurant_tables").update({ status: "libre" }).eq("id", order.table_id);
    }
    await this.log(`Unió pedidos de mesa`);
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

  async getInventory(): Promise<InventoryItem[]> {
    const { data, error } = await this.sb.from("inventory_items").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      stock: Number(i.stock),
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

  async adjustInventory(itemId: string, delta: number, actor: string): Promise<void> {
    const { data: inv } = await this.sb.from("inventory_items").select("stock, name").eq("id", itemId).maybeSingle();
    if (!inv) return;
    await this.sb.from("inventory_items").update({ stock: Math.max(0, Number(inv.stock) + delta) }).eq("id", itemId);
    await this.log(`${actor} ajustó ${inv.name} (${delta > 0 ? "+" : ""}${delta})`);
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

  async getOnlineOrders(): Promise<OnlineOrder[]> {
    const { data, error } = await this.sb.from("online_orders").select("*").order("created_at");
    if (error) throw error;
    return (data ?? []).map((o) => ({
      id: o.id,
      channel: o.channel,
      name: o.customer_name,
      items: o.items,
      total: Number(o.total),
      eta: o.eta,
      status: o.status,
    }));
  }

  async getComprobantes(): Promise<Comprobante[]> {
    const { data, error } = await this.sb
      .from("comprobantes")
      .select("*")
      .order("issued_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map(mapComprobante);
  }

  async emitComprobante(input: EmitComprobanteInput, online: boolean): Promise<Comprobante> {
    const { data: folio, error: folioErr } = await this.sb.rpc("next_folio", {
      tid: this.tenantId,
      p_serie: input.tipo === "Factura" ? "F001" : "B001",
    });
    if (folioErr) throw folioErr;
    const { data, error } = await this.sb
      .from("comprobantes")
      .insert({
        tenant_id: this.tenantId,
        order_id: input.orderId ?? null,
        folio,
        tipo: input.tipo,
        buyer_ruc: input.buyerRuc ?? null,
        buyer_name: input.buyerName ?? null,
        subtotal: input.subtotal,
        igv: input.igv,
        total: input.total,
        reference: input.reference,
        status: online ? "enviando" : "encola",
      })
      .select("*")
      .single();
    if (error) throw error;
    let cpe = mapComprobante(data);
    if (online) {
      const res = await this.sunat.submit(cpe);
      cpe = { ...cpe, status: res.accepted ? "aceptada" : "rechazada", error: res.error ?? null };
      await this.sb.rpc("set_comprobante_status", { cid: cpe.id, new_status: cpe.status, new_error: cpe.error });
    } else {
      await this.sb.from("sunat_outbox").insert({ tenant_id: this.tenantId, comprobante_id: cpe.id });
    }
    await this.log(`Emitió ${input.tipo} ${folio} · ${cpe.status}`);
    return cpe;
  }

  async syncSunat(online: boolean): Promise<number> {
    if (!online) return 0;
    const { data: queued } = await this.sb.from("comprobantes").select("*").eq("status", "encola");
    let sent = 0;
    for (const row of queued ?? []) {
      const cpe = mapComprobante(row);
      const res = await this.sunat.submit(cpe);
      await this.sb.rpc("set_comprobante_status", {
        cid: cpe.id,
        new_status: res.accepted ? "aceptada" : "rechazada",
        new_error: res.error ?? null,
      });
      if (res.accepted) {
        sent++;
        await this.sb.from("sunat_outbox").delete().eq("comprobante_id", cpe.id);
      }
    }
    if (sent > 0) await this.log(`Sincronizó ${sent} comprobante(s) con SUNAT`);
    return sent;
  }

  async retryComprobante(id: string, online: boolean): Promise<void> {
    if (!online) return;
    const { data } = await this.sb.from("comprobantes").select("*").eq("id", id).maybeSingle();
    if (!data) return;
    const cpe = mapComprobante(data);
    const res = await this.sunat.submit(cpe);
    await this.sb.rpc("set_comprobante_status", {
      cid: id,
      new_status: res.accepted ? "aceptada" : "rechazada",
      new_error: res.error ?? null,
    });
  }

  async getSettings(): Promise<BusinessSettings> {
    const { data } = await this.sb.from("business_settings").select("*").eq("tenant_id", this.tenantId).maybeSingle();
    return {
      name: data?.name ?? "",
      currency: (data?.currency ?? "PEN") as BusinessSettings["currency"],
      taxRate: Number(data?.tax_rate ?? 18),
      tipPresets: data?.tip_presets ?? [10, 15, 18],
      onlineOrders: data?.online_orders ?? true,
      autoTip: data?.auto_tip ?? true,
    };
  }
  async updateSettings(patch: Partial<BusinessSettings>): Promise<void> {
    const row: Database["public"]["Tables"]["business_settings"]["Update"] = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.currency !== undefined) row.currency = patch.currency;
    if (patch.taxRate !== undefined) row.tax_rate = patch.taxRate;
    if (patch.tipPresets !== undefined) row.tip_presets = patch.tipPresets;
    if (patch.onlineOrders !== undefined) row.online_orders = patch.onlineOrders;
    if (patch.autoTip !== undefined) row.auto_tip = patch.autoTip;
    await this.sb.from("business_settings").update(row).eq("tenant_id", this.tenantId);
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

  private async log(message: string): Promise<void> {
    await this.sb.from("activity_log").insert({ tenant_id: this.tenantId, actor: "POS", message });
  }

  subscribe(cb: () => void): () => void {
    const channel = this.sb
      .channel(`pos-${this.tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_tickets" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, cb)
      .subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }
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
function mapTable(r: Row<"restaurant_tables">): RestaurantTable {
  return { id: r.id, zone: r.zone, number: r.number, seats: r.seats, status: r.status, waiterId: r.waiter_id };
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
  };
}
