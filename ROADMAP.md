# Phase 2 — Von der Chance zum verkaufsfertigen Produkt

**Entwurf**: 27.07.2026 · Stand `681266b`
**Ziel**: Einen Etsy-Verkäufer von einer gefundenen Opportunity bis zu einem
Produkt begleiten, das eingestellt werden kann.

Phase 1 hat die Datenbasis gebaut: neun Faktoren, 75 % gemessen, jede Aussage
auf ihre Quelle zurückführbar. Dieses Dokument entwirft, was darauf aufsetzt —
**ohne weitere Datenquellen**.

---

## 1. Wo der Verkäufer heute stehenbleibt

```
Discovery ──▶ Analyse ──▶ Score ──▶ Interpretation ──▶ 4 Ideenskizzen ──▶ ✂
                                                                          │
                          alles ab hier passiert ausserhalb von BrandOS ──┘
   Design entwerfen · bewerten · Mockups bauen · Listing texten ·
   Tags recherchieren · Kategorie wählen · Preis festlegen · einstellen
```

Eine `ProductIdea` ist heute: Titel, Bausteine (Nische, Produktart, Zielgruppe,
Emotion, Stil, Differenzierung), Begründung, Potenzial, Abhebung, Preisspanne,
Risiken. Das ist eine **Skizze**, kein Vorhaben — sie lebt in der Analyse, kann
nicht bearbeitet werden, hat keinen Zustand und überlebt keine Entscheidung.

Der Bruch ist scharf: BrandOS sagt „dieser Markt trägt", und der Verkäufer fängt
bei null an.

---

## 2. Drei Befunde, die den Entwurf bestimmen

### 2.1 Die Designsignale sind erfunden

`signals.design` kommt ausschliesslich aus dem **Pinterest-Mock**. Der
Etsy-Mock, der die Capability ebenfalls führt, wird von der Live-Quelle
vollständig verdrängt. Palettenanteile, Typografie, Motive, Beobachtungen —
alles synthetisch, und in der Oberfläche von den gemessenen Signalen nicht zu
unterscheiden.

**Folge:** Eine „Designbewertung gegen den Markt" wäre heute eine Bewertung
gegen Fiktion — in derselben selbstbewussten Aufmachung wie die gemessenen
Faktoren. Genau der Fehler, dessen Beseitigung zwei Sitzungen gekostet hat.

Es gibt zwei ehrliche Auswege:

| Weg | Was er bedeutet |
|---|---|
| **Gegen Gemessenes bewerten** | Preisband, Kategorie-Konventionen, Sättigung, Listing-Alter — plus handwerkliche Kriterien (Lesbarkeit in Thumbnailgrösse, Kontrast, Druckgrenzen), die keine Marktdaten brauchen. Geht **sofort**. |
| **Designsignale echt machen** | Etsys `listing_image`-Endpunkt liefert die Bilder der Treffer. Dominante Farben lassen sich daraus messen. Das ist eine **neue Datenquelle** — ausdrücklich nicht Teil dieser Phase, aber der einzige Weg zu echten Palettenanteilen. |

Der Entwurf unten geht Weg 1 und lässt Weg 2 als spätere Nachrüstung offen.

### 2.2 Ohne Modell gibt es diese Phase nicht

`BRANDOS_AI_MODE=heuristic`, kein `ANTHROPIC_API_KEY`. Bisher war das
folgenlos, weil der Score ohnehin ohne Modell entsteht und die Heuristik eine
vollwertige Interpretation liefert.

**Das trägt hier nicht mehr.** Eine regelbasierte Designkritik wäre wertlos, ein
regelbasierter Listing-Text unverkäuflich. Die Phase braucht deshalb eine neue
Kategorie im Architekturverständnis:

> **Modellpflichtige Funktionen.** Fehlt der Schlüssel, sind sie **abwesend**,
> nicht verschlechtert. Kein Ersatztext, keine leere Bewertung — die Karte
> erscheint nicht, so wie eine Signalkarte ohne Quelle nicht erscheint.

Das ist die konsequente Fortschreibung von „Nicht Messbares bleibt leer".

**Was der Score verspricht, bleibt unberührt:** Er entsteht weiter
deterministisch und ohne Modellbeteiligung. Die Trennlinie verläuft klar —
*Bewerten des Marktes* ist modellfrei, *Erschaffen eines Produkts* ist es nicht.
Diese Grenze muss in der Oberfläche sichtbar sein, sonst verwässert die Zusage,
die BrandOS von einem Ratgeber unterscheidet.

### 2.3 Claude erzeugt keine Bilder

„KI-gestützte Designvorschläge" zerfällt in drei Dinge, die technisch nichts
miteinander zu tun haben:

| | Was es ist | Machbarkeit |
|---|---|---|
| **Design-Richtung** | Text: Farbwerte, Typografie, Motiv, Komposition, Tonalität — als umsetzbares Briefing | Sofort, Claude ist stark darin |
| **Artwork** | Die fertige Grafik | Braucht ein **Bildmodell** — externe API, laufende Kosten, Lizenzfragen |
| **Mockup** | Design auf ein Produktfoto gerechnet | **Keine Erzeugung, sondern Komposition.** Deterministisch, billig, kein Modell |

Mockups sind das beste Verhältnis von Aufwand zu Nutzen in der ganzen Phase und
werden regelmässig mit Bilderzeugung verwechselt. Sie sind es nicht.

**Zum Artwork gehört eine Warnung, die nicht technisch ist:** Etsy verlangt die
Offenlegung KI-generierter Inhalte, und die Regeln haben sich mehrfach
geändert. Wer Artwork erzeugt, gibt dem Verkäufer eine Pflicht mit, von der er
vielleicht nichts weiss. Das muss das Produkt aussprechen, nicht verstecken.

---

## 3. Der fehlende Baustein: das Vorhaben

Heute hängt alles an einer `MarketAnalysis` — einem **Messprotokoll**. Ein
Protokoll ist unveränderlich; ein Produkt in Arbeit ist das Gegenteil.

Deshalb braucht die Phase genau eine neue Domänen-Entität:

```ts
interface ProductProject {
  id: string;
  /** Die Analyse, aus der das Vorhaben entstand. Referenz, keine Kopie. */
  analysisId: string;
  /** Der Marktbegriff zum Zeitpunkt der Entstehung – die Analyse kann verschwinden. */
  term: string;
  title: string;
  status: "idee" | "entwurf" | "bewertet" | "listing" | "eingestellt" | "verworfen";
  /** Übernommen aus der ProductIdea, danach frei bearbeitbar. */
  composition: IdeaComposition;
  assets: ProjectAsset[];
  critique?: DesignCritique;
  listing?: ListingDraft;
  createdAt: string;
  updatedAt: string;
}
```

Zwei Entwurfsentscheidungen dahinter:

- **Referenz statt Kopie.** Das Vorhaben verweist auf die Analyse. Wird sie
  gelöscht, bleibt das Vorhaben bestehen — mit `term` als dem, was es über
  seinen Ursprung noch weiss. Eine Kopie würde die Marktdaten einfrieren und
  stillschweigend veralten lassen.
- **Der Status ist die Werkbank.** Er steuert, welche Werkzeuge sichtbar sind,
  und macht aus einer Liste von Funktionen einen Weg.

Dazu kommt die zweite Lücke: **`.data/` kennt nur JSON.** Hochgeladene Designs
und erzeugte Mockups sind Binärdaten. Das braucht eine Ablage mit derselben
Disziplin wie das Repository — `isSafeId()`, atomares Schreiben, Löschen räumt
die Dateien mit ab.

---

## 4. Die Phasen

### A — Das Vorhaben *(kein Modell nötig)* — ✅ **fertig, 27.07.2026**

Die Wirbelsäule. Ohne sie hat keine andere Funktion einen Ort.

- [x] `ProductProject` samt `JsonProjectRepository`
- [x] „Als Vorhaben übernehmen" auf der Analyseseite
- [x] Vorhabenseite mit Fortschritt, Titel, Notizen; Übersicht unter `/projects`
- [ ] **Asset-Ablage für Binärdaten — bewusst verschoben.** Es gibt bis Phase C
      nichts abzulegen; Infrastruktur ohne Erzeuger wäre auf Verdacht gebaut.
      Sie kommt mit den Mockups, die sie als Erste brauchen.

**Ergebnis:** Der Bruch nach der Analyse ist geschlossen. Noch kein neuer
Erkenntnisgewinn, aber alles Weitere ist andockbar.

### B — Listing-Werkstatt *(Modell empfohlen, Skelett auch ohne)*

Der unmittelbarste Nutzen. Etsys Regeln sind harte Grenzen und damit prüfbar:

| Feld | Grenze | Woher BrandOS es hat |
|---|---|---|
| Titel | 140 Zeichen | Keywords + Nische |
| Tags | 13 Stück, je 20 Zeichen | `keywords`, `category` |
| Kategorie | Etsy-Taxonomie | **gemessen** — `MarketCategorySignal` |
| Preis | — | `pricing`, Perzentile |
| Beschreibung | — | Modell, geerdet in Signalen |

Titel, Tags, Kategorie und Preisvorschlag sind **regelbasiert ableitbar** — die
Heuristik trägt hier tatsächlich. Nur die Beschreibung braucht das Modell.

Der Taxonomie-Messlauf zahlt hier zum zweiten Mal ein: Die Kategorie, die BrandOS
für einen Begriff misst, ist genau das Feld, das der Verkäufer beim Einstellen
ausfüllt.

**Bewusst nicht enthalten:** direktes Veröffentlichen auf Etsy. Das braucht
OAuth2 mit `listings_w`-Scope, nicht den vorhandenen App-Schlüssel — eine eigene
Entscheidung mit eigenem Antrag. Die Phase endet bei Export und Zwischenablage.

### C — Mockups *(kein Modell nötig)*

Design auf Produktvorlagen rechnen: Tasse, T-Shirt, Poster, Sticker. Reine
Bildkomposition — Perspektivtransformation, Maske, Multiply-Überlagerung.

- Vorlagensatz für die Produktarten, die im Markt tatsächlich vorkommen
- Ausgabe in Etsys Bildformat (2000 px, quadratisch)
- **Thumbnail-Vorschau**: Wie sieht das Design in Suchergebnisgrösse aus? Das
  ist die Ansicht, die über den Klick entscheidet, und die niemand prüft

Kein Modell, keine laufenden Kosten, sofort sichtbarer Wert.

### D — Designbewertung *(modellpflichtig)*

Der Verkäufer lädt seinen Entwurf hoch; BrandOS beurteilt ihn — mit Claudes
Bildverständnis, geerdet in dem, was **gemessen** ist:

- Preisband: Wirkt der Entwurf wie ein 17-Euro- oder ein 45-Euro-Produkt?
- Sättigung und Konzentration: Hebt er sich ab, wo es eng ist?
- Kategorie-Konventionen aus der gemessenen Einordnung
- Handwerk ohne Marktdaten: Lesbarkeit im Thumbnail, Kontrast, Druckgrenzen,
  Schnittkanten, Farbraum

**Was hier nicht behauptet werden darf:** „passt zur dominanten Farbwelt des
Marktes" — solange die Palettenanteile aus dem Mock stammen (§ 2.1). Die
Bewertung muss dieselbe Herkunftsdisziplin tragen wie der Score: Jedes Kriterium
weist aus, worauf es sich stützt.

Dies ist die am stärksten differenzierende Funktion — Marktdaten und Entwurf
liegen sonst nirgends zusammen auf einem Tisch.

### E — Designvorschläge *(modellpflichtig)*

Zuerst **Richtungen, kein Artwork**: umsetzbare Briefings mit Farbwerten,
Typografie-Empfehlung, Motividee, Kompositionsskizze — begründet aus den
Signalen und aus der Idee.

Artwork-Erzeugung ist eine **eigene Entscheidung** mit eigenen Fragen: Bildmodell
und Anbieter, laufende Kosten je Entwurf, kommerzielle Nutzungsrechte, und die
Offenlegungspflicht aus § 2.3. Nicht nebenbei zu treffen.

---

## 5. Reihenfolge

```
A Vorhaben ──┬──▶ B Listing-Werkstatt ──▶ C Mockups
             │
             └──▶ D Designbewertung ──▶ E Designvorschläge
                        (ab hier modellpflichtig)
```

**Empfehlung: A → B → C → D → E.**

Begründung: **A** ist Voraussetzung für alles. **B** und **C** liefern Nutzen,
*ohne* dass die Modellfrage entschieden sein muss — B trägt sich zum grössten
Teil regelbasiert, C braucht gar kein Modell. **D** und **E** hängen vollständig
am Schlüssel und an laufenden Kosten.

Das heisst nicht, dass Design unwichtiger wäre. Es heisst, dass zwei Phasen
fertig werden können, während die Modellfrage noch offen ist — und dass die
Designbewertung dann auf einer Werkbank landet, die es schon gibt.

---

## 6. Offene Entscheidungen

1. **Modellzugang.** Ohne `ANTHROPIC_API_KEY` sind D und E nicht baubar und B
   bleibt beim Skelett. Kosten sind real: Die heutige Interpretation läuft mit
   `max_tokens: 64_000` gegen Opus 5.
2. **Artwork ja/nein.** Eigene Entscheidung, siehe E — mit der
   Offenlegungspflicht als Teil davon.
3. **Etsy-Veröffentlichung.** Braucht OAuth2 statt App-Schlüssel. Lohnt erst,
   wenn B steht und sich der Weg bewährt hat.
4. **Echte Designsignale.** Etsys Listing-Bilder wären messbar — widerspricht
   aber der Vorgabe „keine weiteren Datenquellen". Später nachrüstbar; bis
   dahin darf keine Funktion so tun, als gäbe es sie.
