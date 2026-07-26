import type { OpportunityKind } from "@/domain/types";

/**
 * Kandidaten-Universum für die eigenständige Chancensuche.
 *
 * Discovery beginnt immer mit einer Menge möglicher Märkte. Solange keine
 * echte Quelle aufsteigende Begriffe liefert, kommt diese Menge aus einer
 * kuratierten Liste. Die Bewertung selbst ist identisch – nur die Herkunft der
 * Kandidaten ändert sich, wenn echte Provider `discover()` implementieren.
 */

export interface SeedCandidate {
  term: string;
  category: string;
  kind: OpportunityKind;
  hint: string;
}

export const DISCOVERY_SEEDS: SeedCandidate[] = [
  // --- Haustiere -----------------------------------------------------------
  { term: "Dackel", category: "Haustiere", kind: "niche", hint: "Rassespezifische Nachfrage wächst schneller als der Oberbegriff" },
  { term: "Katzen Senioren", category: "Haustiere", kind: "unconventional", hint: "Alternde Haustierpopulation, kaum spezialisiertes Angebot" },
  { term: "Hundetrainer", category: "Haustiere", kind: "audience-product", hint: "Berufsgruppe mit eigener Identität, wenig bedient" },
  { term: "Pferde Dressur", category: "Haustiere", kind: "niche", hint: "Hohe Zahlungsbereitschaft in der Turnierszene" },

  // --- Outdoor -------------------------------------------------------------
  { term: "Bikepacking", category: "Outdoor", kind: "trend", hint: "Starkes Wachstum in Community-Diskussionen" },
  { term: "Vanlife Ausbau", category: "Outdoor", kind: "trend", hint: "Wachsender Selbstausbau-Markt" },
  { term: "Wandern Höhenprofil", category: "Outdoor", kind: "audience-product", hint: "Personalisierbares Produkt mit klarer Zielgruppe" },
  { term: "Wintercamping", category: "Outdoor", kind: "seasonal", hint: "Saisonal unterversorgtes Segment" },
  { term: "Angeln Karpfen", category: "Outdoor", kind: "niche", hint: "Loyale Szene mit eigener Sprache" },

  // --- Beruf & Identität --------------------------------------------------
  { term: "Erzieherin Abschied", category: "Beruf & Identität", kind: "seasonal", hint: "Klarer Anlasskauf zum Kita-Jahresende" },
  { term: "Hebamme", category: "Beruf & Identität", kind: "audience-product", hint: "Emotionale Berufsgruppe, kleines Angebot" },
  { term: "Rettungsdienst", category: "Beruf & Identität", kind: "niche", hint: "Starke Berufsidentität, Spruchkultur" },
  { term: "Handwerker Meister", category: "Beruf & Identität", kind: "evergreen", hint: "Konstante Anlasskäufe zur Prüfung" },
  { term: "Lehrer Referendariat", category: "Beruf & Identität", kind: "audience-product", hint: "Übergangsphase mit eigenem Geschenkanlass" },

  // --- Anlässe ------------------------------------------------------------
  { term: "Standesamt Trauung", category: "Anlässe", kind: "niche", hint: "Kleinere Feiern als eigenständiger Markt" },
  { term: "Einschulung Geschwister", category: "Anlässe", kind: "seasonal", hint: "Nebenzielgruppe mit wenig Angebot" },
  { term: "Silberhochzeit", category: "Anlässe", kind: "evergreen", hint: "Stabile Nachfrage, geringe Konkurrenzdichte" },
  { term: "Ruhestand Abschied", category: "Anlässe", kind: "audience-product", hint: "Hohe Zahlungsbereitschaft bei Kollegiengeschenken" },
  { term: "Baby Meilensteine", category: "Familie", kind: "evergreen", hint: "Wiederkehrender Bedarf mit Personalisierung" },

  // --- Wellness & Lifestyle ------------------------------------------------
  { term: "Achtsamkeit Journal", category: "Wellness", kind: "trend", hint: "Wachsender Selfcare-Markt mit Produktvielfalt" },
  { term: "Menopause", category: "Wellness", kind: "unconventional", hint: "Tabuthema mit steigender Sichtbarkeit und wenig Angebot" },
  { term: "Schlaf Routine", category: "Wellness", kind: "trend", hint: "Steigendes Interesse an Schlafqualität" },
  { term: "Laufen Marathon", category: "Sport", kind: "seasonal", hint: "Anlassgetrieben durch Veranstaltungskalender" },
  { term: "Padel", category: "Sport", kind: "trend", hint: "Schnell wachsende Sportart mit dünnem Angebot" },
  { term: "Bouldern", category: "Sport", kind: "niche", hint: "Junge, gestaltungsaffine Community" },

  // --- Haus & Garten -------------------------------------------------------
  { term: "Hochbeet Planung", category: "Haus & Garten", kind: "seasonal", hint: "Planungsphase vor der Gartensaison" },
  { term: "Zimmerpflanzen Pflege", category: "Haus & Garten", kind: "evergreen", hint: "Konstante Nachfrage mit Informationsbedarf" },
  { term: "Kräuterbeet", category: "Haus & Garten", kind: "niche", hint: "Praktische Produkte mit klarem Nutzen" },
  { term: "Imkerei", category: "Haus & Garten", kind: "unconventional", hint: "Kleine, hoch engagierte Zielgruppe" },

  // --- Kultur & Digital ----------------------------------------------------
  { term: "Retro Gaming", category: "Digital & Kultur", kind: "evergreen", hint: "Nostalgie trägt konstante Nachfrage" },
  { term: "Brettspiele", category: "Digital & Kultur", kind: "niche", hint: "Wachsende Szene mit Sammlermentalität" },
  { term: "Buchliebhaber", category: "Digital & Kultur", kind: "evergreen", hint: "Große, geschenkaffine Zielgruppe" },
  { term: "Vinyl Sammler", category: "Digital & Kultur", kind: "niche", hint: "Hohe Identifikation, Premium-Bereitschaft" },
  { term: "Podcast Host", category: "Digital & Kultur", kind: "unconventional", hint: "Neue Berufsgruppe ohne etabliertes Angebot" },

  // --- Food ----------------------------------------------------------------
  { term: "Sauerteig", category: "Food & Beverage", kind: "trend", hint: "Anhaltendes Interesse am Selbstbacken" },
  { term: "Grillen BBQ", category: "Food & Beverage", kind: "seasonal", hint: "Klarer Sommerpeak mit Vaterschaftsbezug" },
  { term: "Kaffee Barista", category: "Food & Beverage", kind: "niche", hint: "Kennerszene mit Ausrüstungsaffinität" },
  { term: "Weinliebhaber", category: "Food & Beverage", kind: "evergreen", hint: "Geschenkstark mit hoher Preisakzeptanz" },

  // --- Fahrzeuge -----------------------------------------------------------
  { term: "Cafe Racer", category: "Fahrzeuge", kind: "niche", hint: "Ästhetikgetriebene Szene mit Designfokus" },
  { term: "Oldtimer", category: "Fahrzeuge", kind: "evergreen", hint: "Ältere Zielgruppe mit hoher Kaufkraft" },
  { term: "E-Bike Touren", category: "Fahrzeuge", kind: "trend", hint: "Stark wachsende Nutzergruppe 50+" },
  { term: "Traktor Landwirtschaft", category: "Fahrzeuge", kind: "unconventional", hint: "Unterschätzte Zielgruppe mit starker Identität" },
];

/**
 * Wählt eine deterministische Tagesauswahl aus dem Kandidatenpool.
 * Dieselbe Auswahl innerhalb eines Tages hält das Dashboard stabil, ohne
 * dass es über Wochen identisch bleibt.
 */
export function selectSeeds(count: number, offset = 0): SeedCandidate[] {
  const total = DISCOVERY_SEEDS.length;
  const take = Math.min(count, total);
  return Array.from({ length: take }, (_, i) => {
    const index = (offset + i * 7) % total;
    return DISCOVERY_SEEDS[index] as SeedCandidate;
  });
}
