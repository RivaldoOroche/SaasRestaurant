import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@/auth/AuthProvider";
import { useAuth } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/shell/AppShell";
import { Login } from "@/screens/Login";
import { Placeholder } from "@/screens/Placeholder";
import { TENANT_NAV, SAAS_NAV, homePathForRole, type NavEntry } from "@/lib/roles";
import { useTheme } from "@/store/theme";

/** Which build phase each screen is delivered in (shown on placeholders). */
const PHASE: Record<string, string> = {
  pedido: "Fase 1", mesas: "Fase 1", cocina: "Fase 1",
  cuentas: "Fase 2", online: "Fase 2", carta: "Fase 2", editor: "Fase 2",
  inventario: "Fase 2", clientes: "Fase 2", caja: "Fase 2", reportes: "Fase 2",
  panel: "Fase 2", ajustes: "Fase 2",
  comprobantes: "Fase 3",
  saashome: "Fase 4", tenants: "Fase 4", retencion: "Fase 4", ingresos: "Fase 4",
  planes: "Fase 4", soporte: "Fase 4",
  sucursales: "Fase 2", suscripcion: "Fase 4",
};

function screenRoute(e: NavEntry) {
  return (
    <Route
      key={e.key}
      path={e.path}
      element={
        <RequireAuth path={e.path}>
          <Placeholder title={e.label} phase={PHASE[e.key] ?? "próximamente"} />
        </RequireAuth>
      }
    />
  );
}

function HomeRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? homePathForRole(session.role) : "/login"} replace />;
}

function Shell() {
  const apply = useTheme((s) => s.apply);
  useEffect(() => {
    apply();
  }, [apply]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell />}>
        {TENANT_NAV.map(screenRoute)}
        {SAAS_NAV.map(screenRoute)}
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}
