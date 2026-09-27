// Impresora térmica de ESTE equipo: vincular por USB o puerto serie, ancho de
// papel, prueba de impresión e impresión automática de comandas.
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { comandaBytes, type PaperWidth } from "@/lib/escpos";
import { getPrinterConfig, pairPrinter, printRaw, printerSupport, savePrinterConfig, type PrinterConfig } from "@/lib/printer";
import { cn } from "@/lib/cn";

export function PrinterCard() {
  const [cfg, setCfg] = useState<PrinterConfig>(getPrinterConfig);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const support = printerSupport();
  const supported = support.serial || support.usb;

  const update = (patch: Partial<PrinterConfig>) => setCfg(savePrinterConfig(patch));

  async function pair(kind: "serial" | "usb") {
    setMsg(null);
    try {
      setCfg(await pairPrinter(kind));
      setMsg({ ok: true, text: "Impresora vinculada. Imprime una prueba para confirmar." });
    } catch (e) {
      const err = e as Error;
      if (err.name !== "NotFoundError") setMsg({ ok: false, text: err.message }); // NotFound = el usuario canceló
    }
  }

  async function test() {
    setMsg(null);
    try {
      await printRaw(comandaBytes({ label: "PRUEBA", at: new Date(), lines: [{ qty: 1, name: "Impresora lista para comandas" }] }, cfg.width));
      setMsg({ ok: true, text: "Enviado a la impresora." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <Card className="mb-4">
      <CardBody className="space-y-3">
        <div>
          <h3 className="font-semibold">Impresora de este equipo</h3>
          <p className="text-muted text-xs mt-0.5">
            Conecta una impresora térmica por USB para imprimir comandas al instante, aunque no haya internet. Se
            configura en cada equipo (caja, tablet de cocina o del mesero).
          </p>
        </div>

        {!supported ? (
          <p className="text-sm rounded-md bg-chip-bg p-3">
            Este navegador no permite conectar impresoras directamente. Usa <strong>Chrome</strong> o{" "}
            <strong>Edge</strong> en computadora o Android. Mientras tanto, las comandas y tickets se imprimen con el
            diálogo de impresión.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("text-sm", cfg.kind === "none" ? "text-muted" : "text-success font-semibold")}>
                {cfg.kind === "none" ? "Sin impresora vinculada" : `✓ ${cfg.label || "Impresora vinculada"}`}
              </span>
              <div className="flex flex-wrap gap-2 ml-auto">
                {support.usb && (
                  <Button size="sm" variant="secondary" onClick={() => pair("usb")}>
                    Vincular por USB
                  </Button>
                )}
                {support.serial && (
                  <Button size="sm" variant="secondary" onClick={() => pair("serial")}>
                    Puerto serie / Bluetooth
                  </Button>
                )}
                {cfg.kind !== "none" && (
                  <>
                    <Button size="sm" onClick={test}>
                      Imprimir prueba
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => update({ kind: "none", label: "", autoComanda: false })}>
                      Quitar
                    </Button>
                  </>
                )}
              </div>
            </div>

            {cfg.kind !== "none" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-xs text-muted mb-1">Ancho del papel</legend>
                  <div className="flex gap-2">
                    {([48, 32] as PaperWidth[]).map((w) => (
                      <button
                        key={w}
                        onClick={() => update({ width: w })}
                        aria-pressed={cfg.width === w}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm border",
                          cfg.width === w ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border",
                        )}
                      >
                        {w === 48 ? "80 mm" : "58 mm"}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={cfg.autoComanda}
                    onChange={(e) => update({ autoComanda: e.target.checked })}
                  />
                  <span>
                    Imprimir la comanda automáticamente al enviar a cocina desde este equipo
                    <span className="block text-muted text-xs">Úsalo si la cocina trabaja con papel o si falla el internet.</span>
                  </span>
                </label>
              </div>
            )}
          </>
        )}
        {msg && (
          <p role="status" className={cn("text-sm", msg.ok ? "text-success" : "text-warning")}>
            {msg.text}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
