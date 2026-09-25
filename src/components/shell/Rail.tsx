import { NavLink } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { navForRole } from "@/lib/roles";
import { effectivePermissions } from "@/lib/permissions";
import { useRolePermissions } from "@/data/hooks";
import { useT } from "@/i18n";
import { WayraMark } from "@/components/brand/Logo";
import { useTheme } from "@/store/theme";
import { useConnection } from "@/store/connection";
import { cn } from "@/lib/cn";

/**
 * Left navigation rail. On mobile (≤860px) it becomes a bottom tab bar via the
 * `mob:` responsive classes, matching the prototype's responsive shell.
 */
export function Rail() {
  const { session, lock } = useAuth();
  const { theme, toggle } = useTheme();
  const { online, toggle: toggleNet } = useConnection();
  const { data: overrides = {} } = useRolePermissions();
  const t = useT();
  if (!session) return null;
  const isTenant = session.role !== "saas";

  // Permisos efectivos del rol: filtra las pantallas del tenant (el SaaS no se filtra).
  const allowed = effectivePermissions(session.role, overrides);
  const entries = navForRole(session.role).filter((e) => (isTenant ? allowed.has(e.key) : true));
  const top = entries.filter((e) => e.section === "top");
  const bottom = entries.filter((e) => e.section === "bottom");
  const initials = session.staff?.initials ?? (session.role === "saas" ? "SA" : "··");

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "flex flex-col items-center gap-1 bg-shell text-white/80 w-[76px] shrink-0 py-3",
        "mob:order-2 mob:w-full mob:h-[60px] mob:flex-row mob:py-1 mob:px-1.5 mob:border-t mob:border-border",
      )}
    >
      <WayraMark size={40} className="mb-2 mob:hidden" />

      <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full mob:flex-row mob:overflow-x-auto mob:overflow-y-hidden">
        {top.map((e) => (
          <RailButton key={e.key} to={e.path} icon={e.icon} label={t(`nav.${e.key}`)} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1.5 border-t border-white/10 pt-2 w-full mob:flex-row mob:border-t-0 mob:border-l mob:border-white/10 mob:pl-1.5 mob:ml-1 mob:w-auto mob:pt-0">
        {bottom.map((e) => (
          <RailButton key={e.key} to={e.path} icon={e.icon} label={t(`nav.${e.key}`)} />
        ))}
        {isTenant && (
          <button
            onClick={toggleNet}
            title={online ? "En línea (SUNAT)" : "Sin conexión"}
            aria-label={online ? "Conexión: en línea. Cambiar a sin conexión" : "Conexión: sin conexión. Cambiar a en línea"}
            className="h-[38px] w-[38px] rounded-md grid place-items-center hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <span aria-hidden="true">{online ? "📶" : "📴"}</span>
          </button>
        )}
        <button
          onClick={toggle}
          title="Cambiar tema"
          aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          className="h-[38px] w-[38px] rounded-md grid place-items-center hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
        </button>
        <button
          onClick={lock}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="flex flex-col items-center justify-center rounded-md hover:bg-white/10 px-1 py-1 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <span className="h-9 w-9 rounded-md bg-accent grid place-items-center text-xs font-bold text-white" aria-hidden="true">
            {initials}
          </span>
          <span className="text-[10px] mt-0.5 mob:hidden">salir</span>
        </button>
      </div>
    </nav>
  );
}

function RailButton({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center rounded-md w-[60px] min-h-[52px] gap-0.5 text-[10px] transition-colors",
          "mob:w-[58px] mob:min-h-[48px] mob:flex-none",
          "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
          isActive ? "bg-accent text-white" : "hover:bg-white/10 text-white/70",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className="text-lg leading-none" aria-hidden="true">
            {icon}
          </span>
          <span className="leading-tight text-center" aria-current={isActive ? "page" : undefined}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
