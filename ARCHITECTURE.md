# Creator-Architektur — wie Design, Assets und Listing zusammenspielen

**Entwurf**: 27.07.2026 · Stand `310c8a8`
**Zweck**: Die Struktur festlegen, bevor Phase C gebaut wird — damit Mockups und
Assets nicht später umgebaut werden müssen.

Dieses Dokument entscheidet **nicht**, was gebaut wird (das tut
[ROADMAP.md](ROADMAP.md)), sondern **wie es zusammenhängt**.

---

## 1. Was heute steht

Drei Verträge tragen das Produkt. Jeder folgt demselben Muster: eine
Schnittstelle, mehrere Implementierungen, Verfügbarkeit zur Laufzeit geprüft.

| Vertrag | Ort | Implementierungen | Bei Ausfall |
|---|---|---|---|
| `DataProvider` | `server/providers` | 3 live, 4 mock | Lücke, sichtbar in `dataQuality` |
| `Analyst` | `server/ai` | anthropic, heuristic | Heuristik, `degraded: true` |
| `AnalysisRepository` / `ProjectRepository` | `server/repositories` | JSON-Dateien | – |

Zwei Wurzelentitäten mit gegensätzlicher Natur:

- **`MarketAnalysis`** — ein Messprotokoll. Unveränderlich, an einen Zeitpunkt
  gebunden, wird geschrieben und danach nur gelesen.
- **`ProductProject`** — eine Werkbank. Wird fortlaufend verändert, referenziert
  die Analyse, überlebt sie.

Und eine Regel, die alles durchzieht: **jede Aussage weist ihre Herkunft aus.**
`SignalProvenance` beim Score, `ListingFieldBasis` beim Listing. Das ist kein
Schmuck, sondern der Grund, warum man den Zahlen glauben kann.

---

## 2. Was die Creator-Phase wirklich neu einführt

Nicht zehn Dinge, sondern vier. Alles andere ist Anwendung davon.

1. **Ein Erzeuger von Bildern** — eine externe Abhängigkeit einer neuen Art:
   kostet Geld je Aufruf, liefert Binärdaten, hat keine sinnvolle Heuristik.
2. **Binäre Ablage** — `.data/` kennt heute nur JSON.
3. **Eine Ableitungskette** — ein Mockup entsteht aus einem Design, ein Design
   aus einem Briefing, ein Briefing aus Signalen und Bausteinen.
4. **Iteration** — ein Design wird nicht einmal erzeugt, sondern zehnmal
   verworfen.

---

## 3. Die vier Entscheidungen, bei denen ein Fehler später wehtut

Der Rest dieses Dokuments dreht sich darum. Wichtig vorweg, weil es die Liste
kurz hält:

> **Ein optionales Feld später zu ergänzen ist hier billig.** Der Bestand
> toleriert fehlende Felder bereits an mehreren Stellen (`provenance?`,
> `syntheticWeight?`, `listing?`), und die Repositories lesen JSON ohne Schema-
> zwang. Was *teuer* wird, sind Entscheidungen über **Ablage, Besitz,
> Ableitung und Vertragsform** — die vier unten.

### 3.1 Assets gehören ins Dateisystem, ihre Beschreibung ins Vorhaben

**Falsch wäre**: Binärdaten als Base64 in die Projekt-JSON. Ein Mockup in
2000 × 2000 px ist schnell 2 MB; als Base64 im JSON wächst jede Leseoperation
des Vorhabens mit, und `list()` würde unbenutzbar.

**Ebenfalls falsch**: eine globale Asset-Sammlung mit eigenem Index. Assets
werden **immer** über ihr Vorhaben erreicht; ein dritter Index wäre eine
weitere Konsistenz, die schiefgehen kann.

```
.data/projects/<projectId>.json          # Metadaten, inkl. designs[] und assets[]
.data/assets/<projectId>/<assetId>.png   # die Bytes
```

Daraus folgt zweierlei, das **jetzt** festgelegt gehört:

- `isSafeId()` gilt für Asset-IDs genauso wie für Vorhaben-IDs — der Pfad wird
  aus beiden gebaut.
- **`remove()` muss das Asset-Verzeichnis mitlöschen.** Heute entfernt es nur
  die JSON-Datei. Wer das vergisst, sammelt verwaiste Megabytes, und niemand
  merkt es, bis die Platte voll ist.

Ausgeliefert werden Assets über eine Route, nie über einen statischen Pfad:
`GET /api/projects/:id/assets/:assetId` mit passendem Content-Type.

### 3.2 Jedes Asset weiß, woraus es entstand

Das ist die wichtigste Festlegung des Dokuments. Eine flache Liste
`assets: Asset[]` verliert die Ableitung — und dann lässt sich nicht mehr sagen,
welches Mockup zu welchem Design gehört. Genau das wäre der Umbau, den es zu
vermeiden gilt.

```ts
type AssetOrigin =
  | { kind: "upload"; filename: string }
  | { kind: "generated"; designer: SourceId; model: string; briefId: string; seed?: number }
  | { kind: "derived"; from: AssetId; recipe: "mockup"; template: string };
```

Damit entsteht ein gerichteter Graph:

```
Signale + Bausteine
        │
        ▼
   DesignBrief ──generated──▶ Design-Asset ──derived──▶ Mockup-Asset
                                   │                         │
                                   └────────┬────────────────┘
                                            ▼
                                       ListingDraft
```

Drei Dinge fallen dadurch von selbst ab:

- **Regenerieren verwaist nichts.** Ein neues Design ersetzt das alte nicht; die
  alten Mockups bleiben sichtbar bei ihrem Design.
- **Die Herkunftsregel bleibt gewahrt.** `AssetOrigin` ist dieselbe Idee wie
  `SignalProvenance` und `ListingFieldBasis`, nur für Bilder.
- **Die Offenlegungspflicht wird erfüllbar.** Etsy verlangt, KI-generierte
  Inhalte auszuweisen. Ohne durchgehende Herkunft *kann* der Verkäufer das nicht
  — er wüsste nicht mehr, welches Bild aus einem Modell kam. Das ist kein
  Nebensatz in den AGB, sondern eine **Anforderung an den Datenfluss**: Das
  Listing muss `generated` bis nach vorn durchreichen und die Angabe zum
  Kopieren anbieten.

### 3.3 Versioniert wird das Design, nicht das Vorhaben

Die Frage ist nicht „brauchen wir Versionierung", sondern **wovon**.

| Kandidat | Ändert sich | Urteil |
|---|---|---|
| Analyse | nie (Protokoll) | braucht keine Version |
| Bausteine | selten, vom Nutzer | Bearbeitung genügt |
| **Design** | **zehn- bis zwanzigmal** | **hier gehört die Version hin** |
| Listing | oft, aber ableitbar | ein aktueller Entwurf genügt |

Das ganze Vorhaben zu versionieren erzeugte Rauschen: zwanzig Schnappschüsse,
die sich nur im Bild unterscheiden.

```ts
interface DesignVersion {
  id: string;
  /** Fortlaufend, sichtbar als „v3". */
  ordinal: number;
  brief: DesignBrief;
  /** Meist eins; ein Erzeuger darf mehrere Varianten liefern. */
  assetIds: string[];
  status: "kandidat" | "gewaehlt" | "verworfen";
  critique?: DesignCritique;   // Phase D
  createdAt: string;
}
```

Am Vorhaben: `designs: DesignVersion[]` und `chosenDesignId?: string`.
Das Listing merkt sich `basedOnDesignId` — sonst zeigt es irgendwann Bilder,
die zu einem verworfenen Entwurf gehören.

**Verworfen wird nicht gelöscht.** Eine Version, die man wegwirft, ist trotzdem
bezahlt worden; sie zu behalten kostet Plattenplatz, sie wegzuwerfen kostet
Geld, wenn man sie doch wieder will.

### 3.4 Der Designer ist ein eigener Vertrag, kein erweiterter Analyst

`Analyst` ist Text zu strukturiertem Text. Ein Bilderzeuger ist etwas anderes:
andere Ein- und Ausgabe, andere Kosten, andere Fehlerarten. Ihn in `Analyst`
zu pressen hiesse, eine Schnittstelle zu bekommen, die für beides schlecht ist.

```ts
interface Designer {
  readonly id: SourceId;
  readonly label: string;
  isAvailable(): boolean;
  generate(brief: DesignBrief, context: DesignerContext): Promise<GeneratedImage[]>;
}
```

Der entscheidende Unterschied zu `Analyst`: **es gibt keine Rückfallebene.**
Eine Heuristik kann einen Markt deuten; sie kann kein Bild malen. Fehlt der
Zugang, ist die Funktion **abwesend**, nicht verschlechtert — die Regel aus
[ROADMAP.md § 2.2](ROADMAP.md).

Zwei Eigenheiten, die den Vertrag prägen:

- **Kein Antwort-Cache.** Bei Providern spart er Kontingent, weil dieselbe
  Anfrage dieselbe Antwort verdient. Bei einem Bilderzeuger will man
  ausdrücklich **Variation** — ein Cache gäbe zweimal dasselbe Bild zurück und
  wäre eine Fehlfunktion, keine Ersparnis.
- **Nie automatisch.** Jeder Aufruf kostet, also löst ihn immer der Nutzer aus.
  Kein Hintergrundlauf, kein „beim Öffnen erzeugen", keine Discovery, die
  nebenbei zwanzig Bilder produziert.

Der **Mockup-Renderer ist ausdrücklich kein `Designer`.** Er erzeugt nichts, er
rechnet: Perspektivtransformation, Maske, Überlagerung. Deterministisch,
kostenlos, immer verfügbar. Er gehört auf die andere Seite der Grenze.

---

## 4. Wo was liegt

Eine Grenze ist dabei hart: **`src/domain/` ist frei von `server-only` und muss
es bleiben.** Die Tests laden diese Module mit Nodes Type-Stripping; eine native
Bildbibliothek (`sharp`, `@napi-rs/canvas`) dort würde den Testlauf sprengen.

| Was | Wohin | Warum |
|---|---|---|
| `DesignBrief`, `DesignVersion`, `Asset`, `AssetOrigin` | `domain/types.ts` | reine Beschreibung |
| Mockup-**Rezept** (Vorlage, Platzierung, Maße) | `domain/mockup/` | Daten und Rechnung, testbar ohne Bilder |
| Mockup-**Rendering** | `server/rendering/` | braucht native Bibliothek |
| `Designer`-Vertrag + Implementierungen | `server/design/` | externe Abhängigkeit |
| Briefing aus Signalen ableiten | `domain/design/brief.ts` | deterministisch, wie `buildListingDraft` |
| Asset-Ablage | `server/repositories/asset-store.ts` | Dateisystem |

Das Muster ist dasselbe wie bei der Listing-Werkstatt: **die Regel liegt in
`domain/`, der Zugriff auf die Aussenwelt in `server/`.** Deshalb ist
`buildListingDraft` ohne Netz testbar, und deshalb wird es die Mockup-Rechnung
auch sein.

---

## 5. Was das für Phase C konkret bedeutet

Ohne dieses Dokument hätte ich die Mockups so gebaut: ein Bild hochladen, ein
Mockup danebenlegen, beides in `assets: Asset[]` am Vorhaben. Das hätte
funktioniert — und wäre in Phase E vollständig umzubauen gewesen.

Mit dem Entwurf ändert sich an Phase C dreierlei:

1. **Der Asset-Store kommt zuerst** und kennt von Anfang an `AssetOrigin`. Ein
   hochgeladenes Design ist `{ kind: "upload" }`, ein Mockup
   `{ kind: "derived", from, recipe, template }`. Der Erzeuger-Fall bleibt leer,
   aber der Platz ist da.
2. **`DesignVersion` wird eingeführt, auch ohne Erzeuger.** Ein hochgeladenes
   Design ist v1. Damit ist die Iteration von Anfang an modelliert, statt später
   nachgerüstet zu werden.
3. **`remove()` räumt Assets mit ab** — und zwar bevor es Assets gibt, die
   liegenbleiben können.

Was dadurch **nicht** teurer wird: Der Designer-Vertrag, das Briefing und die
Bewertung bleiben ungebaut. Sie haben nur schon einen Platz.

---

## 6. Was bewusst offen bleibt

- **Welches Bildmodell.** Anbieter, Kosten je Bild, kommerzielle Nutzungsrechte —
  eine eigene Entscheidung, die den Vertrag nicht ändert.
- **Welche Mockup-Vorlagen.** Tasse, T-Shirt, Poster, Sticker sind naheliegend,
  aber die Auswahl folgt den Märkten, in denen tatsächlich verkauft wird.
- **Druckdateien.** `kind: "print-file"` steht im Entwurf, weil ein Design für
  den Druck andere Anforderungen hat als für die Anzeige (Auflösung, Farbraum,
  Beschnitt). Ob BrandOS das je erzeugt, ist offen.
- **Etsy-Veröffentlichung.** Braucht OAuth2; unverändert ausserhalb.

---

## 7. Zusammenfassung in einem Satz

Assets liegen im Dateisystem und gehören ihrem Vorhaben, jedes Asset weiß, woraus
es entstand, versioniert wird das Design, und der Bilderzeuger ist ein eigener
Vertrag ohne Rückfallebene — der Rest lässt sich später ergänzen, ohne etwas
davon anzufassen.
