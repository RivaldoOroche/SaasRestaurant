import { cn } from "@/lib/cn";

/** Logomark de Wayra (badge con la "W" de viento). */
export function WayraMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/wayra-mark.svg"
      width={size}
      height={size}
      alt="Wayra POS"
      draggable={false}
      className={cn("select-none", className)}
    />
  );
}

/** Logotipo horizontal: marca + "Wayra POS". */
export function WayraLockup({ mark = 34, className }: { mark?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <WayraMark size={mark} />
      <span className="text-lg font-extrabold tracking-tight leading-none">
        Wayra <span className="text-accent">POS</span>
      </span>
    </div>
  );
}
