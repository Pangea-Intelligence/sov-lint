import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkProfile, PROFILE_PROPERTIES } from '../src/core/profile.js';
import { fromRoot } from '../src/core/paths.js';

/** Baut einen minimal-validen Eintrag mit allen 11 Pflicht-Properties. */
function validEntry(overrides?: { drop?: string[]; extra?: Array<{ name: string; value: string }> }) {
  const values: Record<string, string> = {
    'dsov:provider:country': 'DE',
    'dsov:provider:extraterritorial': 'nein',
    'dsov:service:deployment': 'cloud-anbieter',
    'dsov:data:location': 'deutschland',
    'dsov:data:classification': 'geschäftsdaten',
    'dsov:data:backup': 'unabhängig',
    'dsov:dependency:criticality': 'wichtig',
    'dsov:dependency:offlineCapability': 'tage',
    'dsov:dependency:integrationDepth': 'standalone',
    'dsov:exit:alternative': 'verfügbar',
    'dsov:exit:dataPortability': 'vollständig',
  };
  const props = Object.entries(values)
    .filter(([name]) => !(overrides?.drop ?? []).includes(name))
    .map(([name, value]) => ({ name, value }));
  props.push(...(overrides?.extra ?? []));
  return { name: 'Testdienst', properties: props };
}

function bomWith(entry: unknown) {
  return { bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, services: [entry] };
}

describe('Profil-Definition', () => {
  it('enthält genau 11 Properties in den vier Gruppen', () => {
    expect(PROFILE_PROPERTIES).toHaveLength(11);
    const byGroup = new Map<string, number>();
    for (const p of PROFILE_PROPERTIES) {
      byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + 1);
    }
    expect(byGroup.get('Jurisdiktion')).toBe(3);
    expect(byGroup.get('Daten')).toBe(3);
    expect(byGroup.get('Abhängigkeit')).toBe(3);
    expect(byGroup.get('Exit')).toBe(2);
  });

  it('jede Property hat entweder Enum-Werte oder ein Pattern mit Hinweis', () => {
    for (const p of PROFILE_PROPERTIES) {
      if (p.values.length === 0) {
        expect(p.pattern, `${p.key} braucht pattern`).toBeDefined();
        expect(p.patternHint, `${p.key} braucht patternHint`).toBeDefined();
      } else {
        expect(p.pattern, `${p.key}: Enum und Pattern schliessen sich aus`).toBeUndefined();
      }
    }
  });

  // Drift-Schutz: Code und menschenlesbare Spec müssen synchron bleiben.
  it('spec/profile.md dokumentiert jeden Schlüssel und jeden Enum-Wert', () => {
    const spec = readFileSync(fromRoot('spec', 'profile.md'), 'utf8');
    for (const p of PROFILE_PROPERTIES) {
      expect(spec, `Key ${p.key} fehlt in spec/profile.md`).toContain(`\`${p.key}\``);
      for (const v of p.values) {
        expect(spec, `Wert "${v}" (${p.key}) fehlt in spec/profile.md`).toContain(`\`${v}\``);
      }
    }
  });
});

describe('checkProfile', () => {
  it('meldet nichts bei einem vollständigen Eintrag', () => {
    expect(checkProfile(bomWith(validEntry()))).toEqual([]);
  });

  it('meldet eine leere Stückliste', () => {
    const findings = checkProfile({ bomFormat: 'CycloneDX', specVersion: '1.6', version: 1 });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('profil/leer');
  });

  it('fasst einen Eintrag ganz ohne dsov-Properties zu einem Sammelbefund zusammen', () => {
    const findings = checkProfile(bomWith({ name: 'Nackt', properties: [] }));
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('profil/keine-properties');
  });

  it('meldet jede fehlende Pflicht-Property einzeln', () => {
    const findings = checkProfile(
      bomWith(validEntry({ drop: ['dsov:data:backup', 'dsov:exit:alternative'] }))
    );
    const codes = findings.map((f) => f.code);
    expect(codes).toEqual(['profil/property-fehlt', 'profil/property-fehlt']);
    expect(findings.map((f) => f.message).join(' ')).toContain('dsov:data:backup');
    expect(findings.map((f) => f.message).join(' ')).toContain('dsov:exit:alternative');
  });

  it('meldet ungültige Enum-Werte mit der erlaubten Liste', () => {
    const findings = checkProfile(
      bomWith(
        validEntry({
          drop: ['dsov:dependency:criticality'],
          extra: [{ name: 'dsov:dependency:criticality', value: 'kritisch' }],
        })
      )
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('profil/wert-ungültig');
    expect(findings[0].message).toContain('geschäftskritisch | wichtig | ersetzbar');
  });

  it('prüft provider:country gegen das ISO-Muster', () => {
    const findings = checkProfile(
      bomWith(
        validEntry({
          drop: ['dsov:provider:country'],
          extra: [{ name: 'dsov:provider:country', value: 'Deutschland' }],
        })
      )
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('profil/wert-ungültig');
    expect(findings[0].message).toContain('ISO-3166-1');
  });

  it('erlaubt data:classification mehrfach, andere Properties nicht', () => {
    const okay = checkProfile(
      bomWith(validEntry({ extra: [{ name: 'dsov:data:classification', value: 'personenbezogen' }] }))
    );
    expect(okay).toEqual([]);

    const doppelt = checkProfile(
      bomWith(validEntry({ extra: [{ name: 'dsov:data:backup', value: 'keins' }] }))
    );
    expect(doppelt).toHaveLength(1);
    expect(doppelt[0].code).toBe('profil/property-doppelt');
  });

  it('meldet unbekannte dsov-Properties, ignoriert fremde Namespaces', () => {
    const findings = checkProfile(
      bomWith(
        validEntry({
          extra: [
            { name: 'dsov:provider:contry', value: 'US' },
            { name: 'cdx:reproducible', value: 'true' },
          ],
        })
      )
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('profil/unbekannte-property');
    expect(findings[0].message).toContain('dsov:provider:contry');
  });
});
