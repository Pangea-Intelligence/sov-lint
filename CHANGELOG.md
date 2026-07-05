# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei
dokumentiert. Das Format basiert auf
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

## [0.1.1] - 2026-07-05

Wartungs- und Härtungs-Release ohne Änderung am CLI-Verhalten. Erstes
Release über den neuen, provenance-signierten Publish-Workflow.

### Hinzugefügt

- SECURITY.md: Meldeweg für Schwachstellen (vertraulich per E-Mail,
  keine öffentlichen Issues).
- CONTRIBUTING.md: Sprachprinzip, Entwicklungs-Setup, Test-Pflicht,
  Conventional Commits, Drift-Tests, Release-Ablauf.
- ESLint und Prettier als Dev-Tooling (`npm run lint`,
  `npm run format:check`), in der CI als eigener Schritt verdrahtet.
- Release-Workflow `.github/workflows/release.yml`: Bei Push eines Tags
  `v*` wird gebaut, getestet und mit npm-Provenance nach npmjs.com
  publiziert (npm Trusted Publishing via OIDC, kein Token-Secret).
  Supply-Chain-Härtung: Actions auf Commit-SHAs gepinnt, npm-Version
  fest gepinnt statt `@latest`, `npm ci --ignore-scripts` im
  OIDC-privilegierten Job.

### Geändert

- Exit-Code-Dokumentation im README präzisiert: Bei `screen` zählen nur
  Befunde der Stufen hoch und mittel als Fehlschlag, reine Info-Befunde
  bleiben bei Exit-Code `0`.
- package.json-Metadaten: `types`-Condition im `exports`-Feld,
  `bugs`-URL, durchgängig englische Description, zusätzliche Keywords
  (`vendor-lock-in`, `compliance`), CHANGELOG.md im `files`-Array,
  GitHub-URLs einheitlich als `Pangea-Intelligence` geschrieben.
- CI-Workflow: expliziter `permissions: contents: read`-Block, damit das
  GITHUB_TOKEN unabhängig von Repo-Defaults minimal bleibt.
- GitHub Action: `version`-Input wird gegen SemVer/`latest`/`local`
  validiert, damit über npx keine npm-Alias-Syntax (`npm:paket@x`)
  hereingereicht werden kann.

### Entfernt

- Ungenutzter Parameter `section` der internen Funktion `collectEntries`
  in `src/core/profile.ts`.

## [0.1.0] - 2026-07-03

Erstes Release.

### Hinzugefügt

- `lint`: Validiert digitale Abhängigkeits-Stücklisten (CycloneDX 1.6)
  gegen das dsov-Profil v0.1 mit 11 Pflicht-Properties, deutsche
  Findings, Beispiel-Firma unter `examples/`.
- `screen`: Klumpenrisiko-Bewertung mit Level 0-4 und
  Kritikalitäts-Deckelung (nur geschäftskritische Einträge deckeln das
  Firmen-Level).
- `template`: Starter-Stückliste mit Muster-Einträgen und Ausfüllhilfe.
- GitHub Action: Repo als composite Action nutzbar, eigene CI mit
  Dogfooding und Exit-Code-Checks gegen die Beispiele.
- CycloneDX-1.6-Schemas byte-identisch gevendort und gepinnt (Tag 1.6.2).
- dsov-Profil-Spezifikation (`spec/profile.md`) und deutsches README.
- Exit-Code-Vertrag: `0` = sauber, `1` = Befunde, `2` = Bedienfehler.

[Unreleased]: https://github.com/Pangea-Intelligence/sov-lint/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Pangea-Intelligence/sov-lint/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Pangea-Intelligence/sov-lint/releases/tag/v0.1.0
