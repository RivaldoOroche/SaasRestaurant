import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider } from "@/auth/AuthProvider";
import { useAuth } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/shell/AppShell";
import { Login } from "@/screens/Login";
import { Placeholder } from "@/screens/Placeholder";
import { Pedido } from "@/screens/pos/Pedido";
import { Mesas } from "@/screens/pos/Mesas";
import { Cocina } from "@/screens/pos/Cocina";
import { Cuentas } from "@/screens/pos/Cuentas";
import { Inventario } from "@/screens/pos/Inventario";
import { Clientes } from "@/screens/pos/Clientes";
import { Carta } from "@/screens/pos/Carta";
import { Editor } from "@/screens/pos/Editor";
import { OnlineOrders } from "@/screens/pos/OnlineOrders";
import { Ajustes } from "@/screens/pos/Ajustes";
import { Caja } from "@/screens/pos/Caja";
import { Panel } from "@/screens/pos/Panel";
import { Sucursales } from "@/screens/pos/Sucursales";
import { Suscripcion } from "@/screens/pos/Suscripcion";
import { Sunat } from "@/screens/pos/Sunat";
import { Tenants } from "@/screens/saas/Tenants";
import { Ingresos } from "@/screens/saas/Ingresos";
import { Planes } from "@/screens/saas/Planes";
import { Soporte } from "@/screens/saas/Soporte";

// Chart-heavy screens are code-split so Recharts loads on demand.
const Reportes = lazy(() => import("@/screens/pos/Reportes").then((m) => ({ default: m.Reportes })));
const Resumen = lazy(() => import("@/screens/saas/Resumen").then((m) => ({ default: m.Resumen })));
const Retencion = lazy(() => import("@/screens/saas/Retencion").then((m) => ({ default: m.Retencion })));
import { TENANT_NAV, SAAS_NAV, homePathForRole, type NavEntry } from "@/lib/roles";
import { useTheme } from "@/store/theme";

import type { ComponentType } from "react";

/** Screens implemented so far; the rest fall back to a gated placeholder. */
const SCREENS: Record<string, ComponentType> = {
  pedido: Pedido,
  mesas: Mesas,
  cocina: Cocina,
  cuentas: Cuentas,
  inventario: Inventario,
  clientes: Clientes,
  carta: Carta,
  editor: Editor,
  online: OnlineOrders,
  ajustes: Ajustes,
  reportes: Reportes,
  caja: Caja,
  panel: Panel,
  sucursales: Sucursales,
  suscripcion: Suscripcion,
  comprobantes: Sunat,
  saashome: Resumen,
  tenants: Tenants,
  retencion: Retencion,
  ingresos: Ingresos,
  planes: Planes,
  soporte: Soporte,
};

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
  const Screen = SCREENS[e.key];
  return (
    <Route
      key={e.key}
      path={e.path}
      element={
        <RequireAuth path={e.path}>
          <Suspense fallback={<div className="p-6 text-muted">Cargando…</div>}>
            {Screen ? <Screen /> : <Placeholder title={e.label} phase={PHASE[e.key] ?? "próximamente"} />}
          </Suspense>
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
