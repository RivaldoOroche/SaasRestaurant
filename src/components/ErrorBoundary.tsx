// Si una pantalla falla, se muestra un aviso claro en vez de una página en
// blanco; los pedidos en cola no se pierden (viven en el equipo).
import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError } from "@/lib/observability";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, "react", { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="min-h-[60vh] grid place-items-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-4xl" aria-hidden="true">
            😵
          </p>
          <h1 className="text-lg font-bold">Algo salió mal en esta pantalla</h1>
          <p className="text-sm text-muted">
            Tus pedidos y cobros guardados no se pierden. Recarga para seguir; si vuelve a pasar, avísanos desde Ayuda.
          </p>
          <div className="flex justify-center gap-2">
            <button onClick={() => location.reload()} className="rounded-md bg-accent-cta text-white px-4 py-2 text-sm font-semibold">
              Recargar
            </button>
            <button
              onClick={() => {
                this.setState({ error: null });
                location.assign("/");
              }}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
