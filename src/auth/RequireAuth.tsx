import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { canAccess, homePathForRole } from "@/lib/roles";

/** Gate a route: must be logged in, and the role must be allowed to see `path`. */
export function RequireAuth({ path, children }: { path: string; children: ReactNode }) {
  const { session, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!canAccess(session.role, path)) {
    return <Navigate to={homePathForRole(session.role)} replace />;
  }
  return <>{children}</>;
}
