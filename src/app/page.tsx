import { Suspense } from "react";
import { Activity, Compass, Gauge, Layers } from "lucide-react";
import { DataModeNotice } from "@/components/layout/data-mode-notice";
import { OpportunityCard } from "@/components/dashboard/opportunity-card";
import { TrendList } from "@/components/dashboard/trend-list";
import { AnalysisList } from "@/components/history/analysis-list";
import { SearchForm } from "@/components/research/search-form";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/ui/section";
import { CardSkeletonGrid, ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { formatDateTime, formatNumber } from "@/lib/format";
import { buildDashboard } from "@/server/services/dashboard-service";

/**
 * Dashboard.
 *
 * Beim Oeffnen muss sofort Mehrwert entstehen – auch ohne eine einzige eigene
 * Analyse. Deshalb speist sich die Seite primär aus Discovery und erst
 * nachrangig aus der Historie.
 *
 * Die Discovery-Auswertung dauert einige Sekunden. Sie liegt in einer eigenen
 * Suspense-Grenze, damit Kopfbereich und Suchfeld sofort bedienbar sind.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Übersicht"
        title="Was sich gerade bewegt"
        description="BrandOS wertet laufend Märkte aus und meldet, wo sich ein genauerer Blick lohnt. Oder untersuche direkt einen eigenen Begriff."
      />

      <SearchForm />

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const overview = await buildDashboard();

  return (
    <div className="animate-rise space-y-10">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Beobachtete Nischen"
          value={formatNumber(overview.stats.trackedNiches)}
          hint="im aktuellen Discovery-Durchlauf"
          icon={<Layers size={15} />}
        />
        <Stat
          label="Wachsende Märkte"
          value={formatNumber(overview.stats.risingMarkets)}
          hint="mit klar steigender Nachfrage"
          icon={<Activity size={15} />}
        />
        <Stat
          label="Ø Opportunity Score"
          value={formatNumber(overview.stats.avgOpportunityScore, 1)}
          hint="über alle bewerteten Kandidaten"
          icon={<Gauge size={15} />}
        />
        <Stat
          label="Eigene Analysen"
          value={formatNumber(overview.stats.analysesRun)}
          hint="in deiner Historie"
          icon={<Compass size={15} />}
        />
      </div>

      <Section
        title="Empfohlene Chancen"
        description="Nach Opportunity Score gereiht – jede Empfehlung nennt ihren Grund."
        action={
          <div className="flex items-center gap-3">
            <DataModeNotice mode={overview.dataMode} />
            <ButtonLink href="/discovery" size="sm">
              Alle ansehen
            </ButtonLink>
          </div>
        }
      >
        {overview.topOpportunities.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {overview.topOpportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        ) : (
          <CardSkeletonGrid count={3} />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Steigende Nachfrage"
          description="Märkte mit dem stärksten Zuwachs der letzten 90 Tage."
        >
          <TrendList
            movers={overview.risingTrends}
            metric="growth"
            emptyHint="Im aktuellen Durchlauf wächst kein Markt deutlich."
          />
        </Section>

        <Section
          title="Übersättigte Märkte"
          description="Hohe Angebotsdichte – ein Einstieg lohnt hier selten."
        >
          <TrendList
            movers={overview.saturatedMarkets}
            metric="demand"
            emptyHint="Keine auffällig übersättigten Märkte erkannt."
          />
        </Section>
      </div>

      {overview.seasonalWindows.length > 0 ? (
        <Section
          title="Saisonale Fenster"
          description="Kandidaten, deren Anlass in erreichbarer Nähe liegt."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {overview.seasonalWindows.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Zuletzt untersucht"
          action={
            <ButtonLink href="/history" variant="ghost" size="sm">
              Historie
            </ButtonLink>
          }
        >
          <AnalysisList
            analyses={overview.recentAnalyses}
            emptyDescription="Gib oben einen Begriff ein – die Analyse erscheint danach hier."
          />
        </Section>

        <Section title="Gespeicherte Analysen">
          <AnalysisList
            analyses={overview.savedAnalyses}
            emptyTitle="Nichts gespeichert"
            emptyDescription="Markiere eine Analyse als gespeichert, um sie hier festzuhalten."
          />
        </Section>
      </div>

      <p className="text-xs text-faint">Stand: {formatDateTime(overview.generatedAt)}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-card border border-border bg-surface px-5 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <CardSkeletonGrid count={6} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ListSkeleton />
        <ListSkeleton />
      </div>
    </div>
  );
}
