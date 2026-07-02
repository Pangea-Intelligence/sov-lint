import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTemplate } from '../src/commands/template.js';
import { lintData } from '../src/commands/lint.js';
import { PROFILE_PROPERTIES } from '../src/core/profile.js';

describe('runTemplate', () => {
  let dir: string;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sov-lint-template-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
    vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('schreibt eine Vorlage, die lint unverändert besteht', () => {
    const target = join(dir, 'stueckliste.json');
    expect(runTemplate({ output: target, force: false })).toBe(0);
    const bom = JSON.parse(readFileSync(target, 'utf8')) as unknown;
    expect(lintData(bom)).toEqual([]);
  });

  it('druckt die Ausfüllhilfe mit allen 11 Pflicht-Properties', () => {
    expect(runTemplate({ output: join(dir, 'a.json'), force: false })).toBe(0);
    const output = logs.join('\n');
    for (const prop of PROFILE_PROPERTIES) {
      expect(output, `${prop.key} fehlt in der Ausfüllhilfe`).toContain(prop.key);
    }
  });

  it('überschreibt nie ohne --force (Exit 2), mit --force schon', () => {
    const target = join(dir, 'b.json');
    expect(runTemplate({ output: target, force: false })).toBe(0);
    expect(runTemplate({ output: target, force: false })).toBe(2);
    expect(runTemplate({ output: target, force: true })).toBe(0);
  });
});
