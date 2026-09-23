import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider } from "@/auth/AuthProvider";
import { useAuth } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/shell/AppShell";
import { Login } from "@/screens/Login";
import { Placeholder } from "@/screens/Placeholder";
import { CartaPublica } from "@/screens/public/CartaPublica";
import { Onboarding } from "@/screens/public/Onboarding";
import { LibroReclamaciones } from "@/screens/public/LibroReclamaciones";
import { Legal } from "@/screens/public/Legal";
import { Reclamaciones } from "@/screens/pos/Reclamaciones";
import { Reservas } from "@/screens/pos/Reservas";
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
import { Cobros } from "@/screens/saas/Cobros";
import { Planes } from "@/screens/saas/Planes";
import { Soporte } from "@/screens/saas/Soporte";
import { Bitacora } from "@/screens/saas/Bitacora";
import { ConfigSaaS } from "@/screens/saas/ConfigSaaS";

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
  reclamaciones: Reclamaciones,
  reservas: Reservas,
  saashome: Resumen,
  tenants: Tenants,
  retencion: Retencion,
  ingresos: Ingresos,
  cobros: Cobros,
  planes: Planes,
  soporte: Soporte,
  bitacora: Bitacora,
  configsaas: ConfigSaaS,
};

/** Which build phase each screen is delivered in (shown on placeholders). */
const PHASE: Record<string, string> = {
  pedido: "Fase 1", mesas: "Fase 1", cocina: "Fase 1",
  cuentas: "Fase 2", online: "Fase 2", carta: "Fase 2", editor: "Fase 2",
  inventario: "Fase 2", clientes: "Fase 2", caja: "Fase 2", reportes: "Fase 2",
  panel: "Fase 2", ajustes: "Fase 2",
  comprobantes: "Fase 3", reclamaciones: "Fase 2", reservas: "Fase 2",
  saashome: "Fase 4", tenants: "Fase 4", retencion: "Fase 4", ingresos: "Fase 4",
  planes: "Fase 4", soporte: "Fase 4", bitacora: "Fase 4", cobros: "Fase 4",
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
  const { session, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={session ? homePathForRole(session.role) : "/login"} replace />;
}

function Shell() {
  const apply = useTheme((s) => s.apply);
  useEffect(() => {
    apply();
  }, [apply]);

  return (
    <Routes>
      <Route path="/carta/:slug" element={<CartaPublica />} />
      <Route path="/onboarding/:slug" element={<Onboarding />} />
      <Route path="/libro/:slug" element={<LibroReclamaciones />} />
      <Route path="/legal/:doc" element={<Legal />} />
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
