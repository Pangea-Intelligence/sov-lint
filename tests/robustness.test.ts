import { describe, expect, it } from 'vitest';
import { lintData } from '../src/commands/lint.js';
import { checkProfile } from '../src/core/profile.js';
import { extractEntries, assessBom } from '../src/screen/level.js';
import { decodeJsonBuffer, ReadError, isUsageError } from '../src/core/read.js';
import { cleanText } from '../src/core/sanitize.js';
import { readFileSync } from 'node:fs';
import { fromRoot } from '../src/core/paths.js';

const NESTED = fromRoot('tests', 'fixtures', 'nested-entry.json');
const ESC = String.fromCharCode(27); // ANSI-Escape, ohne literales Steuerzeichen im Quelltext
const CR = String.fromCharCode(13);

function bomWith(entry: unknown) {
  return { bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, services: [entry] };
}

describe('verschachtelte Einträge', () => {
  const bom = JSON.parse(readFileSync(NESTED, 'utf8')) as unknown;

  it('lint prüft auch components[].components[] und meldet das fehlende Profil', () => {
    const findings = lintData(bom);
    expect(findings.length).toBeGreaterThan(0);
    const nested = findings.find((f) => f.pointer.startsWith('/components/0/components/0'));
    expect(nested, 'Kind-Eintrag muss beanstandet werden').toBeDefined();
    expect(nested?.code).toBe('profil/keine-properties');
  });

  it('screen erfasst den verschachtelten Eintrag ebenfalls', () => {
    const entries = extractEntries(bom);
    expect(entries.map((e) => e.name)).toContain('Kind ohne Profil');
  });
});

describe('fehlendes value-Feld (schema-valide, aber leer)', () => {
  it('meldet "kein value-Feld" statt "ungültiger Wert \'\'"', () => {
    const findings = checkProfile(
      bomWith({ name: 'X', properties: [{ name: 'dsov:data:location' }] })
    );
    const missing = findings.find((f) => f.code === 'profil/wert-fehlt');
    expect(missing).toBeDefined();
    expect(missing?.message).toContain('kein value-Feld');
    expect(findings.find((f) => f.code === 'profil/wert-ungültig')).toBeUndefined();
  });
});

describe('reine Tippfehler-Keys', () => {
  it('meldet keine widersprüchliche "keine dsov-Properties" wenn welche da sind', () => {
    const findings = checkProfile(
      bomWith({ name: 'X', properties: [{ name: 'dsov:provider:Country', value: 'DE' }] })
    );
    expect(findings.some((f) => f.code === 'profil/unbekannte-property')).toBe(true);
    expect(findings.some((f) => f.code === 'profil/keine-properties')).toBe(false);
  });
});

describe('UTF-32 wird als Encoding-Fehler erkannt, nicht als kaputtes JSON', () => {
  it('LE-BOM FF FE 00 00 gibt BAD_ENCODING', () => {
    const buf = Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x7b, 0x00, 0x00, 0x00]);
    let err: unknown;
    try {
      decodeJsonBuffer(buf, 'test');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ReadError);
    expect((err as ReadError).code).toBe('BAD_ENCODING');
    expect((err as ReadError).message).toContain('UTF-32');
  });
});

describe('Terminal-Injection wird entschärft', () => {
  it('cleanText entfernt ESC und CR aus Namen', () => {
    const evil = `acme${ESC}[2K${CR}OK`;
    expect(cleanText(evil)).toBe('acme[2KOK');
  });

  it('Eintragsname mit Escape-Sequenz landet gesäubert im Finding', () => {
    const findings = checkProfile(bomWith({ name: `x${ESC}[2K${CR}Y`, properties: [] }));
    const joined = findings.map((f) => f.message).join(' ');
    expect(joined).not.toContain(ESC);
    expect(joined).not.toContain(CR);
  });
});

describe('isUsageError trennt Bedienfehler von Inhaltsfehlern', () => {
  it('NOT_FOUND ist Bedienfehler, BAD_JSON nicht', () => {
    expect(isUsageError('NOT_FOUND')).toBe(true);
    expect(isUsageError('TOO_LARGE')).toBe(true);
    expect(isUsageError('BAD_JSON')).toBe(false);
    expect(isUsageError('BAD_ENCODING')).toBe(false);
  });
});

describe('DoS-Cap', () => {
  it('lehnt eine Stückliste mit zu vielen Einträgen als Bedienfehler ab', () => {
    const services = Array.from({ length: 2001 }, (_, i) => ({ name: `S${i}`, properties: [] }));
    const findings = lintData({ bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, services });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('format/zu-viele-eintraege');
  });
});

describe('Datenexposition ist von der Kritikalität entkoppelt', () => {
  it('ersetzbarer Eintrag mit Betriebsgeheimnissen im Drittland wird als dataExposure geführt', () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      services: [
        {
          name: 'Schatten-Tool',
          properties: [
            { name: 'dsov:provider:country', value: 'US' },
            { name: 'dsov:provider:extraterritorial', value: 'ja' },
            { name: 'dsov:service:deployment', value: 'cloud-anbieter' },
            { name: 'dsov:data:location', value: 'drittland' },
            { name: 'dsov:data:classification', value: 'betriebsgeheimnisse' },
            { name: 'dsov:data:backup', value: 'keins' },
            { name: 'dsov:dependency:criticality', value: 'ersetzbar' },
            { name: 'dsov:dependency:offlineCapability', value: 'dauerhaft' },
            { name: 'dsov:dependency:integrationDepth', value: 'standalone' },
            { name: 'dsov:exit:alternative', value: 'verfügbar' },
            { name: 'dsov:exit:dataPortability', value: 'vollständig' },
          ],
        },
      ],
    };
    const a = assessBom(bom);
    expect(a.entries[0].dataExposure).toBe(true);
    expect(a.entries[0].axes.Daten).toBe(0);
  });
});
