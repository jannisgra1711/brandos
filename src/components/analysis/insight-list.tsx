import {
  AlertTriangle,
  CalendarClock,
  Lightbulb,
  Palette,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Insight, InsightKind } from "@/domain/types";
import { Card } from "@/components/ui/card";
import { formatScore } from "@/lib/format";

const KIND: Record<InsightKind, { icon: React.ComponentType<{ size?: number }>; label: string; color: string }> = {
  opportunity: { icon: Lightbulb, label: "Chance", color: "text-positive" },
  risk: { icon: AlertTriangle, label: "Risiko", color: "text-negative" },
  pattern: { icon: TrendingUp, label: "Muster", color: "text-accent" },
  audience: { icon: Users, label: "Zielgruppe", color: "text-accent" },
  design: { icon: Palette, label: "Design", color: "text-accent" },
  timing: { icon: CalendarClock, label: "Timing", color: "text-warning" },
};

/**
 * Beobachtungen mit Belegen.
 *
 * Jede Aussage trägt ihre Evidenz sichtbar mit sich. Das ist der Kern des
 * Produktversprechens: BrandOS behauptet nicht, es belegt.
 */
export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {insights.map((insight, index) => {
        const config = KIND[insight.kind];
        const Icon = config.icon;

        return (
          <Card key={`${insight.title}-${index}`} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={config.color}>
                  <Icon size={15} />
                </span>
                <span className="text-xs font-medium tracking-wide text-faint uppercase">
                  {config.label}
                </span>
              </div>
              <span className="text-xs tabular-nums text-faint">
                {formatScore(insight.confidence * 100)} sicher
              </span>
            </div>

            <h3 className="mt-2.5 text-sm font-semibold text-text">{insight.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{insight.detail}</p>

            {insight.evidence.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-border pt-3">
                {insight.evidence.map((item) => (
                  <li key={item} className="text-xs leading-relaxed text-faint">
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
