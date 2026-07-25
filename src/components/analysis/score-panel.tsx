import { ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import type { MarketAnalysis } from "@/domain/types";
import { ScoreRing } from "@/components/charts/score-ring";
import { GradeBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatScore } from "@/lib/format";

/**
 * Kopfbereich einer Analyse: Score, Urteil, Treiber und Bremsen.
 *
 * Score und Konfidenz stehen unmittelbar nebeneinander. Eine hohe Zahl bei
 * dünner Datenlage ist eine andere Aussage als dieselbe Zahl bei breiter
 * Quellenbasis – die Oberfläche darf diesen Unterschied nicht verwischen.
 */
export function ScorePanel({ analysis }: { analysis: MarketAnalysis }) {
  const { score, interpretation } = analysis;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 lg:grid-cols-[auto_1fr] lg:gap-8">
        <div className="flex flex-col items-center gap-3">
          <ScoreRing value={score.value} grade={score.grade} confidence={score.confidence} />
          <GradeBadge grade={score.grade} />
          <p className="text-xs text-faint">Konfidenz {formatScore(score.confidence * 100)}</p>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <p className="text-xs font-medium tracking-wide text-faint uppercase">Urteil</p>
            <p className="mt-1.5 text-base leading-relaxed font-medium text-text">
              {interpretation.verdict}
            </p>
          </div>

          <p className="text-sm leading-relaxed text-muted">{interpretation.summary}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <SignalColumn
              icon={<TrendingUp size={14} />}
              tone="positive"
              title="Treiber"
              items={score.drivers}
              empty="Keine ausgeprägten Stärken."
            />
            <SignalColumn
              icon={<TrendingDown size={14} />}
              tone="negative"
              title="Bremsen"
              items={score.drags}
              empty="Keine ausgeprägten Schwächen."
            />
          </div>

          {interpretation.producedBy.degraded ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-subtle px-3.5 py-3">
              <ShieldAlert size={15} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed text-muted">
                Diese Interpretation stammt aus der regelbasierten Auswertung. Sie ist vollständig
                nachvollziehbar, aber konservativer als eine modellgestützte Deutung.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function SignalColumn({
  icon,
  tone,
  title,
  items,
  empty,
}: {
  icon: React.ReactNode;
  tone: "positive" | "negative";
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <p
        className={`flex items-center gap-1.5 text-xs font-medium ${
          tone === "positive" ? "text-positive" : "text-negative"
        }`}
      >
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-faint">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="text-sm leading-relaxed text-muted">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
