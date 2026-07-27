"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { ETSY_LIMITS } from "@/domain/types";
import type { ListingDraft, ListingFieldBasis } from "@/domain/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Die Listing-Werkstatt.
 *
 * Zwei Dinge macht sie sichtbar, die sonst erst Etsy sagt:
 *
 * 1. **Die Grenzen.** Titel 140 Zeichen, 13 Tags à 20 – nicht als Regel im
 *    Kleingedruckten, sondern als Zähler, der sich färbt. Wer sie reisst,
 *    bekommt das Listing nicht eingestellt.
 * 2. **Die Herkunft.** Unter jedem Feld steht, woraus es entstand. Kategorie
 *    und Preis sind gemessen, Titel und Tags abgeleitet, und eine
 *    Handänderung sagt genau das. Ein Listing geht nach draussen – hier ist
 *    die Verwechslung von Messung und Vermutung am teuersten.
 */
export function ListingWorkshop({
  projectId,
  listing,
  modelAvailable,
}: {
  projectId: string;
  listing?: ListingDraft;
  /** Ohne Modell bleibt die Beschreibung leer, statt regelbasiert zu entstehen. */
  modelAvailable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>();
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  async function generate() {
    setBusy(true);
    setFailed(undefined);
    try {
      const response = await fetch(`/api/projects/${projectId}/listing`, { method: "POST" });
      if (!response.ok) throw new Error("Entwurf konnte nicht erzeugt werden");
      setConfirmingRegenerate(false);
      router.refresh();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "Fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  if (!listing) {
    return (
      <Card>
        <CardHeader
          title="Listing-Entwurf"
          description="Titel, Tags, Kategorie und Preis als Ausgangspunkt – zum Überschreiben gedacht."
        />
        <CardBody className="space-y-3 pt-4">
          <Button size="sm" onClick={generate} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Entwurf erzeugen
          </Button>
          {failed ? (
            <p role="alert" className="text-sm text-negative">
              {failed}
            </p>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Listing-Entwurf"
        description="Zum Übertragen nach Etsy. Veröffentlichen geht von hier aus nicht – das braucht einen eigenen Zugang."
        action={
          confirmingRegenerate ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="danger" onClick={generate} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                Verwerfen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingRegenerate(false)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmingRegenerate(true)}>
              <RefreshCw size={14} />
              Neu erzeugen
            </Button>
          )
        }
      />

      <CardBody className="space-y-6 pt-4">
        {confirmingRegenerate ? (
          <p className="rounded-lg border border-border bg-bg-subtle p-3 text-xs text-muted">
            Ein neuer Entwurf ersetzt alle Felder – auch die von Hand geänderten.
          </p>
        ) : null}

        <TitleField projectId={projectId} listing={listing} onSaved={() => router.refresh()} />
        <TagsField projectId={projectId} listing={listing} onSaved={() => router.refresh()} />
        <CategoryField listing={listing} />
        <PriceField listing={listing} />
        <DescriptionField modelAvailable={modelAvailable} />

        {failed ? (
          <p role="alert" className="text-sm text-negative">
            {failed}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

// --- Felder ----------------------------------------------------------------

function TitleField({
  projectId,
  listing,
  onSaved,
}: {
  projectId: string;
  listing: ListingDraft;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(listing.title);
  const [saving, setSaving] = useState(false);
  const over = value.length > ETSY_LIMITS.titleMaxLength;

  async function save() {
    if (value.trim() === listing.title || over || value.trim().length === 0) {
      setValue(listing.title);
      return;
    }
    setSaving(true);
    await fetch(`/api/projects/${projectId}/listing`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: value.trim() }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <Field
      label="Titel"
      counter={`${value.length}/${ETSY_LIMITS.titleMaxLength}`}
      over={over}
      copyValue={value}
      basis={listing.basis.title}
      busy={saving}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={2}
        aria-label="Listing-Titel"
        className={cn(
          "w-full resize-y rounded-lg border bg-bg-subtle px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          over ? "border-negative" : "border-border",
        )}
      />
    </Field>
  );
}

function TagsField({
  projectId,
  listing,
  onSaved,
}: {
  projectId: string;
  listing: ListingDraft;
  onSaved: () => void;
}) {
  const [text, setText] = useState(listing.tags.join("\n"));
  const [saving, setSaving] = useState(false);

  const tags = text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  const tooLong = tags.filter((t) => t.length > ETSY_LIMITS.tagMaxLength);
  const over = tags.length > ETSY_LIMITS.maxTags || tooLong.length > 0;

  async function save() {
    if (over || tags.join("\n") === listing.tags.join("\n")) {
      if (over) setText(listing.tags.join("\n"));
      return;
    }
    setSaving(true);
    await fetch(`/api/projects/${projectId}/listing`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <Field
      label="Tags"
      hint="Einer je Zeile"
      counter={`${tags.length}/${ETSY_LIMITS.maxTags}`}
      over={over}
      // Etsy nimmt sie kommagetrennt entgegen.
      copyValue={tags.join(", ")}
      basis={listing.basis.tags}
      busy={saving}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        rows={Math.max(4, Math.min(tags.length + 1, 14))}
        aria-label="Listing-Tags"
        className={cn(
          "w-full resize-y rounded-lg border bg-bg-subtle px-3 py-2 font-mono text-xs text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          over ? "border-negative" : "border-border",
        )}
      />
      {tooLong.length > 0 ? (
        <p role="alert" className="mt-1.5 text-xs text-negative">
          Zu lang ({ETSY_LIMITS.tagMaxLength} Zeichen sind das Maximum):{" "}
          {tooLong.map((t) => `„${t}"`).join(", ")}
        </p>
      ) : null}
    </Field>
  );
}

function CategoryField({ listing }: { listing: ListingDraft }) {
  if (!listing.category) {
    return (
      <div>
        <FieldLabel label="Kategorie" />
        <p className="mt-1 text-sm text-faint">
          Keine gemessene Kategorie – die Ursprungsanalyse ist nicht mehr verfügbar oder Etsy hat
          zu diesem Begriff keine eindeutige geliefert.
        </p>
      </div>
    );
  }

  return (
    <Field
      label="Kategorie"
      hint="gemessen · Etsys eigene Bezeichnung"
      copyValue={listing.category.name}
      basis={listing.basis.category}
    >
      <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2">
        <p className="text-sm text-text">{listing.category.name}</p>
        <p className="mt-0.5 text-xs text-faint">{listing.category.path.join(" › ")}</p>
      </div>
    </Field>
  );
}

function PriceField({ listing }: { listing: ListingDraft }) {
  if (!listing.price) return null;

  return (
    <Field
      label="Preis"
      copyValue={String(listing.price.value)}
      basis={listing.basis.price}
    >
      <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2">
        <p className="text-sm tabular-nums text-text">
          {listing.price.value.toFixed(2).replace(".", ",")} {listing.price.currency}
        </p>
      </div>
    </Field>
  );
}

function DescriptionField({ modelAvailable }: { modelAvailable: boolean }) {
  return (
    <div>
      <FieldLabel label="Beschreibung" />
      <p className="mt-1 text-sm text-faint">
        {modelAvailable
          ? "Noch nicht erzeugt."
          : "Bleibt leer, solange kein Modell konfiguriert ist. Ein regelbasierter Beschreibungstext wäre unverkäuflich – ein leeres Feld ist ehrlicher als ein schlechtes."}
      </p>
    </div>
  );
}

// --- Bausteine -------------------------------------------------------------

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="text-xs font-medium tracking-wide text-faint uppercase">
      {label}
      {hint ? <span className="ml-2 normal-case opacity-80">{hint}</span> : null}
    </span>
  );
}

function Field({
  label,
  hint,
  counter,
  over = false,
  copyValue,
  basis,
  busy = false,
  children,
}: {
  label: string;
  hint?: string;
  counter?: string;
  over?: boolean;
  copyValue: string;
  basis?: ListingFieldBasis;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <FieldLabel label={label} hint={hint} />
        <div className="flex items-center gap-2">
          {busy ? <Loader2 size={13} className="animate-spin text-faint" /> : null}
          {counter ? (
            <span className={cn("text-xs tabular-nums", over ? "text-negative" : "text-faint")}>
              {counter}
            </span>
          ) : null}
          <CopyButton value={copyValue} label={label} />
        </div>
      </div>
      {children}
      {basis ? <BasisNote basis={basis} /> : null}
    </div>
  );
}

/** Woher das Feld stammt – dieselbe Disziplin wie bei den Score-Faktoren. */
function BasisNote({ basis }: { basis: ListingFieldBasis }) {
  const measured = basis.sources.length > 0 && !basis.synthetic;

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted">
      {measured ? (
        <Badge tone="positive">gemessen</Badge>
      ) : basis.synthetic ? (
        <Badge tone="warning">synthetisch</Badge>
      ) : null}
      <span>{basis.rationale}</span>
      {basis.sources.length > 0 ? (
        <span className="text-faint">Quellen: {basis.sources.join(", ")}</span>
      ) : null}
    </p>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ohne Zwischenablage-Berechtigung bleibt der Text markierbar – kein
      // Grund für eine Fehlermeldung.
    }
  }

  return (
    <button
      onClick={copy}
      aria-label={`${label} kopieren`}
      className="text-faint transition-colors hover:text-text"
    >
      {copied ? <Check size={14} className="text-positive" /> : <Copy size={14} />}
    </button>
  );
}
