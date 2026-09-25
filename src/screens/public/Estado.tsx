import { Link } from "react-router-dom";
import { WayraLockup } from "@/components/brand/Logo";

type Health = "operational" | "degraded" | "down";

interface Service {
  name: string;
  desc: string;
  status: Health;
}

// Estado del servicio. En una instalación real, estos valores los alimenta un
// monitor externo (health checks a SUNAT/OSE, pasarelas, Supabase). Aquí se
// muestran como "operativo" por defecto; el objetivo es dar una página pública
// y honesta de estado que el negocio pueda compartir.
const SERVICES: Service[] = [
  { name: "Aplicación Wayra POS", desc: "POS, carta digital y consola web", status: "operational" },
  { name: "Facturación electrónica (SUNAT)", desc: "Emisión de boletas y facturas", status: "operational" },
  { name: "Pasarelas de pago", desc: "Tarjeta (Culqi, Izipay, Niubiz) y Yape/Plin", status: "operational" },
  { name: "Base de datos y autenticación", desc: "Supabase (Postgres, Auth, Realtime)", status: "operational" },
  { name: "Notificaciones", desc: "Correo y notificaciones push", status: "operational" },
];

const LABEL: Record<Health, string> = {
  operational: "Operativo",
  degraded: "Degradado",
  down: "Caído",
};
const DOT: Record<Health, string> = {
  operational: "bg-success",
  degraded: "bg-warning",
  down: "bg-red-500",
};

export function Estado() {
  const worst: Health = SERVICES.some((s) => s.status === "down")
    ? "down"
    : SERVICES.some((s) => s.status === "degraded")
      ? "degraded"
      : "operational";

  const banner =
    worst === "operational"
      ? { text: "Todos los sistemas operativos", cls: "bg-success/15 text-success border-success/30" }
      : worst === "degraded"
        ? { text: "Rendimiento degradado en algún servicio", cls: "bg-warning/15 text-warning border-warning/30" }
        : { text: "Incidencia en curso", cls: "bg-red-500/15 text-red-600 border-red-500/30" };

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-2xl p-6">
        <header className="flex items-center justify-between gap-4 mb-6">
          <WayraLockup mark={30} />
          <span className="text-muted text-xs">Estado del sistema</span>
        </header>

        <div className={"rounded-xl border px-4 py-4 mb-6 flex items-center gap-3 " + banner.cls}>
          <span className={"h-3 w-3 rounded-full " + DOT[worst]} aria-hidden="true" />
          <p className="font-semibold">{banner.text}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface divide-y divide-border-soft">
          {SERVICES.map((s) => (
            <div key={s.name} className="flex items-center gap-3 p-4">
              <span className={"h-2.5 w-2.5 rounded-full shrink-0 " + DOT[s.status]} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{s.name}</p>
                <p className="text-muted text-xs">{s.desc}</p>
              </div>
              <span className="text-xs font-medium whitespace-nowrap">{LABEL[s.status]}</span>
            </div>
          ))}
        </div>

        <p className="text-muted text-xs mt-4">
          Actualizado: {new Date().toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" })}. ¿Reportar un
          problema? Escríbenos a <a className="text-accent underline" href="mailto:soporte@wayrapos.pe">soporte@wayrapos.pe</a>.
        </p>

        <div className="mt-6 text-sm">
          <Link className="text-accent underline" to="/">
            ← Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
