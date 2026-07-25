/**
 * Nischen-Lexikon für den synthetischen Datenmodus.
 *
 * Zweck: Mock-Daten sollen nicht "zufällig aussehen", sondern fachlich
 * plausibel sein. Ein Nutzer, der "Hunde" eingibt, muss Hundemotive,
 * Hundezielgruppen und realistische Preisbänder sehen – sonst ist das
 * Produkt im Mock-Modus nicht bewertbar.
 *
 * Das Lexikon ist reine Konfiguration. Sobald echte Provider angebunden sind,
 * wird es nur noch als Fallback für unbekannte Begriffe benötigt.
 */

export interface NicheProfile {
  key: string;
  label: string;
  category: string;
  /** Begriffe, die auf dieses Profil matchen (klein geschrieben). */
  match: string[];
  audiences: string[];
  motives: { label: string; kind: "emotional" | "functional" | "social" | "identity" }[];
  productTypes: string[];
  keywordModifiers: string[];
  motifs: string[];
  /** Basiswerte 0..100, werden pro Begriff leicht variiert. */
  giftPotential: number;
  emotionalIntensity: number;
  /** Typisches Preisniveau des Medianprodukts in EUR. */
  priceLevel: number;
  /** Monate (1..12) mit erhöhter Nachfrage. */
  peakMonths: number[];
  seasonDrivers: string[];
  /** Grundsättigung 0..100 – wie belegt der Markt typischerweise ist. */
  baseSaturation: number;
  palettes: { name: string; colors: string[] }[];
}

const GIFT_PALETTE = { name: "Warm Neutrals", colors: ["#E8DCC8", "#C8A882", "#8B6F47", "#3D2E1F"] };
const OUTDOOR_PALETTE = { name: "Forest Dusk", colors: ["#2C4A3B", "#6B8F71", "#D9CBA3", "#1B2B24"] };
const PASTEL_PALETTE = { name: "Soft Pastel", colors: ["#F6D5DC", "#CDE7DA", "#FDF3D8", "#8FA6B2"] };
const BOLD_PALETTE = { name: "High Contrast", colors: ["#111111", "#F5F5F5", "#E4572E", "#F3A712"] };
const RETRO_PALETTE = { name: "Retro Sunset", colors: ["#F4A259", "#BC4B51", "#5B8E7D", "#F4E285"] };
const MONO_PALETTE = { name: "Minimal Mono", colors: ["#1A1A1A", "#FFFFFF", "#9E9E9E", "#5C5C5C"] };

export const NICHE_PROFILES: NicheProfile[] = [
  {
    key: "dogs",
    label: "Hunde",
    category: "Haustiere",
    match: ["hund", "hunde", "dog", "welpe", "dackel", "labrador", "mops", "golden retriever"],
    audiences: [
      "Hundebesitzer 25–45",
      "Rassefans (Dackel, Mops, Labrador)",
      "Gassi-Community",
      "Tierheim-Unterstützer",
    ],
    motives: [
      { label: "Liebe zum eigenen Tier", kind: "emotional" },
      { label: "Zugehörigkeit zur Rasse-Community", kind: "identity" },
      { label: "Geschenk für Hundemenschen", kind: "social" },
      { label: "Alltagsnutzen (Gassi, Training)", kind: "functional" },
    ],
    productTypes: ["T-Shirt", "Hoodie", "Tasse", "Poster", "Tote Bag", "Sticker", "Halstuch"],
    keywordModifiers: ["mama", "papa", "geschenk", "rasse", "spruch", "personalisiert", "silhouette"],
    motifs: ["Rassesilhouette", "Pfotenabdruck", "Line-Art-Portrait", "Spruch-Typo", "Knochen"],
    giftPotential: 84,
    emotionalIntensity: 88,
    priceLevel: 24,
    peakMonths: [11, 12],
    seasonDrivers: ["Weihnachten", "Tag des Hundes"],
    baseSaturation: 74,
    palettes: [GIFT_PALETTE, MONO_PALETTE, PASTEL_PALETTE],
  },
  {
    key: "cats",
    label: "Katzen",
    category: "Haustiere",
    match: ["katze", "katzen", "cat", "kater", "mieze"],
    audiences: ["Katzenhalter 20–40", "Wohnungskatzen-Community", "Tierschutz-Spender"],
    motives: [
      { label: "Bindung zum Tier", kind: "emotional" },
      { label: "Humor / Selbstironie", kind: "identity" },
      { label: "Geschenk unter Freundinnen", kind: "social" },
    ],
    productTypes: ["T-Shirt", "Tasse", "Poster", "Sticker", "Kissen", "Notizbuch"],
    keywordModifiers: ["mama", "lustig", "spruch", "geschenk", "portrait", "minimalistisch"],
    motifs: ["Katzenkontur", "Schnurrhaare", "Sitzende Katze", "Sarkastische Typo"],
    giftPotential: 80,
    emotionalIntensity: 85,
    priceLevel: 22,
    peakMonths: [11, 12],
    seasonDrivers: ["Weihnachten", "Weltkatzentag"],
    baseSaturation: 76,
    palettes: [PASTEL_PALETTE, MONO_PALETTE, GIFT_PALETTE],
  },
  {
    key: "camping",
    label: "Camping",
    category: "Outdoor",
    match: ["camping", "camper", "zelt", "vanlife", "wohnmobil", "outdoor", "lagerfeuer"],
    audiences: [
      "Vanlife-Reisende 28–45",
      "Familien mit Wohnwagen",
      "Wochenend-Camper",
      "Festivalgänger",
    ],
    motives: [
      { label: "Freiheitsgefühl", kind: "emotional" },
      { label: "Lifestyle-Zugehörigkeit", kind: "identity" },
      { label: "Ausrüstung & Nutzen", kind: "functional" },
    ],
    productTypes: ["T-Shirt", "Hoodie", "Emaille-Tasse", "Poster", "Sticker", "Cap", "Handtuch"],
    keywordModifiers: ["vanlife", "abenteuer", "berge", "retro", "geschenk", "spruch", "wohnmobil"],
    motifs: ["Bergpanorama", "Bulli-Silhouette", "Lagerfeuer", "Kompass", "Retro-Badge"],
    giftPotential: 68,
    emotionalIntensity: 74,
    priceLevel: 27,
    peakMonths: [4, 5, 6],
    seasonDrivers: ["Saisonstart Frühjahr", "Sommerurlaub"],
    baseSaturation: 66,
    palettes: [OUTDOOR_PALETTE, RETRO_PALETTE, GIFT_PALETTE],
  },
  {
    key: "teacher",
    label: "Lehrer",
    category: "Beruf & Identität",
    match: ["lehrer", "lehrerin", "teacher", "schule", "grundschule", "erzieher", "kita"],
    audiences: [
      "Grundschullehrkräfte",
      "Referendare",
      "Eltern (Abschiedsgeschenk)",
      "Kollegien / Teams",
    ],
    motives: [
      { label: "Wertschätzung ausdrücken", kind: "social" },
      { label: "Berufsidentität", kind: "identity" },
      { label: "Humor über den Schulalltag", kind: "emotional" },
    ],
    productTypes: ["Tasse", "T-Shirt", "Tote Bag", "Notizbuch", "Sticker", "Schlüsselanhänger"],
    keywordModifiers: [
      "geschenk",
      "abschied",
      "danke",
      "lieblingslehrer",
      "personalisiert",
      "einschulung",
    ],
    motifs: ["Apfel", "Tafel-Typo", "Bleistift", "Handlettering", "Klassen-Icons"],
    giftPotential: 92,
    emotionalIntensity: 71,
    priceLevel: 19,
    peakMonths: [6, 7, 9],
    seasonDrivers: ["Schuljahresende", "Einschulung"],
    baseSaturation: 71,
    palettes: [GIFT_PALETTE, PASTEL_PALETTE, BOLD_PALETTE],
  },
  {
    key: "wedding",
    label: "Hochzeit",
    category: "Anlässe",
    match: ["hochzeit", "wedding", "braut", "brautpaar", "junggesellin", "trauzeuge", "verlobung"],
    audiences: [
      "Brautpaare 26–38",
      "Trauzeugen & Brautjungfern",
      "Hochzeitsgäste",
      "Hochzeitsplanerinnen",
    ],
    motives: [
      { label: "Einmaliger Anlass", kind: "emotional" },
      { label: "Gruppenzugehörigkeit (Team Braut)", kind: "social" },
      { label: "Personalisierung", kind: "identity" },
    ],
    productTypes: [
      "Personalisierter Druck",
      "T-Shirt",
      "Glas / Becher",
      "Gästebuch",
      "Schild",
      "Fächer",
    ],
    keywordModifiers: [
      "personalisiert",
      "namen",
      "datum",
      "boho",
      "eucalyptus",
      "minimalistisch",
      "gästebuch",
    ],
    motifs: ["Eukalyptus", "Handlettering", "Ringe", "Botanische Linien", "Monogramm"],
    giftPotential: 88,
    emotionalIntensity: 82,
    priceLevel: 34,
    peakMonths: [3, 4, 5],
    seasonDrivers: ["Planungsphase vor Hochzeitssaison", "Frühjahrstrauungen"],
    baseSaturation: 82,
    palettes: [
      { name: "Sage & Ivory", colors: ["#DDE5DA", "#A8BBA2", "#F7F3EC", "#5B6B58"] },
      GIFT_PALETTE,
      MONO_PALETTE,
    ],
  },
  {
    key: "motorcycle",
    label: "Motorrad",
    category: "Fahrzeuge",
    match: ["motorrad", "biker", "motorcycle", "chopper", "enduro", "cafe racer", "roller"],
    audiences: ["Biker 35–60", "Cafe-Racer-Szene", "Enduro-Fahrer", "Partner als Schenkende"],
    motives: [
      { label: "Szene-Identität", kind: "identity" },
      { label: "Freiheit & Adrenalin", kind: "emotional" },
      { label: "Technikstolz", kind: "functional" },
    ],
    productTypes: ["T-Shirt", "Hoodie", "Sticker", "Poster", "Cap", "Tasse"],
    keywordModifiers: ["vintage", "spruch", "geschenk", "cafe racer", "papa", "silhouette", "retro"],
    motifs: ["Motorrad-Silhouette", "Zahnrad", "Vintage-Badge", "Streckenprofil", "Helm"],
    giftPotential: 72,
    emotionalIntensity: 80,
    priceLevel: 26,
    peakMonths: [3, 4, 12],
    seasonDrivers: ["Saisonstart Frühjahr", "Weihnachten"],
    baseSaturation: 63,
    palettes: [BOLD_PALETTE, RETRO_PALETTE, MONO_PALETTE],
  },
  {
    key: "garden",
    label: "Garten",
    category: "Haus & Garten",
    match: ["garten", "pflanzen", "garden", "plant", "monstera", "urban gardening", "balkon"],
    audiences: ["Pflanzensammler 25–40", "Kleingärtner 45+", "Balkongärtner in Städten"],
    motives: [
      { label: "Entschleunigung", kind: "emotional" },
      { label: "Sammlerstolz", kind: "identity" },
      { label: "Praktische Hilfe (Schilder, Planer)", kind: "functional" },
    ],
    productTypes: ["Poster", "Pflanzschild", "Tote Bag", "Notizbuch", "Tasse", "Sticker"],
    keywordModifiers: ["botanisch", "vintage", "illustration", "geschenk", "kräuter", "planer"],
    motifs: ["Botanische Illustration", "Blattstruktur", "Gemüsebeet-Layout", "Handlettering"],
    giftPotential: 66,
    emotionalIntensity: 64,
    priceLevel: 21,
    peakMonths: [2, 3, 4],
    seasonDrivers: ["Aussaatplanung", "Frühjahrssaison"],
    baseSaturation: 59,
    palettes: [
      { name: "Botanical Green", colors: ["#3F5E45", "#8FAE86", "#EDE8DA", "#22331F"] },
      GIFT_PALETTE,
      PASTEL_PALETTE,
    ],
  },
  {
    key: "fishing",
    label: "Angeln",
    category: "Outdoor",
    match: ["angeln", "angler", "fishing", "fisch", "karpfen", "fliegenfischen"],
    audiences: ["Angler 30–65", "Karpfenangler-Szene", "Väter & Söhne"],
    motives: [
      { label: "Ruhe & Rückzug", kind: "emotional" },
      { label: "Szene-Humor", kind: "identity" },
      { label: "Geschenk für Väter", kind: "social" },
    ],
    productTypes: ["T-Shirt", "Cap", "Tasse", "Sticker", "Hoodie"],
    keywordModifiers: ["spruch", "lustig", "papa", "geschenk", "karpfen", "petri heil"],
    motifs: ["Fischsilhouette", "Angelrute", "Seeszene", "Spruch-Typo"],
    giftPotential: 74,
    emotionalIntensity: 68,
    priceLevel: 23,
    peakMonths: [3, 4, 5],
    seasonDrivers: ["Saisonstart", "Vatertag"],
    baseSaturation: 54,
    palettes: [OUTDOOR_PALETTE, RETRO_PALETTE, MONO_PALETTE],
  },
  {
    key: "yoga",
    label: "Yoga & Achtsamkeit",
    category: "Wellness",
    match: ["yoga", "meditation", "achtsamkeit", "mindfulness", "pilates", "wellness"],
    audiences: ["Yoga-Praktizierende 25–45", "Studio-Betreiberinnen", "Achtsamkeits-Einsteiger"],
    motives: [
      { label: "Selbstfürsorge", kind: "emotional" },
      { label: "Lebensstil zeigen", kind: "identity" },
      { label: "Praxisnutzen (Journal, Karten)", kind: "functional" },
    ],
    productTypes: ["Poster", "Journal", "Tote Bag", "Kartenset", "T-Shirt", "Tasse"],
    keywordModifiers: ["minimalistisch", "affirmation", "journal", "geschenk", "line art", "ritual"],
    motifs: ["Line-Art-Körper", "Mandala", "Affirmations-Typo", "Sonne / Mond"],
    giftPotential: 70,
    emotionalIntensity: 76,
    priceLevel: 25,
    peakMonths: [1, 9],
    seasonDrivers: ["Neujahrsvorsätze", "Herbst-Routine"],
    baseSaturation: 78,
    palettes: [
      { name: "Earth Calm", colors: ["#D9C7B4", "#A98F73", "#F3EDE4", "#4A403A"] },
      MONO_PALETTE,
      PASTEL_PALETTE,
    ],
  },
  {
    key: "baby",
    label: "Baby & Geburt",
    category: "Familie",
    match: ["baby", "geburt", "schwanger", "kleinkind", "taufe", "babyparty"],
    audiences: ["Werdende Eltern", "Großeltern als Schenkende", "Freundinnen zur Babyparty"],
    motives: [
      { label: "Neuer Lebensabschnitt", kind: "emotional" },
      { label: "Personalisierung mit Namen", kind: "identity" },
      { label: "Klassisches Geschenk", kind: "social" },
    ],
    productTypes: ["Body", "Poster", "Meilenstein-Karten", "Decke", "Lätzchen", "Tasse"],
    keywordModifiers: ["personalisiert", "name", "geburtsdaten", "meilenstein", "taufe", "boho"],
    motifs: ["Handlettering", "Tiere in Pastell", "Geburtsdaten-Layout", "Regenbogen"],
    giftPotential: 94,
    emotionalIntensity: 86,
    priceLevel: 26,
    peakMonths: [3, 4, 11],
    seasonDrivers: ["Frühjahrsgeburten", "Weihnachten"],
    baseSaturation: 80,
    palettes: [PASTEL_PALETTE, GIFT_PALETTE, MONO_PALETTE],
  },
  {
    key: "coffee",
    label: "Kaffee",
    category: "Food & Beverage",
    match: ["kaffee", "coffee", "espresso", "barista", "cafe"],
    audiences: ["Spezialitätenkaffee-Fans", "Büroteams", "Home-Barista"],
    motives: [
      { label: "Tägliches Ritual", kind: "emotional" },
      { label: "Kennerstolz", kind: "identity" },
      { label: "Bürohumor", kind: "social" },
    ],
    productTypes: ["Tasse", "T-Shirt", "Poster", "Sticker", "Schürze"],
    keywordModifiers: ["spruch", "lustig", "büro", "geschenk", "barista", "minimalistisch"],
    motifs: ["Tassen-Icon", "Bohnen-Muster", "Spruch-Typo", "Brühmethoden-Diagramm"],
    giftPotential: 78,
    emotionalIntensity: 62,
    priceLevel: 18,
    peakMonths: [11, 12],
    seasonDrivers: ["Weihnachten", "Wichteln"],
    baseSaturation: 84,
    palettes: [GIFT_PALETTE, MONO_PALETTE, RETRO_PALETTE],
  },
  {
    key: "gaming",
    label: "Gaming",
    category: "Digital & Kultur",
    match: ["gaming", "gamer", "zocken", "konsole", "esport", "retro gaming"],
    audiences: ["Gamer 16–34", "Retro-Gaming-Nostalgiker", "Streaming-Community"],
    motives: [
      { label: "Szene-Identität", kind: "identity" },
      { label: "Nostalgie", kind: "emotional" },
      { label: "Insider-Humor", kind: "social" },
    ],
    productTypes: ["T-Shirt", "Hoodie", "Poster", "Mauspad", "Sticker", "Tasse"],
    keywordModifiers: ["retro", "pixel", "spruch", "geschenk", "streamer", "setup"],
    motifs: ["Pixel-Art", "Controller-Silhouette", "Neon-Typo", "8-Bit-Muster"],
    giftPotential: 64,
    emotionalIntensity: 72,
    priceLevel: 24,
    peakMonths: [11, 12],
    seasonDrivers: ["Weihnachten", "Release-Zyklen"],
    baseSaturation: 81,
    palettes: [
      { name: "Neon Night", colors: ["#0F0F1A", "#7B61FF", "#00E5C0", "#FF3D81"] },
      BOLD_PALETTE,
      MONO_PALETTE,
    ],
  },
  {
    key: "hiking",
    label: "Wandern & Berge",
    category: "Outdoor",
    match: ["wandern", "hiking", "berge", "alpen", "trekking", "gipfel"],
    audiences: ["Wanderer 30–55", "Alpenvereins-Mitglieder", "Fernwanderer"],
    motives: [
      { label: "Naturerlebnis", kind: "emotional" },
      { label: "Leistungsstolz", kind: "identity" },
      { label: "Erinnerung an Touren", kind: "functional" },
    ],
    productTypes: ["Poster", "T-Shirt", "Emaille-Tasse", "Karte", "Sticker", "Cap"],
    keywordModifiers: ["gipfel", "personalisiert", "höhenprofil", "retro", "geschenk", "karte"],
    motifs: ["Höhenlinien", "Gipfelkreuz", "Retro-Nationalpark-Poster", "Topografie"],
    giftPotential: 71,
    emotionalIntensity: 75,
    priceLevel: 29,
    peakMonths: [4, 5, 6],
    seasonDrivers: ["Wandersaison", "Urlaubsplanung"],
    baseSaturation: 62,
    palettes: [OUTDOOR_PALETTE, RETRO_PALETTE, MONO_PALETTE],
  },
  {
    key: "nurse",
    label: "Pflege & Medizin",
    category: "Beruf & Identität",
    match: ["krankenschwester", "pflege", "nurse", "arzt", "ärztin", "hebamme", "rettungsdienst"],
    audiences: ["Pflegekräfte", "Auszubildende", "Teams auf Station", "Hebammen"],
    motives: [
      { label: "Berufsstolz", kind: "identity" },
      { label: "Anerkennung durch andere", kind: "social" },
      { label: "Galgenhumor im Schichtdienst", kind: "emotional" },
    ],
    productTypes: ["Tasse", "T-Shirt", "Schlüsselanhänger", "Notizbuch", "Sticker", "Badge Reel"],
    keywordModifiers: ["geschenk", "spruch", "examen", "danke", "personalisiert", "schicht"],
    motifs: ["EKG-Linie", "Stethoskop", "Spruch-Typo", "Anatomie-Icons"],
    giftPotential: 86,
    emotionalIntensity: 74,
    priceLevel: 20,
    peakMonths: [5, 9, 12],
    seasonDrivers: ["Tag der Pflege", "Examenszeit", "Weihnachten"],
    baseSaturation: 68,
    palettes: [PASTEL_PALETTE, MONO_PALETTE, BOLD_PALETTE],
  },
  {
    key: "craft",
    label: "Handwerk",
    category: "Beruf & Identität",
    match: ["handwerker", "tischler", "schreiner", "elektriker", "maurer", "dachdecker", "meister"],
    audiences: ["Handwerksbetriebe", "Azubis", "Partner als Schenkende"],
    motives: [
      { label: "Berufsstolz", kind: "identity" },
      { label: "Spruchkultur auf der Baustelle", kind: "emotional" },
      { label: "Geschenk zum Gesellenbrief", kind: "social" },
    ],
    productTypes: ["T-Shirt", "Hoodie", "Tasse", "Sticker", "Zollstock-Print", "Cap"],
    keywordModifiers: ["spruch", "geschenk", "meister", "geselle", "lustig", "personalisiert"],
    motifs: ["Werkzeug-Silhouette", "Zunftzeichen", "Bold-Typo", "Vintage-Badge"],
    giftPotential: 76,
    emotionalIntensity: 66,
    priceLevel: 25,
    peakMonths: [6, 7, 12],
    seasonDrivers: ["Gesellenprüfung", "Weihnachten"],
    baseSaturation: 57,
    palettes: [BOLD_PALETTE, RETRO_PALETTE, MONO_PALETTE],
  },
  {
    key: "horses",
    label: "Pferde",
    category: "Haustiere",
    match: ["pferd", "pferde", "reiten", "reiter", "horse", "reitsport", "pony"],
    audiences: ["Reiterinnen 14–35", "Stallgemeinschaften", "Eltern von Reitkindern"],
    motives: [
      { label: "Bindung zum Pferd", kind: "emotional" },
      { label: "Stall-Zugehörigkeit", kind: "identity" },
      { label: "Geschenk zum Turnier", kind: "social" },
    ],
    productTypes: ["T-Shirt", "Hoodie", "Tasse", "Poster", "Sticker", "Schabracke-Print"],
    keywordModifiers: ["personalisiert", "name", "geschenk", "spruch", "silhouette", "dressur"],
    motifs: ["Pferdekopf-Line-Art", "Hufeisen", "Dressur-Silhouette", "Handlettering"],
    giftPotential: 82,
    emotionalIntensity: 87,
    priceLevel: 24,
    peakMonths: [4, 11, 12],
    seasonDrivers: ["Turniersaison", "Weihnachten"],
    baseSaturation: 61,
    palettes: [GIFT_PALETTE, PASTEL_PALETTE, MONO_PALETTE],
  },
];

/** Fallback-Bausteine für Begriffe ausserhalb des Lexikons. */
export const GENERIC = {
  audiences: [
    "Enthusiasten 25–45",
    "Geschenkkäufer im Umfeld",
    "Einsteiger in das Thema",
    "Community auf Social Media",
  ],
  motives: [
    { label: "Persönliche Identifikation", kind: "identity" as const },
    { label: "Geschenkanlass", kind: "social" as const },
    { label: "Emotionale Verbindung zum Thema", kind: "emotional" as const },
    { label: "Praktischer Nutzen", kind: "functional" as const },
  ],
  productTypes: ["T-Shirt", "Tasse", "Poster", "Sticker", "Hoodie", "Tote Bag", "Notizbuch"],
  keywordModifiers: [
    "geschenk",
    "spruch",
    "personalisiert",
    "lustig",
    "minimalistisch",
    "vintage",
    "set",
  ],
  motifs: ["Typografie-Statement", "Minimalistische Line-Art", "Vintage-Badge", "Icon-Muster"],
  palettes: [GIFT_PALETTE, MONO_PALETTE, RETRO_PALETTE, PASTEL_PALETTE, BOLD_PALETTE],
};

export const TYPOGRAPHY_STYLES = [
  { style: "Serif klassisch", note: "wirkt hochwertig, funktioniert bei Geschenkartikeln" },
  { style: "Sans-Serif geometrisch", note: "neutral, breit einsetzbar" },
  { style: "Handlettering / Script", note: "emotional, stark bei personalisierten Produkten" },
  { style: "Bold Condensed", note: "auffällig, dominiert im Thumbnail" },
  { style: "Retro Slab", note: "nostalgisch, starke Wiedererkennung" },
];

export const ILLUSTRATION_STYLES = [
  "Minimal Line Art",
  "Flat Vector",
  "Vintage / Distressed",
  "Aquarell",
  "Typografie-only",
  "Hand-drawn Sketch",
  "Retro Badge",
];

/** Findet das passende Profil zu einem Suchbegriff. */
export function matchNiche(term: string): NicheProfile | undefined {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return undefined;

  // Direkter Treffer schlägt Teilstring-Treffer, damit "hundeleine" nicht
  // zufällig vor "hund" auf ein schwächeres Profil fällt.
  const exact = NICHE_PROFILES.find((p) => p.match.includes(normalized));
  if (exact) return exact;

  return NICHE_PROFILES.find((p) =>
    p.match.some((m) => normalized.includes(m) || m.includes(normalized)),
  );
}
