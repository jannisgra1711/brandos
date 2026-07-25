"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Analyse merken.
 *
 * Optimistisch, aber ehrlich: der Zustand wechselt sofort und wird bei einem
 * Fehler zurückgesetzt – mit sichtbarer Meldung statt stiller Rückabwicklung.
 */
export function SaveToggle({ id, initialSaved }: { id: string; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !saved;
    setSaved(next);
    setPending(true);
    setFailed(false);

    try {
      const response = await fetch(`/api/analyses/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saved: next }),
      });
      if (!response.ok) throw new Error("failed");
    } catch {
      setSaved(!next);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant={saved ? "primary" : "secondary"} size="sm" onClick={toggle} disabled={pending}>
        {pending ? (
          <Loader2 size={15} className="animate-spin" />
        ) : saved ? (
          <BookmarkCheck size={15} />
        ) : (
          <Bookmark size={15} />
        )}
        {saved ? "Gespeichert" : "Speichern"}
      </Button>
      {failed ? (
        <span role="alert" className="text-xs text-negative">
          Konnte nicht gespeichert werden.
        </span>
      ) : null}
    </div>
  );
}
