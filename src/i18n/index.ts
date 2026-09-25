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
  "nav.ayuda": { es: "Ayuda", en: "Help" },
  // Comunes
  "common.language": { es: "Idioma", en: "Language" },
  "common.currency": { es: "Moneda", en: "Currency" },
  "common.logout": { es: "Salir", en: "Log out" },
  "common.online": { es: "En línea", en: "Online" },
  "common.offline": { es: "Sin conexión", en: "Offline" },
  "common.cancel": { es: "Cancelar", en: "Cancel" },
  "common.save": { es: "Guardar", en: "Save" },
  "common.add": { es: "Agregar", en: "Add" },
  "common.close": { es: "Cerrar", en: "Close" },
  "login.title": { es: "Ingresa a Wayra POS", en: "Sign in to Wayra POS" },
  "login.pin": { es: "Ingresa tu PIN", en: "Enter your PIN" },
  // Cocina (KDS)
  "kds.title": { es: "Cocina · KDS", en: "Kitchen · KDS" },
  "kds.subtitle": { es: "Toca una comanda para avanzarla de columna", en: "Tap a ticket to advance it a column" },
  "kds.col.nuevos": { es: "Nuevos", en: "New" },
  "kds.col.prep": { es: "En preparación", en: "In progress" },
  "kds.col.listos": { es: "Listos para pasar", en: "Ready to serve" },
  "kds.active": { es: "Activos", en: "Active" },
  "kds.delay": { es: "Retraso", en: "Delayed" },
  "kds.ready": { es: "Listos", en: "Ready" },
  "kds.empty": { es: "Sin comandas", en: "No tickets" },
  "kds.done": { es: "✓ listo", en: "✓ ready" },
  // Pedido
  "pedido.title": { es: "Pedido", en: "Order" },
  "pedido.chooseTable": { es: "Elige una mesa para empezar a tomar el pedido.", en: "Choose a table to start taking the order." },
  "pedido.goTables": { es: "Ir a Mesas →", en: "Go to Tables →" },
  "pedido.search": { es: "Buscar en toda la carta…", en: "Search the whole menu…" },
  "pedido.orderTable": { es: "Pedido · Mesa", en: "Order · Table" },
  "pedido.emptyTicket": { es: "Ticket vacío", en: "Empty ticket" },
  "pedido.subtotal": { es: "Subtotal", en: "Subtotal" },
  "pedido.total": { es: "Total", en: "Total" },
  "pedido.sendKitchen": { es: "Enviar a cocina", en: "Send to kitchen" },
  "pedido.charge": { es: "Cobrar", en: "Charge" },
  "pedido.soldOut": { es: "Agotado", en: "Sold out" },
  "pedido.transfer": { es: "Transferir / unir mesa", en: "Transfer / merge table" },
  "pedido.filterVeg": { es: "Vegetariano", en: "Vegetarian" },
  "pedido.filterSpicy": { es: "Picante", en: "Spicy" },
  "pedido.filterGf": { es: "Sin gluten", en: "Gluten-free" },
  "pedido.noResults": { es: "Sin resultados.", en: "No results." },
  "pedido.guests": { es: "comensales", en: "guests" },
  "pedido.emptyHint": { es: "Toca un platillo para elegir modificadores, o + para agregarlo directo.", en: "Tap a dish to pick modifiers, or + to add it directly." },
  "pedido.void": { es: "✕ anular", en: "✕ void" },
  // Cobro (checkout)
  "cobro.titleDoc": { es: "Comprobante", en: "Receipt" },
  "cobro.titlePay": { es: "Cobrar · Mesa", en: "Charge · Table" },
  "cobro.discount": { es: "Descuento", en: "Discount" },
  "cobro.courtesy": { es: "Cortesía", en: "Comp" },
  "cobro.tip": { es: "Propina", en: "Tip" },
  "cobro.split": { es: "Dividir cuenta", en: "Split bill" },
  "cobro.loyalty": { es: "Lealtad", en: "Loyalty" },
  "cobro.noCustomer": { es: "Sin cliente", en: "No customer" },
  "cobro.noRedeem": { es: "No canjear", en: "Don't redeem" },
  "cobro.pointsRedeemed": { es: "Puntos canjeados", en: "Points redeemed" },
  "cobro.toCharge": { es: "A cobrar", en: "To charge" },
  "cobro.total": { es: "Total", en: "Total" },
  "cobro.subtotal": { es: "Subtotal", en: "Subtotal" },
  "cobro.method": { es: "Método de pago", en: "Payment method" },
  "cobro.registerPay": { es: "Registrar pago", en: "Register payment" },
  "cobro.confirmReceived": { es: "Confirmar pago recibido", en: "Confirm payment received" },
  "cobro.confirmEmit": { es: "Confirmar pago y emitir", en: "Confirm payment and issue" },
  "cobro.docType": { es: "Tipo de comprobante", en: "Receipt type" },
  "cobro.done": { es: "Listo", en: "Done" },
  "cobro.closeNoEmit": { es: "Cerrar sin emitir", en: "Close without issuing" },
  "cobro.cardNumber": { es: "Número de tarjeta", en: "Card number" },
  "cobro.customerEmail": { es: "Correo del cliente", en: "Customer email" },
  "cobro.razonSocial": { es: "Razón social", en: "Legal name" },
  "cobro.chargeRejected": { es: "El cargo fue rechazado", en: "The charge was rejected" },
  "cobro.cardError": { es: "No se pudo procesar la tarjeta", en: "The card could not be processed" },
  "cobro.back": { es: "← Volver", en: "← Back" },
  "cobro.processing": { es: "Procesando…", en: "Processing…" },
  "cobro.willEarn": { es: "Acumulará", en: "Will earn" },
  "cobro.emit": { es: "Emitir", en: "Issue" },
  "cobro.print": { es: "🖨 Imprimir", en: "🖨 Print" },
  "cobro.offlineNote": {
    es: "Sin conexión — el comprobante quedará en cola y se enviará a SUNAT al reconectar.",
    en: "Offline — the receipt will be queued and sent to SUNAT when back online.",
  },
  "cobro.tokenizeNote": { es: "La tarjeta se tokeniza con", en: "The card is tokenized with" },
  "cobro.notOurServers": { es: "no pasa por nuestros servidores.", en: "it never touches our servers." },
  "pay.efectivo": { es: "Efectivo", en: "Cash" },
  "pay.tarjeta": { es: "Tarjeta", en: "Card" },
  "pay.transferencia": { es: "Transferencia", en: "Transfer" },
  // Mesas (plano)
  "mesa.libre": { es: "Libre", en: "Free" },
  "mesa.ocupada": { es: "Ocupada", en: "Busy" },
  "mesa.cuenta": { es: "Pidió cuenta", en: "Bill requested" },
  "mesa.reservada": { es: "Reservada", en: "Reserved" },
  "mesa.configure": { es: "⚙ Configurar mesas", en: "⚙ Configure tables" },
  "mesa.empty": { es: "Esta sucursal aún no tiene mesas.", en: "This branch has no tables yet." },
  "mesa.emptyAdmin": { es: " Pide a un administrador que las configure.", en: " Ask an administrator to configure them." },
  "mesa.configureBtn": { es: "Configurar mesas", en: "Configure tables" },
  "mesa.seats": { es: "sillas", en: "seats" },
  // Carta pública (vista del cliente vía QR)
  "carta.subtitle": { es: "Carta digital", en: "Digital menu" },
  "carta.loading": { es: "Cargando carta…", en: "Loading menu…" },
  "carta.notFound": { es: "No encontramos esta carta. Verifica el enlace.", en: "We couldn't find this menu. Check the link." },
  "carta.veg": { es: "Veg", en: "Veggie" },
  "carta.spicy": { es: "Picante", en: "Spicy" },
  "carta.gf": { es: "Sin gluten", en: "Gluten-free" },
  "carta.pricesNote": { es: "Precios incluyen IGV. Carta referencial.", en: "Prices include VAT (IGV). Reference menu." },
  "carta.poweredBy": { es: "Con tecnología de", en: "Powered by" },
  "carta.langToggle": { es: "English", en: "Español" },
  // Comprobante (etiquetas bilingües de cortesía; el documento legal es en español)
  "comp.customer": { es: "Cliente", en: "Customer" },
  "comp.issueDate": { es: "Fecha emisión", en: "Issue date" },
  "comp.time": { es: "Hora", en: "Time" },
  "comp.currency": { es: "Moneda", en: "Currency" },
  "comp.qty": { es: "Cant.", en: "Qty" },
  "comp.description": { es: "Descripción", en: "Description" },
  "comp.unitPrice": { es: "P. Unit.", en: "Unit price" },
  "comp.amount": { es: "Importe", en: "Amount" },
  "comp.discount": { es: "Descuento", en: "Discount" },
  "comp.taxable": { es: "Op. Gravada", en: "Taxable amount" },
  "comp.total": { es: "IMPORTE TOTAL", en: "TOTAL" },
  "comp.modifies": { es: "Documento que modifica", en: "Modified document" },
  "comp.reason": { es: "Motivo", en: "Reason" },
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

/**
 * Traducción por texto fuente (español → inglés). Permite internacionalizar
 * componentes reutilizables (p. ej. ScreenHeader) sin tocar cada pantalla:
 * el texto en español es la clave. Si no hay traducción, se devuelve el original.
 */
const SOURCE_EN: Record<string, string> = {
  // Encabezados de pantalla (POS)
  "Mesas": "Tables",
  "Plano por zonas · toca una mesa libre u ocupada para abrir su pedido": "Floor plan by zone · tap a free or busy table to open its order",
  "Cuentas": "Tabs",
  "Cuentas abiertas en el piso · toca una para cobrar": "Open tabs on the floor · tap one to charge",
  "Inventario": "Inventory",
  "Control de stock por insumo · ajusta con ± (solo admin)": "Stock control per item · adjust with ± (admin only)",
  "Clientes": "Customers",
  "CRM y lealtad · visitas, gasto y puntos": "CRM & loyalty · visits, spend and points",
  "Carta": "Menu",
  "Revisión de cambios propuestos · aprueba o rechaza": "Review of proposed changes · approve or reject",
  "Editor de carta": "Menu editor",
  "Precios, disponibilidad (86) y recetas / food cost": "Prices, availability (86) and recipes / food cost",
  "En línea": "Online",
  "Pedidos de delivery y canales digitales": "Delivery orders and digital channels",
  "Reservas y lista de espera": "Bookings and waitlist",
  "Gestiona reservas del día y la cola de espera": "Manage today's bookings and the waitlist",
  "Corte de caja": "Cash close-out",
  "Arqueo del turno · esperado por método vs. contado": "Shift count · expected by method vs. counted",
  "Reportes": "Reports",
  "Resumen del negocio": "Business overview",
  "Panel": "Board",
  "Resumen operativo del turno": "Shift operations overview",
  "Ajustes del negocio": "Business settings",
  "Moneda, impuestos y preferencias": "Currency, taxes and preferences",
  "Monitor SUNAT": "SUNAT monitor",
  "Comprobantes electrónicos · boletas, facturas y notas de crédito": "Electronic receipts · boletas, facturas and credit notes",
  "Libro de Reclamaciones": "Complaints book",
  "Hojas de reclamación de tus clientes (Indecopi). Responde dentro de 15 días hábiles.":
    "Your customers' complaint sheets (Indecopi). Respond within 15 business days.",
  "Permisos por rol": "Permissions by role",
  "Elige a qué pantallas accede cada rol. El Dueño siempre tiene acceso completo.":
    "Choose which screens each role can access. The Owner always has full access.",
  "Centro de ayuda": "Help center",
  "Guías rápidas, preguntas frecuentes y estado del servicio.": "Quick guides, FAQ and service status.",
  "Plan": "Plan",
  "Tu suscripción a Wayra POS": "Your Wayra POS subscription",
  "Dueño": "Owner",
  "Sucursales, personal y bitácora de actividad": "Branches, staff and activity log",
  // Encabezados de pantalla (SaaS)
  "Tenants (clientes)": "Tenants (clients)",
  "Restaurantes que usan tu plataforma": "Restaurants using your platform",
  "Retención & cobranza": "Retention & collections",
  "MRR neto, churn, pruebas, pagos fallidos y uso vs. límites": "Net MRR, churn, trials, failed payments and usage vs. limits",
  "Ingresos": "Revenue",
  "MRR por plan y cobranza del mes": "MRR by plan and this month's collections",
  "Cobros de suscripción": "Subscription charges",
  "Toda cobranza pasa por aprobación: valida los datos de la factura antes de cobrar.":
    "Every charge goes through approval: validate the invoice data before charging.",
  "Planes": "Plans",
  "Precios, beneficios y suscriptores por plan": "Prices, benefits and subscribers per plan",
  "Soporte": "Support",
  "Tickets de los tenants · cambia estado y prioridad": "Tenant tickets · change status and priority",
  "Bitácora": "Activity log",
  "Todo lo que hacen los tenants · monitoreo y detección de fallos": "Everything tenants do · monitoring and failure detection",
  "Configuración del SaaS": "SaaS configuration",
  "Datos de tu empresa y cómo emites las facturas de suscripción a los tenants":
    "Your company data and how you issue subscription invoices to tenants",
  "Tu negocio SaaS · provees el POS a tus clientes (tenants)": "Your SaaS business · you provide the POS to your clients (tenants)",
  "Tenants": "Tenants",
};

/** Traduce un texto en español a inglés por su contenido; conserva el original si no hay traducción. */
export function localizeText(text: string | undefined, lang: Lang): string | undefined {
  if (!text || lang === "es") return text;
  return SOURCE_EN[text] ?? text;
}

/** Hook: devuelve `t(key)` ligado al idioma actual. */
export function useT(): (key: string) => string {
  const lang = useLang((s) => s.lang);
  return (key: string) => translate(key, lang);
}
