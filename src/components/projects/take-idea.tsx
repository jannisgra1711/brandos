"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Eine Idee als Vorhaben übernehmen.
 *
 * Der Übergang von Erkenntnis zu Arbeit – und der Moment, in dem die Analyse
 * vom Ergebnis zum Hintergrund wird. Nach dem Anlegen führt der Weg direkt
 * zum Vorhaben: Wer übernimmt, will dort weiterarbeiten, nicht zurück in die
 * Signaltafel.
 *
 * Mehrfaches Übernehmen derselben Idee ist erlaubt – zwei Varianten desselben
 * Einfalls sind ein normaler Vorgang. Deshalb blockiert der bestehende
 * Hinweis den Knopf nicht, er informiert nur.
 */
export function TakeIdea({
  analysisId,
  ideaId,
  alreadyTaken = 0,
}: {
  analysisId: string;
  ideaId: string;
  /** Wie viele Vorhaben aus dieser Idee schon existieren. */
  alreadyTaken?: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | undefined>();

  async function take() {
    setPending(true);
    setFailed(undefined);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, ideaId }),
      });

      const payload = (await response.json()) as { project?: { id: string }; error?: string };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error ?? "Übernahme fehlgeschlagen");
      }

      router.push(`/projects/${payload.project.id}`);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "Übernahme fehlgeschlagen");
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <Button size="sm" onClick={take} disabled={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
        Als Vorhaben übernehmen
      </Button>

      {alreadyTaken > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <Check size={13} />
          {alreadyTaken === 1 ? "bereits einmal übernommen" : `bereits ${alreadyTaken}× übernommen`}
        </span>
      ) : null}

      {failed ? (
        <span role="alert" className="text-xs text-negative">
          {failed}
        </span>
      ) : null}
    </div>
  );
}
