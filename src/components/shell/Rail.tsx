import { NavLink } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { navForRole } from "@/lib/roles";
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
  if (!session) return null;
  const isTenant = session.role !== "saas";

  const entries = navForRole(session.role);
  const top = entries.filter((e) => e.section === "top");
  const bottom = entries.filter((e) => e.section === "bottom");
  const initials = session.staff?.initials ?? (session.role === "saas" ? "SA" : "··");

  return (
    <nav
      className={cn(
        "flex flex-col items-center gap-1 bg-shell text-white/80 w-[76px] shrink-0 py-3",
        "mob:order-2 mob:w-full mob:h-[60px] mob:flex-row mob:py-1 mob:px-1.5 mob:border-t mob:border-border",
      )}
    >
      <div className="mb-2 h-10 w-10 rounded-lg bg-accent-cta grid place-items-center font-bold text-white mob:hidden">
        N
      </div>

      <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full mob:flex-row mob:overflow-x-auto mob:overflow-y-hidden">
        {top.map((e) => (
          <RailButton key={e.key} to={e.path} icon={e.icon} label={e.label} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1.5 border-t border-white/10 pt-2 w-full mob:flex-row mob:border-t-0 mob:border-l mob:border-white/10 mob:pl-1.5 mob:ml-1 mob:w-auto mob:pt-0">
        {bottom.map((e) => (
          <RailButton key={e.key} to={e.path} icon={e.icon} label={e.label} />
        ))}
        {isTenant && (
          <button
            onClick={toggleNet}
            title={online ? "En línea (SUNAT)" : "Sin conexión"}
            className="h-[38px] w-[38px] rounded-md grid place-items-center hover:bg-white/10"
          >
            {online ? "📶" : "📴"}
          </button>
        )}
        <button
          onClick={toggle}
          title="Cambiar tema"
          className="h-[38px] w-[38px] rounded-md grid place-items-center hover:bg-white/10"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button
          onClick={lock}
          title="Cerrar sesión"
          className="flex flex-col items-center justify-center rounded-md hover:bg-white/10 px-1 py-1"
        >
          <span className="h-9 w-9 rounded-md bg-accent grid place-items-center text-xs font-bold text-white">
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
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center rounded-md w-[60px] min-h-[52px] gap-0.5 text-[10px] transition-colors",
          "mob:w-[58px] mob:min-h-[48px] mob:flex-none",
          isActive ? "bg-accent text-white" : "hover:bg-white/10 text-white/70",
        )
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="leading-tight text-center">{label}</span>
    </NavLink>
  );
}
