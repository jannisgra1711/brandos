"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";

const SUGGESTIONS = ["Camping", "Hunde", "Lehrer", "Hochzeit", "Motorrad", "Angeln"];

/**
 * Einstiegspunkt der Recherche.
 *
 * Die Analyse läuft serverseitig und dauert je nach Quellenlage einige
 * Sekunden. Der Zustand wird deshalb explizit geführt: Ladeanzeige, Fehler
 * im Klartext, kein stiller Abbruch.
 */
export function SearchForm({
  size = "lg",
  className,
  initialTerm = "",
  autoRun = false,
}: {
  size?: "lg" | "sm";
  className?: string;
  /** Vorbelegung, z. B. aus einem Discovery-Vorschlag. */
  initialTerm?: string;
  /** Startet die Analyse ohne weiteren Klick. */
  autoRun?: boolean;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(initialTerm);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const autoRunFor = useRef<string | undefined>(undefined);

  const busy = pending || submitting;

  // Ein aus Discovery übergebener Begriff soll direkt losanalysieren – aber
  // genau einmal, auch wenn React die Komponente erneut rendert.
  useEffect(() => {
    if (!autoRun || !initialTerm || autoRunFor.current === initialTerm) return;
    autoRunFor.current = initialTerm;
    setTerm(initialTerm);
    void run(initialTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, initialTerm]);

  async function run(value: string) {
    const trimmed = value.trim();
    if (!trimmed || busy) return;

    setError(undefined);
    setSubmitting(true);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term: trimmed }),
      });

      const payload = (await response.json()) as { id?: string; error?: string };

      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Die Analyse konnte nicht erstellt werden.");
        return;
      }

      startTransition(() => router.push(`/analysis/${payload.id}`));
    } catch {
      setError("Keine Verbindung zum Server. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(term);
  }

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={onSubmit} className="relative">
        <Search
          size={size === "lg" ? 18 : 16}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint"
        />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          disabled={busy}
          placeholder="Nische, Zielgruppe oder Thema eingeben – z. B. Camping"
          aria-label="Suchbegriff"
          className={cn(
            "w-full rounded-xl border border-border bg-surface pr-32 pl-11 text-text placeholder:text-faint",
            "transition-[border-color,box-shadow] duration-150",
            "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft",
            "disabled:opacity-60",
            size === "lg" ? "h-14 text-base" : "h-11 text-sm",
          )}
        />
        <button
          type="submit"
          disabled={busy || term.trim().length === 0}
          className={cn(
            "absolute top-1/2 right-2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-lg",
            "bg-accent px-3.5 font-medium text-accent-text transition-colors duration-150",
            "hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
            size === "lg" ? "h-10 text-sm" : "h-8 text-sm",
          )}
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Analysiere
            </>
          ) : (
            <>
              Analysieren
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      {busy ? (
        <p className="mt-3 text-sm text-muted">
          Quellen werden befragt, Signale zusammengeführt und bewertet. Das dauert einige Sekunden.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      ) : null}

      {size === "lg" && !busy ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-faint">Beispiele:</span>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setTerm(suggestion);
                void run(suggestion);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-border-strong hover:bg-bg-subtle hover:text-text"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
