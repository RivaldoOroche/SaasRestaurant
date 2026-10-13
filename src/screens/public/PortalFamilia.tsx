// Portal de familias del comedor: enlace privado (sin cuenta) que recibe el
// padre o la madre. Ve el saldo y los consumos de cada hijo, reserva el menú,
// fija el tope diario del kiosko, bloquea categorías y anota alergias.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPortalFamilia, portalAjustes, portalReservar } from "@/data/publicFamilia";
import { formatMoney } from "@/lib/money";
import { abonoVigente, allergyHit, localDate, puedeReservar } from "@/lib/comedor";
import { cn } from "@/lib/cn";
import type { PortalFamilia as Portal } from "@/data/model";

type Hijo = Portal["comensales"][number];

const fecha = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short" });
};

export function PortalFamilia() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["familia", token], queryFn: () => getPortalFamilia(token), refetchOnWindowFocus: true });
  const reload = () => qc.invalidateQueries({ queryKey: ["familia", token] });

  if (isLoading) return <div className="min-h-screen grid place-items-center bg-bg text-muted">Cargando…</div>;
  if (!data)
    return (
      <div className="min-h-screen grid place-items-center bg-bg text-muted p-6 text-center">
        Este enlace no es válido. Pide al comedor que te lo envíe de nuevo.
      </div>
    );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="bg-shell text-white px-5 pt-8 pb-6">
        <p className="text-white/70 text-sm">{data.tenantName}</p>
        <h1 className="text-2xl font-bold mt-1">Hola, {data.responsable.split(" ")[0]}</h1>
        <p className="text-white/70 text-sm mt-1">Saldo, consumos y reservas del comedor.</p>
      </header>
      <main className="max-w-xl mx-auto p-4 space-y-4 pb-10">
        {data.comensales.length === 0 && <p className="text-muted text-sm">No hay alumnos activos asociados a este enlace.</p>}
        {data.comensales.map((h) => (
          <HijoCard key={h.id} h={h} data={data} token={token} onChange={reload} />
        ))}
        <section className="rounded-xl border border-border bg-surface p-4 text-sm space-y-1">
          <h2 className="font-semibold">¿Cómo recargo?</h2>
          {data.yapeNumber || data.plinNumber ? (
            <p>
              Yapea o plinea al <b className="font-mono">{data.yapeNumber ?? data.plinNumber}</b> ({data.tenantName}) y escribe en el mensaje el nombre del
              alumno. El comedor registra la recarga y la verás aquí.
            </p>
          ) : (
            <p>Acércate a la caja del comedor con efectivo o tarjeta.</p>
          )}
          <p className="text-muted">También puedes pagar un abono mensual: el menú se entrega sin descontar del saldo.</p>
        </section>
        <p className="text-xs text-muted text-center">Este enlace es personal: no lo compartas. Wayra POS · tus datos están protegidos (Ley 29733).</p>
      </main>
    </div>
  );
}

function HijoCard({ h, data, token, onChange }: { h: Hijo; data: Portal; token: string; onChange: () => void }) {
  const today = localDate();
  const [tab, setTab] = useState<"menu" | "consumos" | "ajustes">("menu");
  const [err, setErr] = useState<string | null>(null);
  const low = h.plan !== "convenio" && h.balance < data.saldoMinimo;

  async function toggle(date: string, on: boolean) {
    setErr(null);
    try {
      await portalReservar(token, h.id, date, on);
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{h.name}</h2>
          <p className="text-sm text-muted">{h.grupo}</p>
          {h.plan === "abono" && (
            <p className={cn("text-xs mt-1", abonoVigente(h, today) ? "text-success" : "text-warning")}>
              {abonoVigente(h, today) ? `Abono vigente hasta el ${fecha(h.abonoHasta!)}` : "Abono vencido: el menú se cobra del saldo"}
            </p>
          )}
          {h.plan === "convenio" && <p className="text-xs mt-1 text-success">Menú por convenio</p>}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Saldo</p>
          <p className={cn("text-2xl font-bold font-mono", low && "text-warning")}>{formatMoney(h.balance)}</p>
          {low && <p className="text-xs text-warning">Saldo bajo</p>}
        </div>
      </div>
      <div className="flex border-t border-border text-sm" role="tablist">
        {(["menu", "consumos", "ajustes"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("flex-1 py-2.5", tab === t ? "font-semibold text-accent border-b-2 border-accent" : "text-muted")}
          >
            {t === "menu" ? "Menú y reservas" : t === "consumos" ? "Consumos" : "Topes y alergias"}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "menu" && (
          <ul className="space-y-2">
            {data.menus.length === 0 && <li className="text-sm text-muted">El comedor aún no publica el menú de los próximos días.</li>}
            {data.menus.map((m) => {
              const reserved = h.reservas.includes(m.date);
              const open = puedeReservar(m.date, new Date(), data.cierreReservas);
              return (
                <li key={m.date} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted capitalize">{fecha(m.date)}</p>
                    <p className="font-medium">{m.fondo}</p>
                    <p className="text-xs text-muted">{[m.entrada, m.postre, m.bebida].filter(Boolean).join(" · ")}</p>
                    {m.allergens && <p className="text-xs text-muted">Alérgenos: {m.allergens}</p>}
                    {allergyHit(h.allergies, m.allergens) && (
                      <p className="text-xs text-warning font-semibold">⚠️ Contiene {allergyHit(h.allergies, m.allergens)}: avisa al comedor si necesita otra opción.</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm">{formatMoney(m.price)}</p>
                    {open ? (
                      <button
                        onClick={() => void toggle(m.date, !reserved)}
                        className={cn("mt-1 rounded-md px-3 py-1.5 text-sm border", reserved ? "bg-success/15 border-success/50 text-success" : "bg-accent text-white border-accent")}
                      >
                        {reserved ? "✓ Reservado" : "Reservar"}
                      </button>
                    ) : (
                      <p className="mt-1 text-xs text-muted">{reserved ? "✓ Reservado" : "Reservas cerradas"}</p>
                    )}
                  </div>
                </li>
              );
            })}
            {err && (
              <li role="alert" className="text-warning text-sm">
                {err}
              </li>
            )}
            <li className="text-xs text-muted">Puedes reservar o anular hasta las {data.cierreReservas} del mismo día.</li>
          </ul>
        )}
        {tab === "consumos" && (
          <div className="space-y-3">
            <ul className="divide-y divide-border text-sm">
              {h.consumos.length === 0 && <li className="py-1.5 text-muted">Sin consumos todavía.</li>}
              {h.consumos.map((k, i) => (
                <li key={i} className="py-1.5 flex justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate">{k.detail}</span>
                    <span className="block text-xs text-muted">{new Date(k.at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</span>
                  </span>
                  <span className="font-mono shrink-0">{k.pago === "abono" || k.pago === "convenio" ? k.pago : `−${formatMoney(k.total)}`}</span>
                </li>
              ))}
            </ul>
            {h.recargas.length > 0 && (
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Recargas</p>
                <ul className="divide-y divide-border text-sm">
                  {h.recargas.map((w, i) => (
                    <li key={i} className="py-1.5 flex justify-between gap-2">
                      <span>
                        {w.detail} <span className="text-xs text-muted">· {new Date(w.at).toLocaleDateString("es-PE")}{w.method ? ` · ${w.method}` : ""}</span>
                      </span>
                      <span className="font-mono text-success">{w.amount > 0 ? "+" : ""}{formatMoney(w.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {tab === "ajustes" && <Ajustes h={h} data={data} token={token} onChange={onChange} />}
      </div>
    </section>
  );
}

function Ajustes({ h, data, token, onChange }: { h: Hijo; data: Portal; token: string; onChange: () => void }) {
  const [limit, setLimit] = useState(h.dailyLimit == null ? "" : String(h.dailyLimit));
  const [blocked, setBlocked] = useState<string[]>(h.blockedCategoryIds);
  const [allergies, setAllergies] = useState(h.allergies);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setMsg(null);
    const l = limit.trim() ? Number(limit.replace(",", ".")) : null;
    if (l !== null && Number.isNaN(l)) return setMsg({ ok: false, text: "Escribe el tope como un monto (ej. 8)." });
    try {
      await portalAjustes(token, h.id, { dailyLimit: l, blockedCategoryIds: blocked, allergies });
      setMsg({ ok: true, text: "Guardado. El comedor ya aplica estos cambios." });
      onChange();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="text-xs text-muted">Tope diario en el kiosko (S/)</span>
        <input
          value={limit}
          onChange={(e) => setLimit(e.target.value.replace(/[^\d.,]/g, ""))}
          inputMode="decimal"
          placeholder="Sin tope"
          className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 font-mono"
        />
      </label>
      <fieldset>
        <legend className="text-xs text-muted">No puede comprar</legend>
        <div className="flex flex-wrap gap-2 mt-1">
          {data.categories.map((c) => {
            const on = blocked.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setBlocked(on ? blocked.filter((x) => x !== c.id) : [...blocked, c.id])}
                className={cn("rounded-md px-2.5 py-1 border", on ? "bg-warning/15 border-warning text-warning" : "bg-chip-bg border-border")}
              >
                {on ? "🚫 " : ""}
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-xs text-muted">Alergias o restricciones (las ve quien atiende)</span>
        <input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Ej. maní, lactosa" className="w-full rounded-md bg-chip-bg border border-border px-3 py-2" />
      </label>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-success" : "text-warning"}>
          {msg.text}
        </p>
      )}
      <button onClick={() => void save()} className="w-full rounded-md bg-accent text-white py-2.5 font-semibold">
        Guardar
      </button>
    </div>
  );
}
