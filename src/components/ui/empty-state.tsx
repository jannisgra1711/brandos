import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Leerzustand.
 *
 * Ein leerer Bereich muss erklären, warum er leer ist und was als Nächstes
 * zu tun ist. Ein bloßes "Keine Daten" ist im Produkt ein Fehler.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-faint">{icon}</div> : null}
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
