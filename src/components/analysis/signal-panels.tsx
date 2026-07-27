import type { MarketCategorySignal, MarketSignals } from "@/domain/types";
import { BarMeter, toneForScore } from "@/components/charts/bar-meter";
import { SeasonalityChart } from "@/components/charts/seasonality-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge, TrendBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  formatCompact,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatScore,
  monthName,
} from "@/lib/format";

/**
 * Die Signalansichten.
 *
 * Jede Karte rendert genau dann, wenn ihr Signal vorliegt. Fehlt eine Quelle,
 * fehlt die Karte – statt eine Fläche mit Nullwerten zu füllen, die eine
 * Aussage vortäuschen würde.
 */

export function DemandPanel({ signals }: { signals: MarketSignals }) {
  const demand = signals.demand;
  if (!demand) return null;

  return (
    <Card>
      <CardHeader
        title="Nachfrage"
        description="Volumen und Entwicklung über alle antwortenden Quellen."
        action={<TrendBadge direction={demand.direction} />}
      />
      <CardBody className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Fehlt das Absolutvolumen, bleibt die Kachel stehen und zeigt die
              Lücke, statt sie stillschweigend verschwinden zu lassen. */}
          <Metric
            label="Suchen / Monat"
            value={
              demand.estimatedMonthlySearches === undefined
                ? "—"
                : formatCompact(demand.estimatedMonthlySearches)
            }
          />
          <Metric label="Index" value={`${Math.round(demand.volumeIndex)} / 100`} />
          <Metric
            label="90 Tage"
            value={formatPercent(demand.growth90d)}
            tone={demand.growth90d >= 0 ? "positive" : "negative"}
          />
          <Metric
            label="12 Monate"
            value={formatPercent(demand.growth12m)}
            tone={demand.growth12m >= 0 ? "positive" : "negative"}
          />
        </div>

        <div className="rounded-lg border border-border bg-bg-subtle p-4">
          <Sparkline
            values={demand.series.map((p) => p.value)}
            tone={demand.direction === "declining" ? "negative" : "accent"}
            height={64}
            className="h-16"
          />
          <div className="mt-2 flex justify-between text-[10px] text-faint">
            <span>{demand.series[0]?.period}</span>
            <span>{demand.series.at(-1)?.period}</span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function SeasonalityPanel({
  signals,
  currentMonth,
}: {
  signals: MarketSignals;
  currentMonth: number;
}) {
  const seasonality = signals.seasonality;
  if (!seasonality) return null;

  return (
    <Card>
      <CardHeader
        title="Saisonalität"
        description={`Amplitude ${formatScore(seasonality.amplitude * 100)} – ${
          seasonality.amplitude < 0.15 ? "ganzjährig stabil" : "deutlich saisonabhängig"
        }.`}
      />
      <CardBody className="space-y-4 pt-4">
        <SeasonalityChart seasonality={seasonality} currentMonth={currentMonth} />
        <div className="flex flex-wrap gap-2">
          {seasonality.peakMonths.map((month) => (
            <Badge key={month} tone="accent">
              Peak: {monthName(month)}
            </Badge>
          ))}
          {seasonality.drivers.map((driver) => (
            <Badge key={driver}>{driver}</Badge>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

export function CompetitionPanel({ signals }: { signals: MarketSignals }) {
  const competition = signals.competition;
  if (!competition) return null;

  const barrier = { low: "niedrig", medium: "mittel", high: "hoch" }[competition.entryBarrier];

  return (
    <Card>
      <CardHeader
        title="Wettbewerb"
        description="Angebotsdichte, Konzentration und Einstiegshürde."
        action={
          <Badge tone={competition.entryBarrier === "high" ? "negative" : competition.entryBarrier === "medium" ? "warning" : "positive"}>
            Einstieg {barrier}
          </Badge>
        }
      />
      <CardBody className="space-y-4 pt-4">
        {/* Der Sättigungsbalken erscheint nur, wenn eine Quelle den Wert
            wirklich kennt. Ein Balken auf 0 läse sich als „unbesetzter
            Markt" – die Abwesenheit der Kachel ist ehrlicher. */}
        {competition.saturationIndex !== undefined && (
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Sättigung</span>
              <span className="text-sm font-medium tabular-nums text-text">
                {formatNumber(competition.saturationIndex)} / 100
              </span>
            </div>
            <BarMeter
              value={competition.saturationIndex}
              tone={toneForScore(100 - competition.saturationIndex)}
              className="mt-2"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Listings" value={formatCompact(competition.listingCount)} />
          <Metric
            label="Anbieter"
            value={
              competition.activeSellers === undefined
                ? "—"
                : formatCompact(competition.activeSellers)
            }
          />
          <Metric label="Top-10-Anteil" value={formatScore(competition.top10SharePct)} />
          <Metric
            label="Medianalter"
            value={
              competition.medianListingAgeDays === undefined
                ? "—"
                : `${formatNumber(competition.medianListingAgeDays)} T.`
            }
          />
        </div>

        {competition.newListings30dPct !== undefined && (
          <p className="text-xs text-muted">
            {formatNumber(competition.newListings30dPct, 1)} % der Listings sind in den letzten
            30 Tagen hinzugekommen.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function PricingPanel({ signals }: { signals: MarketSignals }) {
  const pricing = signals.pricing;
  if (!pricing) return null;

  const span = pricing.max - pricing.min || 1;
  const left = ((pricing.p25 - pricing.min) / span) * 100;
  const width = ((pricing.p75 - pricing.p25) / span) * 100;
  const medianPos = ((pricing.median - pricing.min) / span) * 100;

  return (
    <Card>
      <CardHeader title="Preise" description="Verteilung im Bestandsangebot." />
      <CardBody className="space-y-5 pt-4">
        <div>
          {/* Das mittlere Preisband ist die eigentliche Aussage – die Extreme
              dienen nur als Rahmen. */}
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-bg-subtle" />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent-soft"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
            <div
              className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-accent"
              style={{ left: `${medianPos}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-faint">
            <span>{formatCurrency(pricing.min, pricing.currency)}</span>
            <span className="font-medium text-text">
              Median {formatCurrency(pricing.median, pricing.currency)}
            </span>
            <span>{formatCurrency(pricing.max, pricing.currency)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Metric label="Unteres Viertel" value={formatCurrency(pricing.p25, pricing.currency)} />
          <Metric label="Oberes Viertel" value={formatCurrency(pricing.p75, pricing.currency)} />
          <Metric
            label="Ø Bewertungen"
            value={
              pricing.avgReviewsPerListing === undefined
                ? "—"
                : formatNumber(pricing.avgReviewsPerListing, 1)
            }
          />
        </div>
      </CardBody>
    </Card>
  );
}

export function AudiencePanel({ signals }: { signals: MarketSignals }) {
  const audience = signals.audience;
  if (!audience) return null;

  const MOTIVE_KIND = {
    emotional: "emotional",
    functional: "funktional",
    social: "sozial",
    identity: "Identität",
  } as const;

  return (
    <Card>
      <CardHeader title="Zielgruppe & Kaufmotive" description="Wer kauft – und warum." />
      <CardBody className="space-y-5 pt-4">
        <div className="grid grid-cols-2 gap-4">
          <Metric label="Geschenkpotenzial" value={formatScore(audience.giftPotential)} />
          <Metric label="Emotionale Bindung" value={formatScore(audience.emotionalIntensity)} />
        </div>

        <div className="space-y-3">
          {audience.segments.map((segment) => (
            <div key={segment.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-text">{segment.label}</span>
                <span className="text-xs tabular-nums text-muted">
                  {formatScore(segment.share * 100)}
                </span>
              </div>
              <BarMeter value={segment.share * 100} className="mt-1.5" />
              <p className="mt-1 text-xs text-faint">{segment.evidence}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {audience.motives.map((motive) => (
            <Badge key={motive.label} tone={motive.kind === "functional" ? "neutral" : "accent"}>
              {motive.label}
              <span className="opacity-70">· {MOTIVE_KIND[motive.kind]}</span>
            </Badge>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

export function DesignPanel({ signals }: { signals: MarketSignals }) {
  const design = signals.design;
  if (!design) return null;

  return (
    <Card>
      <CardHeader title="Designmuster" description="Was der Markt visuell bereits etabliert hat." />
      <CardBody className="space-y-5 pt-4">
        <div className="space-y-3">
          {design.palettes.map((palette) => (
            <div key={palette.name} className="flex items-center gap-3">
              <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                {palette.colors.map((color) => (
                  <span
                    key={color}
                    className="h-8 w-8"
                    style={{ background: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">{palette.name}</p>
                <BarMeter value={palette.share * 100} className="mt-1.5" />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {formatScore(palette.share * 100)}
              </span>
            </div>
          ))}
        </div>

        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-faint uppercase">Typografie</p>
            <ul className="mt-2 space-y-1">
              {design.typography.map((type) => (
                <li key={type.style} className="text-sm text-muted">
                  {type.style}{" "}
                  <span className="tabular-nums text-faint">{formatScore(type.share * 100)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-faint uppercase">Stile & Motive</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {design.illustrationStyles.map((style) => (
                <Badge key={style.style}>{style.style}</Badge>
              ))}
              {design.motifs.map((motif) => (
                <Badge key={motif.motif} tone="accent">
                  {motif.motif}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <ul className="space-y-1.5 border-t border-border pt-4">
          {design.observations.map((observation) => (
            <li key={observation} className="text-xs leading-relaxed text-muted">
              {observation}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function KeywordPanel({ signals }: { signals: MarketSignals }) {
  if (signals.keywords.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Suchbegriffe"
        description="Volumen gegen Wettbewerbsdruck – steigende Begriffe sind markiert."
      />
      <CardBody className="pt-2">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="px-5 py-2 font-medium">Begriff</th>
                <th className="px-3 py-2 text-right font-medium">Volumen</th>
                <th className="px-3 py-2 text-right font-medium">90 Tage</th>
                <th className="px-5 py-2 text-right font-medium">Wettbewerb</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {signals.keywords.map((keyword) => (
                <tr key={keyword.term}>
                  <td className="px-5 py-2.5">
                    <span className="text-text">{keyword.term}</span>
                    {keyword.rising ? (
                      <span className="ml-2 text-[10px] font-medium text-positive">steigend</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                    {Math.round(keyword.volumeIndex)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums ${
                      keyword.growth90d >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {formatPercent(keyword.growth90d)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                    {Math.round(keyword.competition)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

export function ProductTypePanel({ signals }: { signals: MarketSignals }) {
  if (signals.productTypes.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Produktarten" description="Womit der Markt aktuell bedient wird." />
      <CardBody className="space-y-3 pt-4">
        {signals.productTypes.map((type) => (
          <div key={type.type}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-text">{type.type}</span>
              <span className="text-xs tabular-nums text-muted">
                {formatCurrency(type.medianPrice)}
                {type.growth90d === undefined ? null : (
                  <>
                    {" · "}
                    <span className={type.growth90d >= 0 ? "text-positive" : "text-negative"}>
                      {formatPercent(type.growth90d)}
                    </span>
                  </>
                )}
              </span>
            </div>
            <BarMeter value={type.share * 100} className="mt-1.5" />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

const MARKETPLACE_LABEL: Partial<Record<MarketCategorySignal["marketplace"], string>> = {
  etsy: "Etsy",
  ebay: "eBay",
  amazon: "Amazon",
};

/**
 * Wo der Marktplatz den Begriff einsortiert.
 *
 * Bewusst ohne Bewertung: keine Note, keine Farbe nach gut/schlecht, kein
 * Eingang in den Score. Die Tafel beantwortet eine Frage – wo lande ich, wenn
 * ich hier einstelle – und hört danach auf.
 *
 * Die Namen bleiben englisch und unübersetzt. Es sind Etsys eigene
 * Bezeichnungen, dieselben, die im Kategorie-Auswahlfeld stehen; eingedeutscht
 * wären sie nicht mehr auffindbar.
 */
export function CategoryPanel({ signals }: { signals: MarketSignals }) {
  const category = signals.category;
  if (!category) return null;

  const marketplace = MARKETPLACE_LABEL[category.marketplace] ?? category.marketplace;
  const weak = category.distinctCategories - category.categories.length;

  return (
    <Card>
      <CardHeader
        title="Einordnung im Marktplatz"
        description={`Wohin ${marketplace} die Treffer sortiert – ${category.sampleSize} Listings ausgewertet.`}
        action={<Badge>beschreibend</Badge>}
      />
      <CardBody className="space-y-4 pt-4">
        <div className="space-y-3">
          {category.categories.map((entry) => (
            <div key={entry.path.join(" > ")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-text">{entry.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {formatScore(entry.share * 100)} · {entry.listings}
                </span>
              </div>
              <BarMeter value={entry.share * 100} className="mt-1.5" />
              {/* Der Pfad steht dabei, weil derselbe Blattname bei Etsy an
                  mehreren Stellen vorkommt – "Sports & Fitness" gibt es für
                  Erwachsene, Kinder und Herren getrennt. */}
              <p className="mt-1 text-xs text-faint">{entry.path.join(" › ")}</p>
            </div>
          ))}
        </div>

        <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
          {weak > 0 ? (
            <>
              Die Stichprobe berührte {category.distinctCategories} Kategorien;{" "}
              {category.categories.length} davon {category.categories.length === 1 ? "trägt" : "tragen"}{" "}
              mindestens 5 %. Der Rest sind Einzeltreffer der Relevanzsortierung.{" "}
            </>
          ) : null}
          Eine Kategorienzahl ist <strong>keine Produktvielfalt</strong>: {marketplace} teilt zuerst
          nach Zielgruppe, dann nach Produkt. Diese Angaben gehen deshalb in keinen Score-Faktor ein.
        </p>
      </CardBody>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-faint uppercase">{label}</p>
      <p
        className={`mt-0.5 text-sm font-medium tabular-nums ${
          tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
