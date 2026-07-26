"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Analyse löschen.
 *
 * Anders als das Merken ist das Löschen nicht umkehrbar – deshalb kein
 * optimistischer Zustand, sondern ein zweiter Klick. Die Rückfrage steht
 * inline statt in einem Systemdialog: Sie soll erklären, was verschwindet,
 * und nicht nur bestätigt werden wollen.
 *
 * Die Liste wird serverseitig gerendert; nach dem Löschen holt `refresh()`
 * sie neu, statt den Eintrag im Client zu entfernen. So bleibt die Anzeige
 * das, was auf der Platte steht.
 */
export function DeleteAnalysis({ id, term }: { id: string; term: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    setPending(true);
    setFailed(false);

    try {
      const response = await fetch(`/api/analyses/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("failed");
      setConfirming(false);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 hover:text-negative"
        aria-label={`Analyse „${term}“ löschen`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 size={15} />
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted">Löschen?</span>
        <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          Ja
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirming(false);
            setFailed(false);
          }}
          disabled={pending}
        >
          Abbrechen
        </Button>
      </div>
      {failed ? (
        <span role="alert" className="text-xs text-negative">
          Konnte nicht gelöscht werden.
        </span>
      ) : null}
    </div>
  );
}
