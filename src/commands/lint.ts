import { readFileSync } from 'node:fs';
import pc from 'picocolors';
import { fromRoot } from '../core/paths.js';
import { readPayload, ReadError } from '../core/read.js';
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
export function lintData(data: unknown): Finding[] {
  let findings = checkEnvelope(data);
  if (findings.length === 0) {
    findings = validateBom(data);
    if (findings.length === 0) {
      findings = checkProfile(data);
    }
  }
  return findings;
}

function lintOne(file: string): FileResult {
  let findings: Finding[];
  try {
    const { data } = readPayload(file);
    findings = lintData(data);
  } catch (err) {
    const message = err instanceof ReadError ? err.message : `${file}: ${(err as Error).message}`;
    findings = [{ pointer: '', code: 'lesen/fehler', message }];
  }
  return { file, valid: findings.length === 0, findings };
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

  const human = !opts.json;
  if (human && !opts.quiet) {
    console.log(pc.bold(`sov-lint ${version()} - von Pangea Intelligence`));
    console.log('');
  }

  const results = files.map((file) => {
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

  return failed > 0 ? 1 : 0;
}
