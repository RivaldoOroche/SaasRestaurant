import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { usePwa, applyUpdate, promptInstall, isIos } from "@/lib/pwa";
import { useT } from "@/i18n";

const DISMISS_KEY = "wayra-install-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Avisos de la PWA dentro del shell:
 *  - "Nueva versión disponible" → Actualizar (activa el SW en espera y recarga).
 *  - Invitación a instalar la app (diálogo nativo en Android/Chrome; pasos
 *    manuales en iOS). Se puede descartar y no vuelve a aparecer.
 */
export function PwaPrompts() {
  const t = useT();
  const { updateReady, installEvent, installed } = usePwa();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const ios = isIos();

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const showInstall = !installed && !dismissed && (installEvent || ios);

  if (!updateReady && !showInstall) return null;

  return (
    <div
      className="fixed z-40 left-1/2 -translate-x-1/2 w-[min(28rem,calc(100%-1.5rem))] no-print bottom-[calc(1rem+env(safe-area-inset-bottom))] mob:bottom-[calc(72px+env(safe-area-inset-bottom))]"
      role="region"
      aria-label={t("pwa.region")}
    >
      {updateReady ? (
        <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-surface shadow-lg px-4 py-3" role="status">
          <span className="text-xl" aria-hidden="true">✨</span>
          <p className="flex-1 text-sm">{t("pwa.updateReady")}</p>
          <Button size="sm" onClick={applyUpdate}>
            {t("pwa.update")}
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface shadow-lg px-4 py-3">
          <img src="/icons/icon-192.png" alt="" width={36} height={36} className="rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("pwa.installTitle")}</p>
            <p className="text-muted text-xs mt-0.5">{ios && !installEvent ? t("pwa.iosSteps") : t("pwa.installBody")}</p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {installEvent && (
              <Button size="sm" onClick={() => void promptInstall()}>
                {t("pwa.install")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {t("pwa.notNow")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tarjeta permanente (Centro de ayuda) para instalar la app cuando quieras. */
export function InstallAppCard() {
  const t = useT();
  const { installEvent, installed } = usePwa();
  const ios = isIos();
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-lg" />
        <div className="flex-1">
          <p className="font-semibold text-sm">{t("pwa.installTitle")}</p>
          <p className="text-muted text-xs">
            {installed ? t("pwa.alreadyInstalled") : ios ? t("pwa.iosSteps") : installEvent ? t("pwa.installBody") : t("pwa.browserMenu")}
          </p>
        </div>
        {!installed && installEvent && (
          <Button size="sm" onClick={() => void promptInstall()}>
            {t("pwa.install")}
          </Button>
        )}
      </div>
    </div>
  );
}
