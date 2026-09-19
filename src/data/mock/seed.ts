import type {
  Category,
  MenuItem,
  ModifierExtra,
  ModifierPref,
  RestaurantTable,
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
