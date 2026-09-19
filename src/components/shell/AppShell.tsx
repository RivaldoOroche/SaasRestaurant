import { Outlet } from "react-router-dom";
import { Rail } from "./Rail";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";

export function AppShell() {
  const { session, exitTenant } = useAuth();

  return (
    <div className="flex h-full w-full bg-bg text-ink mob:flex-col">
      <Rail />
      <main className="flex-1 min-h-0 min-w-0 flex flex-col mob:order-1">
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
