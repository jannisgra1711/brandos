# Handoff: BrandOS — von synthetisch zu echt

**Generated**: 2026-07-26
**Branch**: `main`, Working Tree sauber, synchron mit `origin/main` (`b934d52`)
**Remote**: https://github.com/jannisgra1711/brandos — **öffentlich**
**Status**: Ready for Review — lauffähig, gebaut, 169 Tests grün. Zwei echte Datenquellen live.

## Goal

Eine KI-gestützte Research-Plattform für E-Commerce, die Marktsignale sammelt, mit
einem nachvollziehbaren Opportunity Score bewertet, interpretiert und daraus
Produktideen ableitet. Oberfläche und Inhalte auf Deutsch. **Privates
Einzelplatz-Werkzeug**, kein gehosteter Dienst — das ist für die API-Anträge
relevant (siehe *Setup Required*).

Die vorige Sitzung baute das Produkt auf synthetischen Daten. Diese Sitzung hat
die ersten echten Quellen angebunden.

## Completed

### Diese Sitzung

- [x] **Repository veröffentlicht** — GitHub, öffentlich, mit englischem
      Projektabschnitt im README als Homepage für den Etsy-Antrag
- [x] **Google Trends live** (SerpAPI) — `demand` + `seasonality`, ein Abruf je
      Analyse über fünf Jahre
- [x] **eBay live** (SerpAPI) — `competition` + `pricing`, echte Preisverteilung
      aus bis zu 200 Listings
- [x] **Antwort-Cache + Nebenläufigkeitsgrenze** — dreischichtig (laufende Abrufe
      / Speicher / Platte), überlebt Serverneustart
- [x] **Sechs Signalfelder optional gemacht** — was nicht gemessen wurde, bleibt
      leer statt geschätzt (siehe *Key Decisions*)
- [x] **Heuristik als dokumentierte Voreinstellung** + vier verknüpfte
      Erkenntnisregeln (zwei Signale je Regel)
- [x] **Testabdeckung von 42 auf 169** — Provider, Cache, Limiter, Aggregator,
      Heuristik-Analyst, Repository, TtlCache
- [x] **Neun echte Defekte gefunden und behoben** (siehe *Failed Approaches* und
      unten)

### Aus der vorigen Sitzung

- [x] Scaffold, Domain-Schicht, Scoring-Engine, Ideengenerator
- [x] Provider-Vertrag, Registry, Aggregator mit Konfliktauflösung
- [x] 6 Mock-Provider über gemeinsames Markt-Fixture
- [x] AI-Schicht (`Analyst`-Vertrag, Anthropic + Heuristik, Fallback)
- [x] Persistenz, Services, API, UI mit eigenen SVG-Charts

## Not Yet Done

- [ ] **Etsy** — Antrag ist gestellt, wartet auf Freigabe. **Größter verbleibender
      Hebel**: liefert `audience`, `design`, `products` und stellt damit fünf der
      sieben Differenzierungsbedingungen im Ideengenerator auf gemessene Werte.
- [ ] **Discovery-Service ungetestet** — letzter Dienst ohne Tests. Steuert den
      teuren Scan, die Auflösung der Saisonlage und den TTL-Cache.
- [ ] **`DELETE /api/analyses/:id` ohne UI-Anbindung** — Route existiert, die
      Historie hat keinen Knopf.
- [ ] **Mock-Keywords kleingeschrieben** — `"emaille tasse vintage"` liest sich in
      deutschen Empfehlungssätzen falsch. Mock-Verhalten, verschwindet mit echten
      Keyword-Quellen.
- [ ] **`rebuildIndex()` ohne Aufrufer** — Wiederherstellung existiert und ist
      getestet, wird aber nirgends angeboten.
- [ ] **AI-Pfad nie gegen ein echtes Modell gelaufen** — bewusst: siehe
      *Key Decisions*. Der Aufruf wurde gegen die API-Referenz korrigiert, aber
      nicht live verifiziert.

## Failed Approaches (Don't Repeat These)

### Discovery-Kandidaten aus Google Trends — zweimal geprüft, zweimal verworfen

**`google_trends_trending_now`** ist nachrichtengetrieben. Beispielabfragen der
Dokumentation: „lizzo", „bet365", „game 7 nba finals", „dutch government
collapses". Verfügbare Kategorien: Sport, Games, Technik, Unterhaltung, Recht,
Politik — **keine für Konsum, Haus oder Hobby**.

**Steigende verwandte Suchanfragen** (`RELATED_QUERIES`, Liste `rising`) zu
breiten Ankerbegriffen wurden **vollständig implementiert, getestet und gegen die
echte API gemessen**. Ergebnis: von acht Kandidaten war *einer* ein Markt
(„Geschenk zum Vatertag"). Der Rest: Markennamen („Froplay Hund"), Personen
(„Hund Jette"), Buchtitel („Das Geschenk des Meeres"), Nachrichten („ADAC 122
Jahre Geschenk", „Meteorit"), Floskeln („Das perfekte Geschenk"). Ein Jahresfilter
entfernte Kalenderabfragen („Vatertag 2026"), änderte am Verhältnis aber nichts.

**Kein Filterproblem, sondern ein Quellenproblem**: Die Liste bildet
*Aufmerksamkeit* ab, nicht Kaufabsicht. Kein Textfilter unterscheidet „Froplay
Hund" von „Adventskalender Hund". Die Implementierung wurde zurückgenommen; das
Messergebnis steht im Kopfkommentar von
[`src/server/providers/live/google-trends.ts`](src/server/providers/live/google-trends.ts).
Wer es erneut versucht, braucht eine Quelle mit **kommerziellem** Signal —
Marktplatz-Suchvorschläge etwa.

### YouTube als nächste Quelle — vor dem Bau verworfen

`AudienceSignal` verlangt Zielgruppensegmente mit Anteilen. Die gibt YouTube nur
für den **eigenen** Kanal über die Analytics-API heraus, nicht für einen
Suchbegriff. Übrig bliebe Engagement als Näherung für `emotionalIntensity` —
wieder erfundene Zahlen.

### Aus der vorigen Sitzung (weiterhin gültig)

- **`create-next-app` scheitert am Projektnamen** (`BrandOS` enthält
  Großbuchstaben). Scaffold ist handgeschrieben.
- **TypeScript 7.0.2 ist mit Next 16 nicht nutzbar** — `next build` bricht mit
  `The "id" argument must be of type string. Received undefined` ab. Gepinnt auf
  `^5.9.3`. `npm view typescript version` liefert 7.0.2 — **nicht blind
  aktualisieren.**
- **ESLint 10 + `eslint-config-next` 16 stürzt ab** (`TypeError: Converting
  circular structure to JSON`). Gepinnt auf `^9.39`. `FlatCompat` darf nicht
  verwendet werden — `eslint-config-next` 16 exportiert native Flat-Configs.
- **`experimental.typedRoutes` bricht den Build** in Next 16.
- **PowerShell-Textmanipulation zerstört UTF-8 und Template-Literale.**
  `Get-Content -Raw` + `Set-Content` liest UTF-8 als ANSI; `node -e "…"` mit
  **doppelten** Anführungszeichen expandiert `${…}` in der Shell. **Für
  Datei-Transformationen ausschließlich Node-Skriptdateien verwenden.**

## Key Decisions

| Decision | Rationale |
|---|---|
| **Nicht Messbares bleibt leer, statt geschätzt zu werden** | Das Datenmodell war gegen einen allwissenden Mock entworfen. Jede echte Quelle weiß weniger. Sechs Felder sind jetzt optional; die UI zeigt „—". Eine Hochrechnung sähe in der Oberfläche aus wie eine Messung. |
| **Normierungen gehören ins Scoring, nicht in den Provider** | Ein Provider meldet Messwerte. Eine Suchergebnisliste kennt ihre Trefferzahl, nicht deren Verhältnis zur Nachfrage — der Sättigungsindex wird deshalb im Scoring aus `listingCount` abgeleitet, wenn keine Quelle ihn liefert. |
| **Heuristik ist die Voreinstellung, nicht der Ausweichweg** | Der Score entsteht ohnehin ohne Modell. Solange ein großer Teil der Signale synthetisch ist, würde ein Modell diese Daten nur *eloquenter* deuten — flüssige Sätze über eine Zielgruppe, die niemand gemessen hat. `BRANDOS_AI_MODE=heuristic`. Nachrüstbar über eine Zeile. |
| **Antwort-Cache mit Plattenablage, nicht nur im Speicher** | Next startet im Dev-Betrieb bei jeder Änderung neu. Ein reiner Speicher-Cache wäre dabei jedes Mal leer und das API-Kontingent nach wenigen Änderungen aufgebraucht. |
| **Stabile Fehlschläge werden mitgecacht, vorübergehende nie** | Dass Trends einen Begriff nicht kennt, ist eine Eigenschaft des Begriffs. Ein Ratenlimit sagt nichts über die Anfrage aus — es einzubrennen ließe den Begriff bis zum Ablauf der Frist tot. |
| **Gesponserte eBay-Treffer fliegen aus der Stichprobe** | Bezahlte Platzierungen sind keine Marktstichprobe. Im Test verschoben sie den Median um das Zwanzigfache. |
| Score deterministisch, ohne Modellbeteiligung | Eine Zahl, die Investitionsentscheidungen trägt, muss reproduzierbar und testbar sein. Das Modell *erklärt* den Score, es berechnet ihn nicht. |
| Fehlende Signale senken die Konfidenz, nicht den Score | Ein fehlender Wert ist Unsicherheit, keine schlechte Nachricht. |
| JSON-Dateien statt Datenbank | Einzige Anforderung ist „Analysen wiederfinden". Vertrag bleibt austauschbar. |

## Current State

**Working**: Alles. `npm run dev` läuft. `/api/health` meldet:

```json
{"status":"ok","dataMode":"mixed","analyst":"heuristic",
 "providers":{"registered":8,"active":[
   {"id":"google-trends","label":"Google Trends","kind":"live","capabilities":["demand"]},
   {"id":"ebay","label":"eBay","kind":"live","capabilities":["competition","pricing"]},
   … 5 Mocks …]}}
```

Verifiziert im Browser: Dashboard, Discovery, Recherche, Analyse-Detail, Historie,
Merken, gefilterte Historie.

**Anteil echter Daten an der Score-Gewichtung:**

| Signal | Quelle | Gewicht |
|---|---|---|
| Nachfrage, Trend, Saisonales Timing | Google Trends | 42 % |
| Wettbewerb, Preisspielraum | eBay | 25 % |
| Marktalter, Geschenkpotenzial, Emotion, Produktvielfalt | **noch Mocks** | 33 % |

**Broken**: Nichts bekannt.

**Uncommitted Changes**: Keine. `HEAD == origin/main == b934d52`.

**Kontingent**: `.data/provider-cache/` enthält Antworten für `google-trends` und
`ebay`, 12 h gültig. Ein frischer Discovery-Lauf kostet ~14 SerpAPI-Aufrufe,
wiederholte Läufe null.

## Files to Know

| File | Why It Matters |
|---|---|
| `src/domain/types.ts` | Die Sprache des Produkts. **Sechs Felder sind optional** — die Kommentare erklären je, warum. |
| `src/domain/scoring/opportunity-score.ts` | Die 9 Faktoren. `scoreCompetition` leitet die Sättigung aus `listingCount` ab, wenn keine Quelle sie meldet; `scoreMarketAge` gibt auf, wenn Alter und Neuzugänge fehlen. |
| `src/server/providers/live/google-trends.ts` | Erste echte Quelle. **Kopfkommentar enthält das Messergebnis der verworfenen Discovery-Versuche.** |
| `src/server/providers/live/ebay.ts` | Angebotsseite. Dokumentiert im Kopf, was eine Suchergebnisliste hergibt und was nicht. |
| `src/server/providers/util/response-cache.ts` | Dreischichtiger Cache. Der Grund, warum das Kontingent hält. |
| `src/server/providers/aggregator.ts` | `blendOptional` mischt nur über Quellen, die einen Wert kennen. |
| `src/server/ai/heuristic-analyst.ts` | Erzeugt alles, was der Nutzer liest. `buildSynthesis()` verknüpft je zwei Signale. |
| `src/domain/ideas/idea-generator.ts` | Signalgetrieben, nicht lexikonbasiert. `productPhrase()` löst die deutsche Kompositionsgrammatik. |
| `src/server/repositories/json-analysis-repository.ts` | `isSafeId()` gilt jetzt auch auf der **Schreibseite**. |
| `src/server/config/env.ts` | Einziger Ort, der `process.env` liest. |
| `scripts/alias-hooks.mjs` | Löst `@/` für den Node-Testrunner auf. **Tests nur über `npm test` starten** — ein direkter `node --test`-Aufruf umgeht den Hook. |

## Code Context

**Der Provider-Vertrag** — alles, was eine neue Quelle implementieren muss:

```ts
interface DataProvider {
  readonly id: SourceId;                    // in domain/types.ts ergänzen
  readonly label: string;
  readonly capabilities: readonly Capability[];
  readonly kind: "live" | "mock";
  readonly priority: number;                // höher gewinnt bei Konflikten
  isAvailable(): boolean;
  fetch(query: MarketQuery, context: ProviderContext): Promise<ProviderResult>;
  discover?(context: ProviderContext): Promise<DiscoverySeed[]>;
}
```

Registrieren in `src/server/providers/registry.ts`. Prioritäten heute:
`google-trends` 20 · `reddit` 18 · `pinterest` 15 · **`ebay` 12** · `etsy` 10 ·
`amazon` 8 · `tiktok` 6.

**Das Muster für jede neue Live-Quelle** (aus `ebay.ts`, gekürzt):

```ts
let cache: ProviderResponseCache<ProviderResult> | undefined;
let limit: ReturnType<typeof createLimiter> | undefined;

// Erst beim ersten Aufruf erzeugen, nicht beim Laden des Moduls –
// sonst friert der Zustand ein, bevor resetConfig() in Tests greift.
function infrastructure() {
  const { providers, storage } = getConfig();
  cache ??= new ProviderResponseCache<ProviderResult>({
    namespace: "ebay",
    ttlMs: providers.cacheTtlMs,
    errorTtlMs: providers.cacheTtlMs * 2,
    dataDir: storage.dataDir,
    isStableFailure,        // nur Eigenschaften der Anfrage, nie des Moments
  });
  limit ??= createLimiter(providers.maxConcurrent);
  return { cache, limit };
}

export function resetEbayInfrastructure(): void { cache = undefined; limit = undefined; }
```

**Optionale Signalfelder** — die sechs und je der Grund:

```ts
DemandSignal.estimatedMonthlySearches?   // Trends misst nur relativ
CompetitionSignal.activeSellers?         // Stichprobe kennt nur sichtbare Treffer
CompetitionSignal.saturationIndex?       // Einordnung, keine Messung → Scoring leitet ab
CompetitionSignal.medianListingAgeDays?  // steht in keiner Ergebnisliste
CompetitionSignal.newListings30dPct?     // dito
PricingSignal.avgReviewsPerListing?      // Marktplätze weisen Verkäufer-, nicht Listing-Bewertungen aus
```

**API-Antwortform** (`POST /api/research`):

```json
{ "id": "uuid", "term": "Emaille Tasse", "score": 43.1, "grade": "D",
  "durationMs": 7718, "analyst": "heuristic" }
```

`GET /api/analyses/:id` antwortet **umschlagen**: `{ "analysis": { … } }`.

**Nicht offensichtlich:**

- `ProviderResponseCache.resolve()` wirft einen gespeicherten Fehlschlag als
  `CachedFailure` — der Provider fängt ihn und wirft ihn als `ProviderError`
  weiter, damit sich Cache-Treffer und frischer Abruf für den Aggregator
  identisch verhalten.
- `buildInsights()` reserviert einen Platz für die Warnung zur Datengrundlage.
  Vorher fiel sie durch `slice(0, 8)` heraus, sobald ein Markt alle Signalblöcke
  füllte — ausgerechnet dann, wenn sie gilt.
- `productPhrase(niche, productType)` hat drei Formen: einwortige Nische →
  `Dackel-Hoodie`; mehrwortige → `Hoodie zum Thema Emaille Tasse`; Produktart
  schon in der Nische → nur die Nische. Bindestrich-Verkettung ist im Deutschen
  nur bei einwortigen Basen korrekt.
- `de()`/`dePercent()` aus `domain/format.ts` für servergenerierte **Texte**,
  `lib/format.ts` für die **UI**. Nicht vermischen.
- `demand.direction` ist die maßgebliche Trendaussage.

## Resume Instructions

1. **Baseline prüfen**:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run build
   ```
   - Erwartet: keine Fehler, **169/169 Tests**, Build listet 10 Routen.
   - Bei TypeScript-Fehlern zu Next-Typen: `.next/` löschen, neu bauen.

2. **App starten und Betriebsmodus prüfen**:
   ```bash
   npm run dev
   ```
   Dann `http://localhost:3000/api/health`.
   - Erwartet: `"dataMode":"mixed"`, `google-trends` und `ebay` mit
     `"kind":"live"`, 7 aktive Provider.
   - Zeigt `dataMode: "mock"`: `SERPAPI_KEY` fehlt in `.env.local`.

3. **Eine Analyse fahren** und gegen den Cache prüfen:
   ```bash
   curl -X POST localhost:3000/api/research -H "content-type: application/json" -d '{"term":"Dackel"}'
   ```
   - Erwartet: `{"id":"…","score":…,"analyst":"heuristic"}` in wenigen Sekunden.
   - Zweiter identischer Aufruf: **keine** neuen `Google Trends ausgewertet` /
     `eBay ausgewertet` im Serverlog — der Cache trägt.
   - Kommen doch Abrufe: `.data/provider-cache/` prüfen, oder
     `BRANDOS_PROVIDER_CACHE_TTL_MS` steht auf 0.

4. **Weiterarbeiten** — Vorschlag nach Wert:
   - **Etsy**, sobald freigegeben. Vorlage: `src/server/providers/live/ebay.ts`.
     Priorität über 12 wählen, damit es eBay überstimmt.
   - **Discovery-Service testen** (`src/server/services/discovery-service.ts`).
     Vorlage für Fake-Provider: `src/server/providers/aggregator.test.ts`.
   - **DELETE-UI** in der Historie anbinden.

## Setup Required

- Node 24 / npm 11 (getestet mit v24.14.0 / 11.9.0)
- **`.env.local`** im Projektwurzelverzeichnis. Existiert bereits und enthält
  `SERPAPI_KEY`. Ohne ihn fällt alles auf Mocks zurück, die App bleibt
  vollständig nutzbar.
- **Keine** weiteren Variablen nötig. `BRANDOS_AI_MODE=heuristic` ist die
  dokumentierte Voreinstellung; ein `ANTHROPIC_API_KEY` ist **bewusst nicht**
  gesetzt.
- `.claude/launch.json` vorhanden (Dev-Server auf Port 3000).

**Zugangsdaten nie in den Chat schreiben.** `.gitignore` deckt `.env*` außer
`.env.example` ab (mit `git check-ignore -v` verifiziert).

**Stand der API-Anträge** (privater, nicht-kommerzieller Einzelplatzbetrieb):

| Quelle | Stand |
|---|---|
| SerpAPI | ✅ aktiv — Google Trends, eBay, (Amazon, YouTube möglich) |
| Etsy | ⏳ Antrag gestellt, Personal App, wartet auf Freigabe |
| Reddit | ❌ Selbstregistrierung seit Nov 2025 geschlossen, 2–4 Wochen Freigabe |
| Pinterest | ❌ Trial nach Review, Standard braucht Video-Demo |
| TikTok | ❌ Research API nur akademisch/non-profit |
| Amazon direkt | ❌ PA-API eingestellt Mai 2026; SerpAPI ist der Weg |

## Edge Cases & Error Handling

- **Alle Provider fallen aus** → `MarketSignals` ohne `demand`; alle Faktoren
  `imputed`, Konfidenz minimal, Treiber/Bremsen leer. Discovery überspringt
  solche Kandidaten.
- **Trends kennt den Begriff nicht** → `ProviderError` mit der SerpAPI-Meldung im
  Klartext, **im Cache abgelegt** (Eigenschaft des Begriffs), Quellenprotokoll
  zeigt den Grund.
- **SerpAPI-Kontingent erschöpft (429)** → `ProviderError` „Kontingent
  erschöpft", **nicht** gecacht.
- **eBay liefert unter 5 verwertbare Preise** → `ProviderError`; eine Verteilung
  aus drei Listings wäre keine.
- **Keine Quelle kennt die Sättigung** → Feld bleibt leer, Scoring leitet aus
  `listingCount` ab, Rationale sagt „(aus der Listing-Zahl abgeleitet)".
- **Manipulierte Analyse-ID** → `isSafeId()` blockiert Lesen, Löschen **und
  Schreiben**; `save()` wirft laut, statt still zu verwerfen.
- **Index beschädigt** → als leer behandelt, Einzeldateien bleiben unversehrt,
  `rebuildIndex()` stellt ihn her.
- **Nicht behandelt**: Rate-Limiting der eigenen API, Authentifizierung,
  Mandantentrennung.

## Warnings

- **Keine TypeScript-Parameter-Properties** (`constructor(private readonly x: T)`).
  Nodes Type-Stripping unterstützt sie nicht; der Testlauf bricht mit
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` ab. Die letzte wurde in `util/cache.ts`
  entfernt — **nicht wieder einführen.**
- **Tests nur über `npm test` starten.** Ein direkter
  `node --test src/…/x.test.ts` umgeht `scripts/alias-hooks.mjs` und scheitert mit
  `ERR_MODULE_NOT_FOUND`.
- **Tests laufen mit `--conditions=react-server`**, damit `server-only` leer
  auflöst.
- **`round()` nicht in deutschen Sätzen verwenden** — erzeugt `36.2` statt `36,2`.
  Ein Test in `heuristic-analyst.test.ts` sucht englische Dezimalpunkte in jedem
  erzeugten Text und schlägt an.
- **Kein `toLowerCase()` auf deutschem Text.** Der Bug war dreimal vorhanden.
  `toLowerCase()` für *Vergleiche* ist in Ordnung, für Ausgaben nie.
- **Mock-Provider werfen absichtlich Fehler** (4–8 %, seed-abhängig). Sporadische
  `WARN brandos:aggregator – Provider fehlgeschlagen` sind erwartet.
- **`buildMarketFixture()` cached pro Begriff und Kalendermonat.** Änderungen am
  Lexikon wirken erst nach Neustart.
- **Discovery hat einen eigenen 15-Minuten-Cache** (`TtlCache` in
  `discovery-service.ts`), unabhängig vom Provider-Cache. Wer Discovery-Änderungen
  testet, muss den Dev-Server neu starten — das Leeren von
  `.data/provider-cache/` genügt nicht.
- **`.env.local` niemals mit `Write` überschreiben** — sie enthält den Key. Bei
  Änderungen gezielt mit `Edit` arbeiten oder den Nutzer bitten.
- **`server-only` in Server-Modulen ist Absicht.**
- **`"type": "module"` in `package.json` ist nötig** für den Testrunner.
