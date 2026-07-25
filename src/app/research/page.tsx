import type { Metadata } from "next";
import { Compass, Search } from "lucide-react";
import { AnalysisList } from "@/components/history/analysis-list";
import { SearchForm } from "@/components/research/search-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader, Section } from "@/components/ui/section";
import { listAnalyses } from "@/server/services/history-service";

export const metadata: Metadata = {
  title: "Recherche",
  description: "Eigene Begriffe untersuchen und begründete Marktanalysen erhalten.",
};

export const dynamic = "force-dynamic";

/**
 * Recherche.
 *
 * Einstieg für eigene Begriffe. Wird die Seite mit `?term=` geöffnet – etwa
 * aus einer Discovery-Karte – startet die Analyse unmittelbar, damit der
 * Nutzer nicht zweimal dieselbe Absicht ausdrücken muss.
 */
export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const params = await searchParams;
  const term = params.term?.trim() ?? "";
  const recent = await listAnalyses({ limit: 8 });

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Recherche"
        title={term ? `Analyse: ${term}` : "Einen Markt untersuchen"}
        description="Gib eine Nische, eine Zielgruppe oder ein Thema ein. BrandOS befragt alle aktiven Quellen, bewertet die Signale und begründet das Ergebnis."
      />

      <SearchForm initialTerm={term} autoRun={Boolean(term)} />

      {!term ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <ExplainerCard
            title="1. Sammeln"
            body="Alle aktiven Quellen werden parallel befragt. Fällt eine aus, entsteht eine Lücke – kein Fehler."
          />
          <ExplainerCard
            title="2. Bewerten"
            body="Neun gewichtete Faktoren ergeben den Opportunity Score. Die Berechnung ist deterministisch und reproduzierbar."
          />
          <ExplainerCard
            title="3. Deuten"
            body="Aus Signalen und Score entstehen Insights, Risiken und Produktideen – jeweils mit Beleg."
          />
        </div>
      ) : null}

      <Section
        title="Zuletzt untersucht"
        action={
          <ButtonLink href="/history" variant="ghost" size="sm">
            Gesamte Historie
          </ButtonLink>
        }
      >
        <AnalysisList
          analyses={recent}
          emptyTitle="Noch keine Recherche"
          emptyDescription="Starte mit einem eigenen Begriff – oder lass dir von Discovery Kandidaten vorschlagen."
          emptyAction={
            <ButtonLink href="/discovery" size="sm">
              <Compass size={15} />
              Zu Discovery
            </ButtonLink>
          }
        />
      </Section>
    </div>
  );
}

function ExplainerCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 text-faint">
          <Search size={14} />
          <span className="text-xs font-medium tracking-wide uppercase">{title}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      </CardBody>
    </Card>
  );
}
