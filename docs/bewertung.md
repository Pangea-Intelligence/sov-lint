# Bewertungslogik: Klumpenrisiko-Level 0-4

Diese Datei ist die menschenlesbare Fassung von `src/screen/level.ts` - beide
müssen synchron bleiben. Die Bewertung ist bewusst **nicht** Teil von
`spec/profile.md`: Die Datei beschreibt, das Werkzeug bewertet. Wer eine
eigene Bewertungslogik über dsov-Stücklisten bauen will, kann das tun.

## Die fünf Stufen

| Stufe | Name |
|---|---|
| 0 | vollständig exponiert |
| 1 | stark abhängig |
| 2 | teilweise abgesichert |
| 3 | weitgehend souverän |
| 4 | souverän handlungsfähig |

## Grundprinzip

Jeder Eintrag wird über **vier Achsen** bewertet (je 0-4). Das Level eines
Eintrags ist das **Minimum seiner Achsen**. Das Firmen-Level ist das
**Minimum über die geschäftskritischen Einträge** - nur sie deckeln. Ein
ersetzbares Newsletter-Tool auf US-Infrastruktur erzeugt einen Befund, aber
es drückt nicht die ganze Firma auf Stufe 0.

Alle `unbekannt`-Werte werden **konservativ** (wie der schlechteste
plausible Fall) bewertet und als eigener Befund gemeldet: Klären lohnt sich,
das Level kann dadurch nur steigen.

## Achse 1: Kontrolle - wer kann den Betrieb beenden?

Vorab wird die **effektive Extraterritorialität** bestimmt: Sie gilt als
gegeben, wenn `dsov:provider:extraterritorial` den Wert `ja` oder `unbekannt`
hat, oder wenn die Konzernmutter in einer extraterritorialen Jurisdiktion
sitzt (derzeit `US`, `CN`), selbst wenn `nein` deklariert ist - dieser
Widerspruch wird zusätzlich als Befund gemeldet (Sitzland sticht
Selbstauskunft).

| `dsov:service:deployment` | extraterritorial | nicht extraterritorial |
|---|---|---|
| `on-premise-autark` | 4 | 4 |
| `cloud-eu-treuhand` | 3 | 4 |
| `on-premise-lizenzpflichtig` | 2 | 3 |
| `cloud-anbieter` | 1 | 3 |

## Achse 2: Daten - Zugriff und Verlust

Zwei Teilwerte, das schwächere zählt:

| `dsov:data:location` | Wert | | `dsov:data:backup` | Wert |
|---|---|---|---|---|
| `deutschland` | 4 | | `unabhängig` | 4 |
| `eu-ewr` | 3 | | `beim-anbieter` | 2 |
| `drittland` | 1 | | `keins` | 1 |
| `unbekannt` | 1 | | `unbekannt` | 1 |

Zwei Sonderregeln:

- **Nur Unkritisches:** Ist `dsov:data:classification` ausschließlich
  `unkritisch`, steht die Achse auf 4 - wo nichts Schützenswertes liegt,
  misst sie nichts.
- **Verschärfung:** Liegen `betriebsgeheimnisse` im `drittland` oder an
  `unbekannt`em Ort, fällt die Achse auf **0** - die härteste
  Einzelexposition im Profil.

## Achse 3: Kontinuität - wie schnell steht der Prozess?

| `dsov:dependency:offlineCapability` | Wert |
|---|---|
| `dauerhaft` | 4 |
| `tage` | 3 |
| `stunden` | 2 |
| `sofort-tot` | 1 |

## Achse 4: Exit - kommt man wieder raus?

Minimum aus drei Teilwerten:

| `dsov:exit:alternative` | Wert | | `dsov:exit:dataPortability` | Wert | | `dsov:dependency:integrationDepth` | Wert |
|---|---|---|---|---|---|---|---|
| `verfügbar` | 4 | | `vollständig` | 4 | | `standalone` | 4 |
| `mit-abstrichen` | 2 | | `teilweise` | 2 | | `schnittstellen` | 3 |
| `keine` | 1 | | `proprietär-gefangen` | 1 | | `tief-integriert` | 2 |

**Anhebung:** Steht sowohl Kontrolle als auch Kontinuität auf mindestens 3,
wird die Exit-Achse um 1 angehoben (maximal 4). Begründung: Wer autark und
dauerhaft lauffähig ist, hat Zeit für den Ausstieg - Exit-Druck entsteht
erst, wenn Kontrolle oder Kontinuität wackeln. Ohne diese Regel stünde ein
souverän betriebenes deutsches On-Premise-ERP nur wegen seiner
Integrationstiefe auf Stufe 2, was das Ergebnis unglaubwürdig machen würde.

## Befunde und Exit-Codes

| Befund | Schwere |
|---|---|
| Geschäftskritischer Eintrag mit Stufe 0-1 (deckelt) | hoch |
| `unbekannt`-Angaben | mittel |
| Widerspruch Sitzland vs. Extraterritorialitäts-Angabe | mittel |
| Kein Eintrag als geschäftskritisch markiert | mittel |
| "Wichtiger" (nicht kritischer) Eintrag mit Stufe 0-1 | info |

Exit-Codes von `sov-lint screen`: `0` = keine Befunde der Schwere
hoch/mittel, `1` = akute Befunde oder Datei besteht `lint` nicht,
`2` = Bedienfehler. `screen` bewertet nur Dateien, die `lint` bestehen -
auf unvollständigen Angaben wäre jedes Level eine Scheinpräzision.

## Bewusste Grenzen

Die Bewertung ist eine Heuristik für den Ersteindruck, kein Audit. Sie
kennt weder Vertragsdetails (Kündigungsfristen, Escrow-Klauseln) noch
technische Migrationsrealität. Für die Priorisierung von
Gegenmaßnahmen, Branchenvergleiche und die wirtschaftliche Bewertung der
Exit-Pfade: [Pangea Intelligence](https://pangea-intelligence.eu).
