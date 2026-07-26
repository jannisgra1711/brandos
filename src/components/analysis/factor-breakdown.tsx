import type { OpportunityScore, SourceContribution } from "@/domain/types";
import { BarMeter, toneForScore } from "@/components/charts/bar-meter";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FACTOR_DESCRIPTIONS } from "@/domain/scoring";
import { formatScore } from "@/lib/format";

/**
 * Aufschlüsselung des Opportunity Scores.
 *
 * Jeder Faktor zeigt Wert, Gewicht, Begründung und **Herkunft**. Die
 * Kennzeichnung trennt drei Fälle, die sonst gleich aussähen:
 *
 * - `geschätzt` – es gab kein Signal, der Faktor steht neutral.
 * - `synthetisch` – es gab ein Signal, aber aus einer Mock-Quelle.
 * - unmarkiert – gemessen, mit Nennung der Quelle.
 *
 * Ohne den mittleren Fall rendert ein erfundener Wert exakt wie ein
 * gemessener: gleicher Balken, gleiche selbstbewusste Begründung.
 */
export function FactorBreakdown({
  score,
  sources = [],
}: {
  score: OpportunityScore;
  /** Quellenprotokoll des Laufs – liefert die Beschriftung zu den IDs. */
  sources?: SourceContribution[];
}) {
  const labelFor = new Map(sources.map((s) => [s.source, s.label]));

  return (
    <Card>
      <CardHeader
        title="Wie der Score zustande kommt"
        description="Neun gewichtete Faktoren. Die Berechnung ist deterministisch und jederzeit reproduzierbar."
      />
      <CardBody className="space-y-4 pt-4">
        {score.syntheticWeight !== undefined && score.syntheticWeight > 0 ? (
          <p className="rounded-lg border border-border bg-bg-subtle px-3 py-2 text-xs leading-relaxed text-muted">
            <span className="font-medium text-text">
              {formatScore(score.syntheticWeight * 100)} der Gewichtung
            </span>{" "}
            stammen aus synthetischen Quellen. Diese Faktoren sind unten markiert – ihre Werte
            sind plausibel erzeugt, aber nicht gemessen.
          </p>
        ) : null}

        {score.factors.map((factor) => {
          const synthetic = factor.syntheticShare ?? 0;
          const origin = (factor.sources ?? []).map((id) => labelFor.get(id) ?? id);

          return (
            <div key={factor.key}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text" title={FACTOR_DESCRIPTIONS[factor.key]}>
                    {factor.label}
                  </span>
                  {factor.imputed ? (
                    <span className="rounded border border-border px-1.5 py-px text-[10px] text-faint">
                      geschätzt
                    </span>
                  ) : synthetic > 0 ? (
                    <span className="rounded border border-transparent bg-warning-soft px-1.5 py-px text-[10px] text-warning">
                      {synthetic >= 1 ? "synthetisch" : `synthetisch ${formatScore(synthetic * 100)}`}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-sm font-medium text-text">{Math.round(factor.value)}</span>
                  <span className="text-xs text-faint">Gewicht {formatScore(factor.weight * 100)}</span>
                </div>
              </div>

              <BarMeter
                value={factor.value}
                tone={factor.imputed ? "muted" : toneForScore(factor.value)}
                className="mt-2"
              />

              <p className="mt-1.5 text-xs leading-relaxed text-muted">{factor.rationale}</p>

              {origin.length > 0 ? (
                <p className="mt-0.5 text-[11px] text-faint">Quelle: {origin.join(", ")}</p>
              ) : null}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
