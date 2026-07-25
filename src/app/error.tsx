"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Fehlergrenze.
 *
 * Zeigt an, dass etwas schiefging, ohne interne Details preiszugeben – und
 * bietet den einzigen sinnvollen nächsten Schritt an: erneut versuchen.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unbehandelter Fehler in der Oberfläche", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="text-warning">
        <AlertTriangle size={28} />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-text">
        Da ist etwas schiefgelaufen
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Die Seite konnte nicht vollständig geladen werden. Häufigste Ursache: eine Datenquelle hat
        nicht geantwortet.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-faint">Referenz: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex gap-3">
        <Button size="sm" onClick={reset}>
          Erneut versuchen
        </Button>
        <ButtonLink href="/" size="sm">
          Zum Dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
