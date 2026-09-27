// Extras con precio (p. ej. "Doble porción + S/ 18") y preferencias sin costo
// ("Sin cebolla") que el mesero ofrece al tomar el pedido.
import { useState } from "react";
import { useExtras, useMenuActions, usePrefs } from "@/data/hooks";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";

const field = "rounded-md bg-chip-bg border border-border px-3 py-2 text-sm";

export function ModifiersPanel() {
  const { data: extras = [] } = useExtras();
  const { data: prefs = [] } = usePrefs();
  const { saveExtra, removeExtra, savePref, removePref } = useMenuActions();
  const [eName, setEName] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [pName, setPName] = useState("");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardBody className="space-y-3">
          <div>
            <h3 className="font-semibold">Extras (con precio)</h3>
            <p className="text-muted text-xs">Se suman al plato: «Doble porción», «Salsa criolla»…</p>
          </div>
          <ul className="divide-y divide-border-soft">
            {extras.length === 0 && <li className="text-sm text-muted py-2">Aún no hay extras.</li>}
            {extras.map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1">{x.name}</span>
                <span className="font-mono">+ {formatMoney(x.price)}</span>
                <button onClick={() => removeExtra.mutate(x.id)} className="text-warning px-1" aria-label={`Quitar ${x.name}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveExtra.mutate({ name: eName, price: Number(ePrice.replace(",", ".")) || 0 }, { onSuccess: () => (setEName(""), setEPrice("")) });
            }}
          >
            <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Nuevo extra" aria-label="Nombre del extra" className={`${field} flex-1 min-w-[8rem]`} />
            <input value={ePrice} onChange={(e) => setEPrice(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="S/ 0.00" aria-label="Precio del extra" className={`${field} w-24 font-mono`} />
            <Button size="sm" type="submit" disabled={!eName.trim()}>
              Agregar
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <div>
            <h3 className="font-semibold">Preferencias (sin costo)</h3>
            <p className="text-muted text-xs">Indicaciones para cocina: «Sin cebolla», «Término medio»…</p>
          </div>
          <ul className="divide-y divide-border-soft">
            {prefs.length === 0 && <li className="text-sm text-muted py-2">Aún no hay preferencias.</li>}
            {prefs.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1">{p.name}</span>
                <button onClick={() => removePref.mutate(p.id)} className="text-warning px-1" aria-label={`Quitar ${p.name}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              savePref.mutate({ name: pName }, { onSuccess: () => setPName("") });
            }}
          >
            <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Nueva preferencia" aria-label="Nueva preferencia" className={`${field} flex-1 min-w-[8rem]`} />
            <Button size="sm" type="submit" disabled={!pName.trim()}>
              Agregar
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
