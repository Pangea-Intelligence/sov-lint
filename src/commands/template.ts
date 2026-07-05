import { copyFileSync, lstatSync } from 'node:fs';
import pc from 'picocolors';
import { fromRoot } from '../core/paths.js';
import { PROFILE_PROPERTIES, type PropertyGroup } from '../core/profile.js';

export interface TemplateOptions {
  output?: string;
  force: boolean;
}

const GROUPS: PropertyGroup[] = ['Jurisdiktion', 'Daten', 'Abhängigkeit', 'Exit'];

/**
 * Prüft den Zielpfad mit lstat (folgt keinen Symlinks). existsSync würde einem
 * Symlink folgen und den Überschreib-Schutz umgehen: ein toter Symlink am
 * Zielpfad meldet dann "frei", copyFileSync schriebe durchs Link-Ziel.
 */
function inspectTarget(p: string): 'frei' | 'datei' | 'symlink' {
  try {
    return lstatSync(p).isSymbolicLink() ? 'symlink' : 'datei';
  } catch {
    return 'frei';
  }
}

/**
 * Schreibt eine Starter-Stückliste mit zwei ausgefüllten Muster-Einträgen
 * (ein Cloud-Dienst, eine installierte Software) und druckt die
 * Ausfüllhilfe: alle 11 Pflicht-Properties mit erlaubten Werten.
 * Die Vorlage besteht `sov-lint lint` unverändert.
 */
export function runTemplate(opts: TemplateOptions): number {
  const target = opts.output ?? 'stueckliste.json';
  const kind = inspectTarget(target);

  if (kind === 'symlink') {
    console.error(
      pc.red(
        `sov-lint: ${target} ist ein Symlink - es wird aus Sicherheitsgründen nicht durch Symlinks geschrieben.`
      )
    );
    return 2;
  }
  if (kind === 'datei' && !opts.force) {
    console.error(pc.red(`sov-lint: ${target} existiert bereits (mit --force überschreiben)`));
    return 2;
  }

  try {
    copyFileSync(fromRoot('templates', 'stueckliste.json'), target);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(
      pc.red(
        `sov-lint: konnte ${target} nicht schreiben (${e.code ?? e.message}). Verzeichnis vorhanden?`
      )
    );
    return 2;
  }
  console.log(`${pc.green('geschrieben:')} ${target}`);
  console.log('');
  console.log('Pro Eintrag sind diese 11 Properties Pflicht:');
  for (const group of GROUPS) {
    console.log('');
    console.log(pc.bold(`  ${group}`));
    for (const prop of PROFILE_PROPERTIES.filter((p) => p.group === group)) {
      const allowed = prop.values.length > 0 ? prop.values.join(' | ') : (prop.patternHint ?? '');
      console.log(`    ${pc.cyan(prop.key)}${prop.multiple ? pc.dim(' (mehrfach erlaubt)') : ''}`);
      console.log(`      ${prop.description}`);
      console.log(pc.dim(`      Werte: ${allowed}`));
    }
  }
  console.log('');
  console.log(pc.dim('Referenz: spec/profile.md - prüfen mit: sov-lint lint ' + target));
  return 0;
}
