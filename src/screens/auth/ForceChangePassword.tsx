import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";

/** Pantalla obligatoria: el usuario entró con contraseña temporal y debe cambiarla. */
export function ForceChangePassword() {
  const { changePassword, lock } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    if (pw.length < 8) return setErr("La contraseña debe tener al menos 8 caracteres.");
    if (pw !== pw2) return setErr("Las contraseñas no coinciden.");
    setBusy(true);
    const e = await changePassword(pw);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <div className="min-h-screen bg-bg text-ink grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-accent-cta grid place-items-center text-xl font-bold text-white">
            🔒
          </div>
          <h1 className="text-2xl font-bold">Cambia tu contraseña</h1>
          <p className="text-muted text-sm">Ingresaste con una contraseña temporal. Define una nueva para continuar.</p>
        </div>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Nueva contraseña"
          className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
        />
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder="Repite la contraseña"
          className="w-full rounded-md bg-chip-bg border border-border px-3 py-2 text-sm"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {err && <p className="text-warning text-sm">{err}</p>}
        <Button className="w-full" onClick={submit} disabled={busy}>
          {busy ? "Guardando…" : "Guardar y continuar"}
        </Button>
        <button className="w-full text-muted text-xs underline" onClick={lock}>
          Salir
        </button>
      </div>
    </div>
  );
}
