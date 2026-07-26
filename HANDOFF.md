# Handoff: BrandOS — drei echte Quellen, Herkunft je Faktor

**Generated**: 2026-07-27
**Branch**: `main`, Working Tree sauber. **Zwei Commits über `origin/main`** — nicht gepusht.
**Remote**: https://github.com/jannisgra1711/brandos — **öffentlich**
**Status**: Ready for Review — lauffähig, gebaut, 263 Tests grün. Drei echte Datenquellen live.

## Goal

Eine KI-gestützte Research-Plattform für E-Commerce, die Marktsignale sammelt, mit
einem nachvollziehbaren Opportunity Score bewertet, interpretiert und daraus
Produktideen ableitet. Oberfläche und Inhalte auf Deutsch. **Privates
Einzelplatz-Werkzeug**, kein gehosteter Dienst — das ist für die API-Anträge
relevant (siehe *Setup Required*).

Die erste Sitzung baute das Produkt auf synthetischen Daten. Die zweite band
Google Trends und eBay an. Diese Sitzung hat Etsy angebunden und — wichtiger —
**sichtbar gemacht, welcher Teil des Scores gemessen ist und welcher erfunden**.

## Completed

### Diese Sitzung (Fortsetzung)

- [x] **`slugify()` behält Buchstaben unter Akzenten** — `"Café Racer"` ergibt
      jetzt `cafe-racer` statt `caf-racer`. Unicode-Zerlegung **nach** der
      Umlautersetzung, sonst würde sie „ä" zu „a" verkürzen. Begriffe ganz ohne
      lateinische Zeichen bekommen eine Ersatzkennung statt einer leeren.
- [x] **`rebuildIndex()` hat einen Aufrufer** — `npm run rebuild-index`
- [x] **Wiederaufbau verliert keine Merkungen mehr** — sie standen nur im Index,
      `toSummary()` setzt `saved: false`; ein Wiederaufbau hätte die gesamte
      Auswahl des Nutzers gelöscht. Gefunden beim Anbinden, nicht gesucht.

### Diese Sitzung

- [x] **Discovery-Service getestet** — der letzte Dienst ohne Abdeckung, 35 Tests
- [x] **Löschen in der Historie** — `DELETE /api/analyses/:id` hatte keine UI
- [x] **Herkunft je Faktor** — jeder Score-Faktor weist aus, welche Quellen ihn
      tragen und welcher Anteil synthetisch ist (siehe *Key Decisions*)
- [x] **Etsy live** (Open API v3) — `competition` + `pricing`, und als einzige
      Quelle **gemessene Listing-Alter**
- [x] **Mocks verdrängt** — sobald eine gemessene Quelle ein Signal trägt, fallen
      die synthetischen heraus
- [x] **Konfidenz nach Gewicht** statt nach Quellenzahl
- [x] **Sättigung nach Marktbreite** statt nach Leitmarkt
- [x] **Synthetischer Anteil der Gewichtung: 48,6 % → 25 %**
- [x] Testabdeckung von 169 auf 259

### Aus den vorigen Sitzungen

- [x] Scaffold, Domain-Schicht, Scoring-Engine, Ideengenerator
- [x] Provider-Vertrag, Registry, Aggregator mit Konfliktauflösung
- [x] AI-Schicht (`Analyst`-Vertrag, Anthropic + Heuristik, Fallback)
- [x] Persistenz, Services, API, UI mit eigenen SVG-Charts
- [x] Google Trends live (SerpAPI), eBay live (SerpAPI)
- [x] Antwort-Cache dreischichtig, sechs Signalfelder optional

## Not Yet Done

- [ ] **`audience` hat keine echte Quelle** — Geschenkpotenzial und Emotionale
      Bindung (zusammen **18 % der Gewichtung**) bleiben synthetisch. Braucht
      Reddit oder Pinterest, **beide Zugänge blockiert**. Etsy liefert es
      **nicht**, entgegen der Behauptung im vorigen HANDOFF.
- [ ] **`products` nur aus dem Amazon-Mock** — 7 % der Gewichtung. Etsys
      Taxonomie ist an der Sprache gescheitert (siehe *Failed Approaches*).
- [ ] **Amazon über SerpAPI** — dritte echte Quelle für Wettbewerb und Preis.
      Bringt Robustheit, aber **keine Prozentpunkte**: Diese Signale sind seit
      Etsy ohnehin gemessen.
- [ ] **Mock-Keywords kleingeschrieben** — `"emaille tasse vintage"` liest sich in
      deutschen Sätzen falsch. Verschwindet mit echten Keyword-Quellen.
- [ ] **AI-Pfad nie gegen ein echtes Modell gelaufen** — bewusst, siehe
      *Key Decisions*.

## Failed Approaches (Don't Repeat These)

### Etsy-Taxonomie für Produktarten — gegen die echte API gemessen, verworfen

Jedes Etsy-Listing nennt seine `taxonomy_id`, und
`GET /v3/application/seller-taxonomy/nodes` löst sie auf: **3065 Knoten, davon
2503 Blätter**. Daraus liessen sich Anteile und Medianpreise je Produktart sauber
messen — `share` und `medianPrice` wären echte Messwerte.

Die Namen sind jedoch **ausschliesslich englisch**: „Adult Bibs", „Aprons",
„Belt Buckles". Ein Sprachparameter existiert nicht, und `Accept-Language: de-DE`
ändert die Antwort **nachweislich nicht** — gegen die echte API geprüft,
byte-gleiches Ergebnis.

Diese Namen landen in deutschen Sätzen: in der Score-Begründung („führend
\"Aprons\""), in der Signaltafel und über `productPhrase()` in Ideentiteln
(„Belt Buckles-Hoodie"). Ein Übersetzungslexikon über 2503 Blätter wäre Handarbeit
mit Lücken; ein Modell zur Laufzeit widerspräche der Zusage, dass der Score ohne
Modellbeteiligung entsteht. Messergebnis steht im Kopfkommentar von
[`src/server/providers/live/etsy.ts`](src/server/providers/live/etsy.ts).
**Wer es erneut versucht, braucht eine Quelle mit lokalisierten Kategorienamen.**

### Etsy-Zugangsdaten — zwei falsche Annahmen, beide widerlegt

Etsy erwartet **beide Werte in einem Header**, durch Doppelpunkt getrennt:

```
x-api-key: keystring:shared_secret
```

Nirgends prominent dokumentiert. Die API sagt es aber selbst, sobald man die Form
knapp verfehlt. Drei Meldungen ergeben zusammen das Bild:

| gesendet | Antwort |
|---|---|
| Keystring allein | „Shared secret is **required** in x-api-key header." |
| Secret allein | „API key **not found** or not active" |
| mit Leerzeichen statt Doppelpunkt | „should be in the format 'keystring:shared_secret'" |

**Die Längen taugen nicht zur Unterscheidung**: Keystring 24 Zeichen, Secret 10.
Prüfen mit `node scripts/check-etsy-key.mjs`, nicht mit einem Analyselauf.

### Discovery-Kandidaten aus Google Trends — zweimal geprüft, zweimal verworfen

**`google_trends_trending_now`** ist nachrichtengetrieben — keine Kategorie für
Konsum, Haus oder Hobby.

**Steigende verwandte Suchanfragen** wurden vollständig implementiert, getestet und
gegen die echte API gemessen: von acht Kandidaten war *einer* ein Markt. Der Rest
Markennamen, Personen, Buchtitel, Nachrichten. **Kein Filterproblem, sondern ein
Quellenproblem** — die Liste bildet Aufmerksamkeit ab, nicht Kaufabsicht.
Messergebnis im Kopfkommentar von
[`src/server/providers/live/google-trends.ts`](src/server/providers/live/google-trends.ts).

### YouTube als Zielgruppenquelle — vor dem Bau verworfen

`AudienceSignal` verlangt Segmente mit Anteilen. Die gibt YouTube nur für den
**eigenen** Kanal heraus, nicht für einen Suchbegriff.

### Aus den vorigen Sitzungen (weiterhin gültig)

- **`create-next-app` scheitert am Projektnamen** (`BrandOS` enthält
  Großbuchstaben). Scaffold ist handgeschrieben.
- **TypeScript 7.x ist mit Next 16 nicht nutzbar** — `next build` bricht ab.
  Gepinnt auf `^5.9.3`. **Nicht blind aktualisieren.**
- **ESLint 10 + `eslint-config-next` 16 stürzt ab.** Gepinnt auf `^9.39`.
  `FlatCompat` darf nicht verwendet werden.
- **`experimental.typedRoutes` bricht den Build** in Next 16.
- **PowerShell-Textmanipulation zerstört UTF-8 und Template-Literale.**
  Für Datei-Transformationen ausschließlich Node-Skriptdateien verwenden.

## Key Decisions

| Decision | Rationale |
|---|---|
| **Ein Faktor weist seine Herkunft aus** | `FactorBreakdown` markierte nur `imputed` — Faktoren ganz ohne Signal. Ein Faktor aus einem Mock rendert sonst identisch zu einem aus Google Trends: gleicher Balken, gleiche selbstbewusste Begründung. In der Seitenleiste steht „Jede Aussage ist auf ihre Quelle zurückführbar" — das stimmte nicht. |
| **Gemessene Quellen verdrängen synthetische, je Signal** | Ein Mock ist ein Platzhalter für eine fehlende Quelle, kein gleichberechtigter Zeuge. Ihn in eine echte Messung einzumischen macht die Messung schlechter, nicht die Schätzung besser. **Je Signal, nicht je Lauf** — eine echte Nachfrage darf eine synthetische Zielgruppe nicht mit hinauswerfen, dort gibt es keine Alternative. |
| **Konfidenz zählt Gewicht, nicht Quellen** | Fünf Mocks, die nichts beitragen, machen einen Score nicht synthetisch. Seit der Verdrängung antworten sie weiter, ohne zu tragen. `dataQuality` beschreibt jetzt nur die *Erhebung*; der Abzug für Erfundenes passiert im Scoring, wo `syntheticWeight` bekannt ist. |
| **Sättigung aus der breitesten Trefferzahl** | Sie setzt Angebot ins Verhältnis zur Nachfrage, und die Nachfrage wird über den *gesamten* Suchmarkt erhoben. `listingCount` ist die Zahl des Leitmarkts: Etsy meldet für „Emaille Tasse" 243, eBay 25.000. Beide stimmen, sie messen verschiedene Märkte. 243 als Marktgröße zu lesen ergäbe „nahezu unbesetzt" bei 25.000 Angeboten. **Nicht summiert** — Marktplätze überschneiden sich. |
| **Index-Wiederaufbau ist ein Skript, kein Knopf** | Er ersetzt den Index als Ganzes und ist eine Reparatur, keine Funktion der Oberfläche. `rebuildIndex()` steht deshalb auch **nicht** im `AnalysisRepository`-Vertrag — ein abgeleiteter Index ist eine Eigenheit der Dateiablage, kein Versprechen der Persistenzschicht. Das Skript spricht direkt mit `JsonAnalysisRepository`. |
| **Nicht Messbares bleibt leer, statt geschätzt zu werden** | Jede echte Quelle weiß weniger als der Mock. Sieben Felder sind optional; die UI zeigt „—". Eine Hochrechnung sähe aus wie eine Messung. |
| **Normierungen gehören ins Scoring, nicht in den Provider** | Ein Provider meldet Messwerte. Eine Ergebnisliste kennt ihre Trefferzahl, nicht deren Verhältnis zur Nachfrage. |
| **Heuristik ist die Voreinstellung, nicht der Ausweichweg** | Der Score entsteht ohnehin ohne Modell. `BRANDOS_AI_MODE=heuristic`. Nachrüstbar über eine Zeile. |
| **Antwort-Cache mit Plattenablage** | Next startet im Dev-Betrieb bei jeder Änderung neu. Ein reiner Speicher-Cache wäre jedes Mal leer. |
| **Stabile Fehlschläge werden gecacht, vorübergehende nie** | Dass Trends einen Begriff nicht kennt, ist eine Eigenschaft des Begriffs. Ein Ratenlimit oder ein abgelehnter Schlüssel sagt nichts über die Anfrage aus. |
| **Gesponserte eBay-Treffer fliegen aus der Stichprobe** | Bezahlte Platzierungen sind keine Marktstichprobe. Im Test verschoben sie den Median um das Zwanzigfache. |
| **Etsy sortiert nach Relevanz, nicht nach Datum** | `sort_on` steht bei Etsy standardmäßig auf `created`. Die Voreinstellung lieferte die 100 *jüngsten* Treffer — Medianalter wären dann durchgehend wenige Tage. `sort_on=score` ist die Reihenfolge, die ein Käufer sieht. |
| Score deterministisch, ohne Modellbeteiligung | Eine Zahl, die Investitionsentscheidungen trägt, muss reproduzierbar sein. |
| Fehlende Signale senken die Konfidenz, nicht den Score | Ein fehlender Wert ist Unsicherheit, keine schlechte Nachricht. |
| JSON-Dateien statt Datenbank | Einzige Anforderung ist „Analysen wiederfinden". |

## Current State

**Working**: Alles. `npm run dev` läuft. `/api/health` meldet 9 registrierte,
7 aktive Provider, `dataMode: "mixed"`:

```
google-trends   live   demand
etsy            live   competition,pricing
ebay            live   competition,pricing
reddit          mock   audience,keywords,discovery
pinterest       mock   design,audience,keywords,discovery
amazon          mock   competition,pricing,products
tiktok          mock   demand,keywords
```

**Anteil echter Daten an der Score-Gewichtung — 75 % gemessen:**

| Faktor | Gewicht | Quelle |
|---|---|---|
| Nachfrage, Trend, Saisonales Timing | 42 % | Google Trends |
| Wettbewerb, Marktalter, Preisspielraum | 33 % | Etsy + eBay |
| Geschenkpotenzial, Emotionale Bindung | 18 % | **Mocks** |
| Produktvielfalt | 7 % | **Mock** |

**Referenzwerte** (26.07.2026, mit gefülltem Cache):

| Begriff | Score | Note | synthetisch | Konfidenz |
|---|---|---|---|---|
| Emaille Tasse | 47,8 | C | 25 % | 0,78 |
| Dackel | 57,6 | C | 25 % | 0,78 |
| Bikepacking | 64,0 | B | 25 % | 0,80 |

**Broken**: Nichts bekannt.

**Uncommitted Changes**: Keine. **`origin/main` steht noch auf `25a1c7f`** —
zwei Commits (`fix(discovery)`, `feat(repository)`) plus dieser Dokumentstand
warten auf den Push.

**Kontingent**: `.data/provider-cache/` enthält Antworten für `google-trends`,
`ebay` und `etsy`, 12 h gültig. Etsy kostet **einen** Aufruf je Analyse.

## Files to Know

| File | Why It Matters |
|---|---|
| `src/domain/types.ts` | Die Sprache des Produkts. **Sieben Felder optional**, `SignalProvenance` erklärt die Herkunftsspur, `marketListingCount` die Marktbreite. |
| `src/domain/scoring/opportunity-score.ts` | Die 9 Faktoren. `FACTOR_SIGNAL` bildet Faktor auf Signal ab — die Grundlage der Herkunft. `scoreCompetition` leitet die Sättigung aus `marketListingCount` ab. |
| `src/server/providers/aggregator.ts` | **`contributorsTo()` ist die zentrale Stelle**: Sie entscheidet, welche Beiträge ein Signal tragen, und wird von Zusammenführung *und* Herkunft gemeinsam benutzt. |
| `src/server/providers/live/etsy.ts` | Einzige Quelle mit Listing-Alter. Kopfkommentar enthält das Messergebnis der verworfenen Taxonomie. |
| `src/server/providers/live/google-trends.ts` | Kopfkommentar enthält das Messergebnis der verworfenen Discovery-Versuche. |
| `src/server/providers/live/ebay.ts` | Vorlage für jede neue Marktplatzquelle. |
| `src/components/analysis/factor-breakdown.tsx` | Wo die Herkunft sichtbar wird: `geschätzt` / `synthetisch X %` / unmarkiert plus Quellennennung. |
| `scripts/check-etsy-key.mjs` | Prüft die Etsy-Zugangsdaten gegen `openapi-ping`, ohne Analyse und ohne den Schlüssel auszugeben. |
| `scripts/rebuild-index.mjs` | `npm run rebuild-index` — stellt `.data/index.json` aus den Analysedateien wieder her. **Nicht neben einem laufenden Dev-Server.** |
| `src/server/config/env.ts` | Einziger Ort, der `process.env` liest. `etsyKey()` fügt Keystring und Secret zusammen. |
| `scripts/alias-hooks.mjs` | Löst `@/` für den Node-Testrunner auf. **Tests nur über `npm test` starten.** |

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
`google-trends` 20 · `reddit` 18 · `pinterest` 15 · **`etsy` 14 (live)** ·
`ebay` 12 · `etsy` 10 (mock) · `amazon` 8 · `tiktok` 6.

Die Registry bevorzugt pro Quelle **Live vor Mock** — ein Live-Provider ersetzt
den gleichnamigen Mock vollständig, auch dessen zusätzliche Capabilities.

**Die Verdrängungsregel** (`aggregator.ts`) — der wichtigste Mechanismus:

```ts
function contributorsTo(contributions: Contribution[], key: PayloadKey): Contribution[] {
  const present = contributions.filter((c) => carries(c, key));
  const measured = present.filter((c) => !c.result.synthetic);
  // Gemessen schlägt erfunden – unabhängig vom Gewicht.
  return [...(measured.length > 0 ? measured : present)].sort((a, b) => b.weight - a.weight);
}
```

**Nicht offensichtlich:**

- `syntheticShare` in `SignalProvenance` ist seit der Verdrängung praktisch
  **binär** (0 oder 1). Die gewichtete Rechnung bleibt trotzdem korrekt, falls
  die Regel je gelockert wird.
- `score.syntheticWeight` ist **`undefined`**, wenn die Signale keine Herkunft
  mitbringen. Eine 0 wäre hier die gefährlichste Antwort — sie läse sich als
  „nichts davon ist synthetisch", obwohl nur niemand nachgehalten hat. Vor der
  Einführung gespeicherte Analysen rendern deshalb unverändert.
- `ProviderResponseCache.resolve()` wirft einen gespeicherten Fehlschlag als
  `CachedFailure` — der Provider fängt ihn und wirft ihn als `ProviderError`
  weiter, damit sich Cache-Treffer und frischer Abruf identisch verhalten.
- `buildInsights()` reserviert einen Platz für die Warnung zur Datengrundlage.
- `productPhrase(niche, productType)` hat drei Formen. Bindestrich-Verkettung ist
  im Deutschen nur bei einwortigen Basen korrekt.
- `de()`/`dePercent()` aus `domain/format.ts` für servergenerierte **Texte**,
  `lib/format.ts` für die **UI**. `formatScore()` hängt das Prozentzeichen
  **selbst** an — kein zweites setzen.
- `demand.direction` ist die maßgebliche Trendaussage.

**API-Antwortform** (`POST /api/research`):

```json
{ "id": "uuid", "term": "Emaille Tasse", "score": 47.8, "grade": "C",
  "durationMs": 3619, "analyst": "heuristic" }
```

`GET /api/analyses/:id` antwortet **umschlagen**: `{ "analysis": { … } }`.

## Resume Instructions

1. **Baseline prüfen**:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run build
   ```
   - Erwartet: keine Fehler, **263/263 Tests**, Build listet 10 Routen.
   - Bei TypeScript-Fehlern zu Next-Typen: `.next/` löschen, neu bauen.

2. **Zugangsdaten prüfen** (kostet kein Kontingent):
   ```bash
   node scripts/check-etsy-key.mjs
   ```
   - Erwartet: `✔ Schluessel wird anerkannt`.

3. **App starten und Betriebsmodus prüfen**:
   ```bash
   npm run dev
   ```
   Dann `http://localhost:3000/api/health` — erwartet: 9 registriert, 7 aktiv,
   `google-trends`, `etsy` und `ebay` mit `"kind":"live"`.

4. **Eine Analyse fahren** und die Herkunft prüfen:
   ```bash
   curl -X POST localhost:3000/api/research -H "content-type: application/json" -d '{"term":"Emaille Tasse"}'
   ```
   - Erwartet: Score um 48, `syntheticWeight` 0.25.
   - Auf der Detailseite müssen sechs Faktoren **ohne** Markierung stehen und
     drei mit `synthetisch`.

5. **Weiterarbeiten** — Vorschlag nach Wert:
   - **Amazon über SerpAPI**. Vorlage: `ebay.ts`. Bringt Robustheit, keine
     Prozentpunkte.
   - **`audience`**: der einzige verbleibende große Hebel (18 %). Braucht Reddit
     oder Pinterest — beide blockiert.

## Setup Required

- Node 24 / npm 11 (getestet mit v24.14.0 / 11.9.0)
- **`.env.local`** im Projektwurzelverzeichnis. Existiert bereits und enthält
  `SERPAPI_KEY`, `ETSY_API_KEY` und `ETSY_API_SECRET`.
- **Etsy braucht beide Werte.** Fehlt einer, gilt die Quelle als nicht
  konfiguriert und der Mock übernimmt — `isAvailable()` meldet dann `false`,
  weil eine halbe Angabe keinen gültigen Header ergibt.
- `BRANDOS_AI_MODE=heuristic` ist die dokumentierte Voreinstellung; ein
  `ANTHROPIC_API_KEY` ist **bewusst nicht** gesetzt.
- `.claude/launch.json` vorhanden (Dev-Server auf Port 3000).

**Zugangsdaten nie in den Chat schreiben.** `.gitignore` deckt `.env*` außer
`.env.example` ab.

**Stand der API-Anträge** (privater, nicht-kommerzieller Einzelplatzbetrieb):

| Quelle | Stand |
|---|---|
| SerpAPI | ✅ aktiv — Google Trends, eBay, (Amazon möglich) |
| Etsy | ✅ aktiv — Personal Access |
| Reddit | ❌ Selbstregistrierung seit Nov 2025 geschlossen |
| Pinterest | ❌ Trial nach Review, Standard braucht Video-Demo |
| TikTok | ❌ Research API nur akademisch/non-profit |
| Amazon direkt | ❌ PA-API eingestellt Mai 2026; SerpAPI ist der Weg |

## Edge Cases & Error Handling

- **Alle Provider fallen aus** → `MarketSignals` ohne `demand`; alle Faktoren
  `imputed`, Konfidenz minimal, Treiber/Bremsen leer.
- **Etsy und eBay antworten beide** → Etsy führt (Priorität 14 gegen 12),
  `listingCount` ist Etsys Zahl, `marketListingCount` das Maximum beider.
- **Nur ein Mock trägt ein Signal** → er bleibt, wird aber als `synthetisch`
  ausgewiesen und senkt die Konfidenz nach seinem Gewicht.
- **Etsy-Schlüssel abgelehnt** → `ProviderError` mit **Etsys eigenem Wortlaut**;
  **nicht** gecacht, weil er nichts über den Begriff aussagt.
- **Trends kennt den Begriff nicht** → `ProviderError`, **im Cache abgelegt**
  (Eigenschaft des Begriffs).
- **Kontingent erschöpft (429)** → `ProviderError`, **nicht** gecacht.
- **Etsy liefert unter 5 verwertbare Preise** → `ProviderError`.
- **Etsy mischt Währungen** → nur die häufigste zählt; ohne Kurse wäre jede
  Zusammenführung erfunden.
- **Keine Quelle kennt die Sättigung** → Scoring leitet sie aus
  `marketListingCount` ab, Rationale nennt die Grundlage.
- **Manipulierte Analyse-ID** → `isSafeId()` blockiert Lesen, Löschen **und**
  Schreiben.
- **Index verloren oder unlesbar** → Historie zeigt eine leere Liste, die
  Analysen sind unversehrt. `npm run rebuild-index` trägt sie nach; die
  Merkungen überleben, solange der alte Index noch lesbar ist.
- **Nicht behandelt**: Rate-Limiting der eigenen API, Authentifizierung,
  Mandantentrennung.

## Warnings

- **Keine TypeScript-Parameter-Properties** (`constructor(private readonly x: T)`).
  Nodes Type-Stripping unterstützt sie nicht.
- **Tests nur über `npm test` starten.** Ein direkter `node --test` umgeht
  `scripts/alias-hooks.mjs`.
- **Tests laufen mit `--conditions=react-server`**, damit `server-only` leer
  auflöst.
- **`round()` nicht in deutschen Sätzen verwenden** — erzeugt `36.2` statt `36,2`.
  Ein Test sucht englische Dezimalpunkte in jedem erzeugten Text.
- **Kein `toLowerCase()` auf deutschem Text.** Für *Vergleiche* in Ordnung, für
  Ausgaben nie.
- **Mock-Provider werfen absichtlich Fehler** (4–8 %, seed-abhängig). Sporadische
  `WARN brandos:aggregator – Provider fehlgeschlagen` sind erwartet.
- **`buildMarketFixture()` cached pro Begriff und Kalendermonat.**
- **Discovery hat einen eigenen 15-Minuten-Cache** (`TtlCache`), unabhängig vom
  Provider-Cache. Wer Discovery-Änderungen testet, muss den Dev-Server neu
  starten. Für Tests: `resetDiscoveryCache()`.
- **`.env.local` niemals mit `Write` überschreiben** — sie enthält drei Keys.
- **`process.exit()` neben einem offenen `AbortSignal.timeout`** lässt libuv unter
  Windows mit einer Assertion fallen. `process.exitCode` verwenden.
- **`server-only` in Server-Modulen ist Absicht.**
- **`"type": "module"` in `package.json` ist nötig** für den Testrunner.
