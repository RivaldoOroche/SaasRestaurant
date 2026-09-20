// Tipos del emisor de comprobantes electrónicos SUNAT.

export type TipoComprobante = "01" | "03" | "07"; // 01 Factura, 03 Boleta, 07 Nota de crédito
export type TipoDocIdentidad = "6" | "1" | "0" | "-"; // 6 RUC, 1 DNI, 0 sin doc

export interface Emisor {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccion: string;
  ubigeo?: string; // 6 dígitos, p.ej. "150122" Miraflores
}

export interface Cliente {
  tipoDoc: TipoDocIdentidad;
  numDoc: string;
  nombre: string;
}

export interface ItemComprobante {
  descripcion: string;
  cantidad: number;
  unidad?: string; // código SUNAT (NIU por defecto)
  valorUnitario: number; // sin IGV
}

export interface Comprobante {
  tipo: TipoComprobante;
  serie: string; // F001 / B001
  correlativo: string; // "123"
  fechaEmision: string; // YYYY-MM-DD
  horaEmision?: string; // HH:MM:SS
  moneda?: string; // PEN
  igvTasa?: number; // 0.18
  emisor: Emisor;
  cliente: Cliente;
  items: ItemComprobante[];
}

export interface Totales {
  valorVenta: number; // gravado (sin IGV)
  igv: number;
  total: number; // con IGV
}

/** Referencia al documento que una nota de crédito modifica. */
export interface NotaCreditoRef {
  tipoDocRef: TipoComprobante; // 01 factura / 03 boleta afectada
  folioRef: string; // serie-correlativo del documento afectado, p.ej. B001-1001
  motivoCodigo?: string; // catálogo 09; "01" = anulación de la operación (por defecto)
  motivo: string; // descripción del motivo
}

// --- Resumen diario de boletas (RC) — SummaryDocuments ---
export interface ResumenLinea {
  tipoDoc: TipoComprobante; // 03 boleta, 07 NC de boleta
  serie: string; // B001
  correlativo: string; // 1001
  clienteTipoDoc: TipoDocIdentidad;
  clienteNumDoc: string;
  gravado: number; // op. gravada (sin IGV)
  igv: number;
  total: number; // con IGV
  estado?: "1" | "2" | "3"; // 1 adicionar (def), 2 modificar, 3 anular
}
export interface ResumenDoc {
  id: string; // RC-YYYYMMDD-#
  fechaReferencia: string; // día de emisión de las boletas (YYYY-MM-DD)
  fechaGeneracion: string; // día de envío del resumen (YYYY-MM-DD)
  emisor: Emisor;
  moneda?: string;
  igvTasa?: number;
  lineas: ResumenLinea[];
}

// --- Comunicación de baja (RA) — VoidedDocuments ---
export interface BajaLinea {
  tipoDoc: TipoComprobante; // 01 factura, 03 boleta
  serie: string;
  correlativo: string;
  motivo: string;
}
export interface BajaDoc {
  id: string; // RA-YYYYMMDD-#
  fechaReferencia: string; // día de emisión del documento a dar de baja
  fechaGeneracion: string; // día de la comunicación
  emisor: Emisor;
  lineas: BajaLinea[];
}
