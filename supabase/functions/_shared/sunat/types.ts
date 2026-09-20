// Tipos del emisor de comprobantes electrónicos SUNAT.

export type TipoComprobante = "01" | "03"; // 01 Factura, 03 Boleta
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
