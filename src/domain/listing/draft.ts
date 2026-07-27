import { ETSY_LIMITS } from "@/domain/types";
import type {
  ListingDraft,
  ListingFieldBasis,
  MarketSignals,
  ProductProject,
  SourceId,
} from "@/domain/types";

/**
 * Der regelbasierte Listing-Entwurf.
 *
 * Er nimmt dem Verkäufer das Blatt-Papier-Problem ab, nicht das Denken: Was
 * hier entsteht, ist ein Ausgangspunkt zum Überschreiben, kein fertiger Text.
 *
 * **Was gemessen ist und was nicht.** Von den Signalen, die ein Listing
 * brauchen könnte, sind heute nur zwei erhoben:
 *
 * | Feld | Grundlage | Status |
 * |---|---|---|
 * | Kategorie | Etsys Taxonomie | **gemessen** |
 * | Preis | Etsy + eBay, Perzentile | **gemessen** |
 * | Titel, Tags | Suchbegriff + Bausteine des Vorhabens | abgeleitet |
 * | Beschreibung | – | fehlt, braucht ein Modell |
 *
 * **`signals.keywords` wird bewusst nicht verwendet.** Die Capability liefern
 * ausschliesslich Mocks (reddit, pinterest, tiktok) – gegen `/api/health`
 * geprüft. Etsy-Tags daraus zu bauen hiesse, ein Listing mit erfundenen
 * Suchbegriffen auszuzeichnen, und zwar unsichtbar: Im fertigen Entwurf sähe
 * ein erfundener Tag genauso aus wie ein gemessener. Sobald eine echte
 * Keyword-Quelle existiert, ist das hier die Stelle.
 *
 * Jedes Feld führt mit, woraus es entstand (`basis`). Ohne das wäre der
 * Entwurf genau die Sorte selbstbewusster Ausgabe, die dieses Produkt
 * vermeiden soll.
 */

export interface DraftInput {
  project: ProductProject;
  /** Die Signale der Ursprungsanalyse. Fehlen, wenn sie gelöscht wurde. */
  signals?: MarketSignals;
  now?: Date;
}

/** Trennt Kopf und Zusätze im Titel. */
const TITLE_SEPARATOR = " – ";

/**
 * Wörter, die als Tag nichts einbringen.
 *
 * Bewusst kurz gehalten: Eine grosse Stoppwortliste würde irgendwann einen
 * echten Suchbegriff schlucken. Hier stehen nur Funktionswörter, die allein
 * stehend nie ein Markt sind.
 */
const STOPWORDS = new Set([
  "und", "oder", "mit", "für", "fuer", "der", "die", "das", "den", "dem",
  "ein", "eine", "einen", "einem", "aus", "von", "vom", "im", "in", "am",
  "an", "auf", "zum", "zur", "bei", "als", "the", "and", "for", "with",
]);

/** Welche Währung ein Markt erwartet. Nur zum Erkennen von Abweichungen. */
const MARKET_CURRENCY: Record<string, string> = {
  DE: "EUR",
  AT: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  GB: "GBP",
  US: "USD",
  CH: "CHF",
};

export function buildListingDraft(input: DraftInput): ListingDraft {
  const { project, signals } = input;
  const now = input.now ?? new Date();

  const title = buildTitle(project);
  const tags = buildTags(project);
  const category = buildCategory(signals);
  const price = buildPrice(project, signals);

  const basis: ListingDraft["basis"] = {
    title: {
      rationale:
        "Aus dem Suchbegriff und den Bausteinen des Vorhabens zusammengesetzt – nicht aus gemessenen Suchdaten.",
      sources: [],
      synthetic: false,
    },
    tags: {
      rationale:
        "Aus Suchbegriff und Bausteinen abgeleitet. Es gibt derzeit keine gemessene Keyword-Quelle; erfundene Tags wären hier gefährlicher als wenige.",
      sources: [],
      synthetic: false,
    },
  };

  if (category) basis.category = categoryBasis(signals);
  if (price) basis.price = priceBasis(project, signals, price.currency);

  return {
    title,
    tags,
    category: category ?? undefined,
    price: price ?? undefined,
    // Bleibt leer, bis ein Modell konfiguriert ist. Siehe Kopfkommentar.
    description: undefined,
    basis,
    generatedAt: now.toISOString(),
  };
}

// --- Titel -----------------------------------------------------------------

/**
 * Der Suchbegriff steht vorn.
 *
 * Etsy gewichtet den Titelanfang stärker, und ein Käufer liest in der
 * Ergebnisliste ohnehin nur die ersten Wörter. Die Zusätze werden von hinten
 * gekürzt, bis die 140 Zeichen passen – so verschwindet Beiwerk, nie der Kern.
 */
export function buildTitle(project: ProductProject): string {
  const { composition, term } = project;

  const head = containsWord(term, composition.productType)
    ? term
    : `${term} ${composition.productType}`;

  const extras = [composition.differentiator, `für ${composition.audience}`].filter(
    (part) => part.trim().length > 0,
  );

  for (let count = extras.length; count > 0; count -= 1) {
    const candidate = `${head}${TITLE_SEPARATOR}${extras.slice(0, count).join(", ")}`;
    if (candidate.length <= ETSY_LIMITS.titleMaxLength) return candidate;
  }

  // Selbst der Kopf allein kann zu lang sein – dann bleibt nur das Kürzen,
  // und zwar an einer Wortgrenze statt mitten im Wort.
  return head.length <= ETSY_LIMITS.titleMaxLength ? head : cutAtWord(head, ETSY_LIMITS.titleMaxLength);
}

// --- Tags ------------------------------------------------------------------

/**
 * Kandidaten in absteigender Nützlichkeit.
 *
 * Zu lange Tags werden **verworfen, nicht gekürzt**: „personalisierte Emai"
 * ist kein Suchbegriff, sondern Müll, und in einem Listing fällt es niemandem
 * auf ausser dem Algorithmus.
 *
 * **Mehrwortige Bausteine werden nicht zerlegt.** Aus „Personalisierung mit
 * Namen oder Daten" entstünden sonst die Tags „oder" und „Daten" – gegen die
 * echte API geprüft und genau so herausgekommen. Etsy gibt dreizehn Plätze;
 * einen davon an ein Bindewort zu vergeben ist teurer, als ihn frei zu lassen.
 * Zerlegt wird allein der Suchbegriff, denn den hat der Verkäufer selbst
 * gewählt.
 */
export function buildTags(project: ProductProject): string[] {
  const { composition, term } = project;

  const termWords = term
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word.toLowerCase()));

  const candidates = [
    term,
    composition.productType,
    `${term} ${composition.productType}`,
    composition.differentiator,
    composition.style,
    composition.audience,
    `${composition.productType} Geschenk`,
    `${term} Geschenk`,
    ...termWords,
  ];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of candidates) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (tag.length === 0 || tag.length > ETSY_LIMITS.tagMaxLength) continue;

    // Nur zum Vergleichen kleingeschrieben – ausgegeben wird die Originalform.
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    tags.push(tag);
    if (tags.length === ETSY_LIMITS.maxTags) break;
  }

  return tags;
}

// --- Kategorie und Preis ---------------------------------------------------

function buildCategory(signals?: MarketSignals): ListingDraft["category"] {
  const leading = signals?.category?.categories[0];
  if (!leading) return undefined;
  return { name: leading.name, path: leading.path };
}

function categoryBasis(signals?: MarketSignals): ListingFieldBasis {
  const category = signals?.category;
  const leading = category?.categories[0];
  const share = leading ? Math.round(leading.share * 100) : 0;

  return {
    rationale: `Gemessen: ${share} % der Etsy-Treffer zu diesem Begriff liegen in dieser Kategorie (${leading?.listings ?? 0} von ${category?.sampleSize ?? 0} Listings).`,
    sources: signals?.provenance?.category?.sources ?? ["etsy"],
    synthetic: (signals?.provenance?.category?.syntheticShare ?? 0) > 0,
  };
}

/**
 * Der Median der sichtbaren Konkurrenz.
 *
 * Nicht das untere Viertel: Ein Neueinsteiger, der sich unter den Markt setzt,
 * verkauft nicht mehr, sondern signalisiert weniger Wert. Der Median ist die
 * Mitte, an der ein Käufer nichts Ungewöhnliches bemerkt – der bewusste
 * Abstand nach oben oder unten ist eine Entscheidung des Verkäufers.
 */
function buildPrice(
  project: ProductProject,
  signals?: MarketSignals,
): ListingDraft["price"] {
  const pricing = signals?.pricing;
  if (pricing) {
    return { value: round2(pricing.median), currency: pricing.currency };
  }

  const { min, max, currency } = project.suggestedPriceRange;
  if (min <= 0 && max <= 0) return undefined;
  return { value: round2((min + max) / 2), currency };
}

function priceBasis(
  project: ProductProject,
  signals: MarketSignals | undefined,
  currency: string,
): ListingFieldBasis {
  const pricing = signals?.pricing;

  // Etsys Leitwährung ist die häufigste der Trefferliste, nicht die des
  // Marktes. Für einen deutschen Shop kann das Pfund herauskommen – ohne
  // Kurse wäre jede Umrechnung erfunden, also wird es benannt statt behoben.
  const expected = MARKET_CURRENCY[project.market];
  const mismatch =
    expected && expected !== currency
      // Kein Markdown: Der Text wird als reiner Text gerendert, Sternchen
      // stünden sichtbar in der Oberfläche.
      ? ` Achtung: Der Markt ${project.market} rechnet in ${expected}, die Messung kam in ${currency} zurück – vor dem Einstellen umrechnen.`
      : "";

  if (!pricing) {
    return {
      rationale: `Mitte des Preiskorridors der übernommenen Idee – die Ursprungsanalyse ist nicht mehr verfügbar.${mismatch}`,
      sources: [],
      synthetic: false,
    };
  }

  return {
    rationale: `Median der sichtbaren Konkurrenz (${fmt(pricing.p25)}–${fmt(pricing.p75)} ${currency} im mittleren Preisband).${mismatch}`,
    sources: signals?.provenance?.pricing?.sources ?? ([] as SourceId[]),
    synthetic: (signals?.provenance?.pricing?.syntheticShare ?? 0) > 0,
  };
}

// --- Hilfsmittel -----------------------------------------------------------

/** Steht `needle` bereits als eigenes Wort in `haystack`? */
function containsWord(haystack: string, needle: string): boolean {
  const words = new Set(haystack.toLowerCase().split(/\s+/));
  return needle
    .toLowerCase()
    .split(/\s+/)
    .every((word) => words.has(word));
}

function cutAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmt(value: number): string {
  return value.toFixed(2).replace(".", ",");
}
