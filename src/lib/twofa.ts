import { supabase, isBackendConfigured } from "@/lib/supabase";

export interface EnrollResult {
  factorId: string;
  qrSvg: string; // SVG del código QR (data URI o markup)
  secret: string; // clave para ingresar a mano
}

/** ¿El backend soporta 2FA? (requiere Supabase Auth). */
export const twoFactorAvailable = isBackendConfigured;

/** Lista los factores TOTP verificados del usuario. */
export async function listTotpFactors(): Promise<{ id: string; friendlyName?: string }[]> {
  if (!supabase) return [];
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? undefined }));
}

/** Inicia la inscripción de un TOTP: devuelve el QR y el secreto. */
export async function enrollTotp(): Promise<EnrollResult | { error: string }> {
  if (!supabase) return { error: "Backend no configurado" };
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) return { error: error.message };
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifica el código del autenticador para activar el factor recién inscrito. */
export async function verifyEnroll(factorId: string, code: string): Promise<string | null> {
  if (!supabase) return "Backend no configurado";
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr) return cErr.message;
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  return error ? error.message : null;
}

/** Desactiva un factor 2FA. */
export async function unenrollTotp(factorId: string): Promise<string | null> {
  if (!supabase) return "Backend no configurado";
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return error ? error.message : null;
}

/** ¿El login actual requiere un segundo factor (aal2) que aún no se cumplió? */
export async function needsMfaChallenge(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return Boolean(data && data.nextLevel === "aal2" && data.nextLevel !== data.currentLevel);
}

/** Resuelve el desafío TOTP en el login con el primer factor TOTP. */
export async function resolveMfaChallenge(code: string): Promise<string | null> {
  if (!supabase) return "Backend no configurado";
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) return "No hay un factor 2FA configurado";
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (cErr) return cErr.message;
  const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
  return error ? error.message : null;
}
