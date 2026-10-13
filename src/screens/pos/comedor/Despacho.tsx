// Despacho del comedor: busca al comensal (código, DNI o nombre; también con
// lector de tarjeta o código de barras que «escribe» y da Enter), entrega el
// menú del día o vende en el kiosko con su saldo. Venta al paso sin comensal.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  useCategories,
  useComedorActions,
  useComedorMenus,
  useComensales,
  useConsumos,
  useMenuItems,
  useReservas,
  useSettings,
} from "@/data/hooks";
import { useBranchStore } from "@/store/branch";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMoney, round2 } from "@/lib/money";
import { allergyHit, itemsTotal, kioskoBlock, localDate, menuCheck, TIPO_LABEL } from "@/lib/comedor";
import { cn } from "@/lib/cn";
import type { Comensal, MenuItem } from "@/data/model";
import { MovimientosModal, PlanBadge, RecargaModal, fechaCorta, saldoTone } from "./shared";

type Mode = "menu" | "kiosko";
type Cart = Record<string, number>;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Despacho() {
  const { session } = useAuth();
  const actor = session?.staff?.name ?? "Despacho";
  const today = localDate();
  const branchId = useBranchStore((s) => s.branchId);
  const { data: settings } = useSettings();
  const { data: comensales = [] } = useComensales();
  const { data: menus = [] } = useComedorMenus(today, today);
  const { data: reservas = [] } = useReservas(today, today);
  const { data: consumos = [] } = useConsumos(today, today);
  const { data: items = [] } = useMenuItems();
  const { data: categories = [] } = useCategories();
  const { despachar } = useComedorActions();

  const [mode, setMode] = useState<Mode>("menu");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [pagoPaso, setPagoPaso] = useState<"efectivo" | "yape" | "plin" | "tarjeta">("efectivo");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recarga, setRecarga] = useState<Comensal | null>(null);
  const [movs, setMovs] = useState<Comensal | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const menu = menus[0] ?? null;
  const rules = {
    bloquearOctogonos: settings?.bloquearOctogonos ?? true,
    permitirSinReserva: settings?.permitirSinReserva ?? true,
  };
  const minimo = settings?.saldoMinimo ?? 10;
  const sel = comensales.find((c) => c.id === selId) ?? null;
  const reservedIds = useMemo(() => new Set(reservas.map((r) => r.comensalId)), [reservas]);
  const menusHoy = consumos.filter((k) => k.kind === "menu");
  const servedIds = useMemo(() => new Set(menusHoy.map((k) => k.comensalId)), [menusHoy]);
  const pendientes = reservas.filter((r) => !servedIds.has(r.comensalId)).length;
  const kioskoHoy = round2(consumos.filter((k) => k.kind === "kiosko").reduce((s, k) => s + k.total, 0));
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";

  const results = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return [];
    return comensales
      .filter((c) => c.active && (norm(c.name).includes(t) || norm(c.code).includes(t) || norm(c.grupo).includes(t)))
      .slice(0, 8);
  }, [q, comensales]);

  // Tras despachar, vuelve al buscador para atender al siguiente.
  useEffect(() => {
    if (!selId) searchRef.current?.focus();
  }, [selId]);

  function pick(c: Comensal) {
    setSelId(c.id);
    setQ("");
    setCart({});
    setMsg(null);
  }
  function onEnter() {
    const t = q.trim().toLowerCase();
    const exact = comensales.find((c) => c.active && c.code.toLowerCase() === t);
    if (exact) return pick(exact);
    if (results.length === 1) return pick(results[0]);
  }

  const cartLines = Object.entries(cart)
    .filter(([, n]) => n > 0)
    .map(([id, qty]) => {
      const it = items.find((i) => i.id === id)!;
      return { menuItemId: id, name: it?.name ?? "", qty, price: it?.price ?? 0, categoryId: it?.categoryId ?? "", octogonos: it?.octogonos ?? 0 };
    })
    .filter((l) => l.name);
  const cartTotal = itemsTotal(cartLines);
  const spentToday = sel ? consumos.filter((k) => k.comensalId === sel.id && k.kind === "kiosko").reduce((s, k) => s + k.total, 0) : 0;

  const menuPreview = sel
    ? menuCheck(sel, menu, {
        yaServido: servedIds.has(sel.id),
        reservado: reservedIds.has(sel.id),
        servidos: menusHoy.length,
        reservasPendientes: pendientes,
      }, rules)
    : null;
  const kioskoErr = sel && cartLines.length ? kioskoBlock(sel, cartLines, spentToday, rules, catName) : null;
  const hit = sel && menu ? allergyHit(sel.allergies, menu.allergens) : null;

  async function run(kind: Mode) {
    setMsg(null);
    try {
      const r = await despachar.mutateAsync({
        comensalId: sel?.id ?? null,
        kind,
        items: kind === "kiosko" ? cartLines.map(({ menuItemId, name, qty, price }) => ({ menuItemId, name, qty, price })) : [],
        pago: sel ? undefined : pagoPaso,
        actor,
        branchId,
      });
      const who = sel?.name ?? "Venta al paso";
      const what = kind === "menu" ? "menú entregado" : `${formatMoney(r.total)} cobrado`;
      const pago = r.pago === "abono" ? " (abono)" : r.pago === "convenio" ? " (convenio)" : "";
      setMsg({ ok: true, text: `✓ ${who}: ${what}${pago}${r.balance != null ? ` · saldo ${formatMoney(r.balance)}` : ""}` });
      setSelId(null);
      setCart({});
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  const kioskoItems = items.filter((i) => i.available);
  const byCat = categories
    .map((c) => ({ c, list: kioskoItems.filter((i) => i.categoryId === c.id) }))
    .filter((g) => g.list.length);

  return (
    <div className="p-6 mob:p-4 max-w-6xl">
      <ScreenHeader
        title="Despacho"
        subtitle={`Menú del día y kiosko · ${fechaCorta(today)}`}
        actions={
          <div className="flex gap-1 rounded-lg bg-chip-bg p-1" role="radiogroup" aria-label="Qué despachas">
            {(["menu", "kiosko"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("rounded-md px-4 py-1.5 text-sm", mode === m ? "bg-accent text-white font-semibold" : "text-muted")}
              >
                {m === "menu" ? "🍱 Menú del día" : "🍎 Kiosko"}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Menús entregados" value={menu ? `${menusHoy.length} / ${menu.raciones}` : "—"} sub={menu ? "raciones preparadas" : "sin menú publicado"} />
        <Stat label="Reservas por recoger" value={String(pendientes)} sub={`${reservas.length} reservas hoy`} />
        <Stat label="Kiosko hoy" value={formatMoney(kioskoHoy)} sub={`${consumos.filter((k) => k.kind === "kiosko").length} ventas`} />
        <Stat
          label="Raciones libres"
          value={menu ? String(Math.max(0, menu.raciones - menusHoy.length - pendientes)) : "—"}
          sub="sin reserva"
          warn={!!menu && menu.raciones - menusHoy.length - pendientes <= 0}
        />
      </div>

      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={cn("mb-4 rounded-md border px-3 py-2 text-sm", msg.ok ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning")}
        >
          {msg.text}
        </p>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4">
        {/* Buscar */}
        <div className="space-y-3 min-w-0">
          <Card>
            <CardBody className="space-y-2">
              <label className="block">
                <span className="text-xs text-muted">Comensal</span>
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onEnter();
                    }
                  }}
                  placeholder="Código, DNI o nombre (o pasa la tarjeta)"
                  className="w-full rounded-md bg-chip-bg border border-border px-3 py-2.5 text-base"
                  aria-label="Buscar comensal"
                />
              </label>
              {results.length > 0 && (
                <ul className="divide-y divide-border" aria-label="Resultados">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => pick(c)} className="w-full text-left py-2 px-1 hover:bg-chip-bg rounded flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-medium truncate">
                            {c.name} {c.allergies && <span title={`Alergias: ${c.allergies}`}>⚠️</span>}
                          </span>
                          <span className="block text-xs text-muted">
                            {c.code} · {c.grupo || TIPO_LABEL[c.tipo]}
                            {servedIds.has(c.id) ? " · ya comió" : reservedIds.has(c.id) ? " · reservó" : ""}
                          </span>
                        </span>
                        <span className={cn("font-mono text-sm shrink-0", saldoTone(c.balance, minimo))}>{formatMoney(c.balance)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q.trim() && results.length === 0 && <p className="text-sm text-muted">Nadie con «{q}». Revisa el código o regístralo en Comensales.</p>}
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  setSelId(null);
                  setCart({});
                  setMsg(null);
                  setQ("");
                }}
              >
                Venta al paso (sin comensal)
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="font-semibold mb-2 text-sm">Últimos despachos</h3>
              {consumos.length === 0 ? (
                <p className="text-sm text-muted">Aún no hay despachos hoy.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {consumos.slice(0, 8).map((k) => (
                    <li key={k.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {k.kind === "menu" ? "🍱" : "🍎"} {k.comensalName}
                      </span>
                      <span className="font-mono text-muted shrink-0">
                        {k.pago === "abono" || k.pago === "convenio" ? k.pago : formatMoney(k.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Atender */}
        <Card className="min-w-0">
          <CardBody className="space-y-4">
            {sel ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold">{sel.name}</h2>
                  <p className="text-sm text-muted">
                    {sel.code} · {sel.grupo || TIPO_LABEL[sel.tipo]}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <PlanBadge c={sel} />
                    {reservedIds.has(sel.id) && <Badge tone="accent">Reservó hoy</Badge>}
                    {servedIds.has(sel.id) && <Badge tone="success">Ya recibió su menú</Badge>}
                    {sel.dailyLimit != null && <Badge tone="neutral">Tope kiosko {formatMoney(sel.dailyLimit)} · usado {formatMoney(spentToday)}</Badge>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Saldo</p>
                  <p className={cn("text-2xl font-bold font-mono", saldoTone(sel.balance, minimo))}>{formatMoney(sel.balance)}</p>
                  <div className="flex gap-1.5 justify-end mt-1">
                    <Button size="sm" variant="secondary" onClick={() => setMovs(sel)}>
                      Movimientos
                    </Button>
                    <Button size="sm" onClick={() => setRecarga(sel)}>
                      Recargar
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold">Venta al paso</h2>
                <p className="text-sm text-muted">Sin comensal: cobra en efectivo, Yape, Plin o tarjeta. Busca a un comensal para cobrar con su saldo.</p>
              </div>
            )}

            {sel?.allergies && (
              <p role="alert" className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-warning text-sm font-semibold">
                ⚠️ Alergias: {sel.allergies}
                {hit && mode === "menu" && <span className="block font-normal">El menú de hoy contiene {hit}. Ofrece la alternativa.</span>}
              </p>
            )}

            {mode === "menu" ? (
              menu ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted uppercase tracking-wide">Menú de hoy · {formatMoney(menu.price)}</p>
                    <p className="font-semibold mt-1">{menu.fondo}</p>
                    <p className="text-sm text-muted">
                      {[menu.entrada, menu.postre, menu.bebida].filter(Boolean).join(" · ")}
                    </p>
                    {menu.allergens && <p className="text-xs text-muted mt-1">Alérgenos: {menu.allergens}</p>}
                  </div>
                  {!sel && (
                    <PagoPaso value={pagoPaso} onChange={setPagoPaso} />
                  )}
                  {sel && menuPreview && !menuPreview.ok && (
                    <p role="alert" className="text-warning text-sm">
                      {menuPreview.motivo}
                    </p>
                  )}
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={despachar.isPending || (!!sel && !menuPreview?.ok)}
                    onClick={() => void run("menu")}
                  >
                    {sel
                      ? menuPreview?.ok
                        ? menuPreview.pago === "saldo"
                          ? `Entregar menú · ${formatMoney(menuPreview.cargo ?? 0)} del saldo`
                          : `Entregar menú · ${menuPreview.pago === "abono" ? "con abono" : "por convenio"}`
                        : "No se puede entregar"
                      : `Cobrar menú ${formatMoney(menu.price)} · ${pagoPaso}`}
                  </Button>
                </div>
              ) : (
                <p className="text-muted text-sm">Hoy no hay menú publicado. Publícalo en «Menú del día».</p>
              )
            ) : (
              <div className="space-y-3">
                {byCat.map(({ c, list }) => (
                  <div key={c.id}>
                    <p className="text-xs text-muted uppercase tracking-wide mb-1.5">
                      {c.icon} {c.name}
                      {sel?.blockedCategoryIds.includes(c.id) && <span className="text-warning normal-case"> · bloqueado por la familia</span>}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {list.map((it) => (
                        <ProductButton
                          key={it.id}
                          item={it}
                          qty={cart[it.id] ?? 0}
                          disabled={(rules.bloquearOctogonos && (it.octogonos ?? 0) > 0) || !!sel?.blockedCategoryIds.includes(c.id)}
                          onAdd={() => setCart((x) => ({ ...x, [it.id]: (x[it.id] ?? 0) + 1 }))}
                          onRemove={() => setCart((x) => ({ ...x, [it.id]: Math.max(0, (x[it.id] ?? 0) - 1) }))}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {cartLines.length > 0 && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <ul className="text-sm space-y-1">
                      {cartLines.map((l) => (
                        <li key={l.menuItemId} className="flex justify-between">
                          <span>
                            {l.qty}× {l.name}
                          </span>
                          <span className="font-mono">{formatMoney(l.qty * l.price)}</span>
                        </li>
                      ))}
                    </ul>
                    {!sel && <PagoPaso value={pagoPaso} onChange={setPagoPaso} />}
                    {kioskoErr && (
                      <p role="alert" className="text-warning text-sm">
                        {kioskoErr}
                      </p>
                    )}
                    <Button size="lg" className="w-full" disabled={despachar.isPending || !!kioskoErr} onClick={() => void run("kiosko")}>
                      {sel ? `Cobrar ${formatMoney(cartTotal)} con saldo` : `Cobrar ${formatMoney(cartTotal)} · ${pagoPaso}`}
                    </Button>
                  </div>
                )}
                {rules.bloquearOctogonos && (
                  <p className="text-xs text-muted">Modo colegio: los productos con octógonos no se venden (Ley 30021).</p>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {recarga && <RecargaModal comensal={recarga} onClose={() => setRecarga(null)} />}
      {movs && <MovimientosModal comensal={movs} onClose={() => setMovs(null)} />}
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card>
      <CardBody>
        <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
        <p className={cn("text-2xl font-bold font-mono mt-1", warn && "text-warning")}>{value}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </CardBody>
    </Card>
  );
}

function PagoPaso({ value, onChange }: { value: "efectivo" | "yape" | "plin" | "tarjeta"; onChange: (v: "efectivo" | "yape" | "plin" | "tarjeta") => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Medio de pago">
      {(["efectivo", "yape", "plin", "tarjeta"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn("rounded-md px-3 py-1.5 text-sm border capitalize", value === m ? "bg-accent/20 border-accent text-accent" : "bg-chip-bg border-border")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function ProductButton({ item, qty, disabled, onAdd, onRemove }: { item: MenuItem; qty: number; disabled: boolean; onAdd: () => void; onRemove: () => void }) {
  const oct = item.octogonos ?? 0;
  return (
    <div className={cn("relative rounded-lg border p-2.5", qty > 0 ? "border-accent bg-accent/10" : "border-border bg-surface", disabled && "opacity-45")}>
      <button onClick={onAdd} disabled={disabled} className="w-full text-left" aria-label={`Agregar ${item.name}`}>
        <span className="text-lg" aria-hidden="true">
          {item.emoji}
        </span>
        <span className="block text-sm font-medium leading-tight">{item.name}</span>
        <span className="block font-mono text-sm mt-0.5">{formatMoney(item.price)}</span>
        {oct > 0 && <span className="block text-[11px] text-warning mt-0.5">⬛ {oct} octógono{oct > 1 ? "s" : ""}</span>}
      </button>
      {qty > 0 && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          <button onClick={onRemove} aria-label={`Quitar ${item.name}`} className="h-6 w-6 rounded bg-chip-bg border border-border text-sm">
            −
          </button>
          <span className="text-xs font-bold w-4 text-center">{qty}</span>
        </div>
      )}
    </div>
  );
}
