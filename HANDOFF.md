# Handoff: BrandOS — Research- & Decision-Intelligence-Plattform

**Generated**: 2026-07-25
**Branch**: `main` (zuletzt `b3247d3`, Working Tree sauber)
**Status**: Ready for Review — lauffähig, gebaut, getestet. Live-Datenquellen noch nicht implementiert.

## Goal

Eine KI-gestützte Research-Plattform für E-Commerce, die Marktsignale aus mehreren Quellen
sammelt, mit einem nachvollziehbaren Opportunity Score bewertet, interpretiert und daraus
Produktideen ableitet. Der Nutzer gab eine Produktvision vor (kein Sprint-Plan) und erwartete
eigenständige Ableitung der Implementierungsreihenfolge. Oberfläche und Inhalte auf Deutsch.

## Completed

- [x] Projekt-Scaffold von Hand (Next.js 16 App Router, React 19, TypeScript, Tailwind 4)
- [x] Domain-Schicht: `types.ts`, `math.ts`, `format.ts`, Scoring-Engine, Ideengenerator
- [x] Provider-Vertrag + Registry (Live bevorzugt, sonst Mock) + Aggregator mit Konfliktauflösung
- [x] 6 Mock-Provider (Etsy, Google Trends, Pinterest, Reddit, Amazon, TikTok) über gemeinsames Markt-Fixture
- [x] Nischen-Lexikon (16 Profile) + Discovery-Kandidatenpool (~40 Begriffe)
- [x] AI-Schicht: `Analyst`-Vertrag, `anthropicAnalyst` (Structured Outputs + Streaming), `heuristicAnalyst`, Fallback-Wrapper
- [x] Persistenz: `AnalysisRepository` + JSON-Implementierung mit Index und serialisierter Schreibkette
- [x] Services: Research, Discovery (TTL-Cache), Dashboard, Historie
- [x] API: `/api/research`, `/api/analyses`, `/api/analyses/[id]`, `/api/health`
- [x] UI: Design-Tokens (Light/Dark), UI-Primitiven, eigene SVG-Charts, 5 Seiten
- [x] 24 Tests (Node-Testrunner) für Scoring, Math, Ideengenerator — grün
- [x] README mit Architektur, Score-Tabelle, API und Entscheidungsbegründungen
- [x] End-to-End im Browser verifiziert (Dashboard, Discovery, Recherche, Analyse-Detail)
- [x] Git-Repository initialisiert, `.gitattributes` (LF-Normalisierung), Initial Commit auf `main`
- [x] Saisonale Fenster aus echtem Peak-Abstand (ersetzt die frühere Näherung), Peak-Badge auf der Chancen-Karte
- [x] Aggregator mit 15 Tests abgesichert — Teilausfälle, Konfliktauflösung, Datenqualität, Fähigkeitsfilter

## Not Yet Done

- [ ] **Erster echter Provider.** Empfehlung: Google Trends via SerpAPI (`SERPAPI_KEY` ist in `.env.example` vorbereitet). Er ist die Leitquelle für `demand`/`seasonality` und hat mit `priority: 20` bereits das höchste Gewicht.
- [ ] **AI-Pfad gegen ein echtes Modell testen.** `anthropicAnalyst` ist vollständig implementiert, aber nie mit gesetztem `ANTHROPIC_API_KEY` gelaufen — der Heuristik-Fallback greift derzeit immer.
- [ ] Discovery-Kandidaten aus echten Trendsignalen statt aus `discovery-seeds.ts` speisen
- [ ] `DELETE /api/analyses/:id` hat keine UI-Anbindung (nur API)
- [ ] Repository ungetestet (Index-Konsistenz, `saved`-Erhalt beim Überschreiben, Pfad-Traversal)
- [ ] Heuristik-Analyst ungetestet (Insight-Auswahl, Trendkonsistenz)
- [ ] Provider-Capabilities `ebay` und `youtube` sind in `SOURCE_IDS` deklariert, aber ohne Implementierung

## Failed Approaches (Don't Repeat These)

**`create-next-app` scheitert am Projektnamen.**
`npx create-next-app@latest .` bricht ab mit `Could not create a project called "BrandOS" because of npm naming restrictions: name can no longer contain capital letters`. Das Scaffold wurde deshalb von Hand geschrieben (`package.json` trägt `"name": "brandos"`). Nicht erneut versuchen.

**TypeScript 7.0.2 ist mit Next 16 nicht nutzbar.**
Mit `typescript@7.0.2` (dem nativen Port) bricht `next build` ab:
```
It looks like you're trying to use TypeScript but do not have the required package(s) installed.
...
The "id" argument must be of type string. Received undefined
Next.js build worker exited with code: 1
```
Next erkennt das Paket nicht. Gepinnt auf `typescript@^5.9.3`. `npm view typescript version` liefert 7.0.2 — nicht blind aktualisieren.

**ESLint 10 + `eslint-config-next` 16 stürzt ab.**
```
TypeError: Converting circular structure to JSON
    at ConfigValidator.formatErrors (@eslint/eslintrc/lib/shared/config-validator.js:299:23)
```
Zwei Ursachen: ESLint 10 ist inkompatibel mit den mitgelieferten Plugins (→ gepinnt auf `eslint@^9.39`), **und** `FlatCompat` darf gar nicht mehr verwendet werden — `eslint-config-next` 16 exportiert native Flat-Configs (`eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`). Die aktuelle `eslint.config.mjs` importiert diese direkt. `@eslint/eslintrc` steht noch in den devDependencies und könnte entfernt werden.

**`experimental.typedRoutes` in `next.config.ts` bricht den Build.**
Führte zu demselben `The "id" argument must be of type string`-Fehler. In Next 16 ist `typedRoutes` kein Experimental-Flag mehr. Die Option wurde entfernt; `next.config.ts` enthält jetzt nur `reactStrictMode`.

**PowerShell-Textmanipulation zerstört UTF-8 und Template-Literale.** Zwei separate Vorfälle:
1. `Get-Content -Raw` + `Set-Content` in Windows PowerShell 5.1 liest UTF-8 als ANSI → `–` wurde zu `â€“` in allen `*-mock.ts`. Mit einem Node-Skript repariert.
2. `node -e "…"` mit **doppelten** Anführungszeichen: PowerShell expandiert `${…}` im JS-Code und leerte damit sämtliche Template-Platzhalter in `opportunity-score.ts` (`Nachfrageindex /100.` statt `Nachfrageindex ${de(relative)}/100.`). Einzeln repariert.

**Konsequenz: Für Datei-Transformationen ausschließlich Node-Skriptdateien verwenden, nie Inline-Code über PowerShell und nie `Get-Content`/`Set-Content` auf Quelldateien.**

## Key Decisions

| Decision | Rationale |
|---|---|
| Score deterministisch, ohne Modellbeteiligung | Eine Zahl, die Investitionsentscheidungen trägt, muss reproduzierbar und testbar sein. Das Modell *erklärt* den Score, es berechnet ihn nicht. |
| Interpretation kennt den Score, nicht umgekehrt | Sonst driften Zahl und Erklärung auseinander. Deshalb die feste Pipeline-Reihenfolge Sammeln → Bewerten → Deuten → Sichern. |
| Fehlende Signale senken die Konfidenz, nicht den Score | Ein fehlender Wert ist Unsicherheit, keine schlechte Nachricht. Faktoren werden neutral bewertet, als `imputed` markiert und aus Treibern/Bremsen ausgeschlossen. |
| Heuristik als vollwertige `Analyst`-Implementierung | Ohne API-Key, bei Modellausfall und in Tests liefert das Produkt dieselbe Ergebnisstruktur. `producedBy.degraded` weist das aus, statt es zu verbergen. |
| Gemeinsames Markt-Fixture hinter allen Mock-Providern | Ein Markt mit 40.000 Listings und gleichzeitig 300 Suchanfragen wäre unglaubwürdig. Provider bleiben technisch unabhängig, projizieren aber Ausschnitte derselben Wahrheit. |
| Deterministischer PRNG (Mulberry32, FNV-1a-Seed) | Dieselbe Suchanfrage muss dasselbe Marktbild ergeben — sonst widersprechen gespeicherte Analysen späteren Ansichten desselben Marktes. |
| JSON-Dateien statt Datenbank | Einzige Anforderung ist „Analysen wiederfinden". Kein Betriebsaufwand, keine Migrationen, keine nativen Abhängigkeiten. Vertrag bleibt austauschbar. |
| Keine Chart-Bibliothek | Sparkline, Score-Ring und Saisonverlauf sind wenige Zeilen SVG, rendern serverseitig und folgen den Design-Tokens. |
| Discovery bewertet nur mit `demand` + `competition` | Vollanalyse je Kandidat wäre um ein Vielfaches teurer, ohne die Rangfolge wesentlich zu ändern. Tiefe Auswertung erst beim Öffnen. |
| Mock-Provider simulieren Latenz und Ausfälle | Der Aggregator ist damit gegen Teilausfälle getestet, bevor die erste echte API angebunden wird. |

## Current State

**Working**: Alles. `npm run dev` läuft ohne jede Konfiguration im synthetischen Modus.
Verifiziert im Browser: Dashboard (Discovery in eigener Suspense-Grenze), Discovery mit
Gruppierung nach Chancen-Art, Recherche mit Auto-Start aus `?term=`, Analyse-Detailseite,
Historie. `npm run build`, `npx tsc --noEmit`, `npm run lint` (0 Warnungen) und `npm test`
(24/24) sind grün.

**Broken**: Nichts bekannt.

**Uncommitted Changes**: Keine — Working Tree sauber. Der gesamte Stand liegt im Initial
Commit `affb0f0` auf `main` (94 Dateien). Kein Remote konfiguriert.
`.gitignore` deckt `node_modules`, `.next`, `.env*.local`, `next-env.d.ts`, `*.tsbuildinfo`
und `.data` ab (verifiziert mit `git check-ignore -v`). In `.data/analyses/` liegen 6
Testanalysen aus der Verifikation; sie sind ignoriert und können gelöscht werden.

**Git-Identität**: **repo-lokal** gesetzt auf `Jannis Grajczyk <jannis.grajczyk@gmail.com>` —
global war keine konfiguriert. Der Name ist aus der E-Mail-Adresse abgeleitet; falls er nicht
stimmt: `git config user.name "…"` und `git commit --amend --reset-author --no-edit`.

## Files to Know

| File | Why It Matters |
|---|---|
| `src/domain/types.ts` | Die Sprache des Produkts. Alles andere referenziert diese Typen. |
| `src/domain/scoring/opportunity-score.ts` | Die 9 Faktoren. Jede Änderung hier verschiebt alle Bewertungen. |
| `src/domain/scoring/weights.ts` | Gewichtung als Produktentscheidung, Summe muss 1 ergeben (Test sichert das). |
| `src/server/providers/types.ts` | Der `DataProvider`-Vertrag — Ausgangspunkt für jede neue Quelle. |
| `src/server/providers/registry.ts` | Einziger Ort, der konkrete Provider kennt. Live gewinnt gegen Mock. |
| `src/server/providers/aggregator.ts` | Zusammenführung, Konfliktauflösung, `dataQuality`-Berechnung. |
| `src/server/providers/mock/market-fixture.ts` | Erzeugt die synthetische Marktwahrheit; alle Mocks projizieren daraus. |
| `src/server/ai/anthropic-analyst.ts` | Modellaufruf. Nie gegen ein echtes Modell gelaufen. |
| `src/server/ai/index.ts` | Fallback-Logik Modell → Heuristik. |
| `src/server/config/env.ts` | Einziger Ort, der `process.env` liest. |
| `src/app/globals.css` | Design-Tokens (Light/Dark) — Komponenten greifen nur hierauf zu. |
| `scripts/alias-hooks.mjs` | Löst `@/` und endungslose Importe für den Node-Testrunner auf. |

## Code Context

**Der Provider-Vertrag** — das ist alles, was eine neue Quelle implementieren muss:

```ts
// src/server/providers/types.ts
interface DataProvider {
  readonly id: SourceId;                    // in domain/types.ts ergänzen
  readonly label: string;
  readonly capabilities: readonly Capability[];
  readonly kind: "live" | "mock";
  readonly priority: number;                // höher gewinnt bei Signalkonflikten
  isAvailable(): boolean;                   // z.B. Boolean(getConfig().providers.keys.serpApi)
  fetch(query: MarketQuery, context: ProviderContext): Promise<ProviderResult>;
  discover?(context: ProviderContext): Promise<DiscoverySeed[]>;
}

interface ProviderResult {
  confidence: number;        // 0..1 — Selbsteinschätzung
  synthetic: boolean;        // false bei echten Daten
  freshnessDays: number;
  payload: ProviderPayload;  // alle Felder optional
  message?: string;          // erscheint im UI-Quellenprotokoll
}
```

Registrierung: in `src/server/providers/registry.ts` dem Array am Dateianfang hinzufügen.
Mehr ist nicht nötig — `resolveProviders()` bevorzugt bei gleicher `id` automatisch
`kind: "live"` gegenüber `kind: "mock"`.

**Konfliktauflösung im Aggregator** (relevant, wenn Live- und Mock-Daten gemischt auftreten):

```ts
// Gewicht eines Beitrags = provider.priority * result.confidence
// - demand:      Zeitreihe von der stärksten Quelle, Wachstumsraten gewichtet gemischt
// - competition: listingCount/activeSellers vom Leitmarkt, Rest gemischt
// - pricing:     alle numerischen Felder gewichtet gemischt
// - seasonality/audience/design: pickBest — stärkster Beitrag unverändert
// - keywords:    Union, mehrfach bestätigte zuerst
```

**API-Antwortform** (`POST /api/research`):

```json
{ "id": "uuid", "term": "Hunde", "score": 53.1, "grade": "C",
  "durationMs": 758, "analyst": "heuristic" }
```

**Nicht offensichtlich:**

- `TtlCache.resolve()` teilt laufende Berechnungen — gleichzeitige Aufrufe mit demselben Schlüssel lösen nur *eine* Discovery aus.
- `JsonAnalysisRepository` serialisiert Schreibzugriffe über eine Promise-Kette (`enqueue`). Das wirkt nur, wenn alle Zugriffe durch **dieselbe Instanz** laufen — deshalb das Singleton in `repositories/index.ts`.
- `de()`/`dePercent()` aus `domain/format.ts` sind für servergenerierte **Texte**, `lib/format.ts` für die **UI**. Beide nutzen `de-DE`. Nicht vermischen: Rohe `round()`-Werte in deutschen Sätzen erzeugen englische Dezimalpunkte.
- `demand.direction` ist die maßgebliche Trendaussage (berücksichtigt beide Zeiträume). Aussagen, die nur `growth90d` betrachten, widersprechen ihr — dieser Bug war vorhanden und wurde behoben.

## Resume Instructions

1. **Baseline prüfen**:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run build
   ```
   - Erwartet: keine Fehler, 42/42 Tests, Build listet 10 Routen.
   - Falls TypeScript-Fehler zu Next-Typen: `.next/` löschen und erneut bauen.

2. **App starten und Betriebsmodus prüfen**:
   ```bash
   npm run dev
   ```
   Dann `http://localhost:3000/api/health` aufrufen.
   - Erwartet: `{"status":"ok","dataMode":"mock","analyst":"heuristic","providers":{"registered":6,"active":[…]}}`
   - Zeigt `analyst: "heuristic"` obwohl `ANTHROPIC_API_KEY` gesetzt ist: `BRANDOS_AI_MODE` steht auf `heuristic`.

3. **AI-Pfad verifizieren** (falls ein Key vorliegt):
   `.env.local` mit `ANTHROPIC_API_KEY=…` anlegen, Server neu starten, dann eine Analyse
   über die Recherche-Seite starten.
   - Erwartet: Auf der Analyse-Detailseite **fehlt** der graue Hinweis „Diese Interpretation stammt aus der regelbasierten Auswertung", und `POST /api/research` liefert `"analyst": "anthropic"`.
   - Bleibt es bei `heuristic`: Serverlog prüfen — `WARN brandos:ai – Modell nicht nutzbar` nennt den Grund im Klartext (Ratenlimit, Schemafehler, Ablehnung).

4. **Ersten Live-Provider bauen** (`src/server/providers/live/google-trends.ts`):
   - `DataProvider` implementieren, `kind: "live"`, `priority: 20`, `isAvailable()` gegen `getConfig().providers.keys.serpApi`
   - In `registry.ts` registrieren
   - Verifikation: `/api/health` zeigt `dataMode: "mixed"` und `google-trends` mit `kind: "live"`; im Analyse-UI wechselt das Quellenprotokoll für diese Zeile auf „Live-Daten".

## Setup Required

- Node 24 / npm 11 (getestet mit v24.14.0 / 11.9.0)
- **Keine** Umgebungsvariablen nötig — alle sind optional, siehe `.env.example`
- Für den AI-Pfad: `ANTHROPIC_API_KEY` in `.env.local`
- `.claude/launch.json` ist vorhanden (Dev-Server auf Port 3000)

## Edge Cases & Error Handling

- **Alle Provider fallen aus** → `MarketSignals` ohne `demand`; alle Score-Faktoren `imputed`, Konfidenz auf Minimum, Treiber/Bremsen leer. Discovery überspringt solche Kandidaten (`scanSeed` gibt `undefined` zurück).
- **Modell antwortet mit `stop_reason: "refusal"` oder `"max_tokens"`** → `AnalystError`, Fallback auf Heuristik, Grund erscheint als zusätzlicher Eintrag in `interpretation.risks`.
- **Modellantwort verletzt das Schema** → lokale Zod-Validierung schlägt an, gleicher Fallback. Structured Outputs erzwingen die Form, nicht die Plausibilität — die Doppelprüfung ist Absicht.
- **Manipulierte Analyse-ID** → `isSafeId()` in `json-analysis-repository.ts` blockiert Pfad-Traversal; Seite rendert `not-found.tsx`.
- **Index-Datei beschädigt** → wird als leer behandelt (Warnung im Log). `JsonAnalysisRepository.rebuildIndex()` stellt ihn aus den Einzeldateien wieder her — noch ohne Aufrufer.
- **Gleichzeitige Analysen desselben Begriffs** → beide werden gespeichert (eigene IDs). Kein Dedup gewollt: Zeitpunkte unterscheiden sich.
- **Nicht behandelt**: Rate-Limiting der eigenen API, Authentifizierung, Mandantentrennung.

## Warnings

- **Keine TypeScript-Parameter-Properties** (`constructor(readonly x: T)`). Sie erzeugen Laufzeitcode, den Nodes Type-Stripping nicht unterstützt — der Testlauf bricht mit `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` ab. Felder ausschreiben.
- **Tests laufen mit `--conditions=react-server`**, damit `server-only` auf die leere Variante auflöst. Ohne das schlägt jeder Test fehl, der ein Servermodul importiert.
- **`round()` nicht in deutschen Sätzen verwenden.** Erzeugt `36.2` statt `36,2`. Immer `de()`/`dePercent()`/`deShare()`/`deCompact()` aus `src/domain/format.ts`.
- **Kein `toLowerCase()` auf deutschen Text.** Substantive bleiben großgeschrieben. Dieser Bug war zweimal vorhanden (Ideentitel, Discovery-Hinweise).
- **Mock-Provider werfen absichtlich Fehler** (4–8 % Wahrscheinlichkeit, seed-abhängig) und simulieren Latenz. Sporadische `WARN brandos:aggregator – Provider fehlgeschlagen`-Einträge sind erwartetes Verhalten, kein Defekt.
- **`buildMarketFixture()` cached pro Begriff und Kalendermonat.** Änderungen an Lexikon oder Fixture wirken sich im laufenden Dev-Server erst nach Neustart aus.
- **`server-only` in Server-Modulen ist Absicht** — der Import bricht den Build, falls ein Client-Component versehentlich Serverlogik zieht.
- **`"type": "module"` in `package.json` ist nötig** für den Node-Testrunner (sonst `MODULE_TYPELESS_PACKAGE_JSON`-Warnung). Build und Dev funktionieren damit; nicht entfernen.
- **`src/**/*.test.ts` liegt neben dem Produktivcode** und wird von `tsc` mitgeprüft, aber nicht gebundelt (kein App-Code importiert sie).
