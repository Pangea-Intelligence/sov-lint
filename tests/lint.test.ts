import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLint } from '../src/commands/lint.js';
import { validateBom } from '../src/core/cyclonedx.js';
import { decodeJsonBuffer } from '../src/core/read.js';
import { fromRoot } from '../src/core/paths.js';

const VALID = fromRoot('examples', 'arnsberg-antriebstechnik', 'stueckliste.json');
const INVALID = fromRoot('examples', 'arnsberg-antriebstechnik', 'stueckliste-fehlerhaft.json');
const SCHEMA_INVALID = fromRoot('tests', 'fixtures', 'schema-invalid.json');

describe('runLint (Exit-Code-Vertrag: 0 = sauber, 1 = Befunde, 2 = Bedienfehler)', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liefert 0 für die valide Beispiel-Stückliste', () => {
    expect(runLint([VALID], { json: false, quiet: false })).toBe(0);
  });

  it('liefert 1 und die 5 erwarteten Befunde für das fehlerhafte Beispiel', () => {
    expect(runLint([INVALID], { json: true, quiet: true })).toBe(1);
    const results = JSON.parse(logs.join('\n')) as Array<{
      valid: boolean;
      findings: Array<{ code: string }>;
    }>;
    expect(results).toHaveLength(1);
    expect(results[0].valid).toBe(false);
    const codes = results[0].findings.map((f) => f.code).sort();
    expect(codes).toEqual([
      'profil/property-doppelt',
      'profil/property-fehlt',
      'profil/property-fehlt',
      'profil/unbekannte-property',
      'profil/wert-ungültig',
    ]);
  });

  it('liefert 2 ohne Eingabedateien', () => {
    expect(runLint([], { json: false, quiet: false })).toBe(2);
  });

  it('meldet Schema-Verstöße ohne nachgelagerte Profil-Befunde', () => {
    expect(runLint([SCHEMA_INVALID], { json: true, quiet: true })).toBe(1);
    const results = JSON.parse(logs.join('\n')) as Array<{
      findings: Array<{ code: string }>;
    }>;
    const codes = results[0].findings.map((f) => f.code);
    expect(codes.some((c) => c.startsWith('schema/'))).toBe(true);
    expect(codes.some((c) => c.startsWith('profil/'))).toBe(false);
  });

  it('weist Nicht-CycloneDX-Dateien mit klarer Ansage ab', () => {
    expect(runLint([fromRoot('package.json')], { json: true, quiet: true })).toBe(1);
    const results = JSON.parse(logs.join('\n')) as Array<{
      findings: Array<{ code: string }>;
    }>;
    expect(results[0].findings[0].code).toBe('format/kein-cyclonedx');
  });

  it('meldet fehlende Dateien als Befund, nicht als Absturz', () => {
    expect(runLint(['gibt-es-nicht.json'], { json: true, quiet: true })).toBe(1);
    const results = JSON.parse(logs.join('\n')) as Array<{
      findings: Array<{ code: string; message: string }>;
    }>;
    expect(results[0].findings[0].code).toBe('lesen/fehler');
    expect(results[0].findings[0].message).toContain('nicht gefunden');
  });
});

describe('validateBom', () => {
  it('akzeptiert die valide Beispiel-Stückliste', async () => {
    const { readFileSync } = await import('node:fs');
    const bom = JSON.parse(readFileSync(VALID, 'utf8')) as unknown;
    expect(validateBom(bom)).toEqual([]);
  });

  it('meldet ein fehlendes Pflichtfeld auf Deutsch', async () => {
    const { readFileSync } = await import('node:fs');
    const bom = JSON.parse(readFileSync(SCHEMA_INVALID, 'utf8')) as unknown;
    const findings = validateBom(bom);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((f) => f.message).join(' ')).toContain('Pflichtfeld fehlt: type');
  });
});

describe('decodeJsonBuffer', () => {
  it('dekodiert UTF-16 LE mit BOM (Windows-Exporte)', () => {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('{"a":"ü"}', 'utf16le'),
    ]);
    const { text, encoding } = decodeJsonBuffer(buf, 'test');
    expect(encoding).toBe('utf-16le (BOM)');
    expect(JSON.parse(text)).toEqual({ a: 'ü' });
  });
});

describe('CLI Ende-zu-Ende', () => {
  const tsx = fromRoot('node_modules', 'tsx', 'dist', 'cli.mjs');
  const cli = fromRoot('src', 'cli.ts');

  function run(args: string[]): { status: number; stdout: string } {
    try {
      const stdout = execFileSync(process.execPath, [tsx, cli, ...args], {
        cwd: fromRoot(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout };
    } catch (err) {
      const e = err as { status?: number; stdout?: string };
      return { status: e.status ?? -1, stdout: e.stdout ?? '' };
    }
  }

  it('lint über das echte CLI: valide Datei = 0, fehlerhafte = 1, unbekanntes Kommando = 2', () => {
    expect(run(['lint', VALID]).status).toBe(0);
    expect(run(['lint', INVALID]).status).toBe(1);
    expect(run(['gibtsnicht']).status).toBe(2);
  });

  it('--json liefert parsebares JSON auf stdout', () => {
    const { status, stdout } = run(['lint', '--json', VALID]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as Array<{ valid: boolean }>;
    expect(parsed[0].valid).toBe(true);
  });
});
