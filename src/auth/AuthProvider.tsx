import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext, type AuthValue } from "./AuthContext";
import {
  MOCK_USERS,
  loadSession,
  saveSession,
  sessionFromMockUser,
  type Session,
} from "./session";
import { supabase, USE_MOCK } from "@/lib/supabase";
import type { AppRole } from "@/types/database";

const mockMode = USE_MOCK || !supabase;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const update = useCallback((s: Session | null) => {
    setSession(s);
    saveSession(s);
  }, []);

  const loginWithPin = useCallback<AuthValue["loginWithPin"]>(
    async (pin) => {
      // The PIN keypad is a demo/offline affordance only. With a real backend,
      // matching a hard-coded mock PIN would mint a fake privileged client
      // session, so it's disabled — staff PIN auth on an already-authenticated
      // tenant device (verified against staff_members.pin_hash server-side) is a
      // backend task. Owners sign in with email + password.
      if (!mockMode) {
        return "Ingreso por PIN no disponible con backend real. Usa correo y contraseña.";
      }
      const user = MOCK_USERS.find((u) => u.pin === pin);
      if (!user) return "PIN incorrecto";
      update(sessionFromMockUser(user));
      return null;
    },
    [update],
  );

  const loginWithPassword = useCallback<AuthValue["loginWithPassword"]>(
    async (email, password) => {
      if (mockMode || !supabase) {
        return "Backend no configurado. Usa el ingreso por PIN (modo demo).";
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      const userId = data.user?.id;
      if (!userId) return "No se pudo iniciar sesión";
      setMustChangePassword(Boolean(data.user?.user_metadata?.must_change_password));

      const { data: membership, error: mErr } = await supabase
        .from("memberships")
        .select("role, tenant_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (mErr) return mErr.message;
      if (!membership) return "Tu usuario no tiene acceso asignado.";

      const role = membership.role as AppRole;
      let tenantName: string | null = null;
      if (membership.tenant_id) {
        const { data: t } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", membership.tenant_id)
          .maybeSingle();
        tenantName = t?.name ?? null;
      }
      update({
        role,
        tenantId: membership.tenant_id,
        tenantName,
        staff: null,
        userEmail: email,
        impersonating: false,
      });
      return null;
    },
    [update],
  );

  const enterTenant = useCallback<AuthValue["enterTenant"]>(
    (tenantId, tenantName) => {
      setSession((prev) => {
        if (!prev || prev.role !== "saas") return prev;
        const next: Session = {
          ...prev,
          role: "dueno",
          tenantId,
          tenantName,
          impersonating: true,
        };
        saveSession(next);
        return next;
      });
    },
    [],
  );

  const exitTenant = useCallback<AuthValue["exitTenant"]>(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: Session = {
        ...prev,
        role: "saas",
        tenantId: null,
        tenantName: "Wayra POS",
        impersonating: false,
      };
      saveSession(next);
      return next;
    });
  }, []);

  const lock = useCallback<AuthValue["lock"]>(() => {
    if (!mockMode && supabase) void supabase.auth.signOut();
    setMustChangePassword(false);
    update(null);
  }, [update]);

  const changePassword = useCallback<AuthValue["changePassword"]>(async (newPassword) => {
    if (mockMode || !supabase) {
      setMustChangePassword(false);
      return null;
    }
    if (newPassword.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    if (error) return error.message;
    setMustChangePassword(false);
    return null;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, ready, loginWithPin, loginWithPassword, enterTenant, exitTenant, lock, mustChangePassword, changePassword }),
    [session, ready, loginWithPin, loginWithPassword, enterTenant, exitTenant, lock, mustChangePassword, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
