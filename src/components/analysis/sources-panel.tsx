import { CheckCircle2, CircleSlash, Clock, XCircle } from "lucide-react";
import type { MarketSignals, SourceStatus } from "@/domain/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatNumber, formatScore } from "@/lib/format";

const STATUS: Record<SourceStatus, { icon: React.ComponentType<{ size?: number }>; label: string; color: string }> = {
  ok: { icon: CheckCircle2, label: "geantwortet", color: "text-positive" },
  degraded: { icon: CircleSlash, label: "eingeschränkt", color: "text-warning" },
  unavailable: { icon: CircleSlash, label: "nicht verfügbar", color: "text-faint" },
  timeout: { icon: Clock, label: "Zeitüberschreitung", color: "text-warning" },
  error: { icon: XCircle, label: "Fehler", color: "text-negative" },
};

/**
 * Quellenprotokoll.
 *
 * Die unspektakulärste Karte der Analyse und zugleich die wichtigste für
 * Vertrauen: sie zeigt, welche Quelle geantwortet hat, wie schnell, wie
 * aktuell die Daten sind – und wo eine Lücke bleibt.
 */
export function SourcesPanel({ signals }: { signals: MarketSignals }) {
  const quality = signals.dataQuality;

  return (
    <Card>
      <CardHeader
        title="Datengrundlage"
        description="Jede Aussage dieser Analyse stützt sich auf die hier protokollierten Quellen."
        action={
          <Badge tone={quality.confidence >= 0.7 ? "positive" : quality.confidence >= 0.45 ? "warning" : "negative"}>
            Konfidenz {formatScore(quality.confidence * 100)}
          </Badge>
        }
      />
      <CardBody className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Quellen" value={String(quality.sourceCount)} />
          <Metric label="Abdeckung" value={formatScore(quality.coverage * 100)} />
          <Metric label="Synthetisch" value={formatScore(quality.syntheticShare * 100)} />
          <Metric label="Aktualität" value={`${formatNumber(quality.freshnessDays, 1)} T.`} />
        </div>

        <ul className="divide-y divide-border border-t border-border">
          {signals.sources.map((source) => {
            const config = STATUS[source.status];
            const Icon = config.icon;

            return (
              <li key={source.source} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 shrink-0 ${config.color}`}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-text">{source.label}</span>
                    <span className="text-xs text-faint">{config.label}</span>
                    {source.status === "ok" ? (
                      <span className="text-xs tabular-nums text-faint">
                        · {formatNumber(source.latencyMs)} ms · Konfidenz{" "}
                        {formatScore(source.confidence * 100)}
                      </span>
                    ) : null}
                  </div>
                  {source.message ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{source.message}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {source.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded border border-border px-1.5 py-px text-[10px] text-faint"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-faint uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-text">{value}</p>
    </div>
  );
}
