import type { ProductIdea } from "@/domain/types";
import { BarMeter, toneForScore } from "@/components/charts/bar-meter";
import { TakeIdea } from "@/components/projects/take-idea";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/format";

const COMPOSITION_LABELS: Record<keyof ProductIdea["composition"], string> = {
  niche: "Nische",
  productType: "Produktart",
  audience: "Zielgruppe",
  emotion: "Emotion",
  style: "Stil",
  differentiator: "Alleinstellung",
};

/**
 * Produktideen mit sichtbarer Herkunft.
 *
 * Die Bausteine werden ausgewiesen, statt nur das Ergebnis zu zeigen. So ist
 * nachvollziehbar, dass die Idee aus einer Kombination entstanden ist – und
 * der Nutzer kann einzelne Bausteine gedanklich austauschen.
 */
export function IdeaList({
  ideas,
  analysisId,
  takenByIdea = {},
}: {
  ideas: ProductIdea[];
  /** Fehlt sie, wird nicht zum Übernehmen eingeladen – etwa in Vorschauen. */
  analysisId?: string;
  /** Wie oft je Idee bereits ein Vorhaben entstand. */
  takenByIdea?: Record<string, number>;
}) {
  if (ideas.length === 0) {
    return (
      <EmptyState
        title="Keine Ideen ableitbar"
        description="Die Signallage reicht nicht aus, um belastbare Produktideen zu kombinieren."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {ideas.map((idea) => (
        <Card key={idea.id} interactive className="flex flex-col p-5">
          <h3 className="text-sm leading-snug font-semibold text-text">{idea.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{idea.rationale}</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-4">
            {(Object.keys(COMPOSITION_LABELS) as (keyof ProductIdea["composition"])[]).map((key) => (
              <div key={key} className="min-w-0">
                <dt className="text-[10px] tracking-wide text-faint uppercase">
                  {COMPOSITION_LABELS[key]}
                </dt>
                <dd className="truncate text-xs text-text" title={idea.composition[key]}>
                  {idea.composition[key]}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <Meter label="Potenzial" value={idea.potential} />
            <Meter label="Differenzierung" value={idea.distinctiveness} />
          </div>

          <p className="mt-3 text-xs text-muted">
            Preiskorridor{" "}
            <span className="font-medium text-text">
              {formatCurrency(idea.suggestedPriceRange.min, idea.suggestedPriceRange.currency)} –{" "}
              {formatCurrency(idea.suggestedPriceRange.max, idea.suggestedPriceRange.currency)}
            </span>
          </p>

          {idea.risks.length > 0 ? (
            <ul className="mt-3 space-y-1 border-t border-border pt-3">
              {idea.risks.map((risk) => (
                <li key={risk} className="text-xs leading-relaxed text-faint">
                  {risk}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Der Knopf sitzt unten und ist die einzige Aktion der Karte –
              alles darüber ist Entscheidungsgrundlage. `mt-auto` hält ihn in
              Karten unterschiedlicher Höhe auf einer Linie. */}
          {analysisId ? (
            <div className="mt-auto">
              <TakeIdea
                analysisId={analysisId}
                ideaId={idea.id}
                alreadyTaken={takenByIdea[idea.id] ?? 0}
              />
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-xs font-medium tabular-nums text-text">{Math.round(value)}</span>
      </div>
      <BarMeter value={value} tone={toneForScore(value)} className="mt-1.5" />
    </div>
  );
}
