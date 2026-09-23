import { create } from "zustand";

export type Lang = "es" | "en";

// Diccionario base. Añadir un idioma = extender cada entrada con su clave.
// Las claves siguen el patrón "seccion.item"; el fallback es la clave misma.
const DICT: Record<string, Record<Lang, string>> = {
  // Navegación (POS)
  "nav.pedido": { es: "Pedido", en: "Order" },
  "nav.mesas": { es: "Mesas", en: "Tables" },
  "nav.reservas": { es: "Reservas", en: "Bookings" },
  "nav.cuentas": { es: "Cuentas", en: "Tabs" },
  "nav.cocina": { es: "Cocina", en: "Kitchen" },
  "nav.online": { es: "En línea", en: "Online" },
  "nav.carta": { es: "Carta", en: "Menu" },
  "nav.editor": { es: "Editor", en: "Editor" },
  "nav.inventario": { es: "Inventario", en: "Inventory" },
  "nav.clientes": { es: "Clientes", en: "Customers" },
  "nav.comprobantes": { es: "SUNAT", en: "SUNAT" },
  "nav.reclamaciones": { es: "Reclamos", en: "Complaints" },
  "nav.caja": { es: "Caja", en: "Cash" },
  "nav.reportes": { es: "Reportes", en: "Reports" },
  "nav.sucursales": { es: "Dueño", en: "Owner" },
  "nav.suscripcion": { es: "Plan", en: "Plan" },
  "nav.permisos": { es: "Permisos", en: "Permissions" },
  "nav.panel": { es: "Panel", en: "Board" },
  "nav.ajustes": { es: "Ajustes", en: "Settings" },
  // Navegación (SaaS)
  "nav.saashome": { es: "Resumen", en: "Overview" },
  "nav.tenants": { es: "Tenants", en: "Tenants" },
  "nav.retencion": { es: "Retención", en: "Retention" },
  "nav.ingresos": { es: "Ingresos", en: "Revenue" },
  "nav.cobros": { es: "Cobros", en: "Charges" },
  "nav.planes": { es: "Planes", en: "Plans" },
  "nav.soporte": { es: "Soporte", en: "Support" },
  "nav.bitacora": { es: "Bitácora", en: "Activity log" },
  "nav.configsaas": { es: "Config", en: "Config" },
  // Comunes
  "common.language": { es: "Idioma", en: "Language" },
  "common.currency": { es: "Moneda", en: "Currency" },
  "common.logout": { es: "Salir", en: "Log out" },
  "common.online": { es: "En línea", en: "Online" },
  "common.offline": { es: "Sin conexión", en: "Offline" },
  "login.title": { es: "Ingresa a Wayra POS", en: "Sign in to Wayra POS" },
  "login.pin": { es: "Ingresa tu PIN", en: "Enter your PIN" },
};

const KEY = "nubepos-lang";
function initial(): Lang {
  try {
    const s = localStorage.getItem(KEY) as Lang | null;
    if (s === "es" || s === "en") return s;
  } catch {
    /* ignore */
  }
  return "es";
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLang = create<LangState>((set) => ({
  lang: initial(),
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignore */
    }
    set({ lang });
  },
}));

/** Traduce una clave al idioma actual; si no existe, devuelve la clave. */
export function translate(key: string, lang: Lang): string {
  return DICT[key]?.[lang] ?? key;
}

/** Hook: devuelve `t(key)` ligado al idioma actual. */
export function useT(): (key: string) => string {
  const lang = useLang((s) => s.lang);
  return (key: string) => translate(key, lang);
}
