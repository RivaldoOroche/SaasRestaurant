import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { computeCheckout, equalSplit } from "@/lib/checkout";
import { useOrderActions, useCustomers, useSunatActions, useSettings, useRepo } from "@/data/hooks";
import { useConnection } from "@/store/connection";
import { cn } from "@/lib/cn";
import { Qr } from "@/components/Qr";
import { tokenizeCard } from "@/lib/cardToken";
import { printThermal } from "@/lib/printThermal";
import { isBackendConfigured } from "@/lib/supabase";
import { useT } from "@/i18n";
import { ComprobanteDoc } from "./ComprobanteDoc";
import type { Order, Comprobante, ComprobanteTipo } from "@/data/model";

type Stage = "cuenta" | "pago" | "doc";
const DISCOUNTS = [0, 0.1, 0.15, 1];
const TIPS = [0, 0.1, 0.15, 0.18];
const METHOD_KEYS = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;
// Yape y Plin son marcas: no se traducen.
function methodLabel(tr: (k: string) => string, key: string): string {
  return key === "yape" ? "Yape" : key === "plin" ? "Plin" : tr(`pay.${key}`);
}

export function CobroModal({
  open,
  onClose,
  order,
  amount,
  taxRate,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  amount: number;
  taxRate: number;
  onPaid: () => void;
}) {
  const t = useT();
  const actions = useOrderActions(order.tableId);
  const { data: customers = [] } = useCustomers();
  const { data: settings } = useSettings();
  const sunat = useSunatActions();
  const online = useConnection((s) => s.online);
  const [docTipo, setDocTipo] = useState<ComprobanteTipo>("Boleta");
  const [ruc, setRuc] = useState("");
  const [razon, setRazon] = useState("");
  const [emitted, setEmitted] = useState<Comprobante | null>(null);
  const [stage, setStage] = useState<Stage>("cuenta");
  const [discountPct, setDiscountPct] = useState(0);
  const [tipPct, setTipPct] = useState(0);
  const [splitN, setSplitN] = useState(1);
  const [method, setMethod] = useState("efectivo");
  const [custId, setCustId] = useState<string | null>(null);
  const [redeem, setRedeem] = useState(0);
  const repo = useRepo();
  const [card, setCard] = useState({ number: "", expMonth: "", expYear: "", cvv: "", email: "" });
  const [cardErr, setCardErr] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);

  const cardConfigured =
    method === "tarjeta" && !!settings?.cardProvider && settings.cardProvider !== "ninguno" && !!settings.cardPublicKey;

  const customer = customers.find((c) => c.id === custId) ?? null;
  const preResult = useMemo(
    () => computeCheckout({ amount, taxRate, discountPct, tipPct }),
    [amount, taxRate, discountPct, tipPct],
  );
  const redeemMax = Math.min(customer?.points ?? 0, Math.floor(preResult.grand));
  const result = useMemo(
    () => computeCheckout({ amount, taxRate, discountPct, tipPct, redeem }),
    [amount, taxRate, discountPct, tipPct, redeem],
  );
  const perPerson = equalSplit(result.due, splitN);

  function reset() {
    setStage("cuenta");
    setDiscountPct(0);
    setTipPct(0);
    setSplitN(1);
    setMethod("efectivo");
    setCustId(null);
    setRedeem(0);
    setDocTipo("Boleta");
    setRuc("");
    setRazon("");
    setEmitted(null);
    setCard({ number: "", expMonth: "", expYear: "", cvv: "", email: "" });
    setCardErr(null);
  }

  async function emitComprobante() {
    const cpe = await sunat.emit.mutateAsync({
      input: {
        orderId: order.id,
        tipo: docTipo,
        buyerRuc: docTipo === "Factura" ? ruc : null,
        buyerName: docTipo === "Factura" ? razon : null,
        subtotal: result.subtotal,
        igv: result.igv,
        // El comprobante SUNAT grava subtotal + IGV; la propina no forma parte
        // del comprobante en Perú, así que el total es netAmt, no grand.
        total: result.netAmt,
        reference: `Mesa ${order.tableLabel}`,
      },
      online,
    });
    setEmitted(cpe);
  }

  function close() {
    reset();
    onClose();
  }

  async function pay() {
    await actions.payOrder.mutateAsync({
      orderId: order.id,
      method,
      total: result.grand,
      customerId: custId,
      redeem: result.redeemApplied,
    });
    setStage("doc");
  }

  /** Cobro con tarjeta: tokeniza (con la llave pública) y cobra en el servidor. */
  async function payCard() {
    setCardErr(null);
    setCardBusy(true);
    try {
      const provider = settings!.cardProvider!;
      // Sin backend real (demo) no hay pasarela: usamos un token de prueba.
      const token = !isBackendConfigured
        ? `tok_demo_${Date.now()}`
        : await tokenizeCard(provider, settings!.cardPublicKey!, card);
      const res = await repo.chargeCard({
        token,
        amount: result.due,
        currency: settings!.currency,
        email: card.email,
        description: `Mesa ${order.tableLabel}`,
      });
      if (!res.success) {
        setCardErr(res.error ?? "El cargo fue rechazado");
        return;
      }
      await pay();
    } catch (e) {
      setCardErr((e as Error).message ?? "No se pudo procesar la tarjeta");
    } finally {
      setCardBusy(false);
    }
  }

  const methodName = methodLabel(t, method);

  return (
    <Modal open={open} onClose={close} labelledBy="cobro-title">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 id="cobro-title" className="text-xl font-bold">
            {stage === "doc" ? t("cobro.titleDoc") : t("cobro.titlePay") + " " + order.tableLabel}
          </h2>
          <span className="font-mono text-lg font-bold text-accent">{formatMoney(result.due)}</span>
        </div>

        {stage === "cuenta" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-alt border border-border-soft p-3 space-y-1">
              <Row label={t("cobro.subtotal")} value={formatMoney(result.subtotal)} />
              <Row label={`IGV (${Math.round(taxRate * 100)}%)`} value={formatMoney(result.igv)} />
              {result.discAmt > 0 && <Row label={t("cobro.discount")} value={"− " + formatMoney(result.discAmt)} />}
              {result.tipAmt > 0 && <Row label={t("cobro.tip")} value={formatMoney(result.tipAmt)} />}
              {result.redeemApplied > 0 && (
                <Row label={t("cobro.pointsRedeemed")} value={"− " + formatMoney(result.redeemApplied)} />
              )}
              <div className="flex justify-between pt-1 font-bold">
                <span>{result.redeemApplied > 0 ? t("cobro.toCharge") : t("cobro.total")}</span>
                <span className="font-mono">{formatMoney(result.due)}</span>
              </div>
            </div>

            <Field label={t("cobro.discount")}>
              <div className="flex flex-wrap gap-2">
                {DISCOUNTS.map((d) => (
                  <Pill key={d} active={discountPct === d} onClick={() => setDiscountPct(d)}>
                    {d === 1 ? t("cobro.courtesy") : `${Math.round(d * 100)}%`}
                  </Pill>
                ))}
              </div>
            </Field>

            <Field label={t("cobro.tip")}>
              <div className="flex flex-wrap gap-2">
                {TIPS.map((tp) => (
                  <Pill key={tp} active={tipPct === tp} onClick={() => setTipPct(tp)}>
                    {Math.round(tp * 100)}%
                  </Pill>
                ))}
              </div>
            </Field>

            <Field label={t("cobro.split")}>
              <div className="flex items-center gap-3">
                <Stepper value={splitN} onDec={() => setSplitN(Math.max(1, splitN - 1))} onInc={() => setSplitN(Math.min(order.seats || 8, splitN + 1))} />
                {splitN > 1 && (
                  <span className="text-sm text-muted">
                    {formatMoney(perPerson)} <span className="opacity-70">por persona</span>
                  </span>
                )}
              </div>
            </Field>

            <Field label={t("cobro.loyalty")}>
              <select
                value={custId ?? ""}
                onChange={(e) => {
                  setCustId(e.target.value || null);
                  setRedeem(0);
                }}
                className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm mb-2"
              >
                <option value="">{t("cobro.noCustomer")}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.points} pts
                  </option>
                ))}
              </select>
              {customer && (
                <div className="flex flex-wrap gap-2">
                  {[0, 50, 100].filter((v) => v <= redeemMax).map((v) => (
                    <Pill key={v} active={redeem === v} onClick={() => setRedeem(v)}>
                      {v === 0 ? t("cobro.noRedeem") : `${v} pts`}
                    </Pill>
                  ))}
                  {redeemMax > 0 && (
                    <Pill active={redeem === redeemMax} onClick={() => setRedeem(redeemMax)}>
                      Todo ({redeemMax})
                    </Pill>
                  )}
                </div>
              )}
            </Field>

            <Field label={t("cobro.method")}>
              <div className="flex flex-wrap gap-2">
                {METHOD_KEYS.map((k) => (
                  <Pill key={k} active={method === k} onClick={() => setMethod(k)}>
                    {methodLabel(t, k)}
                  </Pill>
                ))}
              </div>
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => setStage("pago")}>{t("cobro.registerPay")}</Button>
            </div>
          </div>
        )}

        {stage === "pago" && (
          <div className="space-y-4">
            {method === "yape" || method === "plin" ? (
              <div className="text-center py-2">
                <p className="font-semibold mb-2">
                  {method === "yape" ? "Yape" : "Plin"} — {formatMoney(result.due)}
                </p>
                <div className="inline-block bg-white p-2 rounded-md border border-border">
                  <Qr
                    value={`${method === "yape" ? "YAPE" : "PLIN"}|${(method === "yape" ? settings?.yapeNumber : settings?.plinNumber) ?? ""}|${result.due.toFixed(2)}|${order.tableLabel}`}
                    size={150}
                  />
                </div>
                <p className="text-sm mt-2">
                  Escanea para pagar a{" "}
                  <span className="font-mono font-semibold">
                    {(method === "yape" ? settings?.yapeNumber : settings?.plinNumber) || "—"}
                  </span>
                </p>
                <p className="text-muted text-xs mt-1">
                  Pide al cliente que escanee y confirma cuando llegue el pago.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-4xl mb-2">{method === "efectivo" ? "💵" : "💳"}</div>
                <p className="font-semibold">{t("pedido.charge")} {formatMoney(result.due)}</p>
                <p className="text-muted text-sm">{t("cobro.method")}: {methodName}</p>
                {method === "tarjeta" && settings?.cardProvider && settings.cardProvider !== "ninguno" && (
                  <p className="text-muted text-xs mt-1">Procesado con {settings.cardProvider}</p>
                )}
                {result.pointsEarned > 0 && (
                  <p className="text-muted text-xs mt-1">{t("cobro.willEarn")} {result.pointsEarned} pts</p>
                )}
              </div>
            )}

            {cardConfigured && (
              <div className="space-y-2 rounded-lg bg-surface-alt border border-border-soft p-3">
                <input
                  value={card.number}
                  onChange={(e) => setCard({ ...card, number: e.target.value })}
                  placeholder={t("cobro.cardNumber")}
                  inputMode="numeric"
                  className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={card.expMonth}
                    onChange={(e) => setCard({ ...card, expMonth: e.target.value })}
                    placeholder="MM"
                    inputMode="numeric"
                    className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
                  />
                  <input
                    value={card.expYear}
                    onChange={(e) => setCard({ ...card, expYear: e.target.value })}
                    placeholder="AAAA"
                    inputMode="numeric"
                    className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
                  />
                  <input
                    value={card.cvv}
                    onChange={(e) => setCard({ ...card, cvv: e.target.value })}
                    placeholder="CVV"
                    inputMode="numeric"
                    className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm font-mono"
                  />
                </div>
                <input
                  value={card.email}
                  onChange={(e) => setCard({ ...card, email: e.target.value })}
                  placeholder={t("cobro.customerEmail")}
                  inputMode="email"
                  className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
                />
                {cardErr && <p className="text-warning text-xs">{cardErr}</p>}
                <p className="text-muted text-[11px]">
                  {t("cobro.tokenizeNote")} {settings!.cardProvider}; {t("cobro.notOurServers")}
                </p>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStage("cuenta")}>
                {t("cobro.back")}
              </Button>
              {cardConfigured ? (
                <Button onClick={payCard} disabled={cardBusy || actions.payOrder.isPending}>
                  {cardBusy ? t("cobro.processing") : `${t("pedido.charge")} ${formatMoney(result.due)}`}
                </Button>
              ) : (
                <Button onClick={pay} disabled={actions.payOrder.isPending}>
                  {method === "yape" || method === "plin" ? t("cobro.confirmReceived") : t("cobro.confirmEmit")}
                </Button>
              )}
            </div>
          </div>
        )}

        {stage === "doc" && (
          <div>
            {/* Controles de emisión (arriba, no se imprimen) */}
            {!emitted && (
              <div className="mb-4 no-print space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted mb-1.5">{t("cobro.docType")}</p>
                  <div className="flex flex-wrap gap-2">
                    {(["Boleta", "Factura"] as const).map((dt) => (
                      <Pill key={dt} active={docTipo === dt} onClick={() => setDocTipo(dt)}>
                        {dt}
                      </Pill>
                    ))}
                  </div>
                </div>
                {docTipo === "Factura" && (
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      value={ruc}
                      onChange={(e) => setRuc(e.target.value)}
                      placeholder="RUC (11 dígitos)"
                      className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
                    />
                    <input
                      value={razon}
                      onChange={(e) => setRazon(e.target.value)}
                      placeholder={t("cobro.razonSocial")}
                      className="rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {!online && (
                  <p className="text-warning text-xs">{t("cobro.offlineNote")}</p>
                )}
              </div>
            )}

            {/* Representación impresa de la boleta/factura */}
            <ComprobanteDoc
              tipo={docTipo}
              folio={emitted?.folio ?? `${docTipo === "Factura" ? "F001" : "B001"}-PENDIENTE`}
              emisor={{
                razonSocial: "LA HIGUERA S.A.C.",
                nombreComercial: "La Higuera",
                ruc: "20512345678",
                direccion: "Av. La Mar 1234, Miraflores, Lima",
              }}
              cliente={
                docTipo === "Factura"
                  ? { nombre: razon || "—", docLabel: "RUC", docNum: ruc || "—" }
                  : { nombre: "CLIENTES VARIOS", docLabel: "DNI", docNum: "—" }
              }
              lines={order.lines}
              discount={result.discAmt}
              subtotal={result.subtotal}
              igv={result.igv}
              total={result.netAmt}
              taxRate={taxRate}
              status={emitted?.status}
            />

            <div className="flex justify-between gap-2 mt-4 no-print">
              {!emitted ? (
                <Button onClick={emitComprobante} disabled={sunat.emit.isPending}>
                  {t("cobro.emit")} {docTipo}
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => window.print()}>
                    {t("cobro.print")}
                  </Button>
                  <Button variant="secondary" onClick={printThermal}>
                    🧾 80mm
                  </Button>
                </div>
              )}
              <Button
                onClick={() => {
                  reset();
                  onPaid();
                }}
              >
                {emitted ? t("cobro.done") : t("cobro.closeNoEmit")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm border transition-colors",
        active ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Stepper({ value, onDec, onInc }: { value: number; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onDec} className="h-8 w-8 rounded-md bg-chip-bg border border-border">
        −
      </button>
      <span className="w-8 text-center">{value}</span>
      <button onClick={onInc} className="h-8 w-8 rounded-md bg-chip-bg border border-border">
        +
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
