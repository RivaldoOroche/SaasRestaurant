import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "accent" | "success" | "warning" | "neutral";

const tones: Record<Tone, string> = {
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  neutral: "bg-neutral/15 text-neutral",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
