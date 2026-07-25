import { de, deCompact, dePercent } from "@/domain/format";
import { round } from "@/domain/math";
import { generateIdeas } from "@/domain/ideas/idea-generator";
import { monthsUntilNextPeak } from "@/domain/scoring";
import type { Insight, MarketInterpretation, MarketSignals, OpportunityScore } from "@/domain/types";
import type { Analyst, InterpretationInput } from "./types";

/**
 * Regelbasierte Interpretation.
 *
 * Die Heuristik ist kein Platzhalter. Sie ist die Untergrenze der
 * Produktqualität: ohne API-Key, bei Modellausfall und in Tests liefert
 * BrandOS dieselbe Ergebnisstruktur – nur konservativer formuliert und mit
 * niedrigerer ausgewiesener Konfidenz.
 *
 * Alle Aussagen leiten sich direkt aus Signalen ab. Es gibt keine Formulierung
 * ohne zugrunde liegenden Wert.
 */
export const heuristicAnalyst: Analyst = {
  id: "heuristic",
  label: "Regelbasierte Analyse",
  isAvailable: () => true,

  async interpret(input: InterpretationInput): Promise<MarketInterpretation> {
    const { signals, score } = input;
    const insights = buildInsights(signals);

    return {
      summary: buildSummary(signals, score),
      verdict: buildVerdict(signals, score),
      insights,
      opportunities: score.drivers.length > 0 ? score.drivers : ["Keine ausgeprägten Stärken erkennbar."],
      risks: score.drags.length > 0 ? score.drags : ["Keine ausgeprägten Schwächen erkennbar."],
      recommendedActions: buildActions(signals, score),
      ideas: generateIdeas(signals, score, { count: input.ideaCount ?? 4 }),
      producedBy: { analyst: "heuristic", degraded: true },
    };
  },
};

// ---------------------------------------------------------------------------

function buildSummary(signals: MarketSignals, score: OpportunityScore): string {
  const term = signals.query.term;
  const parts: string[] = [];

  if (signals.demand) {
    const d = signals.demand;
    // Beide Horizonte nennen: eine Richtungsangabe ohne die Zahlen, auf denen
    // sie beruht, wirkt bei gegenläufigen Zeiträumen wie ein Widerspruch.
    const volume =
      d.estimatedMonthlySearches === undefined
        ? `liegt bei einem Nachfrageindex von ${de(d.volumeIndex)}/100`
        : `bewegt rund ${deCompact(d.estimatedMonthlySearches)} Suchanfragen pro Monat`;
    parts.push(
      `Der Markt "${term}" ${volume} und entwickelt sich insgesamt ${describeDirection(d.direction)} (${dePercent(d.growth90d)} in 90 Tagen, ${dePercent(d.growth12m)} im Jahresvergleich).`,
    );
  } else {
    parts.push(`Für "${term}" liegen keine belastbaren Nachfragedaten vor.`);
  }

  if (signals.competition) {
    const c = signals.competition;
    const saturation =
      c.saturationIndex === undefined
        ? ""
        : ` bei einer Sättigung von ${de(c.saturationIndex)}/100`;
    parts.push(
      `Auf der Angebotsseite stehen ${deCompact(c.listingCount)} Listings${saturation}; die Top 10 halten ${de(c.top10SharePct)} % des Marktes.`,
    );
  }

  parts.push(
    `Daraus ergibt sich ein Opportunity Score von ${de(score.value, 1)}/100 (Note ${score.grade}) bei einer Konfidenz von ${de(score.confidence * 100)} %.`,
  );

  return parts.join(" ");
}

function buildVerdict(signals: MarketSignals, score: OpportunityScore): string {
  const caveat =
    signals.dataQuality.syntheticShare > 0.5
      ? " Grundlage sind überwiegend synthetische Daten – vor einer Investition mit echten Quellen validieren."
      : "";

  if (score.value >= 75) {
    return `Klare Chance: Nachfrage und Wettbewerbslage stehen günstig zueinander, ein Einstieg ist jetzt vertretbar.${caveat}`;
  }
  if (score.value >= 60) {
    return `Tragfähiger Markt mit Einschränkungen: Ein Einstieg lohnt, wenn die unten genannten Bremsen adressiert werden.${caveat}`;
  }
  if (score.value >= 45) {
    return `Grenzfall: Der Markt funktioniert, bietet aber keinen strukturellen Vorteil – nur mit klarer Differenzierung sinnvoll.${caveat}`;
  }
  return `Zurückhaltung angeraten: Die Rahmenbedingungen sprechen aktuell gegen einen Einstieg.${caveat}`;
}

function buildInsights(signals: MarketSignals): Insight[] {
  const insights: Insight[] = [];
  const confidence = signals.dataQuality.confidence;

  // --- Nachfrage & Trend ----------------------------------------------------
  if (signals.demand) {
    const d = signals.demand;

    // `direction` ist die maßgebliche Trendaussage – sie berücksichtigt beide
    // Zeiträume. Aussagen, die nur einen Horizont betrachten, würden ihr
    // widersprechen und die Analyse unglaubwürdig machen.
    const diverging = Math.sign(d.growth90d) !== Math.sign(d.growth12m);

    const trend = {
      rising: {
        kind: "opportunity" as const,
        title: "Nachfrage zieht an",
        detail: `Der Markt wächst über beide Zeiträume hinweg (${dePercent(d.growth90d)} in 90 Tagen, ${dePercent(d.growth12m)} im Jahr). Ein Einstieg trifft auf Rückenwind.`,
      },
      declining: {
        kind: "risk" as const,
        title: "Nachfrage lässt nach",
        detail: `Die Nachfrage geht zurück (${dePercent(d.growth90d)} in 90 Tagen, ${dePercent(d.growth12m)} im Jahr). Ein Einstieg trifft auf einen schrumpfenden Markt.`,
      },
      volatile: {
        kind: "risk" as const,
        title: "Schwankende Nachfrage",
        detail: `Kurz- und Langfrist laufen auseinander (${dePercent(d.growth90d)} in 90 Tagen gegenüber ${dePercent(d.growth12m)} im Jahr). Planung auf Basis eines einzelnen Zeitraums ist hier riskant.`,
      },
      stable: {
        kind: "pattern" as const,
        title: "Stabile Nachfrage",
        detail: `Die Nachfrage bewegt sich in einem engen Band (${dePercent(d.growth90d)} in 90 Tagen, ${dePercent(d.growth12m)} im Jahr) – planbar, aber ohne Rückenwind.`,
      },
    }[d.direction];

    insights.push({
      kind: trend.kind,
      title: trend.title,
      detail: trend.detail,
      confidence: round(confidence, 2),
      evidence: [
        `Wachstum 90 Tage: ${dePercent(d.growth90d)}`,
        `Wachstum 12 Monate: ${dePercent(d.growth12m)}`,
        `Nachfrageindex: ${de(d.volumeIndex)}/100`,
      ],
    });

    // Gegenläufige Zeiträume sind selbst eine Erkenntnis – nicht ein
    // Darstellungsproblem, das man glätten sollte.
    if (diverging && d.direction !== "volatile") {
      insights.push({
        kind: "pattern",
        title: d.growth12m > 0 ? "Kurzfristige Delle im Aufwärtstrend" : "Kurzfristige Erholung im Abwärtstrend",
        detail:
          d.growth12m > 0
            ? `Über zwölf Monate wuchs der Markt um ${dePercent(d.growth12m)}, in den letzten 90 Tagen um ${dePercent(d.growth90d)}. Das kann Saisonalität sein – vor einer Entscheidung mit dem Saisonverlauf abgleichen.`
            : `Über zwölf Monate schrumpfte der Markt um ${dePercent(d.growth12m)}, zuletzt zeigt er ${dePercent(d.growth90d)}. Für eine Trendwende ist der Zeitraum zu kurz.`,
        confidence: round(confidence * 0.8, 2),
        evidence: [
          `Kurzfrist: ${dePercent(d.growth90d)}`,
          `Langfrist: ${dePercent(d.growth12m)}`,
        ],
      });
    }
  }

  // --- Wettbewerb -----------------------------------------------------------
  if (signals.competition) {
    const c = signals.competition;
    // Ohne Sättigungswert trägt der Top-10-Anteil die Aussage: er misst
    // dasselbe aus anderer Richtung – wie verteilt der Markt ist.
    const crowded =
      c.saturationIndex === undefined ? c.top10SharePct > 40 : c.saturationIndex > 70;
    const saturationPhrase =
      c.saturationIndex === undefined ? "" : `${de(c.saturationIndex)}/100 Sättigung und `;

    insights.push({
      kind: crowded ? "risk" : "opportunity",
      title: crowded ? "Markt ist dicht besetzt" : "Wettbewerb lässt Raum",
      detail: crowded
        ? `Bei ${saturationPhrase}einem Top-10-Anteil von ${de(c.top10SharePct)} % entscheidet die Sichtbarkeit, nicht das Produkt.`
        : `Mit ${saturationPhrase}einem Top-10-Anteil von ${de(c.top10SharePct)} % ist der Markt verteilt genug für neue Anbieter.`,
      confidence: round(confidence, 2),
      evidence: [
        `Listings: ${deCompact(c.listingCount)}`,
        ...(c.saturationIndex === undefined ? [] : [`Sättigung: ${de(c.saturationIndex)}/100`]),
        `Einstiegshürde: ${c.entryBarrier}`,
      ],
    });

    if (c.medianListingAgeDays !== undefined && c.medianListingAgeDays < 400) {
      insights.push({
        kind: "pattern",
        title: "Junges Bestandsangebot",
        detail: `Das Medianlisting ist ${Math.round(c.medianListingAgeDays)} Tage alt. Etablierte Anbieter haben noch keinen uneinholbaren Bewertungsvorsprung aufgebaut.`,
        confidence: round(confidence * 0.9, 2),
        evidence: [`Medianalter: ${Math.round(c.medianListingAgeDays)} Tage`],
      });
    }
  }

  // --- Zielgruppe -----------------------------------------------------------
  if (signals.audience) {
    const a = signals.audience;
    const topSegment = a.segments[0];
    const topMotive = a.motives[0];
    insights.push({
      kind: "audience",
      title: a.giftPotential > 70 ? "Geschenkgetriebener Markt" : "Kauf für den Eigenbedarf",
      detail:
        a.giftPotential > 70
          ? `Mit ${de(a.giftPotential)}/100 Geschenkeignung dominiert der Fremdkauf. Das erhöht die Preisakzeptanz und verschiebt die Nachfrage in Anlasszeiträume.`
          : `Bei ${de(a.giftPotential)}/100 Geschenkeignung kauft die Zielgruppe überwiegend für sich selbst – Nutzen und Identifikation schlagen Verpackung.`,
      confidence: round(confidence * 0.85, 2),
      evidence: [
        topSegment ? `Größtes Segment: ${topSegment.label} (${de(topSegment.share * 100)} %)` : "Keine Segmentierung",
        topMotive ? `Stärkstes Motiv: ${topMotive.label}` : "Keine Motive erkannt",
        `Emotionale Bindung: ${de(a.emotionalIntensity)}/100`,
      ],
    });
  }

  // --- Design ---------------------------------------------------------------
  const leadPalette = signals.design?.palettes[0];
  if (leadPalette) {
    insights.push({
      kind: "design",
      title:
        leadPalette.share > 0.4 ? "Eine Farbwelt dominiert" : "Visuell heterogener Markt",
      detail:
        leadPalette.share > 0.4
          ? `"${leadPalette.name}" prägt ${de(leadPalette.share * 100)} % des sichtbaren Angebots. Wer abweicht, fällt im Suchergebnis auf – riskiert aber, die Erwartung der Zielgruppe zu verfehlen.`
          : `Keine Farbwelt kommt über ${de(leadPalette.share * 100)} % Anteil. Der Markt ist gestalterisch offen, es gibt keine Pflichtästhetik.`,
      confidence: round(confidence * 0.75, 2),
      evidence: [
        `Führende Palette: ${leadPalette.name} (${leadPalette.colors.join(", ")})`,
        ...(signals.design?.motifs.slice(0, 2).map((m) => `Motiv "${m.motif}": ${de(m.frequency * 100)} %`) ?? []),
      ],
    });
  }

  // --- Timing ---------------------------------------------------------------
  if (signals.seasonality && signals.seasonality.amplitude >= 0.15) {
    const lead = monthsUntilNextPeak(new Date().getMonth() + 1, signals.seasonality.peakMonths);
    insights.push({
      kind: "timing",
      title: lead >= 2 && lead <= 4 ? "Vorbereitungsfenster ist offen" : "Timing ist ungünstig ausgerichtet",
      detail:
        lead >= 2 && lead <= 4
          ? `Bis zum Peak sind es ${lead} Monate – genug Zeit für Produktion, Listing-Reifung und organisches Ranking.`
          : lead <= 1
            ? "Der Peak steht unmittelbar bevor oder läuft bereits. Neue Listings ranken zu spät, um ihn mitzunehmen."
            : `Bis zum nächsten Peak sind es ${lead} Monate. Ein Einstieg jetzt bindet Kapital ohne kurzfristigen Rückfluss.`,
      confidence: round(confidence * 0.8, 2),
      evidence: [
        `Peak-Monate: ${signals.seasonality.peakMonths.join(", ")}`,
        `Saisonamplitude: ${de(signals.seasonality.amplitude * 100)} %`,
        // Nicht jede Quelle kennt den Anlass hinter dem Peak – Google Trends
        // etwa misst nur, dass ein Monat heraussticht. Eine Zeile "Treiber:"
        // ohne Inhalt sähe nach einem Darstellungsfehler aus.
        ...(signals.seasonality.drivers.length > 0
          ? [`Treiber: ${signals.seasonality.drivers.join(", ")}`]
          : []),
      ],
    });
  }

  // --- Keywords -------------------------------------------------------------
  const risingKeywords = signals.keywords.filter((k) => k.rising).slice(0, 3);
  if (risingKeywords.length > 0) {
    insights.push({
      kind: "opportunity",
      title: "Aufsteigende Suchbegriffe",
      detail: `${risingKeywords.length} Begriffe wachsen überdurchschnittlich. Sie sind noch weniger umkämpft als der Oberbegriff und eignen sich als Einstiegspunkt.`,
      confidence: round(confidence * 0.7, 2),
      evidence: risingKeywords.map(
        (k) => `"${k.term}": ${dePercent(k.growth90d)}, Wettbewerb ${de(k.competition)}/100`,
      ),
    });
  }

  // --- Datenqualität -------------------------------------------------------
  if (signals.dataQuality.confidence < 0.55) {
    insights.push({
      kind: "risk",
      title: "Eingeschränkte Datengrundlage",
      detail: `Nur ${signals.dataQuality.sourceCount} Quellen bei ${de(signals.dataQuality.coverage * 100)} % Abdeckung. Der Score ist eine Richtung, keine Entscheidungsgrundlage.`,
      confidence: 0.9,
      evidence: [
        `Quellen: ${signals.dataQuality.sourceCount}`,
        `Synthetischer Anteil: ${de(signals.dataQuality.syntheticShare * 100)} %`,
      ],
    });
  }

  return insights.slice(0, 8);
}

function buildActions(signals: MarketSignals, score: OpportunityScore): string[] {
  const actions: string[] = [];

  const rising = signals.keywords.filter((k) => k.rising).slice(0, 2);
  if (rising.length > 0) {
    actions.push(
      `Mit den wachsenden Nebenbegriffen starten (${rising.map((k) => `"${k.term}"`).join(", ")}) statt mit dem umkämpften Oberbegriff.`,
    );
  }

  if (signals.seasonality && signals.seasonality.amplitude >= 0.2) {
    const lead = monthsUntilNextPeak(new Date().getMonth() + 1, signals.seasonality.peakMonths);
    actions.push(
      lead >= 2 && lead <= 4
        ? `Listings innerhalb der nächsten ${Math.max(1, lead - 1)} Monate veröffentlichen, damit sie zum Peak gereift sind.`
        : "Den Einstieg auf zwei bis vier Monate vor dem nächsten Peak terminieren.",
    );
  }

  const topType = signals.productTypes[0];
  if (topType) {
    actions.push(
      `Mit "${topType.type}" testen – die Produktart trägt ${de(topType.share * 100)} % des Angebots und hat die niedrigste Erklärungshürde.`,
    );
  }

  if ((signals.competition?.saturationIndex ?? 0) > 70) {
    actions.push(
      "Vor Produktion ein Untersegment festlegen – im Oberbegriff ist organische Sichtbarkeit unrealistisch.",
    );
  }

  if (signals.dataQuality.syntheticShare > 0.5) {
    actions.push("Echte Datenquellen anbinden, bevor Budget gebunden wird.");
  }

  if (score.value < 45) {
    actions.push("Alternativen Markt prüfen – die Kennzahlen rechtfertigen keinen Einstieg.");
  }

  // Jede Maßnahme oben hängt an einem Signal. Liegt keines davon vor – etwa
  // ohne Keywords, Saisonalität und Produktarten –, bleibt die Liste leer.
  // Dann sagt sie das, statt als leerer Abschnitt in der Oberfläche zu
  // stehen. Dieselbe Behandlung wie bei Treibern und Bremsen.
  if (actions.length === 0) {
    return ["Aus den vorliegenden Signalen ergibt sich keine spezifische Maßnahme."];
  }

  return actions.slice(0, 6);
}

// ---------------------------------------------------------------------------

function describeDirection(direction: string): string {
  switch (direction) {
    case "rising":
      return "aufwärts";
    case "declining":
      return "abwärts";
    case "volatile":
      return "schwankend";
    default:
      return "stabil";
  }
}


