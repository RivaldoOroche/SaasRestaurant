// Menú del día: se publica con anticipación (las familias reservan desde su
// enlace), con raciones a preparar y alérgenos. Muestra reservas y entregas.
import { useMemo, useState } from "react";
import { useComedorActions, useComedorMenus, useComensales, useConsumos, useReservas, useSettings } from "@/data/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import { localDate, nextSchoolDays } from "@/lib/comedor";
import { cn } from "@/lib/cn";
import type { ComedorMenuDay } from "@/data/model";
import { fechaCorta, field } from "./shared";

export function MenuDia() {
  const today = localDate();
  const days = useMemo(() => nextSchoolDays(new Date(), 10), []);
  const from = days[0];
  const to = days[days.length - 1];
  const { data: settings } = useSettings();
  const { data: menus = [] } = useComedorMenus(from, to);
  const { data: reservas = [] } = useReservas(from, to);
  const { data: consumos = [] } = useConsumos(today, today);
  const [edit, setEdit] = useState<string | null>(null);
  const [lista, setLista] = useState<string | null>(null);

  const byDate = new Map(menus.map((m) => [m.date, m]));
  const reservasDe = (d: string) => reservas.filter((r) => r.date === d).length;
  const entregadosHoy = consumos.filter((k) => k.kind === "menu").length;
  const sinPublicar = days.slice(0, 5).filter((d) => !byDate.has(d)).length;

  return (
    <div className="p-6 mob:p-4 max-w-5xl">
      <ScreenHeader
        title="Menú del día"
        subtitle={`Las familias reservan hasta las ${settings?.cierreReservas ?? "09:30"} del mismo día`}
      />
      {sinPublicar > 0 && (
        <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {sinPublicar === 1 ? "1 día" : `${sinPublicar} días`} de esta semana sin menú publicado: las familias no pueden reservar.
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {days.map((d) => {
          const m = byDate.get(d);
          const res = reservasDe(d);
          const isToday = d === today;
          return (
            <Card key={d} className={cn(isToday && "border-accent/50")}>
              <CardBody className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold capitalize">
                    {fechaCorta(d)} {isToday && <Badge tone="accent">Hoy</Badge>}
                  </h3>
                  <Button size="sm" variant={m ? "ghost" : "primary"} onClick={() => setEdit(d)}>
                    {m ? "Editar" : "Publicar menú"}
                  </Button>
                </div>
                {m ? (
                  <>
                    <p className="font-medium">{m.fondo}</p>
                    <p className="text-sm text-muted">{[m.entrada, m.postre, m.bebida].filter(Boolean).join(" · ")}</p>
                    {m.allergens && <p className="text-xs text-muted">Alérgenos: {m.allergens}</p>}
                    <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
                      <span className="font-mono">{formatMoney(m.price)}</span>
                      <span className="text-muted">·</span>
                      <button className="text-accent hover:underline" onClick={() => setLista(d)}>
                        {res} {res === 1 ? "reserva" : "reservas"}
                      </button>
                      <span className="text-muted">· {m.raciones} raciones</span>
                      {isToday && <span className="text-muted">· {entregadosHoy} entregados</span>}
                    </div>
                    {res > m.raciones && <p className="text-xs text-warning">Hay más reservas que raciones: aumenta las raciones.</p>}
                  </>
                ) : (
                  <p className="text-sm text-muted">Sin menú publicado{res ? ` · ${res} reservas` : ""}.</p>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
      {edit && <MenuModal date={edit} menu={byDate.get(edit) ?? null} previous={menus.filter((m) => m.date < edit).at(-1) ?? null} onClose={() => setEdit(null)} />}
      {lista && <ReservasModal date={lista} onClose={() => setLista(null)} />}
    </div>
  );
}

function MenuModal({ date, menu, previous, onClose }: { date: string; menu: ComedorMenuDay | null; previous: ComedorMenuDay | null; onClose: () => void }) {
  const { data: settings } = useSettings();
  const { saveMenu, removeMenu } = useComedorActions();
  const { data: comensales = [] } = useComensales();
  const empty: ComedorMenuDay = { date, entrada: "", fondo: "", postre: "", bebida: "", price: settings?.menuPrice ?? 12, raciones: comensales.filter((c) => c.active).length, allergens: "" };
  const [m, setM] = useState<ComedorMenuDay>(menu ?? empty);
  const [price, setPrice] = useState(String(m.price));
  const [raciones, setRaciones] = useState(String(m.raciones));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof ComedorMenuDay, v: string) => setM((x) => ({ ...x, [k]: v }));

  async function save() {
    setErr(null);
    const p = Number(price.replace(",", "."));
    const r = Number(raciones);
    if (!(p >= 0)) return setErr("Revisa el precio.");
    if (!Number.isInteger(r) || r < 0) return setErr("Las raciones deben ser un número entero.");
    try {
      await saveMenu.mutateAsync({ ...m, price: p, raciones: r });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="menu-title">
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="menu-title" className="text-lg font-bold capitalize">
            Menú del {fechaCorta(date)}
          </h2>
          {!menu && previous && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setM({ ...previous, date })}>
              Copiar el anterior
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted">Entrada</span>
            <input value={m.entrada} onChange={(e) => set("entrada", e.target.value)} placeholder="Crema de zapallo" className={field} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Fondo</span>
            <input autoFocus value={m.fondo} onChange={(e) => set("fondo", e.target.value)} placeholder="Ají de gallina con arroz" className={field} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Postre</span>
            <input value={m.postre} onChange={(e) => set("postre", e.target.value)} placeholder="Fruta" className={field} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Bebida</span>
            <input value={m.bebida} onChange={(e) => set("bebida", e.target.value)} placeholder="Chicha morada" className={field} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Precio con saldo (S/)</span>
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" className={`${field} font-mono`} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Raciones a preparar</span>
            <input value={raciones} onChange={(e) => setRaciones(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${field} font-mono`} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-muted">Alérgenos (se avisa a quien despacha si el comensal es alérgico)</span>
          <input value={m.allergens} onChange={(e) => set("allergens", e.target.value)} placeholder="Ej. lácteos, maní, gluten" className={field} />
        </label>
        {err && (
          <p role="alert" className="text-warning text-sm">
            {err}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          {menu ? (
            <Button type="button" variant="ghost" onClick={() => removeMenu.mutate(date, { onSuccess: onClose })}>
              Quitar menú
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMenu.isPending}>
              {menu ? "Guardar" : "Publicar"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Quién reservó un día (para la cocina y para entregar), con alergias. */
function ReservasModal({ date, onClose }: { date: string; onClose: () => void }) {
  const { data: reservas = [] } = useReservas(date, date);
  const { data: comensales = [] } = useComensales();
  const { data: consumos = [] } = useConsumos(date, date);
  const served = new Set(consumos.filter((k) => k.kind === "menu").map((k) => k.comensalId));
  const rows = reservas
    .map((r) => ({ r, c: comensales.find((x) => x.id === r.comensalId) }))
    .filter((x) => x.c)
    .sort((a, b) => a.c!.grupo.localeCompare(b.c!.grupo) || a.c!.name.localeCompare(b.c!.name));
  const alergicos = rows.filter((x) => x.c!.allergies).length;

  return (
    <Modal open onClose={onClose} labelledBy="res-title">
      <div className="p-5 space-y-3">
        <h2 id="res-title" className="text-lg font-bold capitalize">
          Reservas del {fechaCorta(date)}
        </h2>
        <p className="text-sm text-muted">
          {rows.length} reservas · {alergicos} con alergias · {served.size} entregados
        </p>
        <ul className="divide-y divide-border max-h-[55vh] overflow-y-auto text-sm">
          {rows.map(({ r, c }) => (
            <li key={r.comensalId} className="py-1.5 flex justify-between gap-2">
              <span>
                {served.has(c!.id) ? "✓ " : ""}
                {c!.name} <span className="text-muted">· {c!.grupo}</span>
                {c!.allergies && <span className="text-warning"> · ⚠️ {c!.allergies}</span>}
              </span>
              <span className="text-xs text-muted shrink-0">{r.by === "familia" ? "familia" : "comedor"}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
