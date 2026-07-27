import type { ProjectStatus } from "@/domain/types";
import { Badge } from "@/components/ui/badge";

/**
 * Der Fortschritt eines Vorhabens, einmal beschrieben.
 *
 * Label, Ton und Erklärung stehen hier gemeinsam, damit Übersicht und
 * Detailseite nicht zwei Vokabulare entwickeln. Die Beschreibungen sagen, was
 * der **Verkäufer** getan hat – nicht, was BrandOS für ihn getan hat.
 */
export const STATUS_META: Record<
  ProjectStatus,
  { label: string; tone: "neutral" | "accent" | "positive" | "warning"; hint: string }
> = {
  idee: {
    label: "Idee",
    tone: "neutral",
    hint: "Übernommen, noch nichts entschieden.",
  },
  entwurf: {
    label: "Entwurf",
    tone: "accent",
    hint: "Das Design ist in Arbeit.",
  },
  bereit: {
    label: "Bereit",
    tone: "warning",
    hint: "Das Design steht, das Listing fehlt noch.",
  },
  eingestellt: {
    label: "Eingestellt",
    tone: "positive",
    hint: "Das Produkt ist auf Etsy verfügbar.",
  },
  verworfen: {
    label: "Verworfen",
    tone: "neutral",
    hint: "Beiseitegelegt – bleibt erhalten, taucht aber nicht in der Arbeitsliste auf.",
  },
};

/** Die Reihenfolge des Wegs. „verworfen" steht daneben, nicht darin. */
export const STATUS_PATH: ProjectStatus[] = ["idee", "entwurf", "bereit", "eingestellt"];

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
