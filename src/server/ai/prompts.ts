import { de, dePercent } from "@/domain/format";
import type { MarketSignals, OpportunityScore } from "@/domain/types";

/**
 * Prompt-Aufbau.
 *
 * Das Modell erhält einen verdichteten Faktenbericht, kein Roh-JSON. Grund:
 * die Aufgabe ist Interpretation, nicht Parsing. Ein lesbarer Bericht mit
 * expliziten Einheiten liefert messbar stabilere Aussagen als eine
 * Objektstruktur – und macht im Fehlerfall sofort sichtbar, was das Modell
 * gesehen hat.
 *
 * Wichtig: Der Score wird dem Modell *mitgeteilt*, nicht von ihm berechnet.
 * Die Bewertung bleibt deterministisch (siehe domain/scoring).
 */

export const SYSTEM_PROMPT = `Du bist der Analyst von BrandOS, einer Research-Plattform für E-Commerce.

Deine Aufgabe: Marktdaten interpretieren und daraus Entscheidungen ableiten.

Grundregeln:
- Interpretiere, wiederhole nicht. Zahlen kennt der Nutzer bereits; er braucht ihre Bedeutung.
- Jede Aussage stützt sich auf ein konkretes Signal aus dem Bericht. Nenne es im Feld "evidence".
- Wenn die Datenlage dünn ist, sage das und senke die Konfidenz. Erfinde niemals Zahlen.
- Produktideen entstehen aus Kombination (Nische x Produktart x Zielgruppe x Emotion x Stil x Alleinstellungsmerkmal), nicht aus dem Nachbau bestehender Angebote.
- Der Opportunity Score ist bereits berechnet. Erkläre ihn, korrigiere ihn nicht.
- Schreibe auf Deutsch, sachlich und knapp. Keine Marketingsprache, keine Füllsätze.
- Widersprechen sich Quellen, benenne den Widerspruch, statt ihn zu glätten.`;

export function buildMarketBrief(
  signals: MarketSignals,
  score: OpportunityScore,
  ideaCount: number,
): string {
  const lines: string[] = [];
  const push = (line: string) => lines.push(line);

  push(`# Marktbericht: "${signals.query.term}"`);
  push(`Markt: ${signals.query.market ?? "DE"} | Erhoben: ${signals.collectedAt}`);
  push("");

  // --- Bewertung ------------------------------------------------------------
  push("## Opportunity Score (bereits berechnet)");
  push(`Gesamt: ${score.value}/100 (Note ${score.grade}), Konfidenz ${de(score.confidence * 100)} %`);
  for (const factor of score.factors) {
    push(
      `- ${factor.label}: ${factor.value}/100 (Gewicht ${de(factor.weight * 100)} %)` +
        `${factor.imputed ? " [geschätzt]" : ""} – ${factor.rationale}`,
    );
  }
  push("");

  // --- Nachfrage ------------------------------------------------------------
  if (signals.demand) {
    const d = signals.demand;
    push("## Nachfrage");
    push(`Geschätzte Suchanfragen/Monat: ${Math.round(d.estimatedMonthlySearches)}`);
    push(`Nachfrageindex: ${d.volumeIndex}/100 | Richtung: ${d.direction}`);
    push(`Wachstum 90 Tage: ${pct(d.growth90d)} | Wachstum 12 Monate: ${pct(d.growth12m)}`);
    push(`Verlauf (letzte 12 Monate): ${d.series.slice(-12).map((p) => `${p.period}=${p.value}`).join(", ")}`);
    push("");
  }

  // --- Saisonalität --------------------------------------------------------
  if (signals.seasonality) {
    const s = signals.seasonality;
    push("## Saisonalität");
    push(`Amplitude: ${de(s.amplitude * 100)} % | Peak-Monate: ${s.peakMonths.join(", ")}`);
    push(`Schwache Monate: ${s.lowMonths.join(", ")} | Treiber: ${s.drivers.join(", ")}`);
    push("");
  }

  // --- Wettbewerb -----------------------------------------------------------
  if (signals.competition) {
    const c = signals.competition;
    push("## Wettbewerb");
    push(`Listings: ${c.listingCount} | Aktive Anbieter: ${c.activeSellers}`);
    push(`Sättigung: ${c.saturationIndex}/100 | Top-10-Anteil: ${c.top10SharePct} %`);
    push(
      `Medianalter der Listings: ${c.medianListingAgeDays} Tage | Neuzugänge (30 T.): ${c.newListings30dPct} %`,
    );
    push(`Einstiegshürde: ${c.entryBarrier}`);
    push("");
  }

  // --- Preise ---------------------------------------------------------------
  if (signals.pricing) {
    const p = signals.pricing;
    push("## Preise");
    push(
      `Median ${p.median} ${p.currency} | Band ${p.p25}–${p.p75} ${p.currency} | Spanne ${p.min}–${p.max} ${p.currency}`,
    );
    push(`Durchschnittliche Bewertungen je Listing: ${p.avgReviewsPerListing}`);
    push("");
  }

  // --- Zielgruppe -----------------------------------------------------------
  if (signals.audience) {
    const a = signals.audience;
    push("## Zielgruppe & Kaufmotive");
    push(`Geschenkpotenzial: ${a.giftPotential}/100 | Emotionale Bindung: ${a.emotionalIntensity}/100`);
    for (const segment of a.segments) {
      push(`- Segment "${segment.label}": ${de(segment.share * 100)} % (${segment.evidence})`);
    }
    for (const motive of a.motives) {
      push(`- Motiv "${motive.label}" (${motive.kind}), Gewicht ${motive.weight}`);
    }
    push("");
  }

  // --- Produktarten ---------------------------------------------------------
  if (signals.productTypes.length > 0) {
    push("## Produktarten");
    for (const type of signals.productTypes) {
      push(
        `- ${type.type}: ${de(type.share * 100)} % Anteil, Medianpreis ${type.medianPrice}, Wachstum ${pct(type.growth90d)}`,
      );
    }
    push("");
  }

  // --- Design ---------------------------------------------------------------
  if (signals.design) {
    const d = signals.design;
    push("## Designmuster");
    for (const palette of d.palettes.slice(0, 3)) {
      push(`- Palette "${palette.name}" (${de(palette.share * 100)} %): ${palette.colors.join(", ")}`);
    }
    push(`- Typografie: ${d.typography.map((t) => `${t.style} (${de(t.share * 100)} %)`).join(", ")}`);
    push(
      `- Stile: ${d.illustrationStyles.map((s) => `${s.style} (${de(s.share * 100)} %)`).join(", ")}`,
    );
    push(`- Motive: ${d.motifs.map((m) => `${m.motif} (${de(m.frequency * 100)} %)`).join(", ")}`);
    push("");
  }

  // --- Keywords -------------------------------------------------------------
  if (signals.keywords.length > 0) {
    push("## Keywords");
    for (const keyword of signals.keywords.slice(0, 10)) {
      push(
        `- "${keyword.term}": Volumen ${keyword.volumeIndex}/100, Wachstum ${pct(keyword.growth90d)}, Wettbewerb ${keyword.competition}/100${keyword.rising ? " [steigend]" : ""}`,
      );
    }
    push("");
  }

  // --- Datenqualität -------------------------------------------------------
  const q = signals.dataQuality;
  push("## Datengrundlage");
  push(
    `Quellen: ${q.sourceCount} | Abdeckung: ${de(q.coverage * 100)} % | Synthetischer Anteil: ${de(q.syntheticShare * 100)} % | Konfidenz: ${de(q.confidence * 100)} %`,
  );
  for (const source of signals.sources) {
    push(
      `- ${source.label}: ${source.status}${source.message ? ` (${source.message})` : ""}`,
    );
  }
  push("");

  push("## Auftrag");
  push(
    [
      "Erstelle die Interpretation dieses Marktes.",
      `Liefere ${ideaCount} Produktideen.`,
      "Vier bis sieben Insights, jeweils mit Belegen aus dem Bericht.",
      q.syntheticShare > 0.5
        ? "Achtung: Die Daten sind überwiegend synthetisch. Formuliere entsprechend vorsichtig und weise im Verdict darauf hin."
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  );

  return lines.join("\n");
}

const pct = dePercent;
