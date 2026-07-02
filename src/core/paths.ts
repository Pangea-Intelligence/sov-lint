import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedRoot: string | undefined;

/**
 * Findet den sov-lint-Paket-Root, indem von dieser Datei aus aufwärts bis
 * zur nächsten package.json gelaufen wird. Funktioniert aus src/ (tsx),
 * aus dist/ (kompiliert) und bei npx-Aufruf aus beliebigen Verzeichnissen.
 */
export function packageRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `sov-lint interner Fehler: Paket-Root nicht gefunden (keine package.json oberhalb von ${path.dirname(
          fileURLToPath(import.meta.url)
        )})`
      );
    }
    dir = parent;
  }
}

/** Hängt Pfadsegmente an den Paket-Root an. */
export function fromRoot(...segments: string[]): string {
  return path.join(packageRoot(), ...segments);
}
