import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { initObservability, setObservabilityContext } from "./lib/observability";
import { useBranchStore } from "./store/branch";
import { initPwa } from "./lib/pwa";
import "./styles/index.css";

initObservability();
// La sucursal activa acompaña a cada reporte de error.
setObservabilityContext({ branchId: useBranchStore.getState().branchId });
useBranchStore.subscribe((s) => setObservabilityContext({ branchId: s.branchId }));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

// PWA: service worker (offline + actualizaciones) e instalación "Agregar a inicio".
initPwa();
