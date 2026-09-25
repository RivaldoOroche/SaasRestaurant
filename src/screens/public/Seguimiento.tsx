import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDeliveryTracking } from "@/data/publicDelivery";
import { useLang, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { DeliveryStatus, DeliveryTracking } from "@/data/model";

const STEPS: { st: DeliveryStatus; at: keyof DeliveryTracking }[] = [
  { st: "recibido", at: "createdAt" },
  { st: "preparando", at: "acceptedAt" },
  { st: "listo", at: "readyAt" },
  { st: "en_camino", at: "dispatchedAt" },
  { st: "entregado", at: "deliveredAt" },
];
const EMOJI: Record<DeliveryStatus, string> = {
  recibido: "🧾",
  preparando: "👨‍🍳",
  listo: "📦",
  en_camino: "🛵",
  entregado: "🎉",
  cancelado: "⚠️",
};

/** Seguimiento público del pedido (enlace que recibe el cliente por WhatsApp). */
export function Seguimiento() {
  const { token = "" } = useParams();
  const t = useT();
  const { lang, setLang } = useLang();
  const { data, isLoading } = useQuery({
    queryKey: ["tracking", token],
    queryFn: () => getDeliveryTracking(token),
    // Se actualiza sola mientras el pedido siga activo.
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "entregado" || s === "cancelado" ? false : 20_000;
    },
    refetchOnWindowFocus: true,
  });

  const locale = lang === "en" ? "en-US" : "es-PE";
  const hhmm = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";

  const header = (
    <button
      onClick={() => setLang(lang === "es" ? "en" : "es")}
      className="absolute top-3 right-3 rounded-md border border-white/25 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10"
      aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
    >
      {t("carta.langToggle")}
    </button>
  );

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center bg-bg text-muted">{t("trk.loading")}</div>;
  }
  if (!data) {
    return <div className="min-h-screen grid place-items-center bg-bg text-muted p-6 text-center">{t("trk.notFound")}</div>;
  }

  const cancelled = data.status === "cancelado";
  const currentIdx = STEPS.findIndex((s) => s.st === data.status);
  const active = !cancelled && data.status !== "entregado";
  const eta = new Date(new Date(data.createdAt).getTime() + data.etaMin * 60000).toISOString();

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="relative bg-shell text-white px-5 pt-8 pb-10 text-center">
        {header}
        <p className="text-white/60 text-xs uppercase tracking-wide">{t("trk.title")}</p>
        <h1 className="text-2xl font-bold mt-1">{data.tenantName}</h1>
        <p className="font-mono text-white/70 mt-1">{data.code}</p>
      </header>

      {/* relative: debe pintarse sobre el header (que es posicionado) al superponerse. */}
      <main className="relative max-w-md mx-auto px-4 -mt-6 pb-10">
        <section className="rounded-2xl border border-border bg-surface shadow-lg p-5 text-center" aria-live="polite">
          <div className="text-5xl mb-2" aria-hidden="true">{EMOJI[data.status]}</div>
          <h2 className="text-xl font-bold">{t(`trk.h.${data.status}`)}</h2>
          {active && (
            <p className="text-muted text-sm mt-1">
              {t("trk.eta")}: <b className="text-ink">~{hhmm(eta)}</b>
            </p>
          )}
          {data.status === "en_camino" && data.driverName && (
            <p className="text-sm mt-2">
              🛵 <b>{data.driverName}</b> {t("trk.driver")}
            </p>
          )}
          {cancelled && <p className="text-muted text-sm mt-2">{t("trk.cancelHelp")}</p>}
        </section>

        {!cancelled && (
          <ol className="mt-6 space-y-0" aria-label={t("trk.title")}>
            {STEPS.map((s, i) => {
              const done = i <= currentIdx;
              const at = data[s.at] as string | null;
              return (
                <li key={s.st} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "h-7 w-7 rounded-full grid place-items-center text-xs font-bold border-2",
                        done ? "bg-accent border-accent text-white" : "bg-surface border-border text-muted",
                        i === currentIdx && active && "ring-4 ring-accent/25",
                      )}
                      aria-hidden="true"
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    {i < STEPS.length - 1 && <span className={cn("w-0.5 flex-1 min-h-[28px]", i < currentIdx ? "bg-accent" : "bg-border")} />}
                  </div>
                  <div className="pb-5 flex-1 flex justify-between gap-2">
                    <span className={cn("text-sm", done ? "font-semibold" : "text-muted")}>
                      {t(`trk.s.${s.st}`)}
                      <span className="sr-only">{done ? " ✓" : ""}</span>
                    </span>
                    <span className="text-xs text-muted font-mono">{done ? hhmm(at) : ""}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <p className="text-center text-muted text-xs mt-4">
          {active && `${t("trk.auto")} · `}
          {t("carta.poweredBy")} <span className="text-accent font-semibold">Wayra POS</span>
        </p>
      </main>
    </div>
  );
}
