import type {
  Category,
  MenuItem,
  ModifierExtra,
  ModifierPref,
  RestaurantTable,
  Customer,
  InventoryItem,
  RecipeLine,
  MenuChange,
  OnlineOrder,
  BusinessSettings,
} from "../model";

export const CATEGORIES: Category[] = [
  { id: "c-ent", key: "entradas", name: "Entradas", icon: "🥑", subtitle: "Para empezar a compartir", sort: 1 },
  { id: "c-cev", key: "ceviches", name: "Ceviches", icon: "🐟", subtitle: "Frescos del día", sort: 2 },
  { id: "c-seg", key: "segundos", name: "Segundos", icon: "🍲", subtitle: "Criollos de la casa", sort: 3 },
  { id: "c-pos", key: "postres", name: "Postres", icon: "🍮", subtitle: "Dulces limeños", sort: 4 },
  { id: "c-bar", key: "bebidas", name: "Barra", icon: "🍹", subtitle: "Piscos y refrescos", sort: 5 },
];

function item(p: Partial<MenuItem> & Pick<MenuItem, "id" | "categoryId" | "name" | "price">): MenuItem {
  return {
    description: "",
    emoji: "🍽️",
    badge: null,
    veg: false,
    spicy: false,
    gf: false,
    meat: false,
    available: true,
    sort: 0,
    ...p,
  };
}

export const MENU_ITEMS: MenuItem[] = [
  item({ id: "i-causa", categoryId: "c-ent", name: "Causa limeña", description: "Papa amarilla, palta, pollo", price: 28, emoji: "🥔", gf: true }),
  item({ id: "i-antic", categoryId: "c-ent", name: "Anticuchos", description: "Corazón de res a la parrilla, papa dorada", price: 34, emoji: "🍢", spicy: true, gf: true, meat: true }),
  item({ id: "i-tequen", categoryId: "c-ent", name: "Tequeños", description: "Crocantes rellenos de queso, salsa de huancaína", price: 24, emoji: "🧀", veg: true }),
  item({ id: "i-cev", categoryId: "c-cev", name: "Ceviche clásico", description: "Pescado fresco, limón, ají limo, camote", price: 42, emoji: "🐟", badge: "Popular", spicy: true, gf: true }),
  item({ id: "i-tira", categoryId: "c-cev", name: "Tiradito nikkei", description: "Láminas de pescado, crema de rocoto", price: 46, emoji: "🐟", spicy: true, gf: true }),
  item({ id: "i-mixto", categoryId: "c-cev", name: "Ceviche mixto", description: "Pescado y mariscos, leche de tigre", price: 52, emoji: "🦐", gf: true }),
  item({ id: "i-lomo", categoryId: "c-seg", name: "Lomo saltado", description: "Lomo de res, cebolla, tomate, papas fritas", price: 48, emoji: "🥩", badge: "Chef", meat: true }),
  item({ id: "i-aji", categoryId: "c-seg", name: "Ají de gallina", description: "Gallina deshilachada en crema de ají amarillo", price: 38, emoji: "🍗", spicy: true, gf: true }),
  item({ id: "i-seco", categoryId: "c-seg", name: "Seco de res", description: "Res al culantro, frejoles, arroz", price: 44, emoji: "🥘", meat: true }),
  item({ id: "i-arroz", categoryId: "c-seg", name: "Arroz con mariscos", description: "Arroz meloso, mariscos, ají panca", price: 50, emoji: "🦑", spicy: true }),
  item({ id: "i-susp", categoryId: "c-pos", name: "Suspiro a la limeña", description: "Manjar blanco y merengue al oporto", price: 22, emoji: "🍮", gf: true }),
  item({ id: "i-pica", categoryId: "c-pos", name: "Picarones", description: "Aros de zapallo y camote, miel de chancaca", price: 20, emoji: "🍩", veg: true }),
  item({ id: "i-pisco", categoryId: "c-bar", name: "Pisco sour", description: "Pisco quebranta, limón, clara de huevo", price: 26, emoji: "🍸", badge: "Popular", gf: true }),
  item({ id: "i-chicha", categoryId: "c-bar", name: "Chicha morada", description: "Maíz morado, piña, canela y clavo", price: 14, emoji: "🟣", veg: true, gf: true }),
  item({ id: "i-chilcano", categoryId: "c-bar", name: "Chilcano", description: "Pisco, ginger ale, limón", price: 24, emoji: "🥃", gf: true }),
  item({ id: "i-inca", categoryId: "c-bar", name: "Inca Kola", description: "La bebida del Perú, bien helada", price: 8, emoji: "🥤", veg: true, gf: true }),
];

export const EXTRAS: ModifierExtra[] = [
  { id: "x-aji", key: "aji", name: "Extra ají", price: 4 },
  { id: "x-criolla", key: "criolla", name: "Salsa criolla", price: 5 },
  { id: "x-doble", key: "doble", name: "Doble porción", price: 18 },
];

export const PREFS: ModifierPref[] = [
  { id: "p-cebolla", key: "cebolla", name: "Sin cebolla" },
  { id: "p-culantro", key: "culantro", name: "Sin culantro" },
  { id: "p-aji", key: "aji", name: "Sin ají" },
];

export const TERMS = ["Rojo", "Medio", "Tres cuartos", "Bien cocido"];

export function seedTables(): RestaurantTable[] {
  const tables: RestaurantTable[] = [];
  const zones: Array<[string, number, number]> = [
    ["Terraza", 1, 6],
    ["Salón principal", 7, 16],
    ["Barra", 17, 20],
  ];
  for (const [zone, lo, hi] of zones) {
    for (let n = lo; n <= hi; n++) {
      tables.push({ id: `t-${n}`, zone, number: n, seats: zone === "Barra" ? 2 : 4, status: "libre", waiterId: null });
    }
  }
  // A couple pre-seeded as occupied for demo texture.
  tables[8].status = "ocupada";
  tables[9].status = "cuenta";
  tables[3].status = "reservada";
  return tables;
}

export const CUSTOMERS: Customer[] = [
  { id: "cu-1", name: "Lucía Fernández", phone: "987 654 321", visits: 14, spent: 1820, points: 182, tier: "Oro" },
  { id: "cu-2", name: "Diego Rojas", phone: "956 112 233", visits: 6, spent: 640, points: 64, tier: "Plata" },
  { id: "cu-3", name: "Valeria Chávez", phone: "999 888 777", visits: 2, spent: 180, points: 18, tier: "Bronce" },
  { id: "cu-4", name: "Martín Palomino", phone: "981 220 145", visits: 28, spent: 4200, points: 420, tier: "Platino" },
];

export function seedInventory(): InventoryItem[] {
  return [
    { id: "inv-pesc", name: "Pescado fresco", unit: "kg", stock: 18, par: 20 },
    { id: "inv-papa", name: "Papa amarilla", unit: "kg", stock: 40, par: 25 },
    { id: "inv-aji", name: "Ají amarillo", unit: "kg", stock: 6, par: 8 },
    { id: "inv-cul", name: "Culantro", unit: "atado", stock: 0, par: 10 },
    { id: "inv-pisco", name: "Pisco", unit: "bot", stock: 12, par: 6 },
    { id: "inv-limon", name: "Limón", unit: "kg", stock: 22, par: 15 },
    { id: "inv-res", name: "Lomo de res", unit: "kg", stock: 14, par: 12 },
  ];
}

/** Recipe map: menu item id -> ingredient consumption per unit sold. */
export const RECIPES: Record<string, RecipeLine[]> = {
  "i-cev": [{ inventoryId: "inv-pesc", qtyPerUnit: 0.25 }, { inventoryId: "inv-limon", qtyPerUnit: 0.1 }, { inventoryId: "inv-cul", qtyPerUnit: 0.05 }],
  "i-tira": [{ inventoryId: "inv-pesc", qtyPerUnit: 0.2 }, { inventoryId: "inv-aji", qtyPerUnit: 0.03 }],
  "i-mixto": [{ inventoryId: "inv-pesc", qtyPerUnit: 0.3 }, { inventoryId: "inv-limon", qtyPerUnit: 0.12 }],
  "i-lomo": [{ inventoryId: "inv-res", qtyPerUnit: 0.3 }, { inventoryId: "inv-papa", qtyPerUnit: 0.2 }],
  "i-seco": [{ inventoryId: "inv-res", qtyPerUnit: 0.3 }, { inventoryId: "inv-cul", qtyPerUnit: 0.08 }],
  "i-causa": [{ inventoryId: "inv-papa", qtyPerUnit: 0.25 }],
  "i-aji": [{ inventoryId: "inv-aji", qtyPerUnit: 0.06 }],
  "i-pisco": [{ inventoryId: "inv-pisco", qtyPerUnit: 0.08 }, { inventoryId: "inv-limon", qtyPerUnit: 0.05 }],
  "i-chilcano": [{ inventoryId: "inv-pisco", qtyPerUnit: 0.06 }],
};

export function seedMenuChanges(): MenuChange[] {
  return [
    { id: "mc-1", kind: "precio", itemName: "Ceviche mixto", detail: "S/ 52 → S/ 55", status: "pendiente" },
    { id: "mc-2", kind: "nuevo", itemName: "Chicharrón de pota", detail: "Nuevo · S/ 36", status: "pendiente" },
    { id: "mc-3", kind: "86", itemName: "Seco de res", detail: "Marcar agotado (sin culantro)", status: "pendiente" },
  ];
}

export function seedOnlineOrders(): OnlineOrder[] {
  return [
    { id: "on-1", channel: "Rappi", name: "Pedido #4821", items: "2× Lomo saltado, 1× Chicha", total: 110, eta: "25 min", status: "nuevo" },
    { id: "on-2", channel: "PedidosYa", name: "Pedido #7734", items: "1× Ceviche mixto", total: 52, eta: "18 min", status: "prep" },
    { id: "on-3", channel: "WhatsApp", name: "Familia Torres", items: "3× Ají de gallina", total: 114, eta: "35 min", status: "nuevo" },
  ];
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  name: "La Higuera",
  currency: "PEN",
  taxRate: 18,
  tipPresets: [10, 15, 18],
  onlineOrders: true,
  autoTip: true,
};

export const VOID_REASONS = [
  "Error de captura",
  "Cliente cambió de opinión",
  "Plato dañado",
  "Cortesía de la casa",
  "Fuera de tiempo",
];
