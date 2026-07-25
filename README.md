# BrandOS

KI-gestützte Research- und Decision-Intelligence-Plattform für E-Commerce.

BrandOS liefert keine Rohdaten, sondern Entscheidungen: Es sammelt Marktsignale aus
mehreren Quellen, bewertet sie mit einem nachvollziehbaren Opportunity Score,
interpretiert das Ergebnis und leitet daraus konkrete Produktideen ab. Jede Aussage
ist auf ihre Quelle zurückführbar.

```bash
npm install
npm run dev
```

Die Anwendung läuft ohne jede Konfiguration: Ohne API-Keys arbeitet sie vollständig
im synthetischen Datenmodus, alle Funktionen sind nutzbar. Der Betriebsmodus wird in
der Oberfläche dauerhaft ausgewiesen.

---

## Die Pipeline

Jede Analyse durchläuft vier Schritte in fester Reihenfolge:

```
Suchbegriff
    │
    ▼
1. Sammeln     providers/aggregator     Alle Quellen parallel, Teilausfälle erlaubt
    │                                   → MarketSignals + Quellenprotokoll
    ▼
2. Bewerten    domain/scoring           Neun gewichtete Faktoren, rein deterministisch
    │                                   → OpportunityScore + Begründung je Faktor
    ▼
3. Deuten      server/ai                Modell oder Heuristik interpretiert
    │                                   → Insights, Risiken, Produktideen
    ▼
4. Sichern     repositories             → MarketAnalysis
```

Die Reihenfolge ist nicht beliebig. **Die Interpretation kennt den Score, nicht
umgekehrt.** Eine Zahl, die über Investitionsentscheidungen mitbestimmt, muss
reproduzierbar sein — deshalb berechnet kein Modell den Score, es erklärt ihn nur.

---

## Architektur

```
src/
├── domain/              Fachlogik – ohne Framework, Netzwerk oder UI
│   ├── types.ts         Die Sprache des Produkts
│   ├── scoring/         Opportunity Score (reine Funktionen, getestet)
│   ├── ideas/           Kombinatorische Ideengenerierung
│   ├── math.ts          Normalisierung, Entropie, Wachstumsraten
│   └── format.ts        Deutsche Zahlformate für servergenerierte Texte
│
├── server/
│   ├── providers/       Datenquellen hinter einem einzigen Vertrag
│   │   ├── types.ts      DataProvider – der Vertrag
│   │   ├── registry.ts   Auflösung: Live bevorzugt, sonst Mock
│   │   ├── aggregator.ts Zusammenführung, Konfliktauflösung, Datenqualität
│   │   └── mock/         Synthetische Quellen mit gemeinsamem Markt-Fixture
│   ├── ai/              Analyst-Vertrag + Modell- und Heuristik-Implementierung
│   ├── services/        Anwendungsfälle (Research, Discovery, Dashboard, Historie)
│   ├── repositories/    Persistenz hinter einem Interface
│   ├── config/env.ts    Einziger Ort, der process.env liest
│   └── logging/         Strukturiertes Logging
│
├── components/          UI – frei von Fachlogik
├── app/                 Seiten und API-Endpunkte
└── lib/                 Darstellungshilfen
```

**Eine Regel trägt die Architektur:** Jede Schicht kennt nur den Vertrag der
darunterliegenden, nie deren Implementierung. Die Anwendung spricht mit
`DataProvider`, nicht mit Etsy. Mit `Analyst`, nicht mit einem Modell. Mit
`AnalysisRepository`, nicht mit dem Dateisystem.

---

## Die drei Verträge

### `DataProvider` — Datenquellen

```ts
interface DataProvider {
  id: SourceId;
  capabilities: Capability[];      // demand | competition | pricing | audience | …
  kind: "live" | "mock";
  isAvailable(): boolean;          // Zugangsdaten vorhanden?
  fetch(query, context): Promise<ProviderResult>;
  discover?(context): Promise<DiscoverySeed[]>;
}
```

Eine neue Quelle anzubinden heißt: Interface implementieren, in `registry.ts`
registrieren. Sonst nichts. Die Registry bevorzugt automatisch die Live-Variante,
sobald deren Keys gesetzt sind — der Übergang von synthetisch zu echt ist ein
Konfigurationsschritt, keine Code-Änderung.

Der Aggregator behandelt Teilausfälle als Normalfall: Fällt eine Quelle aus,
entsteht eine Lücke, die in `dataQuality` sichtbar wird und die Konfidenz senkt —
kein Fehler. Konflikte werden nach Gewicht (Priorität × Konfidenz) aufgelöst;
numerische Signale werden gemischt, Zeitreihen und Kategorien vom stärksten
Beitrag übernommen.

### `Analyst` — Interpretation

```ts
interface Analyst {
  isAvailable(): boolean;
  interpret(input): Promise<MarketInterpretation>;
}
```

Zwei Implementierungen: `anthropicAnalyst` (Structured Outputs, Streaming) und
`heuristicAnalyst` (regelbasiert). Die Heuristik ist kein Notnagel, sondern die
Untergrenze der Produktqualität — ohne API-Key, bei Modellausfall und in Tests
liefert BrandOS dieselbe Ergebnisstruktur, nur konservativer formuliert. Der
tatsächlich verwendete Analyst wird im Ergebnis über `producedBy.degraded`
ausgewiesen, nicht verborgen.

### `AnalysisRepository` — Persistenz

Aktuell JSON-Dateien unter `.data/` (Einzelanalysen plus abgeleiteter Index für
Listen). Der Vertrag ist so geschnitten, dass ein Wechsel auf Postgres genau eine
Datei ersetzt.

---

## Der Opportunity Score

Neun Faktoren, Summe der Gewichte = 1:

| Faktor | Gewicht | Misst |
|---|---|---|
| Nachfrage | 18 % | Absolutes Volumen und relative Marktposition |
| Wettbewerb | 18 % | Sättigung, Anbieterkonzentration, Einstiegshürde |
| Trend | 16 % | Richtung und Tempo, Kurzfrist stärker gewichtet |
| Geschenkpotenzial | 9 % | Anteil Fremdkäufe — erhöht Preisakzeptanz |
| Emotionale Bindung | 9 % | Identifikation der Zielgruppe |
| Marktalter | 8 % | Angreifbarkeit des Bestandsangebots |
| Saisonales Timing | 8 % | Abstand zum nächsten Peak |
| Produktvielfalt | 7 % | Anzahl und Streuung tragfähiger Produktarten |
| Preisspielraum | 7 % | Raum für Premium-Positionierung |

Zwei Eigenschaften sind bewusst gesetzt:

**Fehlende Signale senken die Konfidenz, nicht den Score.** Ein fehlender Wert ist
eine Unsicherheit, keine schlechte Nachricht. Betroffene Faktoren werden neutral
bewertet, als `imputed` markiert und erscheinen weder unter den Treibern noch unter
den Bremsen — ohne Daten behauptet das System nichts.

**Jeder Faktor trägt seine Begründung.** Kein Wert erscheint unerklärt.

---

## Discovery

Der Nutzer soll nicht wissen müssen, wonach er suchen soll. Discovery arbeitet
zweistufig: Provider schlagen Kandidaten vor (`discover()`), anschließend wird jeder
Kandidat mit einem schlanken Signalsatz (nur Nachfrage und Wettbewerb) bewertet und
begründet. Eine vollständige Analyse je Kandidat wäre um ein Vielfaches teurer, ohne
die Rangfolge wesentlich zu verändern — die tiefe Auswertung erfolgt erst beim
Öffnen. Ergebnisse werden 15 Minuten prozesslokal zwischengespeichert.

Begriffe, die mehrere Quellen unabhängig vorschlagen, werden bevorzugt.

---

## Konfiguration

Alle Variablen sind optional. Siehe [`.env.example`](.env.example).

| Variable | Wirkung |
|---|---|
| `ANTHROPIC_API_KEY` | Aktiviert die modellgestützte Interpretation |
| `BRANDOS_AI_MODEL` | Modell-ID, Standard `claude-opus-5` |
| `BRANDOS_AI_MODE` | `auto` \| `anthropic` \| `heuristic` |
| `ETSY_API_KEY`, `PINTEREST_ACCESS_TOKEN`, … | Aktivieren die jeweilige Live-Quelle |
| `BRANDOS_PROVIDER_TIMEOUT_MS` | Timeout je Quelle, Standard 8000 |
| `BRANDOS_DATA_DIR` | Speicherort des Datastores, Standard `.data` |
| `BRANDOS_LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` |

`process.env` wird ausschließlich in `server/config/env.ts` gelesen.

---

## API

| Methode | Pfad | Zweck |
|---|---|---|
| `POST` | `/api/research` | Analyse starten → `{ id, score, grade, … }` |
| `GET` | `/api/analyses` | Historie (`limit`, `offset`, `saved`, `term`) |
| `GET` | `/api/analyses/:id` | Vollständige Analyse |
| `PATCH` | `/api/analyses/:id` | Merken (`{ saved: boolean }`) |
| `DELETE` | `/api/analyses/:id` | Löschen |
| `GET` | `/api/health` | Aktive Quellen, Analyst, Betriebsmodus |

---

## Befehle

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

Die Tests decken die entscheidungskritische Logik ab: Determinismus des Scores,
Gewichtssumme, Begründungspflicht, Umgang mit Datenlücken und die Vollständigkeit
generierter Ideen.

---

## Technische Entscheidungen

**Next.js 16 (App Router), React 19, TypeScript, Tailwind 4.** Server Components
laden Daten direkt in den Seiten; API-Endpunkte existieren dort, wo der Client sie
braucht (Recherche mit Ladezustand) oder wo später eine öffentliche Schnittstelle
entsteht.

**Keine Chart-Bibliothek.** Sparklines, Score-Ring und Saisonverlauf sind wenige
Zeilen SVG — sie rendern serverseitig, kosten keine Laufzeit und folgen den
Design-Tokens.

**Keine Datenbank.** Die einzige heutige Anforderung lautet „Analysen
wiederfinden". Eine Datei deckt das ohne Betriebsaufwand, Migrationen und native
Abhängigkeiten. Der Vertrag bleibt austauschbar.

**Deterministischer Zufall in den Mocks.** Dieselbe Suchanfrage ergibt dasselbe
Marktbild. Andernfalls wirkte das Produkt beliebig und gespeicherte Analysen
widersprächen späteren Ansichten desselben Marktes. Ein gemeinsames Markt-Fixture
hält die Mock-Quellen untereinander konsistent — ein Markt mit 40.000 Listings und
gleichzeitig 300 Suchanfragen wäre unglaubwürdig.

---

## Vorbereitete Erweiterungen

Die Architektur ist auf diese Richtungen vorbereitet, ohne sie vorwegzunehmen:
weitere Datenquellen (Provider registrieren), Nutzerkonten und Mandanten
(Repository-Schicht), Designgenerierung und Listing-Erstellung (weitere
`Analyst`-artige Verträge), Shop-Anbindungen (Provider mit Schreibrichtung),
öffentliche API (die Endpunkte existieren bereits).
