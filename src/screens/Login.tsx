import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { homePathForRole } from "@/lib/roles";
import { MOCK_USERS } from "@/auth/session";
import { isBackendConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function Login() {
  const { loginWithPin, loginWithPassword, pendingMfa, completeMfa } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = await completeMfa(otp);
    if (err) {
      setError(err);
      return;
    }
    setOtp("");
    navigate("/");
  }

  async function submitPin(nextPin: string) {
    setError(null);
    const err = await loginWithPin(nextPin);
    if (err) {
      setError(err);
      setPin("");
      return;
    }
    const user = MOCK_USERS.find((u) => u.pin === nextPin);
    navigate(homePathForRole(user?.role ?? "mesero"));
  }

  function press(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) void submitPin(next);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = await loginWithPassword(email, password);
    if (err) {
      setError(err);
      return;
    }
    navigate("/"); // HomeRedirect routes to the role's home once the session is set
  }

  return (
    <div className="h-full w-full grid place-items-center bg-shell text-white p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-accent-cta grid place-items-center text-2xl font-bold">
            W
          </div>
          <h1 className="text-2xl font-bold">Wayra POS</h1>
          <p className="text-white/60 text-sm">Punto de venta · SaaS para restaurantes</p>
        </div>

        {pendingMfa ? (
          <form onSubmit={submitOtp} className="space-y-3">
            <p className="text-white/70 text-sm text-center">Ingresa el código de tu app de autenticación (2FA).</p>
            <input
              inputMode="numeric"
              autoFocus
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-md bg-white/10 border border-white/15 px-3 py-2.5 text-center text-lg tracking-[0.3em] font-mono placeholder:text-white/40"
            />
            <Button type="submit" size="lg" className="w-full" disabled={otp.length < 6}>
              Verificar
            </Button>
          </form>
        ) : mode === "pin" ? (
          <>
            <div className="flex justify-center gap-3 mb-5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border border-white/40",
                    i < pin.length && "bg-accent border-accent",
                  )}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <PinKey key={d} onClick={() => press(d)}>
                  {d}
                </PinKey>
              ))}
              <PinKey onClick={() => setPin("")}>C</PinKey>
              <PinKey onClick={() => press("0")}>0</PinKey>
              <PinKey onClick={() => setPin(pin.slice(0, -1))}>⌫</PinKey>
            </div>
            <p className="text-center text-white/40 text-xs mt-5">
              Demo: 1111 Dueña · 2222 Gerente · 3333/4444 Mesero · 0000 SaaS
            </p>
          </>
        ) : (
          <form onSubmit={submitPassword} className="space-y-3">
            <input
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md bg-white/10 border border-white/15 px-3 py-2.5 text-sm placeholder:text-white/40"
            />
            <input
              type="password"
              placeholder="contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-white/10 border border-white/15 px-3 py-2.5 text-sm placeholder:text-white/40"
            />
            <Button type="submit" size="lg" className="w-full">
              Ingresar
            </Button>
          </form>
        )}

        {error && <p className="text-center text-warning text-sm mt-4">{error}</p>}

        <button
          onClick={() => {
            setMode(mode === "pin" ? "password" : "pin");
            setError(null);
          }}
          className="block mx-auto mt-6 text-white/50 text-xs underline underline-offset-2"
        >
          {mode === "pin" ? "Ingresar con correo y contraseña" : "Ingresar con PIN"}
        </button>
        {!isBackendConfigured && (
          <p className="text-center text-white/30 text-[11px] mt-3">
            Modo demo (sin backend). Configura .env para conectar Supabase.
          </p>
        )}
      </div>
    </div>
  );
}

function PinKey({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-16 rounded-lg bg-white/8 hover:bg-white/15 text-xl font-semibold transition-colors"
    >
      {children}
    </button>
  );
}
