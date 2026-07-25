import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Kennzahl für Kopfzeilen – Wert dominant, Kontext untergeordnet. */
export function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-border bg-surface px-5 py-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-faint uppercase">{label}</p>
        {icon ? <span className="text-faint">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-text">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
