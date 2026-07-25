import type { Metadata } from "next";
import { Search } from "lucide-react";
import { AnalysisList } from "@/components/history/analysis-list";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/ui/section";
import { listAnalyses } from "@/server/services/history-service";

export const metadata: Metadata = {
  title: "Historie",
  description: "Frühere Recherchen erneut öffnen und vergleichen.",
};

export const dynamic = "force-dynamic";

/**
 * Historie.
 *
 * Gespeicherte Analysen stehen oben: sie sind die bewusste Auswahl des
 * Nutzers, während die vollständige Liste chronologisch bleibt.
 */
export default async function HistoryPage() {
  const [saved, all] = await Promise.all([
    listAnalyses({ limit: 20, savedOnly: true }),
    listAnalyses({ limit: 50 }),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Historie"
        title="Frühere Analysen"
        description="Jede Analyse bleibt vollständig erhalten – inklusive Signalen, Score und Quellenprotokoll zum Zeitpunkt der Erhebung."
        action={
          <ButtonLink href="/research" variant="primary" size="sm">
            <Search size={15} />
            Neue Recherche
          </ButtonLink>
        }
      />

      {saved.length > 0 ? (
        <Section title="Gespeichert" description="Von dir markierte Analysen.">
          <AnalysisList analyses={saved} />
        </Section>
      ) : null}

      <Section title="Alle Analysen" description="Chronologisch, neueste zuerst.">
        <AnalysisList
          analyses={all}
          emptyTitle="Noch keine Analysen"
          emptyDescription="Untersuche einen Markt – das Ergebnis wird automatisch gesichert."
          emptyAction={
            <ButtonLink href="/research" size="sm">
              Recherche starten
            </ButtonLink>
          }
        />
      </Section>
    </div>
  );
}
