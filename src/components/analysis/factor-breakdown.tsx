import type { OpportunityScore } from "@/domain/types";
import { BarMeter, toneForScore } from "@/components/charts/bar-meter";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FACTOR_DESCRIPTIONS } from "@/domain/scoring";
import { formatScore } from "@/lib/format";

/**
 * Aufschlüsselung des Opportunity Scores.
 *
 * Jeder Faktor zeigt Wert, Gewicht und Begründung. Geschätzte Faktoren sind
 * markiert – ohne diese Kennzeichnung wäre nicht erkennbar, welche Teile des
 * Scores auf Daten und welche auf Annahmen beruhen.
 */
export function FactorBreakdown({ score }: { score: OpportunityScore }) {
  return (
    <Card>
      <CardHeader
        title="Wie der Score zustande kommt"
        description="Neun gewichtete Faktoren. Die Berechnung ist deterministisch und jederzeit reproduzierbar."
      />
      <CardBody className="space-y-4 pt-4">
        {score.factors.map((factor) => (
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
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
