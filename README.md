# sov-lint

**Linter für digitale Abhängigkeits-Stücklisten im Mittelstand.**

Welche Software und welche Cloud-Dienste halten Ihren Betrieb am Laufen - und
wem gehören sie eigentlich? `sov-lint` prüft Stücklisten der digitalen
Abhängigkeiten eines Unternehmens: maschinenlesbar im etablierten
[CycloneDX-Format](https://cyclonedx.org/) (ECMA-424), ergänzt um das offene
**dsov-Profil** mit 11 Feldern zu Jurisdiktion, Daten, Abhängigkeit und Exit.

Dieselbe Logik, mit der ein Einkäufer physische Lieferketten betrachtet,
angewandt auf die digitale Ebene: Klumpenrisiko sichtbar machen, bevor es zum
Problem wird. Ein Projekt von [Pangea Intelligence](https://pangea-intelligence.eu).

## Schnellstart

Drei Schritte, kein Setup:

```bash
npx sov-lint template          # schreibt stueckliste.json mit Muster-Einträgen + Ausfüllhilfe
npx sov-lint lint stueckliste.json     # prüft Form und Vollständigkeit
npx sov-lint screen stueckliste.json   # bewertet: Klumpenrisiko-Level 0-4
```

Beispiel-Ausgabe von `screen` für die fiktive Beispiel-Firma:

```
Stückliste: examples/arnsberg-antriebstechnik/stueckliste.json
Einträge: 6 (davon 4 geschäftskritisch)

  Stufe 0  GitHub                     wichtig            schwächste Achse: Daten
  Stufe 1  SolidWorks                 geschäftskritisch  schwächste Achse: Kontinuität
  Stufe 1  Microsoft 365              geschäftskritisch  schwächste Achse: Kontrolle
  Stufe 2  DATEV Unternehmen online   geschäftskritisch  schwächste Achse: Daten
  Stufe 3  proALPHA ERP               geschäftskritisch  schwächste Achse: Exit

Klumpenrisiko-Level: Stufe 1 von 4 - stark abhängig
Gedeckelt von: SolidWorks, Microsoft 365
```

Die Pointe der Beispiel-Firma: Nicht die Cloud ist das schwächste Glied,
sondern das CAD-System, das im eigenen Haus läuft - und ohne Lizenzserver
sofort stirbt, während die Konstruktionsdaten proprietär gefangen sind.
Das Firmen-Level bestimmen nur **geschäftskritische** Einträge: GitHub steht
auf Stufe 0, deckelt aber nicht. Die vollständigen Bewertungsregeln sind
offen dokumentiert in [`docs/bewertung.md`](docs/bewertung.md).

Beispiel-Ausgabe von `lint` für eine unvollständige Stückliste:

```
sov-lint 0.1.0 - von Pangea Intelligence

FEHLER  stueckliste.json - 2 Befunde
  /services/0  "Microsoft 365" (services/0): Pflicht-Property dsov:dependency:offlineCapability fehlt. Erlaubt: dauerhaft | tage | stunden | sofort-tot.
  /components/0/properties/6  "SolidWorks" (components/0): ungültiger Wert "kritisch" für dsov:dependency:criticality. Erlaubt: geschäftskritisch | wichtig | ersetzbar.

1 Datei geprüft, 0 sauber, 1 mit Befunden
```

Exit-Codes: `0` = alles sauber, `1` = Befunde, `2` = Bedienfehler. Damit ist
`sov-lint` direkt CI-fähig.

## Wie sieht so eine Stückliste aus?

Eine gewöhnliche CycloneDX-1.6-Datei: Cloud-Dienste als `services`, installierte
Software als `components`, pro Eintrag 11 Properties im `dsov:`-Namespace.
Ein vollständiges Beispiel eines fiktiven Maschinenbauers liegt in
[`examples/arnsberg-antriebstechnik/`](examples/arnsberg-antriebstechnik/),
die vollständige Feld-Referenz in [`spec/profile.md`](spec/profile.md).

Der Kern in Kürze - jeder Eintrag beantwortet vier Fragen:

| Gruppe | Fragen |
|---|---|
| **Jurisdiktion** | Wo sitzt die Konzernmutter? Extraterritorialer Zugriff (CLOUD Act)? Cloud oder On-Premise - und wenn On-Premise: läuft es ohne Lizenzserver weiter? |
| **Daten** | Wo liegen die Daten? Was liegt dort (Betriebsgeheimnisse, Personenbezug)? Gibt es ein Backup außerhalb der Kontrolle des Anbieters? |
| **Abhängigkeit** | Wie geschäftskritisch? Wie lange läuft der Prozess bei Abschaltung weiter? Wie tief integriert? |
| **Exit** | Gibt es eine reale Alternative? Kommen die Daten in offenem Format wieder heraus? |

`unbekannt` ist dabei fast überall ein zulässiger Wert - denn nicht zu wissen,
wo die eigenen Konstruktionsdaten liegen, ist ein Befund, kein Ausfüllfehler.

## Warum CycloneDX statt eigenem Format?

Weil eine dsov-Stückliste damit eine gewöhnliche BOM-Datei bleibt: lesbar für
jedes CycloneDX-Werkzeug (z.B. Dependency-Track), anschlussfähig an
CRA-Prozesse, und ohne neuen Standard, den niemand braucht. Die offiziellen
Schemas sind byte-identisch gevendort und gepinnt
([`schemas/PATCHES.md`](schemas/PATCHES.md)).

## Als GitHub Action

Das Repo ist selbst eine Action - drei Zeilen, und jede Änderung an der
Stückliste wird im CI geprüft:

```yaml
- uses: Pangea-Intelligence/sov-lint@main
  with:
    files: stueckliste.json          # command: screen für die Bewertung
```

Exit-Codes: `0` = sauber, `1` = Befunde (Step schlägt fehl), `2` = Bedienfehler.
Die eigene CI dieses Repos führt die Action gegen die Beispiele aus - in beide
Richtungen (saubere Datei passiert, kaputte lässt den Job scheitern).

## Was sov-lint bewusst nicht tut

Die Spezifikation beschreibt, das Werkzeug bewertet - deshalb steht die
Bewertungslogik in [`docs/bewertung.md`](docs/bewertung.md) und nicht in der
Spec, und das Profil bleibt für fremde Werkzeuge mit eigener Bewertungslogik
nutzbar. Die Bewertung selbst ist eine Heuristik für den Ersteindruck, kein
Audit: Sie kennt weder Vertragsdetails noch Migrationsrealität. Für
priorisierte Gegenmaßnahmen, Branchenvergleiche und die wirtschaftliche
Bewertung der Exit-Pfade: [Pangea Intelligence](https://pangea-intelligence.eu).

Ebenfalls Absicht: v0.1 beschreibt nur die **eigenen** Abhängigkeiten. Der
Durchgriff auf Zulieferer folgt in v0.2 mit einem maschinenlesbaren Fragebogen.

## Entwicklung

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist/
npm run dev       # CLI aus den Quellen: npx tsx src/cli.ts
```

Node >= 20. Die gevendorten Schemas werden über
`node scripts/vendor-schemas.mjs --force` aktualisiert.

## Lizenz

Apache-2.0. Die gevendorten CycloneDX-Schemas stehen ebenfalls unter
Apache-2.0 (siehe [NOTICE](NOTICE)).
