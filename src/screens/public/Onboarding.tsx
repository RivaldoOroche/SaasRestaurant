import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { WayraMark } from "@/components/brand/Logo";
import { supabase, isBackendConfigured } from "@/lib/supabase";

/** Página pública de alta de un tenant desde el link firmado. */
export function Onboarding() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const bonito = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  async function submit() {
    setErr(null);
    if (!email || password.length < 8) {
      setErr("Ingresa un correo y una contraseña de al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    try {
      if (!isBackendConfigured || !supabase) {
        // Demo sin backend: simula el alta.
        await new Promise((r) => setTimeout(r, 500));
        setDone(true);
        return;
      }
      const { data, error } = await supabase.functions.invoke("onboarding-complete", {
        body: { token, email, password, ownerName },
      });
      if (error) throw new Error(error.message);
      const r = data as { success?: boolean; error?: string };
      if (!r.success) throw new Error(r.error ?? "No se pudo completar el registro");
      setDone(true);
    } catch (e) {
      setErr((e as Error).message ?? "No se pudo completar el registro");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg text-muted p-6 text-center">
        Enlace de activación inválido. Solicita uno nuevo a tu proveedor.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <WayraMark size={52} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Activa tu Wayra POS</h1>
          <p className="text-muted text-sm mt-1">{bonito}</p>
        </div>

        <div className="rounded-xl bg-surface border border-border p-5">
          {done ? (
            <div className="text-center space-y-4">
              <p className="text-success text-4xl">✓</p>
              <p className="font-semibold">¡Cuenta activada!</p>
              <p className="text-muted text-sm">
                Ya puedes ingresar con tu correo y contraseña.
              </p>
              <Link to="/login">
                <Button className="w-full">Ir a iniciar sesión</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Tu nombre">
                <input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Nombre del dueño"
                  className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Correo">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Contraseña (mín. 8 caracteres)">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
                />
              </Field>
              {err && <p className="text-warning text-xs">{err}</p>}
              <Button className="w-full" onClick={submit} disabled={busy}>
                {busy ? "Activando…" : "Crear mi cuenta"}
              </Button>
              <p className="text-muted text-[11px] text-center">
                Al continuar aceptas los términos del servicio Wayra POS.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
