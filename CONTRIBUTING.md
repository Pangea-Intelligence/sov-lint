# Mitwirken an sov-lint

Danke für dein Interesse. sov-lint ist ein kleines, fokussiertes Werkzeug -
kleine, fokussierte Pull Requests funktionieren am besten.

## Sprachprinzip (deutsch-first)

- Alles, was ein Mensch liest, ist Deutsch: README, Spec, Findings,
  CLI-Hilfetexte, Enum-Werte (`geschäftskritisch`, `verfügbar`), Doku.
- Technische Schlüssel sind Englisch: Property-Keys
  (`dsov:provider:country`), Code-Identifier, CycloneDX-Standardfelder.
- Echte Umlaute (ö, ä, ü, ß) überall, auch in Code-Strings. Nie oe/ae/ue/ss.
  Keine em dashes, nur normale Bindestriche.

## Entwicklung

```sh
git clone https://github.com/Pangea-Intelligence/sov-lint.git
cd sov-lint
npm ci

# CLI aus dem Quellcode starten (tsx)
npm run dev -- lint examples/arnsberg-antriebstechnik/stueckliste.json

# Typprüfung und Build nach dist/
npm run build

# Tests
npm test

# Lint und Formatierung
npm run lint
npm run format:check
```

Voraussetzung: Node >= 20. Das Projekt ist ESM mit NodeNext-Auflösung,
relative Imports in `.ts`-Dateien brauchen deshalb die `.js`-Endung.

## Tests sind Pflicht

- `npm run build` und `npm test` müssen durchlaufen.
- Jede Verhaltensänderung braucht neue oder angepasste Tests.
- **Drift-Tests:** `spec/profile.md` und `docs/bewertung.md` sind mit dem
  Code (`src/core/profile.ts`, `src/screen/level.ts`) strukturell verzahnt.
  Wer Profil oder Bewertungslogik ändert, muss Spec bzw. Doku im selben PR
  mitziehen - sonst schlagen die Tests fehl. Das ist Absicht.

## Commits

Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:` usw.,
optional mit Scope (`feat(screen): ...`).

## Verbindliche Verträge

- Exit-Codes sind stabile API: `0` = sauber, `1` = Befunde, `2` =
  Bedienfehler. Änderungen daran brauchen vorherige Diskussion.
- Schemas unter `schemas/` sind byte-identisch gevendort und gepinnt.
  Nie von Hand editieren, nur über `node scripts/vendor-schemas.mjs --force`.
  Regeln und Provenienz: `schemas/PATCHES.md`.

## Releases

1. Version in `package.json` erhöhen und committen.
2. Tag `vX.Y.Z` setzen und pushen, z. B.
   `git tag v0.2.0 && git push origin v0.2.0`.
3. `.github/workflows/release.yml` baut, testet und publisht das Paket
   nach npmjs.com mit npm-Provenance (`npm publish --provenance`).

Voraussetzung: npm Trusted Publishing (OIDC) ist für das Paket `sov-lint`
auf npmjs.com konfiguriert (Repo Pangea-Intelligence/sov-lint, Workflow
`release.yml`). Ein npm-Token als GitHub-Secret gibt es bewusst nicht.
