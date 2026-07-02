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

```bash
npx sov-lint lint stueckliste.json
```

Beispiel-Ausgabe für eine unvollständige Stückliste:

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

## Was sov-lint bewusst nicht tut

`lint` prüft Form und Vollständigkeit - es bewertet nicht. Die Bewertung
(Klumpenrisiko-Level, Weakest-Link-Analyse) folgt als eigenes Kommando in einer
kommenden Version; die Trennung ist Absicht: Die Datei beschreibt, das Werkzeug
bewertet, und das Profil bleibt für fremde Werkzeuge mit eigener
Bewertungslogik nutzbar.

Ebenfalls Absicht: v0.1 beschreibt nur die **eigenen** Abhängigkeiten. Der
Durchgriff auf Zulieferer folgt in v0.2 mit einem maschinenlesbaren Fragebogen.

## Entwicklung

```bash
npm install
npm test          # vitest, 22 Tests
npm run build     # tsc -> dist/
npm run dev       # CLI aus den Quellen: npx tsx src/cli.ts
```

Node >= 20. Die gevendorten Schemas werden über
`node scripts/vendor-schemas.mjs --force` aktualisiert.

## Lizenz

Apache-2.0. Die gevendorten CycloneDX-Schemas stehen ebenfalls unter
Apache-2.0 (siehe [NOTICE](NOTICE)).
