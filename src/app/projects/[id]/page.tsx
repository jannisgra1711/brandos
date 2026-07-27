import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { IdeaComposition } from "@/domain/types";
import { ProjectWorkbench } from "@/components/projects/project-workbench";
import { StatusBadge } from "@/components/projects/status";
import { GradeBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/section";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { getAnalysisSummary } from "@/server/services/history-service";
import { getProject } from "@/server/services/project-service";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? project.title : "Vorhaben" };
}

export const dynamic = "force-dynamic";

const COMPOSITION_LABELS: Record<keyof IdeaComposition, string> = {
  niche: "Nische",
  productType: "Produktart",
  audience: "Zielgruppe",
  emotion: "Emotion",
  style: "Stil",
  differentiator: "Alleinstellung",
};

/**
 * Vorhabenseite.
 *
 * Links die Arbeit, rechts die Grundlage: Was das Vorhaben ist, steht neben
 * dem, woraus es entstand. Die Herkunft ist bewusst eingefroren und als solche
 * beschriftet – sie sagt, worauf die Entscheidung beruhte, nicht wie der Markt
 * heute steht. Wer das wissen will, folgt dem Verweis zur Analyse.
 */
export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) notFound();

  // Die Analyse darf gelöscht sein – das Vorhaben überlebt sie.
  const analysis = await getAnalysisSummary(project.analysisId);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text"
        >
          <ChevronLeft size={15} />
          Vorhaben
        </Link>
      </div>

      <PageHeader
        eyebrow={`${project.market} · angelegt ${formatDateTime(project.createdAt)}`}
        title={project.title}
        description={`Aus der Analyse zu „${project.term}".`}
        action={<StatusBadge status={project.status} />}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <ProjectWorkbench project={project} />

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Bausteine" description="Aus der übernommenen Idee." />
            <CardBody className="pt-4">
              <dl className="space-y-3">
                {(Object.keys(COMPOSITION_LABELS) as (keyof IdeaComposition)[]).map((key) => (
                  <div key={key}>
                    <dt className="text-[10px] tracking-wide text-faint uppercase">
                      {COMPOSITION_LABELS[key]}
                    </dt>
                    <dd className="text-sm text-text">{project.composition[key]}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Grundlage"
              description="Stand bei der Übernahme – bewusst eingefroren."
            />
            <CardBody className="space-y-4 pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">Score der Analyse</span>
                <span className="flex items-center gap-2">
                  {/* `formatScore` hängt ein Prozentzeichen an – ein Score ist
                      aber ein Punktwert, kein Anteil. */}
                  <span className="text-sm font-medium tabular-nums text-text">
                    {formatNumber(project.origin.score, 1)}/100
                  </span>
                  <GradeBadge grade={project.origin.grade} />
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                <Metric label="Potenzial" value={`${formatNumber(project.origin.potential)}/100`} />
                <Metric
                  label="Differenzierung"
                  value={`${formatNumber(project.origin.distinctiveness)}/100`}
                />
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-[10px] tracking-wide text-faint uppercase">Preiskorridor</p>
                <p className="mt-0.5 text-sm text-text">
                  {formatCurrency(project.suggestedPriceRange.min, project.suggestedPriceRange.currency)}
                  {" – "}
                  {formatCurrency(project.suggestedPriceRange.max, project.suggestedPriceRange.currency)}
                </p>
              </div>

              <div className="border-t border-border pt-4 text-xs">
                {analysis ? (
                  <Link
                    href={`/analysis/${project.analysisId}`}
                    className="text-accent transition-colors hover:underline"
                  >
                    Zur Analyse – zeigt den heutigen Stand
                  </Link>
                ) : (
                  <p className="text-faint">
                    Die Ursprungsanalyse wurde gelöscht. Die Werte oben bleiben als
                    Entscheidungsgrundlage erhalten.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-wide text-faint uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-text">{value}</p>
    </div>
  );
}
