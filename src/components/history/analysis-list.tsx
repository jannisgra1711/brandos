import Link from "next/link";
import type { AnalysisSummary } from "@/domain/types";
import { GradeBadge, TrendBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative, formatScore } from "@/lib/format";

/** Liste gespeicherter bzw. zuletzt durchgeführter Analysen. */
export function AnalysisList({
  analyses,
  emptyTitle = "Noch keine Analysen",
  emptyDescription = "Sobald du einen Markt untersuchst, erscheint er hier.",
  emptyAction,
}: {
  analyses: AnalysisSummary[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  if (analyses.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {analyses.map((analysis) => (
        <li key={analysis.id}>
          <Link
            href={`/analysis/${analysis.id}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-hover"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-text">{analysis.term}</p>
                <span className="text-xs text-faint">{analysis.market}</span>
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-muted">{analysis.verdict}</p>
            </div>

            <div className="flex items-center gap-2">
              <TrendBadge direction={analysis.trend} />
              <GradeBadge grade={analysis.grade} />
            </div>

            <div className="w-28 shrink-0 text-right">
              <p className="text-sm font-medium tabular-nums text-text">
                {Math.round(analysis.score)}
                <span className="text-xs font-normal text-faint"> / 100</span>
              </p>
              <p className="text-xs text-faint">
                {formatRelative(analysis.createdAt)} · Konfidenz {formatScore(analysis.confidence * 100)}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
