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

const WELCOME: Step = {
  icon: "👋",
  title: "Bienvenido a Wayra POS",
  body: "Cuatro pasos rápidos con lo esencial para vender hoy mismo. Puedes cerrarlo cuando quieras y volver a verlo desde Ayuda.",
};
const SERVICE_STEPS: Step[] = [
  {
    icon: "🍽️",
    title: "Atiende una mesa",
    body: "En Mesas toca una mesa libre y se abre su pedido. Agrega platos con ＋ (toca el plato para sus extras o «sin cebolla») y luego «Enviar a cocina»: la comanda llega al instante a Cocina.",
  },
  {
    icon: "💳",
    title: "Cobra y emite el comprobante",
    body: "Toca «Cobrar»: efectivo, tarjeta, Yape o Plin, con propina, descuento o cuenta dividida. Al final emites boleta o factura para SUNAT.",
  },
  {
    icon: "📶",
    title: "Sin internet, sigue vendiendo",
    body: "Si se va la red, todo se guarda en este equipo y se sincroniza solo al volver. El ícono 📶 te dice si hay algo pendiente.",
  },
];
const MANAGER_STEP: Step = {
  icon: "🏠",
  title: "Tu Inicio",
  body: "En Inicio ves las ventas del día, la caja y los insumos por reponer, y una guía de primeros pasos para dejar listo tu restaurante: carta, mesas, personal y SUNAT.",
};
const TENANT_STEPS: Step[] = [WELCOME, MANAGER_STEP, ...SERVICE_STEPS];
const MESERO_STEPS: Step[] = [WELCOME, ...SERVICE_STEPS];

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
  const steps = role === "saas" ? SAAS_STEPS : role === "mesero" ? MESERO_STEPS : TENANT_STEPS;

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
