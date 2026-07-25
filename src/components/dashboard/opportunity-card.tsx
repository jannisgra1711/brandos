import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DiscoveryOpportunity } from "@/domain/types";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge, GradeBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatPercent, formatScore } from "@/lib/format";

const KIND_LABEL: Record<DiscoveryOpportunity["kind"], string> = {
  niche: "Nische",
  "audience-product": "Zielgruppe × Produkt",
  trend: "Trend",
  seasonal: "Saisonal",
  evergreen: "Ganzjährig",
  unconventional: "Ungewöhnlich",
};

/**
 * Eine erkannte Chance.
 *
 * Die Karte führt bewusst mit der *Begründung*, nicht mit der Zahl: der
 * Score ordnet ein, der Grund macht handlungsfähig. Ein Klick startet die
 * vollständige Analyse zu diesem Begriff.
 */
export function OpportunityCard({ opportunity }: { opportunity: DiscoveryOpportunity }) {
  const tone =
    opportunity.direction === "rising"
      ? "positive"
      : opportunity.direction === "declining"
        ? "negative"
        : "accent";

  return (
    <Card interactive className="group relative flex flex-col overflow-hidden">
      <Link
        href={`/research?term=${encodeURIComponent(opportunity.term)}`}
        className="absolute inset-0 z-10"
        aria-label={`${opportunity.term} analysieren`}
      />

      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-text">{opportunity.term}</h3>
            <ArrowUpRight
              size={14}
              className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
          <p className="mt-0.5 text-xs text-faint">
            {opportunity.category} · {KIND_LABEL[opportunity.kind]}
          </p>
        </div>
        <GradeBadge grade={opportunity.grade} />
      </div>

      <p className="mt-3 px-5 text-sm leading-relaxed text-muted">{opportunity.reason}</p>

      <div className="mt-4 px-5">
        <Sparkline values={opportunity.sparkline} tone={tone} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-px border-t border-border bg-border">
        <Metric label="Score" value={`${Math.round(opportunity.score)}`} />
        <Metric label="90 Tage" value={formatPercent(opportunity.growth90d)} />
        <Metric label="Sättigung" value={formatScore(opportunity.saturationIndex)} />
      </dl>

      <div className="flex items-center justify-between gap-2 bg-surface px-5 py-3">
        <Badge tone="neutral">Konfidenz {formatScore(opportunity.confidence * 100)}</Badge>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-5 py-3">
      <dt className="text-[11px] tracking-wide text-faint uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}
