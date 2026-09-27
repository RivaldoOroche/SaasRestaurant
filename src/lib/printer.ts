// Impresora térmica del equipo, conectada por USB o puerto serie (Web Serial /
// WebUSB, disponibles en Chrome y Edge de escritorio y Android). Imprime ESC/POS
// directo, sin internet y sin el diálogo de impresión: ideal para comandas.
// La configuración es por equipo (cada caja o tablet tiene su impresora).
import type { PaperWidth } from "./escpos";

export type PrinterKind = "none" | "serial" | "usb";

export interface PrinterConfig {
  kind: PrinterKind;
  width: PaperWidth;
  /** Imprimir la comanda al enviar a cocina desde este equipo. */
  autoComanda: boolean;
  /** Nombre visible de la impresora vinculada. */
  label: string;
}

const KEY = "wayra-printer";
const DEFAULTS: PrinterConfig = { kind: "none", width: 48, autoComanda: false, label: "" };

export function getPrinterConfig(): PrinterConfig {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PrinterConfig>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrinterConfig(patch: Partial<PrinterConfig>): PrinterConfig {
  const next = { ...getPrinterConfig(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

// ---- Tipos mínimos de Web Serial / WebUSB (no están en lib.dom) ----
interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
interface USBEndpointLike {
  direction: "in" | "out";
  type: string;
  endpointNumber: number;
}
interface USBDeviceLike {
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration: { interfaces: { interfaceNumber: number; alternate: { endpoints: USBEndpointLike[] } }[] } | null;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(ep: number, data: Uint8Array): Promise<unknown>;
}
type Nav = Navigator & {
  serial?: { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> };
  usb?: { requestDevice(o: { filters: object[] }): Promise<USBDeviceLike>; getDevices(): Promise<USBDeviceLike[]> };
};
const nav = () => (typeof navigator === "undefined" ? undefined : (navigator as Nav));

export function printerSupport(): { serial: boolean; usb: boolean } {
  return { serial: !!nav()?.serial, usb: !!nav()?.usb };
}

/** Pide al usuario elegir la impresora (el navegador muestra la lista). */
export async function pairPrinter(kind: "serial" | "usb"): Promise<PrinterConfig> {
  const n = nav();
  if (kind === "serial") {
    if (!n?.serial) throw new Error("Este navegador no permite impresoras por puerto serie. Usa Chrome o Edge.");
    const port = await n.serial.requestPort();
    const info = port.getInfo();
    return savePrinterConfig({ kind, label: info.usbVendorId ? `Serie USB ${info.usbVendorId.toString(16)}` : "Puerto serie" });
  }
  if (!n?.usb) throw new Error("Este navegador no permite impresoras USB. Usa Chrome o Edge.");
  const dev = await n.usb.requestDevice({ filters: [{ classCode: 7 }, {}] }); // 7 = clase impresora
  return savePrinterConfig({ kind, label: [dev.manufacturerName, dev.productName].filter(Boolean).join(" ") || "Impresora USB" });
}

async function writeSerial(data: Uint8Array) {
  const [port] = (await nav()?.serial?.getPorts()) ?? [];
  if (!port) throw new Error("La impresora no está conectada. Vuelve a vincularla en Ajustes.");
  try {
    await port.open({ baudRate: 9600 });
  } catch {
    /* ya estaba abierta */
  }
  const writer = port.writable!.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

async function writeUsb(data: Uint8Array) {
  const [dev] = (await nav()?.usb?.getDevices()) ?? [];
  if (!dev) throw new Error("La impresora no está conectada. Vuelve a vincularla en Ajustes.");
  if (!dev.opened) {
    await dev.open();
    if (!dev.configuration) await dev.selectConfiguration(1);
  }
  const iface = dev.configuration!.interfaces.find((i) => i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"));
  if (!iface) throw new Error("No se encontró la salida de datos de la impresora.");
  try {
    await dev.claimInterface(iface.interfaceNumber);
  } catch {
    /* ya reclamada */
  }
  const ep = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk")!;
  // Envío en bloques: algunas impresoras no aceptan transferencias grandes.
  for (let i = 0; i < data.length; i += 4096) await dev.transferOut(ep.endpointNumber, data.slice(i, i + 4096));
}

/** true si hay impresora directa configurada en este equipo. */
export function hasDirectPrinter(): boolean {
  return getPrinterConfig().kind !== "none";
}

/** Envía bytes ESC/POS a la impresora del equipo. */
export async function printRaw(data: Uint8Array): Promise<void> {
  const cfg = getPrinterConfig();
  if (cfg.kind === "serial") return writeSerial(data);
  if (cfg.kind === "usb") return writeUsb(data);
  throw new Error("No hay impresora directa configurada en este equipo.");
}
