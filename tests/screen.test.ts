import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assessBom,
  assessEntry,
  LEVEL_NAMES,
  type EntryInput,
} from '../src/screen/level.js';
import { deriveFindings, runScreen } from '../src/commands/screen.js';
import { fromRoot } from '../src/core/paths.js';

const VALID = fromRoot('examples', 'arnsberg-antriebstechnik', 'stueckliste.json');
const INVALID = fromRoot('examples', 'arnsberg-antriebstechnik', 'stueckliste-fehlerhaft.json');

function entry(values: Record<string, string | string[]>): EntryInput {
  const map = new Map<string, string[]>();
  const defaults: Record<string, string> = {
    'dsov:provider:country': 'DE',
    'dsov:provider:extraterritorial': 'nein',
    'dsov:service:deployment': 'on-premise-autark',
    'dsov:data:location': 'deutschland',
    'dsov:data:classification': 'geschäftsdaten',
    'dsov:data:backup': 'unabhängig',
    'dsov:dependency:criticality': 'geschäftskritisch',
    'dsov:dependency:offlineCapability': 'dauerhaft',
    'dsov:dependency:integrationDepth': 'standalone',
    'dsov:exit:alternative': 'verfügbar',
    'dsov:exit:dataPortability': 'vollständig',
  };
  for (const [k, v] of Object.entries({ ...defaults, ...values })) {
    map.set(k, Array.isArray(v) ? v : [v]);
  }
  return { pointer: '/services/0', name: 'Test', values: map };
}

describe('assessEntry (Achsen-Logik)', () => {
  it('bewertet den souveränen Idealfall mit Stufe 4', () => {
    const a = assessEntry(entry({}));
    expect(a.level).toBe(4);
    expect(a.axes).toEqual({ Kontrolle: 4, Daten: 4, Kontinuität: 4, Exit: 4 });
  });

  it('US-Cloud-Dienst: Kontrolle deckelt auf 1', () => {
    const a = assessEntry(
      entry({
        'dsov:provider:country': 'US',
        'dsov:provider:extraterritorial': 'ja',
        'dsov:service:deployment': 'cloud-anbieter',
      })
    );
    expect(a.axes.Kontrolle).toBe(1);
    expect(a.level).toBe(1);
    expect(a.weakestAxis).toBe('Kontrolle');
  });

  it('Widerspruchsregel: Sitzland US sticht extraterritorial=nein', () => {
    const a = assessEntry(
      entry({
        'dsov:provider:country': 'US',
        'dsov:provider:extraterritorial': 'nein',
        'dsov:service:deployment': 'cloud-anbieter',
      })
    );
    expect(a.contradiction).toBe(true);
    expect(a.axes.Kontrolle).toBe(1); // konservativ als "ja" bewertet
  });

  it('unbekannt wird konservativ bewertet und gesammelt', () => {
    const a = assessEntry(
      entry({
        'dsov:provider:extraterritorial': 'unbekannt',
        'dsov:service:deployment': 'cloud-anbieter',
        'dsov:data:location': 'unbekannt',
      })
    );
    expect(a.axes.Kontrolle).toBe(1);
    expect(a.axes.Daten).toBe(1);
    expect(a.unknowns.sort()).toEqual([
      'dsov:data:location',
      'dsov:provider:extraterritorial',
    ]);
  });

  it('Verschärfung: Betriebsgeheimnisse im Drittland fallen auf 0', () => {
    const a = assessEntry(
      entry({
        'dsov:data:location': 'drittland',
        'dsov:data:classification': ['betriebsgeheimnisse'],
      })
    );
    expect(a.axes.Daten).toBe(0);
    expect(a.level).toBe(0);
  });

  it('nur Unkritisches neutralisiert die Daten-Achse', () => {
    const a = assessEntry(
      entry({
        'dsov:data:location': 'drittland',
        'dsov:data:backup': 'keins',
        'dsov:data:classification': ['unkritisch'],
      })
    );
    expect(a.axes.Daten).toBe(4);
  });

  it('Exit-Anhebung: autark + dauerhaft hebt die Exit-Achse um 1', () => {
    const base = {
      'dsov:dependency:integrationDepth': 'tief-integriert',
      'dsov:exit:alternative': 'mit-abstrichen',
      'dsov:exit:dataPortability': 'teilweise',
    };
    const autark = assessEntry(entry(base));
    expect(autark.axes.Exit).toBe(3); // min(2,2,2) + 1

    const cloudUs = assessEntry(
      entry({
        ...base,
        'dsov:provider:country': 'US',
        'dsov:provider:extraterritorial': 'ja',
        'dsov:service:deployment': 'cloud-anbieter',
      })
    );
    expect(cloudUs.axes.Exit).toBe(2); // Kontrolle 1 -> keine Anhebung
  });
});

describe('assessBom (Deckel-Regel)', () => {
  const bom = JSON.parse(readFileSync(VALID, 'utf8')) as unknown;

  it('bewertet die Beispiel-Firma exakt wie dokumentiert', () => {
    const a = assessBom(bom);
    const byName = new Map(a.entries.map((e) => [e.name, e.level]));
    expect(byName.get('Microsoft 365')).toBe(1);
    expect(byName.get('DATEV Unternehmen online')).toBe(2);
    expect(byName.get('GitHub')).toBe(0);
    expect(byName.get('Mailchimp')).toBe(1);
    expect(byName.get('SolidWorks')).toBe(1);
    expect(byName.get('proALPHA ERP')).toBe(3);
  });

  it('nur Geschäftskritisches deckelt: GitHub (Stufe 0) drückt das Level nicht', () => {
    const a = assessBom(bom);
    expect(a.companyLevel).toBe(1); // nicht 0, obwohl GitHub auf 0 steht
    expect(a.levelName).toBe(LEVEL_NAMES[1]);
    expect(a.cappedBy.sort()).toEqual(['Microsoft 365', 'SolidWorks']);
  });

  it('ohne geschäftskritische Einträge gibt es kein Firmen-Level', () => {
    const a = assessBom({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      services: [
        {
          name: 'Nur ein Tool',
          properties: [
            { name: 'dsov:dependency:criticality', value: 'ersetzbar' },
          ],
        },
      ],
    });
    expect(a.companyLevel).toBeNull();
    const findings = deriveFindings(a);
    expect(findings.some((f) => f.code === 'bewertung/keine-kritischen')).toBe(true);
  });
});

describe('runScreen (Exit-Code-Vertrag)', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liefert 1 für die Beispiel-Firma (hoch-Befunde: zwei Decker)', () => {
    expect(runScreen(VALID, { json: true, quiet: true })).toBe(1);
    const result = JSON.parse(logs.join('\n')) as {
      assessment: { companyLevel: number };
      findings: Array<{ severity: string; code: string }>;
    };
    expect(result.assessment.companyLevel).toBe(1);
    expect(result.findings.filter((f) => f.severity === 'hoch')).toHaveLength(2);
    expect(result.findings[0].severity).toBe('hoch'); // sortiert: hoch zuerst
  });

  it('liefert 0, wenn alle kritischen Einträge solide stehen', async () => {
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const bom = JSON.parse(readFileSync(VALID, 'utf8')) as {
      services: unknown[];
      components: Array<{ name: string }>;
    };
    // Nur proALPHA (Stufe 3) behalten - keine Decker, keine unbekannt-Werte.
    bom.services = [];
    bom.components = bom.components.filter((c) => c.name === 'proALPHA ERP');
    const dir = mkdtempSync(join(tmpdir(), 'sov-lint-test-'));
    const file = join(dir, 'solide.json');
    writeFileSync(file, JSON.stringify(bom), 'utf8');
    expect(runScreen(file, { json: true, quiet: true })).toBe(0);
  });

  it('bewertet nichts, was lint nicht besteht (Exit 1 + lint-Befunde)', () => {
    expect(runScreen(INVALID, { json: true, quiet: true })).toBe(1);
    const result = JSON.parse(logs.join('\n')) as {
      assessment: unknown;
      lintFindings: unknown[];
    };
    expect(result.assessment).toBeNull();
    expect(result.lintFindings.length).toBeGreaterThan(0);
  });
});

describe('Doku-Drift-Schutz', () => {
  it('docs/bewertung.md nennt alle fünf Stufen-Namen', () => {
    const doc = readFileSync(fromRoot('docs', 'bewertung.md'), 'utf8');
    for (const name of LEVEL_NAMES) {
      expect(doc, `Stufen-Name "${name}" fehlt in docs/bewertung.md`).toContain(name);
    }
  });
});
