import Link from "next/link";
import type { ProjectSummary } from "@/domain/types";
import { STATUS_META, StatusBadge } from "@/components/projects/status";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatNumber } from "@/lib/format";

/**
 * Die Arbeitsliste.
 *
 * Sortiert nach letzter Bearbeitung, nicht nach Entstehung – oben steht, woran
 * gearbeitet wird. Der Score der Ursprungsanalyse steht dabei, aber klein: Er
 * war die Entscheidungsgrundlage, ist aber nicht mehr die Sache selbst.
 */
export function ProjectList({
  projects,
  emptyTitle = "Noch keine Vorhaben",
  emptyDescription = "Übernimm eine Produktidee aus einer Analyse, um hier weiterzuarbeiten.",
  emptyAction,
}: {
  projects: ProjectSummary[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  if (projects.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  return (
    <Card className="divide-y divide-border overflow-hidden p-0">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/projects/${project.id}`}
          className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-hover"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{project.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {project.productType} · aus &bdquo;{project.term}&ldquo;
              <span className="text-faint"> · {formatDateTime(project.updatedAt)}</span>
            </p>
          </div>

          {/* Kein `formatScore` – das hängt ein Prozentzeichen an, und ein
              Opportunity Score von 63 sind keine 63 %. */}
          <span className="shrink-0 text-xs tabular-nums text-faint" title="Score der Ursprungsanalyse">
            {formatNumber(project.score)}/100
          </span>
          <StatusBadge status={project.status} />
        </Link>
      ))}
    </Card>
  );
}

/** Zählt die Vorhaben je Status – für die Kopfzeile der Übersicht. */
export function StatusTally({ projects }: { projects: ProjectSummary[] }) {
  const counts = new Map<string, number>();
  for (const project of projects) {
    counts.set(project.status, (counts.get(project.status) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {[...counts.entries()].map(([status, count]) => (
        <span key={status}>
          {count}× {STATUS_META[status as keyof typeof STATUS_META].label}
        </span>
      ))}
    </div>
  );
}
