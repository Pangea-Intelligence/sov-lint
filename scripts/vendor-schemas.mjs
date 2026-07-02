#!/usr/bin/env node
// Vendort die offiziellen CycloneDX-JSON-Schemas nach schemas/.
//
// Quelle: https://github.com/CycloneDX/specification (Apache-2.0)
// Die Dateien werden byte-identisch übernommen und nie lokal verändert.
// Provenienz und Regeln: schemas/PATCHES.md
//
// Aufruf:  node scripts/vendor-schemas.mjs [--force]
// Ohne --force wird eine vorhandene Datei nie überschrieben.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tag 1.6.2 des specification-Repos, als unveränderlicher Commit gepinnt.
const DEFAULT_REF = 'e833d732337dd33aceb45ff1991f896796f1e5e7';

// bom-1.6 referenziert spdx und jsf per $ref, beide müssen mit vendort werden.
const FILES = ['bom-1.6.schema.json', 'spdx.schema.json', 'jsf-0.82.schema.json'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = path.join(root, 'schemas');
const force = process.argv.includes('--force');
const ref = process.env.CYCLONEDX_REF ?? DEFAULT_REF;

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  return res.text();
}

mkdirSync(targetDir, { recursive: true });

let written = 0;
let skipped = 0;
for (const file of FILES) {
  const target = path.join(targetDir, file);
  if (existsSync(target) && !force) {
    console.log(`übersprungen (existiert): ${file}`);
    skipped++;
    continue;
  }
  const url = `https://raw.githubusercontent.com/CycloneDX/specification/${ref}/schema/${file}`;
  const text = await fetchText(url);
  // Plausibilitätsprüfung: muss parsebares JSON-Schema sein, bevor es landet.
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || !('$schema' in parsed)) {
    throw new Error(`${file}: Antwort sieht nicht wie ein JSON-Schema aus`);
  }
  writeFileSync(target, text, 'utf8');
  console.log(`vendort: ${file} (${text.length} Bytes) @ ${ref.slice(0, 12)}`);
  written++;
}

console.log(`fertig: ${written} geschrieben, ${skipped} übersprungen`);
