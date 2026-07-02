# sov-lint - Projektregeln

## Was das ist

Open-Source-CLI von Pangea Intelligence: Linter für digitale
Abhängigkeits-Stücklisten (CycloneDX 1.6 + dsov-Profil) im Mittelstand.
Architektur-Blaupause ist das Schwesterprojekt `dpp-lint`
(`/Volumes/Satechi SSD/dev/dpp-lint`) - bei Grundsatzfragen (CLI-Verhalten,
Vendoring, Release-Flow) dort nachsehen und konsistent bleiben.

## Sprache (deutsch-first, bewusste Entscheidung)

- Alles, was ein Mensch liest, ist DEUTSCH: README, Spec, Findings,
  CLI-Hilfetexte, Enum-Werte (`geschäftskritisch`, `verfügbar`), Reports.
- Technische Schlüssel sind ENGLISCH: Property-Keys (`dsov:provider:country`),
  Code-Identifier, CycloneDX-Standardfelder.
- Echte Umlaute (ö/ä/ü/ß) überall, auch in Enum-Werten und Code-Strings.
  Nie oe/ae/ue/ss. Keine em dashes, nur normale Hyphens.

## Verbindliche Verträge

- Exit-Codes: 0 = sauber, 1 = Befunde, 2 = Bedienfehler. Nie aufweichen.
- `spec/profile.md` und `src/core/profile.ts` sind EIN Inhalt in zwei Formen.
  Jede Profil-Änderung ändert beide; der Drift-Test in tests/profile.test.ts
  erzwingt das strukturell.
- Schemas in `schemas/` sind byte-identisch gevendort und gepinnt. Nie von
  Hand editieren, nur über `node scripts/vendor-schemas.mjs --force`.
  Regeln und Provenienz: `schemas/PATCHES.md`.
- Profil-Prüfung läuft nur bei schema-validem Grundformat (keine doppelten
  Meldungen derselben kaputten Stelle).
- `unbekannt` ist ein legaler Wert und wird beim künftigen Screening als
  eigener Befund behandelt, nie als Fehler abgewiesen.

## Scope-Leitplanken (aus dem Grill 2026-07-02)

- Erstnutzer des CLI: IT-Leiter und Berater, NICHT der Geschäftsführer.
  Der GF bekommt später einen gehosteten Stress-Test auf der Pangea-Website.
- v0.1 beschreibt nur die EIGENEN Abhängigkeiten. Lieferanten-Durchgriff
  kommt erst in v0.2 mit dem Fragebogen (keine Felder ohne Erfassungsweg).
- Bewertung (Level 0-4): nur Geschäftskritisches darf das Level deckeln.
  Die Bewertungslogik gehört ins Werkzeug (`screen`), NICHT in die Spec.
- Offen bleibt: Level 0-4 + Findings im Tool; granularer Score, Benchmark
  und Maßnahmen sind Pangea-gehostet (Open-Core-Schnitt).

## Release

- Vor jedem Publish: `npm run build && npm test`, dann `npm pack --dry-run`
  gegenlesen (bin-Feld-Bug von npm 11 im Blick behalten: `dist/cli.js` ohne
  führendes `./`).
- npm-Publish braucht Felix' 2FA-Bestätigung im Browser.
