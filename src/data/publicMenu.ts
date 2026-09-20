import { supabase, USE_MOCK } from "@/lib/supabase";
import { CATEGORIES, MENU_ITEMS } from "./mock/seed";
import type { Category, MenuItem } from "./model";

export interface PublicMenu {
  tenantName: string;
  currencySym: string;
  categories: Category[];
  items: MenuItem[];
}

/** Carta pública de un restaurante por slug — sin autenticación. */
export async function getPublicMenu(slug: string): Promise<PublicMenu | null> {
  if (USE_MOCK || !supabase) {
    // En demo, una sola carta (La Higuera).
    return {
      tenantName: "La Higuera",
      currencySym: "S/",
      categories: [...CATEGORIES].sort((a, b) => a.sort - b.sort),
      items: MENU_ITEMS.filter((i) => i.available),
    };
  }

  const { data, error } = await supabase.rpc("public_menu", { p_slug: slug });
  if (error || !data) return null;
  const m = data as {
    tenant_name: string;
    currency: string;
    categories: { id: string; key: string; name: string; icon: string; subtitle: string; sort: number }[];
    items: {
      id: string; category_id: string; name: string; description: string; price: number; emoji: string;
      badge: string | null; is_veg: boolean; is_spicy: boolean; is_gf: boolean; is_meat: boolean;
      available: boolean; sort: number;
    }[];
  };
  const sym = m.currency === "USD" ? "$" : m.currency === "EUR" ? "€" : "S/";
  return {
    tenantName: m.tenant_name,
    currencySym: sym,
    categories: m.categories,
    items: m.items.map((r) => ({
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
    })),
  };
}
