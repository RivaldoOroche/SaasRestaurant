import { Link } from "react-router-dom";
import { useSettings, useTables, useCategories, useMenuItems } from "@/data/hooks";
import { Card, CardBody } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

interface Item {
  label: string;
  done: boolean;
  hint: string;
  to?: string;
}

/** Resumen de qué falta para dejar el restaurante operativo. */
export function ConfigChecklist() {
  const { data: s } = useSettings();
  const { data: tables = [] } = useTables();
  const { data: cats = [] } = useCategories();
  const { data: items = [] } = useMenuItems();
  if (!s) return null;

  const ruc = (s.ruc ?? "").replace(/\D/g, "");
  const emisorOk = ruc.length === 11 && !!s.razonSocial && !!s.direccionFiscal && !!s.ubigeo;
  const facturacionOk = !!s.billingProvider && s.billingProvider !== "ninguno";
  const pagosOk = !!s.yapeNumber || !!s.plinNumber || (!!s.cardProvider && s.cardProvider !== "ninguno");
  const mesasOk = tables.length > 0;
  const cartaOk = cats.length > 0 && items.length > 0;

  const list: Item[] = [
    { label: "Datos del emisor", done: emisorOk, hint: "RUC, razón social, dirección y ubigeo", to: "/pos/ajustes" },
    { label: "Facturación electrónica", done: facturacionOk, hint: "Elige proveedor y carga credenciales", to: "/pos/ajustes" },
    { label: "Métodos de pago", done: pagosOk, hint: "Yape/Plin o proveedor de tarjeta", to: "/pos/ajustes" },
    { label: "Mesas de la sucursal", done: mesasOk, hint: "Configura el plano de mesas por zona", to: "/pos/mesas" },
    { label: "Carta / menú", done: cartaOk, hint: "Crea categorías y platos", to: "/pos/editor" },
  ];

  const done = list.filter((i) => i.done).length;
  const pct = Math.round((done / list.length) * 100);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">Configuración del restaurante</h3>
          <span className={cn("text-sm font-mono", pct === 100 ? "text-success" : "text-muted")}>
            {pct}% {pct === 100 ? "· listo ✓" : `· ${done}/${list.length}`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-chip-bg overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-success" : "bg-accent")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="divide-y divide-border-soft">
          {list.map((i) => (
            <li key={i.label} className="flex items-center gap-3 py-2">
              <span
                className={cn(
                  "h-5 w-5 shrink-0 grid place-items-center rounded-full text-xs",
                  i.done ? "bg-success/20 text-success" : "bg-warning/15 text-warning",
                )}
              >
                {i.done ? "✓" : "!"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium">{i.label}</span>
                <span className="block text-muted text-xs truncate">{i.hint}</span>
              </span>
              {!i.done && i.to && (
                <Link to={i.to} className="text-accent text-xs shrink-0 hover:underline">
                  Configurar →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
