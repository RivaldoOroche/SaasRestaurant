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
} from "../model";
import type { Database, Row } from "@/types/database";

/**
 * Real backend repo. Tenant scoping is enforced by RLS; we still set tenant_id
 * on inserts so rows land in the right tenant. One instance per tenant.
 */
export class SupabaseRepo implements Repo {
  constructor(
    private sb: SupabaseClient<Database>,
    private tenantId: string,
  ) {}

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

  async payOrder({ orderId }: PayInput): Promise<void> {
    const { data: order } = await this.sb.from("orders").select("table_id").eq("id", orderId).single();
    await this.sb.from("orders").update({ status: "cobrada", closed_at: new Date().toISOString() }).eq("id", orderId);
    if (order?.table_id) {
      await this.sb.from("restaurant_tables").update({ status: "libre" }).eq("id", order.table_id);
    }
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
