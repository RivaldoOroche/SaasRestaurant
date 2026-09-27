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
import { needsMfaChallenge, resolveMfaChallenge } from "@/lib/twofa";
import type { AppRole } from "@/types/database";
import { clearPairing, getPairing, setPairing, type DevicePairing } from "./device";
import { matchPin, pinLockSeconds, registerPinFailure, resetPinFailures } from "@/lib/pin";
import { getRepo } from "@/data";

const mockMode = USE_MOCK || !supabase;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingMfa, setPendingMfa] = useState<{ userId: string; email: string; metaMustChange: boolean } | null>(null);
  const [pairing, setPairingState] = useState<DevicePairing | null>(() => (mockMode ? null : getPairing()));

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
      const wait = pinLockSeconds();
      if (wait > 0) return `Demasiados intentos. Espera ${wait} s.`;
      const fail = () => {
        const secs = registerPinFailure();
        return secs > 0 ? `PIN incorrecto. Teclado bloqueado ${secs} s.` : "PIN incorrecto";
      };
      if (mockMode) {
        const user = MOCK_USERS.find((u) => u.pin === pin);
        if (!user) return fail();
        resetPinFailures();
        const s = sessionFromMockUser(user);
        // Sucursales asignadas en Personal (demo).
        if (s.tenantId && s.staff) {
          const pins = await getRepo(s.tenantId).getStaffPins().catch(() => []);
          s.staff.branchIds = pins.find((p) => p.name === user.name)?.branchIds ?? [];
        }
        update(s);
        return null;
      }
      // Equipo vinculado: el PIN se verifica en el propio equipo (funciona sin red).
      const p = getPairing();
      if (!p) return "Primero vincula este equipo: ingresa una vez con el correo del dueño.";
      let staff;
      try {
        staff = await getRepo(p.tenantId).getStaffPins();
      } catch {
        return "No hay datos del personal en este equipo. Conéctate a internet una vez.";
      }
      if (!staff.some((s) => s.verifier)) {
        return "Aún no hay PIN configurados. Ingresa con correo y define los PIN en Dueño → Personal.";
      }
      const who = await matchPin(pin, staff);
      if (!who) return fail();
      resetPinFailures();
      update({
        role: who.role,
        tenantId: p.tenantId,
        tenantName: p.tenantName,
        staff: { id: who.id, name: who.name, initials: who.initials, role: who.role, branchIds: who.branchIds ?? [] },
        userEmail: p.email,
        impersonating: false,
      });
      return null;
    },
    [update],
  );

  // Termina el login: resuelve rol/tenant, arma la sesión y audita el acceso.
  const finishLogin = useCallback(
    async (userId: string, email: string, metaMustChange: boolean): Promise<string | null> => {
      if (!supabase) return "Backend no configurado";
      setMustChangePassword(metaMustChange);
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
        const { data: t } = await supabase.from("tenants").select("name").eq("id", membership.tenant_id).maybeSingle();
        tenantName = t?.name ?? null;
      }
      update({ role, tenantId: membership.tenant_id, tenantName, staff: null, userEmail: email, impersonating: false });
      // Dueño/gerente: el equipo queda vinculado al restaurante para ingresar con PIN.
      if (membership.tenant_id && (role === "dueno" || role === "admin")) {
        const pr = { tenantId: membership.tenant_id, tenantName, email };
        setPairing(pr);
        setPairingState(pr);
        void getRepo(membership.tenant_id).getStaffPins().catch(() => undefined); // queda en caché para usar sin red
      }
      try {
        await supabase.from("access_log").insert({
          user_id: userId,
          email,
          role,
          event: "login",
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        });
      } catch {
        /* no bloquea el ingreso */
      }
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
      const metaMustChange = Boolean(data.user?.user_metadata?.must_change_password);

      // 2FA: si el usuario tiene un segundo factor, exígelo antes de entrar.
      if (await needsMfaChallenge()) {
        setPendingMfa({ userId, email, metaMustChange });
        return null; // la pantalla de login mostrará el campo del código
      }
      return finishLogin(userId, email, metaMustChange);
    },
    [finishLogin],
  );

  const completeMfa = useCallback<AuthValue["completeMfa"]>(
    async (code) => {
      if (!pendingMfa) return "No hay un desafío 2FA pendiente";
      const err = await resolveMfaChallenge(code);
      if (err) return err;
      const { userId, email, metaMustChange } = pendingMfa;
      setPendingMfa(null);
      return finishLogin(userId, email, metaMustChange);
    },
    [pendingMfa, finishLogin],
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
    // Con equipo vinculado solo se bloquea (vuelve al PIN); si no, se cierra la sesión.
    if (!mockMode && supabase && !getPairing()) void supabase.auth.signOut();
    setMustChangePassword(false);
    setPendingMfa(null);
    update(null);
  }, [update]);

  const unpair = useCallback<AuthValue["unpair"]>(() => {
    if (!mockMode && supabase) void supabase.auth.signOut();
    clearPairing();
    setPairingState(null);
    setMustChangePassword(false);
    setPendingMfa(null);
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
    () => ({
      session,
      ready,
      loginWithPin,
      loginWithPassword,
      enterTenant,
      exitTenant,
      lock,
      unpair,
      pairing,
      mustChangePassword,
      changePassword,
      pendingMfa: pendingMfa !== null,
      completeMfa,
    }),
    [session, ready, loginWithPin, loginWithPassword, enterTenant, exitTenant, lock, unpair, pairing, mustChangePassword, changePassword, pendingMfa, completeMfa],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
