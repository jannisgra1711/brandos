import { Suspense } from "react";
import type { Metadata } from "next";
import type { DiscoveryOpportunity, OpportunityKind } from "@/domain/types";
import { OpportunityCard } from "@/components/dashboard/opportunity-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Section } from "@/components/ui/section";
import { CardSkeletonGrid } from "@/components/ui/skeleton";
import { discoverOpportunities } from "@/server/services/discovery-service";

export const metadata: Metadata = {
  title: "Discovery",
  description: "Eigenständig erkannte Produktchancen mit Begründung.",
};

export const dynamic = "force-dynamic";

/**
 * Discovery.
 *
 * Der Nutzer soll nicht wissen müssen, wonach er suchen soll. Diese Seite
 * zeigt, was BrandOS von sich aus gefunden hat – gruppiert nach Art der
 * Chance, damit unterschiedliche Suchhaltungen bedient werden: wer eine
 * langfristige Nische sucht, liest andere Karten als wer einen Trend mitnehmen
 * will.
 */

const GROUPS: { kind: OpportunityKind; title: string; description: string }[] = [
  {
    kind: "trend",
    title: "Trends",
    description: "Märkte mit auffälliger Bewegung – zeitkritisch, aber mit Rückenwind.",
  },
  {
    kind: "niche",
    title: "Nischen",
    description: "Klar abgegrenzte Segmente mit eigener Zielgruppe.",
  },
  {
    kind: "seasonal",
    title: "Saisonale Chancen",
    description: "Anlassgetrieben – der Einstiegszeitpunkt entscheidet.",
  },
  {
    kind: "audience-product",
    title: "Zielgruppe × Produkt",
    description: "Kombinationen, die im Bestandsangebot unterversorgt sind.",
  },
  {
    kind: "evergreen",
    title: "Langfristige Märkte",
    description: "Konstante Nachfrage ohne Timing-Risiko.",
  },
  {
    kind: "unconventional",
    title: "Ungewöhnliche Kombinationen",
    description: "Wenig bedient und deshalb interessant – mit erhöhter Unsicherheit.",
  },
];

export default function DiscoveryPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Discovery"
        title="Chancen, nach denen du nicht gesucht hast"
        description="BrandOS sammelt Kandidaten aus allen aktiven Quellen, bewertet sie mit einem schlanken Signalsatz und begründet jede Empfehlung. Ein Klick startet die vollständige Analyse."
      />

      <Suspense fallback={<CardSkeletonGrid count={9} />}>
        <DiscoveryContent />
      </Suspense>
    </div>
  );
}

async function DiscoveryContent() {
  const opportunities = await discoverOpportunities({ limit: 24 });

  if (opportunities.length === 0) {
    return (
      <EmptyState
        title="Keine Kandidaten verfügbar"
        description="Derzeit liefert keine Quelle Vorschläge. Prüfe die Provider-Konfiguration unter /api/health."
      />
    );
  }

  const grouped = GROUPS.map((group) => ({
    ...group,
    items: opportunities.filter((o) => o.kind === group.kind),
  })).filter((group) => group.items.length > 0);

  // Kandidaten, deren Art in keiner Gruppe vorkommt, dürfen nicht verloren
  // gehen – sie landen gesammelt am Ende.
  const covered = new Set(grouped.flatMap((group) => group.items.map((item) => item.id)));
  const remaining = opportunities.filter((o) => !covered.has(o.id));

  return (
    <div className="animate-rise space-y-10">
      {grouped.map((group) => (
        <Section key={group.kind} title={group.title} description={group.description}>
          <Grid items={group.items} />
        </Section>
      ))}

      {remaining.length > 0 ? (
        <Section title="Weitere Kandidaten" description="Ohne eindeutige Zuordnung.">
          <Grid items={remaining} />
        </Section>
      ) : null}
    </div>
  );
}

function Grid({ items }: { items: DiscoveryOpportunity[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((opportunity) => (
        <OpportunityCard key={opportunity.id} opportunity={opportunity} />
      ))}
    </div>
  );
}
