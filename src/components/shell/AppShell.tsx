import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { Rail } from "./Rail";
import { BranchBar } from "./BranchBar";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { useRepoSubscription, useSunatActions } from "@/data/hooks";
import { usePlatformSubscription } from "@/data/platform/hooks";
import { useConnection } from "@/store/connection";

export function AppShell() {
  const { session, exitTenant } = useAuth();
  useRepoSubscription();
  usePlatformSubscription();

  // Auto-sync queued comprobantes to SUNAT when connectivity is restored.
  const online = useConnection((s) => s.online);
  const { sync } = useSunatActions();
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) sync.mutate(true);
    wasOnline.current = online;
  }, [online, sync]);

  return (
    <div className="flex h-full w-full bg-bg text-ink mob:flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Saltar al contenido
      </a>
      <Rail />
      <main id="contenido" className="flex-1 min-h-0 min-w-0 flex flex-col mob:order-1">
        {session && session.role !== "saas" && <BranchBar />}
        {session && session.role !== "saas" && !online && (
          <div className="bg-warning/15 text-warning px-4 py-1.5 text-sm text-center no-print">
            📴 Sin conexión — ventas y comprobantes se registran localmente y se enviarán a SUNAT al reconectar.
          </div>
        )}
        {session?.impersonating && (
          <div className="flex items-center justify-between gap-3 bg-accent/15 text-accent px-4 py-1.5 text-sm no-print">
            <span>
              Estás en el POS de <strong>{session.tenantName}</strong> como plataforma
              (impersonación auditada).
            </span>
            <Button size="sm" variant="secondary" onClick={exitTenant}>
              Salir del tenant
            </Button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
