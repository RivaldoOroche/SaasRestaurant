import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useTour } from "@/store/tour";
import { useAuth } from "@/auth/AuthContext";
import { InstallAppCard } from "@/components/pwa/PwaPrompts";

interface Faq {
  q: string;
  a: string;
  cat: string;
}

const FAQS: Faq[] = [
  { cat: "Ventas", q: "¿Cómo tomo un pedido y lo envío a cocina?", a: "Entra a Pedido, elige la mesa, agrega platos y modificadores, y pulsa «Enviar a cocina». La comanda aparece de inmediato en la pantalla de Cocina (KDS)." },
  { cat: "Ventas", q: "¿Cómo divido la cuenta entre varias personas?", a: "En el cobro puedes dividir en partes iguales o por ítem. Cada parte genera su propio total; también puedes cobrar cada parte con un método de pago distinto." },
  { cat: "Ventas", q: "¿Puedo aplicar descuentos y propinas?", a: "Sí. En la pantalla de cobro defines el descuento (monto o %) y la propina; el sistema recalcula subtotal, IGV y total automáticamente." },
  { cat: "SUNAT", q: "¿Qué pasa si no tengo internet al cobrar?", a: "La venta y el comprobante se guardan localmente y entran a una cola. Cuando vuelve la conexión, Wayra POS los envía a SUNAT automáticamente y actualiza el estado." },
  { cat: "SUNAT", q: "¿Boleta o factura?", a: "Al cobrar eliges el tipo. Para factura ingresas el RUC y la razón social del cliente; para boleta basta el DNI (opcional). El correlativo se asigna solo." },
  { cat: "SUNAT", q: "¿Cómo anulo un comprobante?", a: "Desde la pantalla SUNAT emites una nota de crédito (para facturas/boletas) o una comunicación de baja, según corresponda. Todo queda registrado." },
  { cat: "Delivery", q: "¿Cómo registro un pedido a domicilio?", a: "En Delivery pulsa «+ Nuevo pedido»: elige el canal (teléfono, WhatsApp, web, Rappi o PedidosYa), los datos del cliente, la zona (define el costo de envío y el tiempo estimado), los productos y el pago. Si paga en efectivo, indica con cuánto paga y el sistema calcula el vuelto que debe llevar el repartidor." },
  { cat: "Delivery", q: "¿Cómo sigue el cliente su pedido?", a: "Cada pedido tiene un enlace de seguimiento privado. Envíalo por WhatsApp desde la tarjeta del pedido: el cliente ve el avance (recibido, en preparación, listo, en camino, entregado), la hora estimada y el nombre del repartidor — nunca su dirección ni montos." },
  { cat: "Delivery", q: "¿Qué pasa en cocina cuando acepto un pedido?", a: "Al pulsar «Aceptar → cocina» la comanda aparece en la pantalla de Cocina marcada con 🛵 y el código del pedido. Si luego lo cancelas, la comanda se retira sola para que no se siga preparando." },
  { cat: "Configuración", q: "¿Dónde configuro mi RUC y proveedor de facturación?", a: "En Ajustes → sección fiscal. Puedes usar SUNAT directo o un OSE/facturador (Nubefact, Efact, Bizlinks). Las credenciales secretas se guardan cifradas y nunca se muestran de vuelta." },
  { cat: "Configuración", q: "¿Cómo cambio de plan?", a: "En Plan eliges el nuevo plan y solicitas el cambio. Wayra POS lo aprueba y se refleja en tu próxima facturación. Sin permanencia." },
  { cat: "Equipo", q: "¿Cómo agrego meseros o gerentes?", a: "El dueño gestiona el personal en la sección Dueño → Personal: cada persona tiene su nombre, rol y PIN propio. Los permisos por rol se ajustan en Permisos." },
  { cat: "Equipo", q: "¿Puedo limitar qué ve cada rol?", a: "Sí. En Permisos activas o desactivas pantallas por rol (por ejemplo, que el mesero no vea Reportes o Caja)." },
];

export function Ayuda() {
  const [query, setQuery] = useState("");
  const { start } = useTour();
  const { session } = useAuth();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter((f) => (f.q + " " + f.a + " " + f.cat).toLowerCase().includes(q));
  }, [query]);

  const cats = useMemo(() => Array.from(new Set(results.map((f) => f.cat))), [results]);

  return (
    <div className="p-6 max-w-4xl">
      <ScreenHeader
        title="Centro de ayuda"
        subtitle="Guías rápidas, preguntas frecuentes y estado del servicio."
        actions={
          <Button variant="secondary" size="sm" onClick={start}>
            Ver recorrido de nuevo
          </Button>
        }
      />

      <Card className="mb-4">
        <CardBody>
          <label className="block">
            <span className="sr-only">Buscar en la ayuda</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca: dividir cuenta, factura, PIN, plan…"
              className="w-full h-11 rounded-md bg-chip-bg border border-border px-3 text-sm"
            />
          </label>
        </CardBody>
      </Card>

      <div className="mb-3">
        <InstallAppCard />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <QuickLink to="/estado" icon="🟢" title="Estado del sistema" desc="¿Todo funciona? Revisa el estado en vivo de SUNAT, pagos y la app." />
        <QuickLink to="/pos/reclamaciones" icon="📕" title="Libro de reclamaciones" desc="Gestiona los reclamos de tus clientes (Indecopi)." />
        <button
          onClick={start}
          className="text-left rounded-xl border border-border bg-surface p-4 hover:border-accent/60 transition-colors"
        >
          <div className="text-2xl mb-1" aria-hidden="true">🧭</div>
          <p className="font-semibold text-sm">Recorrido guiado</p>
          <p className="text-muted text-xs mt-0.5">Vuelve a ver el tour de bienvenida cuando quieras.</p>
        </button>
      </div>

      {results.length === 0 ? (
        <Card>
          <CardBody className="text-center py-10">
            <p className="text-muted">No encontramos resultados para «{query}».</p>
            <p className="text-muted text-sm mt-1">Escríbenos a soporte@wayrapos.pe y te ayudamos.</p>
          </CardBody>
        </Card>
      ) : (
        cats.map((cat) => (
          <div key={cat} className="mb-6">
            <p className="text-xs uppercase tracking-wide text-muted mb-2">{cat}</p>
            <div className="space-y-2">
              {results
                .filter((f) => f.cat === cat)
                .map((f, idx) => (
                  <details key={idx} className="group rounded-lg border border-border bg-surface">
                    <summary className="cursor-pointer list-none p-4 font-medium text-sm flex items-center justify-between gap-3">
                      {f.q}
                      <span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
                    </summary>
                    <p className="text-muted text-sm px-4 pb-4 leading-relaxed">{f.a}</p>
                  </details>
                ))}
            </div>
          </div>
        ))
      )}

      <p className="text-muted text-xs mt-4">
        ¿Sigues con dudas? Escríbenos a <a className="text-accent underline" href="mailto:soporte@wayrapos.pe">soporte@wayrapos.pe</a>
        {session?.role !== "saas" && " y menciona el nombre de tu restaurante."}
      </p>
    </div>
  );
}

function QuickLink({ to, icon, title, desc }: { to: string; icon: string; title: string; desc: string }) {
  return (
    <Link to={to} className="rounded-xl border border-border bg-surface p-4 hover:border-accent/60 transition-colors">
      <div className="text-2xl mb-1" aria-hidden="true">{icon}</div>
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-muted text-xs mt-0.5">{desc}</p>
    </Link>
  );
}
