import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { FactorBreakdown } from "@/components/analysis/factor-breakdown";
import { IdeaList } from "@/components/analysis/idea-list";
import { InsightList } from "@/components/analysis/insight-list";
import { SaveToggle } from "@/components/analysis/save-toggle";
import { ScorePanel } from "@/components/analysis/score-panel";
import {
  AudiencePanel,
  CategoryPanel,
  CompetitionPanel,
  DemandPanel,
  DesignPanel,
  KeywordPanel,
  PricingPanel,
  ProductTypePanel,
  SeasonalityPanel,
} from "@/components/analysis/signal-panels";
import { SourcesPanel } from "@/components/analysis/sources-panel";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, Section } from "@/components/ui/section";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getAnalysis, getAnalysisSummary } from "@/server/services/history-service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const analysis = await getAnalysis(id);
  if (!analysis) return { title: "Analyse nicht gefunden" };

  return {
    title: `${analysis.query.term} – Score ${Math.round(analysis.score.value)}`,
    description: analysis.interpretation.verdict,
  };
}

/**
 * Analyse-Detailseite.
 *
 * Aufbau folgt der Entscheidungsreihenfolge: erst das Urteil, dann seine
 * Begründung, dann die Handlungsoptionen, zuletzt die Rohsignale und die
 * Quellenlage. Wer nur die Entscheidung braucht, liest die erste Karte; wer
 * sie prüfen will, liest bis unten.
 */
export default async function AnalysisPage({ params }: Props) {
  const { id } = await params;
  const [analysis, summary] = await Promise.all([getAnalysis(id), getAnalysisSummary(id)]);

  if (!analysis) notFound();

  const currentMonth = new Date(analysis.createdAt).getMonth() + 1;
  const { interpretation } = analysis;

  return (
    <div className="space-y-10">
      <div>
        <a
          href="/history"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text"
        >
          <ChevronLeft size={15} />
          Historie
        </a>
      </div>

      <PageHeader
        eyebrow={`${analysis.query.market ?? "DE"} · ${formatDateTime(analysis.createdAt)}`}
        title={analysis.query.term}
        description={`Erhebung in ${formatNumber(analysis.durationMs)} ms über ${analysis.signals.dataQuality.sourceCount} antwortende Quellen.`}
        action={<SaveToggle id={analysis.id} initialSaved={summary?.saved ?? false} />}
      />

      <ScorePanel analysis={analysis} />

      <Section
        title="Erkenntnisse"
        description="Jede Beobachtung führt ihre Belege mit – nachprüfbar gegen die Signale weiter unten."
      >
        <InsightList insights={interpretation.insights} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <FactorBreakdown score={analysis.score} sources={analysis.signals.sources} />

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Empfohlene nächste Schritte"
              description="Priorisiert – die erste Zeile hat den größten Hebel."
            />
            <CardBody className="pt-4">
              {interpretation.recommendedActions.length === 0 ? (
                <p className="text-sm text-muted">Keine konkreten Schritte ableitbar.</p>
              ) : (
                <ol className="space-y-3">
                  {interpretation.recommendedActions.map((action, index) => (
                    <li key={action} className="flex gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                        {index + 1}
                      </span>
                      <span className="text-sm leading-relaxed text-muted">{action}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <ListCard title="Chancen" tone="positive" items={interpretation.opportunities} />
            <ListCard title="Risiken" tone="negative" items={interpretation.risks} />
          </div>
        </div>
      </div>

      <Section
        title="Produktideen"
        description="Aus Kombination entstanden, nicht aus Nachbau. Die Bausteine jeder Idee sind ausgewiesen."
      >
        <IdeaList ideas={interpretation.ideas} />
      </Section>

      <Section
        title="Signale"
        description="Die Rohdaten hinter Score und Interpretation. Fehlende Karten bedeuten fehlende Quellen."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <DemandPanel signals={analysis.signals} />
          <CompetitionPanel signals={analysis.signals} />
          <SeasonalityPanel signals={analysis.signals} currentMonth={currentMonth} />
          <PricingPanel signals={analysis.signals} />
          <AudiencePanel signals={analysis.signals} />
          <ProductTypePanel signals={analysis.signals} />
          <CategoryPanel signals={analysis.signals} />
          <DesignPanel signals={analysis.signals} />
          <KeywordPanel signals={analysis.signals} />
        </div>
      </Section>

      <SourcesPanel signals={analysis.signals} />
    </div>
  );
}

function ListCard({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "positive" | "negative";
  items: string[];
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="pt-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted">Nichts Auffälliges.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item} className="flex gap-2.5">
                <CheckCircle2
                  size={14}
                  className={`mt-0.5 shrink-0 ${tone === "positive" ? "text-positive" : "text-negative"}`}
                />
                <span className="text-sm leading-relaxed text-muted">{item}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
