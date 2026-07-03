import { readFileSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { fromRoot } from '../core/paths.js';
import { readPayload, ReadError, isUsageError, MAX_ENTRIES } from '../core/read.js';
import { validateBom, SPEC_VERSION } from '../core/cyclonedx.js';
import { checkProfile } from '../core/profile.js';
import type { Finding } from '../core/finding.js';

export interface LintOptions {
  json: boolean;
  quiet: boolean;
}

export interface FileResult {
  file: string;
  valid: boolean;
  findings: Finding[];
  /** true bei Bedienfehlern (Pfad falsch, interner Fehler) - führt zu Exit 2. */
  usageError?: boolean;
}

function isRecordTop(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Zählt Einträge (components + services) rekursiv, ohne Objekte zu materialisieren. */
function countEntries(data: unknown): number {
  let n = 0;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    for (const entry of node) {
      n++;
      if (isRecordTop(entry)) {
        walk(entry.components);
        walk(entry.services);
      }
    }
  };
  if (isRecordTop(data)) {
    walk(data.components);
    walk(data.services);
  }
  return n;
}

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(fromRoot('package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Vorprüfung vor dem Schema-Lauf: Ist das überhaupt eine CycloneDX-1.6-Datei?
 * Eine fremde JSON-Datei durch das volle BOM-Schema zu jagen erzeugt nur
 * Fehler-Rauschen; hier kommt stattdessen eine klare Ansage.
 */
function checkEnvelope(data: unknown): Finding[] {
  if (!isRecord(data)) {
    return [
      {
        pointer: '',
        code: 'format/kein-objekt',
        message: 'Datei ist kein JSON-Objekt (erwartet: CycloneDX-BOM).',
      },
    ];
  }
  if (data.bomFormat !== 'CycloneDX') {
    return [
      {
        pointer: '/bomFormat',
        code: 'format/kein-cyclonedx',
        message:
          'Datei ist keine CycloneDX-Stückliste (Feld bomFormat fehlt oder ist nicht "CycloneDX"). ' +
          'Eine Startvorlage liegt in spec/profile.md.',
      },
    ];
  }
  if (data.specVersion !== SPEC_VERSION) {
    return [
      {
        pointer: '/specVersion',
        code: 'format/spec-version',
        message: `sov-lint ${version()} prüft CycloneDX ${SPEC_VERSION}, die Datei deklariert specVersion "${String(
          data.specVersion
        )}".`,
      },
    ];
  }
  return [];
}

/**
 * Die volle lint-Kaskade auf bereits geparsten Daten: Envelope, dann Schema,
 * dann Profil. Jede Schicht läuft nur, wenn die davor sauber war - sonst
 * melden zwei Schichten dieselbe kaputte Stelle doppelt. Wird auch von
 * `screen` genutzt: bewertet wird nur, was lint besteht.
 */
/** Finding-Codes, die einen Bedienfehler (Exit 2) statt eines Befunds (Exit 1) markieren. */
const USAGE_FINDING_CODES = new Set(['format/zu-viele-eintraege']);

export function lintData(data: unknown): Finding[] {
  const envelope = checkEnvelope(data);
  if (envelope.length > 0) return envelope;

  // Eintrags-Cap VOR der teuren Schema-Validierung: schützt CI-Läufe vor
  // pathologisch grossen Dateien (siehe MAX_ENTRIES).
  const count = countEntries(data);
  if (count > MAX_ENTRIES) {
    return [
      {
        pointer: '',
        code: 'format/zu-viele-eintraege',
        message:
          `Datei hat ${count} Einträge, sov-lint validiert höchstens ${MAX_ENTRIES} am Stück. ` +
          `Bitte die Stückliste in kleinere Dateien aufteilen.`,
      },
    ];
  }

  const schema = validateBom(data);
  if (schema.length > 0) return schema;
  return checkProfile(data);
}

function lintOne(file: string): FileResult {
  try {
    const { data } = readPayload(file);
    const findings = lintData(data);
    const usageError = findings.some((f) => USAGE_FINDING_CODES.has(f.code));
    return { file, valid: findings.length === 0, findings, usageError };
  } catch (err) {
    if (err instanceof ReadError) {
      return {
        file,
        valid: false,
        findings: [{ pointer: '', code: 'lesen/fehler', message: err.message }],
        usageError: isUsageError(err.code),
      };
    }
    // Kein ReadError = interner Fehler (z.B. Schema-Datei fehlt/korrupt) -
    // das ist ein Bedienfehler (Exit 2), kein Befund über die Stückliste.
    return {
      file,
      valid: false,
      findings: [
        { pointer: '', code: 'intern/fehler', message: `${file}: interner Fehler: ${(err as Error).message}` },
      ],
      usageError: true,
    };
  }
}

function printResult(result: FileResult): void {
  if (result.valid) {
    console.log(`${pc.green('OK')}      ${result.file}`);
    return;
  }
  console.log(
    `${pc.red('FEHLER')}  ${result.file} - ${result.findings.length} Befund${
      result.findings.length === 1 ? '' : 'e'
    }`
  );
  for (const f of result.findings) {
    const pointer = f.pointer === '' ? '/' : f.pointer;
    console.log(`  ${pc.yellow(pointer)}  ${f.message}`);
  }
}

/**
 * Prüft Stücklisten-Dateien gegen CycloneDX 1.6 und das dsov-Profil.
 * Exit-Code-Vertrag: 0 = alles sauber, 1 = Befunde, 2 = Bedienfehler.
 */
export function runLint(files: string[], opts: LintOptions): number {
  if (files.length === 0) {
    console.error(pc.red('sov-lint: keine Eingabedateien angegeben'));
    return 2;
  }

  // Dieselbe Datei (z.B. durch überlappende Globs) nur einmal prüfen -
  // sonst erscheinen Befunde doppelt und die Zählung stimmt nicht.
  const seenPaths = new Set<string>();
  const uniqueFiles = files.filter((f) => {
    const key = path.resolve(f);
    if (seenPaths.has(key)) return false;
    seenPaths.add(key);
    return true;
  });

  const human = !opts.json;
  if (human && !opts.quiet) {
    console.log(pc.bold(`sov-lint ${version()} - von Pangea Intelligence`));
    console.log('');
  }

  const results = uniqueFiles.map((file) => {
    const result = lintOne(file);
    if (human) printResult(result);
    return result;
  });

  const failed = results.filter((r) => !r.valid).length;
  const passed = results.length - failed;

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else if (!opts.quiet) {
    console.log('');
    const summary = `${results.length} Datei${results.length === 1 ? '' : 'en'} geprüft, ${passed} sauber, ${failed} mit Befunden`;
    console.log(failed > 0 ? pc.red(summary) : pc.green(summary));
  }

  if (results.some((r) => r.usageError)) return 2;
  return failed > 0 ? 1 : 0;
}
