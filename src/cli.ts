#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import pc from 'picocolors';
import { runLint } from './commands/lint.js';
import { runScreen } from './commands/screen.js';
import { runTemplate } from './commands/template.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('sov-lint')
  .description(
    'Linter für digitale Abhängigkeits-Stücklisten im Mittelstand.\n' +
      'Validiert CycloneDX-1.6-Dateien gegen das dsov-Profil:\n' +
      'Jurisdiktion, Daten, Abhängigkeit, Exit - pro Software und Dienst.'
  )
  .version(pkg.version)
  .addHelpText('after', `\n${pc.dim('von Pangea Intelligence · https://pangea-intelligence.eu')}`);

program
  .command('lint')
  .description('Eine oder mehrere Stücklisten-Dateien prüfen')
  .argument('<dateien...>', 'Stücklisten-Dateien (CycloneDX-JSON, UTF-8 oder UTF-16)')
  .option('--json', 'maschinenlesbare JSON-Ausgabe', false)
  .option('-q, --quiet', 'nur Befunde ausgeben, kein Banner und keine Zusammenfassung', false)
  .action((files: string[], opts) => {
    process.exitCode = runLint(files, opts);
  });

program
  .command('screen')
  .description('Klumpenrisiko einer Stückliste bewerten (Level 0-4, Weakest-Link-Deckelung)')
  .argument('<datei>', 'Stücklisten-Datei (CycloneDX-JSON, muss lint bestehen)')
  .option('--json', 'maschinenlesbare JSON-Ausgabe', false)
  .option('-q, --quiet', 'kein Banner', false)
  .action((file: string, opts) => {
    process.exitCode = runScreen(file, opts);
  });

program
  .command('template')
  .description('Starter-Stückliste mit Muster-Einträgen und Ausfüllhilfe schreiben')
  .option('-o, --output <datei>', 'Zieldatei (Standard: stueckliste.json)')
  .option('-f, --force', 'vorhandene Zieldatei überschreiben', false)
  .action((opts) => {
    process.exitCode = runTemplate(opts);
  });

// Commanders Standard-Exit-Code für Bedienfehler ist 1 und kollidiert mit
// "Befunde gefunden" in unserem Vertrag (0 = sauber, 1 = Befunde, 2 =
// Bedienfehler). exitOverride lässt commander stattdessen werfen, damit wir
// ummappen können: help/version beenden mit 0, jeder Bedienfehler mit 2.
// exitOverride vererbt sich nicht, Subkommandos brauchen es zusätzlich.
program.exitOverride();
for (const sub of program.commands) sub.exitOverride();

program.parseAsync(process.argv).catch((err: unknown) => {
  const commanderErr = err as { code?: string; exitCode?: number };
  if (typeof commanderErr.code === 'string' && commanderErr.code.startsWith('commander.')) {
    process.exitCode = commanderErr.exitCode === 0 ? 0 : 2;
    return;
  }
  console.error(pc.red(`sov-lint: ${err instanceof Error ? err.message : String(err)}`));
  process.exitCode = 2;
});
