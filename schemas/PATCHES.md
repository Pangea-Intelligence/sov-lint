# Gevendorte Schemas: Provenienz und Regeln

## Quelle

Alle Dateien in diesem Ordner stammen byte-identisch aus dem offiziellen
CycloneDX-Specification-Repo:

- Repo: https://github.com/CycloneDX/specification
- Lizenz: Apache-2.0 (siehe NOTICE im Projekt-Root)
- Gepinnter Stand: Tag `1.6.2`, Commit `e833d732337dd33aceb45ff1991f896796f1e5e7`

| Datei | Zweck |
|---|---|
| `bom-1.6.schema.json` | CycloneDX 1.6 BOM-Schema (JSON Schema draft-07) |
| `spdx.schema.json` | SPDX-Lizenz-Enum, per `$ref` aus bom-1.6 referenziert |
| `jsf-0.82.schema.json` | JSON Signature Format, per `$ref` aus bom-1.6 referenziert |

## Regeln

1. **Nie von Hand editieren.** Die Dateien werden ausschließlich über
   `node scripts/vendor-schemas.mjs --force` aktualisiert.
2. **Keine lokalen Patches.** Stand heute gibt es keine Abweichungen vom
   Upstream. Sollte je ein Patch nötig werden, wird er hier dokumentiert
   (Datei, Grund, Diff) - analog zum Vorgehen in dpp-lint. Die Dateien
   werden ausschließlich per Skript aktualisiert, nie von Hand.
3. **Version anheben = bewusste Entscheidung.** CycloneDX 1.7 existiert;
   sov-lint bleibt vorerst auf 1.6, weil 1.6 die von Werkzeugen
   (z.B. Dependency-Track) am breitesten unterstützte Version ist.
   Ein Wechsel ändert den gepinnten Commit und diese Datei.
