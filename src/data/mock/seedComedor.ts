// Datos de ejemplo del modo demo para un comedor escolar: el Colegio San Martín
// (Surco), con su kiosko saludable, padrón de alumnos y docentes, familias,
// menús de las próximas dos semanas y el historial de los últimos días.
import type {
  BusinessSettings,
  Branch,
  Category,
  ComedorConsumo,
  ComedorMenuDay,
  ComedorReserva,
  Comensal,
  InventoryItem,
  MenuItem,
  Responsable,
  WalletMovement,
} from "../model";
import { localDate, nextSchoolDays } from "@/lib/comedor";

export const COMEDOR_BRANCHES: Branch[] = [
  { id: "cb-1", name: "Sede Surco", city: "Lima", parentId: null, active: true, address: "Av. Caminos del Inca 1450, Surco", phone: "" },
];

export const COMEDOR_CATEGORIES: Category[] = [
  { id: "k-sal", key: "saludables", name: "Saludables", icon: "🍎", subtitle: "Frutas, ensaladas y sándwiches", sort: 1 },
  { id: "k-beb", key: "bebidas", name: "Bebidas", icon: "🥤", subtitle: "Refrescos naturales y agua", sort: 2 },
  { id: "k-pos", key: "postres", name: "Postres", icon: "🍮", subtitle: "Dulces caseros", sort: 3 },
  { id: "k-snk", key: "snacks", name: "Snacks envasados", icon: "🍪", subtitle: "Con registro sanitario", sort: 4 },
];

function item(p: Partial<MenuItem> & Pick<MenuItem, "id" | "categoryId" | "name" | "price">): MenuItem {
  return { description: "", emoji: "🍽️", badge: null, veg: false, spicy: false, gf: false, meat: false, available: true, sort: 0, octogonos: 0, ...p };
}

export const COMEDOR_ITEMS: MenuItem[] = [
  item({ id: "k-fruta", categoryId: "k-sal", name: "Fruta picada", description: "Papaya, piña y plátano", price: 3.5, emoji: "🍉", veg: true, gf: true, badge: "Saludable" }),
  item({ id: "k-sand", categoryId: "k-sal", name: "Sándwich de pollo", description: "Pan integral, pollo deshilachado y lechuga", price: 6, emoji: "🥪" }),
  item({ id: "k-ensal", categoryId: "k-sal", name: "Ensalada de frutas con yogur", price: 5, emoji: "🥗", veg: true, gf: true }),
  item({ id: "k-choclo", categoryId: "k-sal", name: "Choclo con queso", price: 4, emoji: "🌽", veg: true, gf: true }),
  item({ id: "k-chicha", categoryId: "k-beb", name: "Chicha morada natural", price: 2.5, emoji: "🟣", veg: true, gf: true }),
  item({ id: "k-agua", categoryId: "k-beb", name: "Agua mineral 625 ml", price: 2, emoji: "💧", veg: true, gf: true }),
  item({ id: "k-limon", categoryId: "k-beb", name: "Limonada", price: 2.5, emoji: "🍋", veg: true, gf: true }),
  item({ id: "k-gela", categoryId: "k-pos", name: "Gelatina", price: 2, emoji: "🍮", gf: true }),
  item({ id: "k-quequ", categoryId: "k-pos", name: "Queque de zanahoria", price: 3, emoji: "🍰", veg: true }),
  item({ id: "k-galle", categoryId: "k-snk", name: "Galleta rellena", description: "Con octógonos: no se vende en el colegio", price: 1.5, emoji: "🍪", octogonos: 2 }),
  item({ id: "k-chips", categoryId: "k-snk", name: "Papitas fritas", description: "Con octógonos: no se vende en el colegio", price: 2, emoji: "🥔", octogonos: 3 }),
];

export const COMEDOR_SETTINGS: BusinessSettings = {
  name: "Comedor San Martín",
  currency: "PEN",
  taxRate: 18,
  taxRegime: "general",
  tipPresets: [],
  onlineOrders: false,
  autoTip: false,
  yapeNumber: "986 120 455",
  plinNumber: "986 120 455",
  cardProvider: "ninguno",
  cardPublicKey: "",
  ruc: "20601234567",
  razonSocial: "SERVICIOS ALIMENTARIOS SAN MARTÍN S.A.C.",
  direccionFiscal: "Av. Caminos del Inca 1450, Santiago de Surco, Lima",
  ubigeo: "150140",
  billingProvider: "ninguno",
  sunatMode: "beta",
  solUser: "",
  billingEndpoint: "",
  businessType: "comedor",
  comedorMode: "escolar",
  bloquearOctogonos: true,
  permitirSinReserva: true,
  cierreReservas: "09:30",
  menuPrice: 12,
  saldoMinimo: 10,
  defaultDailyLimit: 10,
};

export function comedorInventory(): InventoryItem[] {
  return [
    { id: "ci-arroz", name: "Arroz", unit: "kg", stock: 0, par: 40, cost: 4.2 },
    { id: "ci-pollo", name: "Pollo", unit: "kg", stock: 0, par: 30, cost: 10.5 },
    { id: "ci-menes", name: "Menestras", unit: "kg", stock: 0, par: 15, cost: 7 },
    { id: "ci-fruta", name: "Fruta de estación", unit: "kg", stock: 0, par: 25, cost: 4 },
    { id: "ci-verd", name: "Verduras", unit: "kg", stock: 0, par: 20, cost: 3.5 },
  ];
}
export function comedorStock(): Record<string, Record<string, number>> {
  return { "cb-1": { "ci-arroz": 46, "ci-pollo": 22, "ci-menes": 18, "ci-fruta": 31, "ci-verd": 12 } };
}

/** Generador pseudoaleatorio con semilla: el demo es igual en cada carga. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");

const MENUS: Omit<ComedorMenuDay, "date" | "price" | "raciones">[] = [
  { entrada: "Crema de zapallo", fondo: "Ají de gallina con arroz", postre: "Mazamorra morada", bebida: "Chicha morada", allergens: "Lácteos, maní" },
  { entrada: "Ensalada de pallares", fondo: "Pollo al horno con puré", postre: "Fruta", bebida: "Limonada", allergens: "Lácteos" },
  { entrada: "Sopa de quinua", fondo: "Tallarines verdes con bistec", postre: "Gelatina", bebida: "Maracuyá", allergens: "Gluten, lácteos" },
  { entrada: "Papa a la huancaína", fondo: "Lentejas con arroz y huevo", postre: "Arroz con leche", bebida: "Chicha morada", allergens: "Huevo, lácteos" },
  { entrada: "Ensalada fresca", fondo: "Pescado sudado con yuca", postre: "Fruta", bebida: "Limonada", allergens: "Pescado" },
];

const ALUMNOS: [string, string, string, string][] = [
  // código, nombre, grado, alergias
  ["A-0101", "Lucía Ramos Torres", "3.° B primaria", "Maní"],
  ["A-0102", "Mateo Ramos Torres", "1.° A primaria", ""],
  ["A-0103", "Valentina Quispe Huamán", "5.° A primaria", ""],
  ["A-0104", "Santiago Flores Rojas", "2.° B secundaria", ""],
  ["A-0105", "Camila Chávez León", "4.° A primaria", "Lactosa"],
  ["A-0106", "Thiago Vargas Paredes", "6.° B primaria", ""],
  ["A-0107", "Isabella Mendoza Ríos", "1.° A secundaria", ""],
  ["A-0108", "Gael Castillo Salas", "3.° A primaria", "Mariscos"],
  ["A-0109", "Emma Gutiérrez Díaz", "5.° B primaria", ""],
  ["A-0110", "Leonardo Sánchez Cruz", "2.° A primaria", ""],
  ["A-0111", "Sofía Ramírez Vega", "4.° B secundaria", "Gluten (celiaquía)"],
  ["A-0112", "Joaquín Torres Medina", "3.° B secundaria", ""],
  ["A-0113", "Mía Herrera Campos", "6.° A primaria", ""],
  ["A-0114", "Daniel Rojas Navarro", "1.° B primaria", ""],
  ["A-0115", "Antonella Díaz Ponce", "5.° A secundaria", ""],
  ["A-0116", "Sebastián Paredes Luna", "2.° B primaria", "Huevo"],
];
const PERSONAL: [string, string, string, "docente" | "colaborador"][] = [
  ["D-201", "Prof. Carmen Ortiz", "Docentes", "docente"],
  ["D-202", "Prof. Jorge Benavides", "Docentes", "docente"],
  ["D-203", "Prof. Ana Lucía Prado", "Docentes", "docente"],
  ["C-301", "Miguel Ángel Soto", "Administración", "colaborador"],
];
const FAMILIAS: [string, string, string, number[]][] = [
  // responsable, celular, correo, índices de ALUMNOS
  ["Rosa Torres", "987111222", "rosa.torres@correo.pe", [0, 1]],
  ["Julio Quispe", "986333444", "jquispe@correo.pe", [2]],
  ["Patricia Rojas", "985555666", "patricia.rojas@correo.pe", [3]],
  ["Luis Chávez", "984777888", "lchavez@correo.pe", [4]],
  ["Karina Paredes", "983999000", "kparedes@correo.pe", [5, 15]],
  ["Óscar Mendoza", "982121212", "omendoza@correo.pe", [6]],
  ["Diana Salas", "981343434", "dsalas@correo.pe", [7]],
  ["Ricardo Díaz", "980565656", "rdiaz@correo.pe", [8, 14]],
  ["Gabriela Cruz", "979787878", "gcruz@correo.pe", [9]],
  ["Fernando Vega", "978909090", "fvega@correo.pe", [10]],
  ["Lorena Medina", "977131313", "lmedina@correo.pe", [11]],
  ["Hugo Campos", "976242424", "hcampos@correo.pe", [12]],
  ["Silvia Navarro", "975353535", "snavarro@correo.pe", [13]],
];

export interface ComedorSeed {
  comensales: Comensal[];
  responsables: Responsable[];
  wallet: WalletMovement[];
  comedorMenus: ComedorMenuDay[];
  reservas: ComedorReserva[];
  consumos: ComedorConsumo[];
}

/** Padrón, familias, menús e historial de los últimos 8 días de clases. */
export function seedComedor(now = new Date()): ComedorSeed {
  const rand = rng(46);
  const responsables: Responsable[] = FAMILIAS.map(([name, phone, email], i) => ({ id: `rp-${i + 1}`, name, phone, email, portalToken: token() }));
  const respOf = new Map<number, string>();
  FAMILIAS.forEach((f, i) => f[3].forEach((a) => respOf.set(a, `rp-${i + 1}`)));

  const today = localDate(now);
  const finDeMes = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const comensales: Comensal[] = [
    ...ALUMNOS.map(([code, name, grupo, allergies], i): Comensal => ({
      id: `cm-${code}`,
      code,
      name,
      tipo: "alumno",
      grupo,
      // Tres alumnos con abono mensual; el resto paga con saldo.
      plan: i % 5 === 2 ? "abono" : "prepago",
      abonoHasta: i % 5 === 2 ? finDeMes : null,
      balance: 0,
      dailyLimit: i === 3 ? 6 : 10,
      blockedCategoryIds: i === 4 ? ["k-pos"] : [],
      allergies,
      responsableId: respOf.get(i) ?? null,
      active: true,
      branchId: "cb-1",
    })),
    ...PERSONAL.map(([code, name, grupo, tipo]): Comensal => ({
      id: `cm-${code}`,
      code,
      name,
      tipo,
      grupo,
      plan: tipo === "docente" ? "convenio" : "prepago",
      abonoHasta: null,
      balance: 0,
      dailyLimit: null,
      blockedCategoryIds: [],
      allergies: "",
      responsableId: null,
      active: true,
      branchId: "cb-1",
    })),
  ];

  // Menús: 8 días de clases pasados + hoy (si es día de clases) + 9 próximos.
  const past: string[] = [];
  for (let d = new Date(now); past.length < 8; ) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) past.unshift(localDate(d));
  }
  const upcoming = nextSchoolDays(now, 10);
  const days = [...past, ...upcoming];
  const comedorMenus: ComedorMenuDay[] = days.map((date, i) => ({ date, ...MENUS[i % MENUS.length], price: 12, raciones: 18 }));

  const wallet: WalletMovement[] = [];
  const consumos: ComedorConsumo[] = [];
  const reservas: ComedorReserva[] = [];
  const at = (date: string, h: number, m: number) => new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).toISOString();
  const byId = new Map(comensales.map((c) => [c.id, c]));
  const move = (c: Comensal, kind: WalletMovement["kind"], amount: number, method: string | null, detail: string, actor: string, when: string) => {
    if (kind !== "abono") c.balance = Math.round((c.balance + amount) * 100) / 100;
    wallet.unshift({ id: `wm-${wallet.length + 1}`, comensalId: c.id, comensalName: c.name, kind, amount, method, detail, actor, balanceAfter: c.balance, at: when });
  };

  // Recarga inicial de cada comensal que paga con saldo y pago de abonos.
  for (const c of comensales) {
    if (c.plan === "convenio") continue;
    const method = (["yape", "efectivo", "transferencia", "plin"] as const)[Math.floor(rand() * 4)];
    if (c.plan === "abono") move(c, "abono", 220, "transferencia", `Abono hasta ${c.abonoHasta}`, "Rosa (caja)", at(past[0], 7, 40));
    move(c, "recarga", c.plan === "abono" ? 30 : [100, 120, 150, 80][Math.floor(rand() * 4)], method, "Recarga", "Rosa (caja)", at(past[0], 7, 45));
  }

  const kiosko = COMEDOR_ITEMS.filter((i) => !i.octogonos);
  const serve = (date: string, c: Comensal, kind: "menu" | "kiosko", h: number) => {
    let items: { name: string; qty: number; price: number; menuItemId?: string }[];
    let pago: ComedorConsumo["pago"] = "saldo";
    let total: number;
    if (kind === "menu") {
      items = [{ name: "Menú del día", qty: 1, price: 12 }];
      if (c.plan === "convenio") pago = "convenio";
      else if (c.plan === "abono" && c.abonoHasta && c.abonoHasta >= date) pago = "abono";
      total = pago === "saldo" ? 12 : 0;
      if (pago === "saldo" && c.balance < 12) return;
    } else {
      const it = kiosko[Math.floor(rand() * kiosko.length)];
      if (c.blockedCategoryIds.includes(it.categoryId)) return;
      items = [{ name: it.name, qty: 1, price: it.price, menuItemId: it.id }];
      total = it.price;
      if (c.balance < total) return;
    }
    const when = at(date, h, Math.floor(rand() * 50));
    if (pago === "saldo") move(c, "consumo", -total, "saldo", kind === "menu" ? "Menú del día" : `1× ${items[0].name}`, "Beto (despacho)", when);
    consumos.unshift({
      id: `cs-${consumos.length + 1}`,
      comensalId: c.id,
      comensalName: c.name,
      grupo: c.grupo,
      kind,
      items,
      total,
      pago,
      actor: "Beto (despacho)",
      branchId: "cb-1",
      date,
      at: when,
    });
  };

  for (const date of past) {
    for (const c of comensales) {
      if (rand() < 0.78) serve(date, c, "menu", 12);
      if (c.tipo === "alumno" && rand() < 0.55) serve(date, c, "kiosko", 10);
    }
    // Ventas al paso (visitas, padres en reuniones).
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const it = kiosko[Math.floor(rand() * kiosko.length)];
      consumos.unshift({
        id: `cs-${consumos.length + 1}`,
        comensalId: null,
        comensalName: "Venta al paso",
        grupo: "",
        kind: "kiosko",
        items: [{ name: it.name, qty: 1, price: it.price, menuItemId: it.id }],
        total: it.price,
        pago: rand() < 0.5 ? "efectivo" : "yape",
        actor: "Beto (despacho)",
        branchId: "cb-1",
        date,
        at: at(date, 11, Math.floor(rand() * 50)),
      });
    }
  }

  // Reservas de hoy y de los próximos días (las familias reservan con anticipación).
  for (const date of upcoming.slice(0, 5)) {
    for (const c of comensales) {
      if (rand() < (date === today ? 0.7 : 0.45)) reservas.push({ comensalId: c.id, date, by: c.responsableId ? "familia" : "comedor" });
    }
  }
  // Un alumno queda con saldo bajo para mostrar el aviso.
  const bajo = byId.get("cm-A-0104");
  if (bajo && bajo.balance > 6) move(bajo, "ajuste", -(bajo.balance - 4.5), null, "Devolución a la familia (demo)", "Rosa (caja)", at(past[past.length - 1], 16, 0));

  consumos.sort((a, b) => b.at.localeCompare(a.at));
  wallet.sort((a, b) => b.at.localeCompare(a.at));
  return { comensales, responsables, wallet, comedorMenus, reservas, consumos };
}
