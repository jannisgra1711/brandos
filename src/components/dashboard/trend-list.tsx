import Link from "next/link";
import type { TrendMover } from "@/domain/types";
import { Sparkline } from "@/components/charts/sparkline";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPercent, formatScore } from "@/lib/format";

/**
 * Kompakte Marktbewegungen.
 *
 * `metric` bestimmt, welche Zahl rechts steht: bei Aufsteigern das Wachstum,
 * bei übersättigten Märkten der Nachfrageindex – sonst hätte die Liste
 * eine Kennzahl, die ihre eigene Aussage nicht stützt.
 */
export function TrendList({
  movers,
  metric = "growth",
  emptyHint,
}: {
  movers: TrendMover[];
  metric?: "growth" | "demand";
  emptyHint: string;
}) {
  if (movers.length === 0) {
    return <EmptyState title="Keine Bewegungen erkannt" description={emptyHint} />;
  }

  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {movers.map((mover) => {
        const tone =
          mover.direction === "rising" ? "positive" : mover.direction === "declining" ? "negative" : "muted";

        return (
          <li key={mover.term}>
            <Link
              href={`/research?term=${encodeURIComponent(mover.term)}`}
              className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{mover.term}</p>
                <p className="text-xs text-faint">{mover.category}</p>
              </div>

              <div className="hidden w-24 shrink-0 sm:block">
                <Sparkline values={mover.sparkline} tone={tone} height={28} />
              </div>

              <div className="w-20 shrink-0 text-right">
                <span
                  className={
                    metric === "growth"
                      ? mover.growth90d >= 0
                        ? "text-sm font-medium tabular-nums text-positive"
                        : "text-sm font-medium tabular-nums text-negative"
                      : "text-sm font-medium tabular-nums text-text"
                  }
                >
                  {metric === "growth"
                    ? formatPercent(mover.growth90d)
                    : formatScore(mover.demandIndex)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
