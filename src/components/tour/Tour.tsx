import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTour } from "@/store/tour";
import { useAuth } from "@/auth/AuthContext";

interface Step {
  icon: string;
  title: string;
  body: string;
}

const TENANT_STEPS: Step[] = [
  { icon: "👋", title: "Bienvenido a Wayra POS", body: "Este recorrido rápido te muestra lo esencial para vender hoy mismo. Puedes cerrarlo cuando quieras y volver a verlo desde el Centro de ayuda." },
  { icon: "🧾", title: "Toma pedidos en segundos", body: "En Pedido eliges la mesa, agregas platos y modificadores, y envías a Cocina. La comanda aparece al instante en la pantalla del KDS." },
  { icon: "🍽️", title: "Controla el salón", body: "En Mesas ves el estado de cada mesa en tiempo real (libre, ocupada, por cobrar) y en Reservas gestionas las reservas del día." },
  { icon: "💳", title: "Cobra y factura a SUNAT", body: "Al cobrar eliges efectivo, tarjeta, Yape o Plin, aplicas descuentos y propinas, y emites boleta o factura electrónica. Si no hay internet, el comprobante se envía solo al reconectar." },
  { icon: "📊", title: "Mide tu negocio", body: "Reportes, Inventario, Clientes y Caja te dan el pulso del restaurante. ¿Dudas? El Centro de ayuda está siempre a un clic." },
];

const SAAS_STEPS: Step[] = [
  { icon: "👋", title: "Bienvenido a la consola SaaS", body: "Desde aquí operas Wayra POS como negocio: tenants, ingresos y salud de la plataforma. Este recorrido es rápido y puedes reabrirlo desde el Centro de ayuda." },
  { icon: "🏬", title: "Gestiona tus tenants", body: "En Tenants creas restaurantes, generas enlaces de invitación o cuentas con clave temporal, y entras a su POS (impersonación auditada)." },
  { icon: "🧾", title: "Cobra con aprobación", body: "En Cobros revisas y apruebas cada cobro de suscripción antes de facturar. Nada se cobra sin que valides los datos de la factura." },
  { icon: "📉", title: "Vigila retención e ingresos", body: "Resumen, Retención e Ingresos muestran MRR, churn, cohortes y dunning con datos reales de tus tenants." },
  { icon: "⚙️", title: "Configura tu emisor", body: "En Config defines tu razón social, RUC y proveedor de facturación (SUNAT directo u OSE), y revisas la auditoría de accesos y configuración." },
];

export function Tour() {
  const { open, finish, shouldAutoStart, start } = useTour();
  const { session } = useAuth();
  const [i, setI] = useState(0);

  const role = session?.role ?? "";
  const steps = role === "saas" ? SAAS_STEPS : TENANT_STEPS;

  // Autoarranque en el primer ingreso de cada rol.
  useEffect(() => {
    if (session && shouldAutoStart(role)) {
      setI(0);
      start();
    }
  }, [session?.userEmail, role]);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  if (!session) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  const onDone = () => finish(role);

  return (
    <Modal open={open} onClose={onDone} labelledBy="tour-title" className="max-w-md">
      <div className="p-6">
        <div className="text-4xl mb-3" aria-hidden="true">
          {step.icon}
        </div>
        <h2 id="tour-title" className="text-xl font-bold">
          {step.title}
        </h2>
        <p className="text-muted text-sm mt-2 leading-relaxed">{step.body}</p>

        <div className="flex items-center justify-center gap-1.5 my-5" role="tablist" aria-label="Progreso del recorrido">
          {steps.map((_, idx) => (
            <span
              key={idx}
              aria-hidden="true"
              className={"h-1.5 rounded-full transition-all " + (idx === i ? "w-6 bg-accent" : "w-1.5 bg-border")}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onDone}>
            Omitir
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setI((v) => v - 1)}>
                Atrás
              </Button>
            )}
            {last ? (
              <Button size="sm" onClick={onDone}>
                Empezar
              </Button>
            ) : (
              <Button size="sm" onClick={() => setI((v) => v + 1)}>
                Siguiente
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
