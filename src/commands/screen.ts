import { readFileSync } from 'node:fs';
import pc from 'picocolors';
import { fromRoot } from '../core/paths.js';
import { readPayload, ReadError, isUsageError } from '../core/read.js';
import { lintData } from './lint.js';
import {
  assessBom,
  LEVEL_NAMES,
  type EntryAssessment,
  type ScreenAssessment,
} from '../screen/level.js';
import type { Finding } from '../core/finding.js';
import { cleanText } from '../core/sanitize.js';

export interface ScreenOptions {
  json: boolean;
  quiet: boolean;
}

export type Severity = 'hoch' | 'mittel' | 'info';

export interface ScreenFinding extends Finding {
  severity: Severity;
}

/**
 * status macht das JSON-Ergebnis für CI-Konsumenten eindeutig, ohne dass sie
 * den Exit-Code brauchen:
 * - 'bewertet': assessment liegt vor, findings zählen
 * - 'lint-fehler': Datei besteht lint nicht, die Fehler stehen in lintFindings
 * - 'bedienfehler': Pfad falsch / interner Fehler, lintFindings trägt die Meldung
 */
export type ScreenStatus = 'bewertet' | 'lint-fehler' | 'bedienfehler';

export interface ScreenFileResult {
  file: string;
  status: ScreenStatus;
  /** null solange die Datei lint nicht besteht. */
  assessment: ScreenAssessment | null;
  lintFindings: Finding[];
  findings: ScreenFinding[];
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

/** Leitet die Screening-Befunde aus der Bewertung ab. */
export function deriveFindings(assessment: ScreenAssessment): ScreenFinding[] {
  const findings: ScreenFinding[] = [];

  if (assessment.companyLevel === null) {
    findings.push({
      pointer: '',
      code: 'bewertung/keine-kritischen',
      severity: 'mittel',
      message:
        'Kein Eintrag ist als geschäftskritisch markiert - für einen laufenden Betrieb ' +
        'unplausibel. Ohne kritische Einträge gibt es kein Firmen-Level.',
    });
  }

  for (const e of assessment.entries) {
    if (e.criticality === 'geschäftskritisch' && e.level <= 1) {
      const capsCompany = e.level === assessment.companyLevel;
      findings.push({
        pointer: e.pointer,
        code: 'bewertung/deckel',
        severity: 'hoch',
        message: capsCompany
          ? `${e.name}: Stufe ${e.level} (${LEVEL_NAMES[e.level]}), deckelt das Firmen-Level. ` +
            `Schwächste Achse: ${e.weakestAxis} (${e.axes[e.weakestAxis]}).`
          : `${e.name}: Stufe ${e.level} (${LEVEL_NAMES[e.level]}), geschäftskritisch und dringend - ` +
            `ein anderer Eintrag liegt noch tiefer und deckelt (Firmen-Level ${assessment.companyLevel}). ` +
            `Schwächste Achse: ${e.weakestAxis} (${e.axes[e.weakestAxis]}).`,
      });
    } else if (e.criticality !== 'geschäftskritisch' && e.level <= 1) {
      // Jeder exponierte Eintrag wird sichtbar, auch ein ersetzbarer - er
      // deckelt nicht, verschwindet aber auch nicht lautlos aus dem Bericht.
      findings.push({
        pointer: e.pointer,
        code: 'bewertung/exponiert-unkritisch',
        severity: 'info',
        message:
          `${e.name}: Stufe ${e.level} (schwächste Achse: ${e.weakestAxis}), ` +
          `deckelt aber nicht - Kritikalität ist "${e.criticality}".`,
      });
    }

    if (e.dataExposure) {
      findings.push({
        pointer: e.pointer,
        code: 'bewertung/datenexposition',
        severity: 'mittel',
        message:
          `${e.name}: schützenswerte Daten (Betriebsgeheimnisse oder personenbezogen) ` +
          `schwach abgesichert - Daten-Achse auf Stufe ${e.axes.Daten}. ` +
          `Gilt unabhängig davon, wie geschäftskritisch der Eintrag ist.`,
      });
    }

    if (e.contradiction) {
      findings.push({
        pointer: e.pointer,
        code: 'bewertung/widerspruch',
        severity: 'mittel',
        message:
          `${e.name}: Konzernmutter sitzt in einer extraterritorialen Jurisdiktion, ` +
          `aber dsov:provider:extraterritorial ist "nein". Konservativ als "ja" bewertet - Angabe prüfen.`,
      });
    }

    if (e.unknowns.length > 0) {
      findings.push({
        pointer: e.pointer,
        code: 'bewertung/unbekannt',
        severity: 'mittel',
        message:
          `${e.name}: ${e.unknowns.length} Angabe${e.unknowns.length === 1 ? '' : 'n'} "unbekannt" ` +
          `(${e.unknowns.join(', ')}). Konservativ bewertet - klären lohnt sich, das Level kann nur steigen.`,
      });
    }
  }

  const rank: Record<Severity, number> = { hoch: 0, mittel: 1, info: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Finding-Codes aus lintData, die einen Bedienfehler markieren (siehe lint.ts). */
const USAGE_FINDING_CODES = new Set(['format/zu-viele-eintraege']);

function screenOne(file: string): ScreenFileResult {
  try {
    const { data } = readPayload(file);
    const lintFindings = lintData(data);
    if (lintFindings.length > 0) {
      const status: ScreenStatus = lintFindings.some((f) => USAGE_FINDING_CODES.has(f.code))
        ? 'bedienfehler'
        : 'lint-fehler';
      return { file, status, assessment: null, lintFindings, findings: [] };
    }
    const assessment = assessBom(data);
    return {
      file,
      status: 'bewertet',
      assessment,
      lintFindings: [],
      findings: deriveFindings(assessment),
    };
  } catch (err) {
    if (err instanceof ReadError) {
      return {
        file,
        status: isUsageError(err.code) ? 'bedienfehler' : 'lint-fehler',
        assessment: null,
        lintFindings: [{ pointer: '', code: 'lesen/fehler', message: err.message }],
        findings: [],
      };
    }
    // Interner Fehler (z.B. Schema-Datei fehlt) - Bedienfehler, keine Bewertung.
    return {
      file,
      status: 'bedienfehler',
      assessment: null,
      lintFindings: [
        { pointer: '', code: 'intern/fehler', message: `${file}: interner Fehler: ${(err as Error).message}` },
      ],
      findings: [],
    };
  }
}

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
  hoch: pc.red,
  mittel: pc.yellow,
  info: pc.dim,
};

/** Kürzt zu lange Namen, damit die Levelspalten bündig bleiben. */
function fit(name: string, width: number): string {
  if (name.length <= width) return name.padEnd(width);
  return `${name.slice(0, width - 1)}…`;
}

function printAssessment(result: ScreenFileResult): void {
  if (result.assessment === null) {
    const reason =
      result.status === 'bedienfehler'
        ? 'Datei nicht verwertbar, keine Bewertung möglich:'
        : 'Datei besteht lint nicht, keine Bewertung möglich:';
    console.log(`${pc.red('FEHLER')}  ${result.file} - ${reason}`);
    for (const f of result.lintFindings) {
      const pointer = f.pointer === '' ? '/' : f.pointer;
      console.log(`  ${pc.yellow(pointer)}  ${f.message}`);
    }
    return;
  }

  const a = result.assessment;
  const critical = a.entries.filter((e) => e.criticality === 'geschäftskritisch').length;
  console.log(`Stückliste: ${result.file}`);
  console.log(`Einträge: ${a.entries.length} (davon ${critical} geschäftskritisch)`);
  console.log('');

  const sorted = [...a.entries].sort((x, y) => x.level - y.level);
  for (const e of sorted) {
    const levelLabel = e.level <= 1 ? pc.red(`Stufe ${e.level}`) : e.level === 2 ? pc.yellow(`Stufe ${e.level}`) : pc.green(`Stufe ${e.level}`);
    console.log(
      `  ${levelLabel}  ${fit(e.name, 26)} ${e.criticality.padEnd(18)} schwächste Achse: ${e.weakestAxis}`
    );
  }
  console.log('');

  if (a.companyLevel === null) {
    console.log(pc.yellow('Klumpenrisiko-Level: nicht ermittelbar (kein geschäftskritischer Eintrag)'));
  } else {
    const headline = `Klumpenrisiko-Level: Stufe ${a.companyLevel} von 4 - ${a.levelName}`;
    console.log(a.companyLevel <= 1 ? pc.red(pc.bold(headline)) : a.companyLevel === 2 ? pc.yellow(pc.bold(headline)) : pc.green(pc.bold(headline)));
    if (a.cappedBy.length > 0 && a.companyLevel < 4) {
      console.log(`Gedeckelt von: ${a.cappedBy.join(', ')}`);
    }
  }

  if (result.findings.length > 0) {
    console.log('');
    console.log('Befunde:');
    for (const f of result.findings) {
      console.log(`  ${SEVERITY_COLOR[f.severity](`[${f.severity}]`.padEnd(9))}${f.message}`);
    }
  }
}

/**
 * Bewertet eine lint-saubere Stückliste: Level 0-4 pro Eintrag, Firmen-Level
 * als Minimum über die geschäftskritischen Einträge (Deckel-Regel).
 * Exit-Code-Vertrag: 0 = keine akuten Befunde, 1 = Befunde der Stufe
 * hoch/mittel oder Datei besteht lint nicht, 2 = Bedienfehler
 * (Pfad falsch, Datei zu gross, interner Fehler).
 */
export function runScreen(file: string, opts: ScreenOptions): number {
  const human = !opts.json;
  if (human && !opts.quiet) {
    console.log(pc.bold(`sov-lint ${version()} - von Pangea Intelligence`));
    console.log('');
  }

  const result = screenOne(file);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printAssessment(result);
  }

  if (result.status === 'bedienfehler') return 2;
  if (result.status === 'lint-fehler') return 1;
  const acute = result.findings.some((f) => f.severity === 'hoch' || f.severity === 'mittel');
  return acute ? 1 : 0;
}
