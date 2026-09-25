import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { navForRole, type NavEntry } from "@/lib/roles";
import { effectivePermissions } from "@/lib/permissions";
import { useRolePermissions } from "@/data/hooks";
import { useT } from "@/i18n";
import { WayraMark } from "@/components/brand/Logo";
import { Modal } from "@/components/ui/Modal";
import { useTheme } from "@/store/theme";
import { useConnection } from "@/store/connection";
import { cn } from "@/lib/cn";

/** Pestañas fijas en la barra móvil; el resto va al menú "Más". */
const MOBILE_PRIMARY = 4;

/** Entradas de navegación visibles para la sesión (filtradas por permisos). */
function useNavEntries() {
  const { session } = useAuth();
  const { data: overrides = {} } = useRolePermissions();
  if (!session) return null;
  const isTenant = session.role !== "saas";
  // Permisos efectivos del rol: filtra las pantallas del tenant (el SaaS no se filtra).
  const allowed = effectivePermissions(session.role, overrides);
  const entries = navForRole(session.role).filter((e) => (isTenant ? allowed.has(e.key) : true));
  return {
    isTenant,
    top: entries.filter((e) => e.section === "top"),
    bottom: entries.filter((e) => e.section === "bottom"),
    initials: session.staff?.initials ?? (session.role === "saas" ? "SA" : "··"),
  };
}

/** Riel lateral (escritorio y tablet). En móvil (≤860px) lo reemplaza MobileTabBar. */
export function Rail() {
  const { lock } = useAuth();
  const nav = useNavEntries();
  const t = useT();
  if (!nav) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className="flex flex-col items-center gap-1 bg-shell text-white/80 w-[76px] shrink-0 py-3 mob:hidden"
    >
      <WayraMark size={40} className="mb-2" />

      <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full">
        {nav.top.map((e) => (
          <RailButton key={e.key} entry={e} label={t(`nav.${e.key}`)} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1.5 border-t border-white/10 pt-2 w-full">
        {nav.bottom.map((e) => (
          <RailButton key={e.key} entry={e} label={t(`nav.${e.key}`)} />
        ))}
        <UtilityButtons isTenant={nav.isTenant} />
        <button
          onClick={lock}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="flex flex-col items-center justify-center rounded-md hover:bg-white/10 px-1 py-1"
        >
          <span className="h-9 w-9 rounded-md bg-accent grid place-items-center text-xs font-bold text-white" aria-hidden="true">
            {nav.initials}
          </span>
          <span className="text-[10px] mt-0.5">salir</span>
        </button>
      </div>
    </nav>
  );
}

/**
 * Barra inferior móvil: las primeras pantallas del rol como pestañas y un botón
 * "Más" que abre una hoja con el resto, el tema, la conexión y cerrar sesión.
 */
export function MobileTabBar() {
  const { lock } = useAuth();
  const nav = useNavEntries();
  const t = useT();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);

  // Al navegar desde la hoja "Más", se cierra.
  useEffect(() => setMore(false), [pathname]);

  if (!nav) return null;
  const primary = nav.top.slice(0, MOBILE_PRIMARY);
  const rest = [...nav.top.slice(MOBILE_PRIMARY), ...nav.bottom];
  const restActive = rest.some((e) => pathname.startsWith(e.path));

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="hidden mob:flex order-2 shrink-0 w-full bg-shell text-white/80 border-t border-border px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]"
      >
        {primary.map((e) => (
          <TabLink key={e.key} entry={e} label={t(`nav.${e.key}`)} />
        ))}
        <button
          onClick={() => setMore(true)}
          aria-haspopup="dialog"
          aria-expanded={more}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 rounded-md min-h-[52px] text-[11px]",
            restActive ? "text-white bg-white/10" : "text-white/70",
          )}
        >
          <span className="text-lg leading-none" aria-hidden="true">☰</span>
          <span>{t("nav.more")}</span>
        </button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} labelledBy="more-title" placement="bottom">
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <h2 id="more-title" className="text-sm font-semibold text-muted mb-3">
            {t("nav.more")}
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {rest.map((e) => (
              <NavLink
                key={e.key}
                to={e.path}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg p-2 min-h-[68px] text-[11px] text-center border",
                    isActive ? "bg-accent/15 border-accent text-accent" : "bg-chip-bg border-border text-ink",
                  )
                }
              >
                <span className="text-xl leading-none" aria-hidden="true">{e.icon}</span>
                <span className="leading-tight">{t(`nav.${e.key}`)}</span>
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
            <UtilityButtons isTenant={nav.isTenant} light />
            <button
              onClick={lock}
              className="ml-auto flex items-center gap-2 rounded-md px-3 h-10 text-sm border border-border bg-chip-bg"
            >
              <span className="h-6 w-6 rounded bg-accent grid place-items-center text-[10px] font-bold text-white" aria-hidden="true">
                {nav.initials}
              </span>
              {t("common.logout")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Conexión (solo tenant) y tema. `light`: estilo para fondo claro (hoja "Más"). */
function UtilityButtons({ isTenant, light }: { isTenant: boolean; light?: boolean }) {
  const { theme, toggle } = useTheme();
  const { online, toggle: toggleNet } = useConnection();
  const cls = cn(
    "h-10 w-10 rounded-md grid place-items-center",
    light ? "border border-border bg-chip-bg" : "h-[38px] w-[38px] hover:bg-white/10",
  );
  return (
    <>
      {isTenant && (
        <button
          onClick={toggleNet}
          title={online ? "En línea (SUNAT)" : "Sin conexión"}
          aria-label={online ? "Conexión: en línea. Cambiar a sin conexión" : "Conexión: sin conexión. Cambiar a en línea"}
          className={cls}
        >
          <span aria-hidden="true">{online ? "📶" : "📴"}</span>
        </button>
      )}
      <button
        onClick={toggle}
        title="Cambiar tema"
        aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        className={cls}
      >
        <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
      </button>
    </>
  );
}

function RailButton({ entry, label }: { entry: NavEntry; label: string }) {
  return (
    <NavLink
      to={entry.path}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center rounded-md w-[60px] min-h-[52px] gap-0.5 text-[10px] transition-colors",
          "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
          isActive ? "bg-accent text-white" : "hover:bg-white/10 text-white/70",
        )
      }
    >
      <span className="text-lg leading-none" aria-hidden="true">
        {entry.icon}
      </span>
      <span className="leading-tight text-center">{label}</span>
    </NavLink>
  );
}

function TabLink({ entry, label }: { entry: NavEntry; label: string }) {
  return (
    <NavLink
      to={entry.path}
      className={({ isActive }) =>
        cn(
          "flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-md min-h-[52px] text-[11px]",
          isActive ? "bg-accent text-white" : "text-white/70",
        )
      }
    >
      <span className="text-lg leading-none" aria-hidden="true">
        {entry.icon}
      </span>
      <span className="truncate max-w-full px-0.5">{label}</span>
    </NavLink>
  );
}
