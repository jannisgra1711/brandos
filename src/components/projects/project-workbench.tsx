"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import type { ProductProject, ProjectStatus } from "@/domain/types";
import { STATUS_META, STATUS_PATH } from "@/components/projects/status";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Die Werkbank eines Vorhabens.
 *
 * Sie hält heute Fortschritt, Titel und Notizen. Die Werkzeuge, die daraus ein
 * Produkt machen – Listing, Mockups, Designbewertung –, docken später hier an;
 * bis dahin behauptet die Seite nicht, sie zu haben. Ein Knopf, der nichts tut,
 * wäre schlimmer als kein Knopf.
 *
 * Gespeichert wird bei jeder Änderung sofort. Ein Vorhaben ist ein Arbeitsstand,
 * kein Formular – ein „Speichern"-Zwang würde nur Gelegenheiten schaffen, ihn
 * zu verlieren. Ausnahme sind die Notizen: Dort wäre jeder Tastendruck ein
 * Schreibzugriff.
 */
export function ProjectWorkbench({ project }: { project: ProductProject }) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [pending, setPending] = useState<string | undefined>();
  const [failed, setFailed] = useState<string | undefined>();
  const [savedNotes, setSavedNotes] = useState(false);

  async function patch(changes: Record<string, unknown>, label: string) {
    setPending(label);
    setFailed(undefined);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Änderung fehlgeschlagen");
      }
      router.refresh();
      return true;
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "Änderung fehlgeschlagen");
      return false;
    } finally {
      setPending(undefined);
    }
  }

  async function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === project.title) {
      setTitle(project.title);
      return;
    }
    await patch({ title: trimmed }, "title");
  }

  async function saveNotes() {
    if (await patch({ notes }, "notes")) {
      setSavedNotes(true);
      setTimeout(() => setSavedNotes(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Fortschritt" description="Wo du mit diesem Vorhaben stehst." />
        <CardBody className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_PATH.map((status) => (
              <StatusButton
                key={status}
                status={status}
                active={project.status === status}
                pending={pending === status}
                onSelect={() => patch({ status }, status)}
              />
            ))}
          </div>

          <p className="text-xs text-muted">{STATUS_META[project.status].hint}</p>

          <div className="border-t border-border pt-4">
            {project.status === "verworfen" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => patch({ status: "idee" }, "idee")}
                disabled={pending !== undefined}
              >
                Wieder aufnehmen
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => patch({ status: "verworfen" }, "verworfen")}
                disabled={pending !== undefined}
              >
                Beiseitelegen
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Titel" description="Arbeitstitel des Vorhabens – nicht der Listing-Titel." />
        <CardBody className="pt-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setTitle(project.title);
            }}
            maxLength={200}
            aria-label="Titel des Vorhabens"
            className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notizen" description="Was du beim Umsetzen nicht vergessen willst." />
        <CardBody className="space-y-3 pt-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            maxLength={10_000}
            aria-label="Notizen"
            placeholder="Druckdatei, Lieferant, offene Fragen …"
            className="w-full resize-y rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={saveNotes}
              disabled={pending !== undefined || notes === (project.notes ?? "")}
            >
              {pending === "notes" ? <Loader2 size={15} className="animate-spin" /> : null}
              Notiz sichern
            </Button>
            {savedNotes ? (
              <span className="inline-flex items-center gap-1 text-xs text-positive">
                <Check size={13} />
                gesichert
              </span>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {failed ? (
        <p role="alert" className="text-sm text-negative">
          {failed}
        </p>
      ) : null}

      <DeleteProject id={project.id} title={project.title} />
    </div>
  );
}

function StatusButton({
  status,
  active,
  pending,
  onSelect,
}: {
  status: ProjectStatus;
  active: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  const meta = STATUS_META[status];

  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-accent text-accent-text"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
      )}
    >
      {pending ? <Loader2 size={12} className="animate-spin" /> : null}
      {meta.label}
    </button>
  );
}

/**
 * Löschen ist endgültig – anders als „Beiseitelegen", das den Status setzt.
 * Deshalb ein zweiter Klick, und die Rückfrage sagt, was verschwindet.
 */
function DeleteProject({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    setPending(true);
    setFailed(false);

    try {
      const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("failed");
      router.push("/projects");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-faint transition-colors hover:text-negative"
      >
        Vorhaben löschen
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg-subtle p-4">
      <p className="text-sm text-text">
        &bdquo;{title}&ldquo; endgültig löschen? Notizen und Fortschritt gehen verloren. Die Analyse
        bleibt.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          Ja, löschen
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Abbrechen
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-negative">
          Konnte nicht gelöscht werden.
        </p>
      ) : null}
    </div>
  );
}
