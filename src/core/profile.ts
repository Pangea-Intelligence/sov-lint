import type { Finding } from './finding.js';
import { cleanText } from './sanitize.js';

/**
 * Das dsov-Profil v0.1: die Single Source of Truth der 11 Properties.
 * Menschenlesbare Referenz: spec/profile.md - beide müssen synchron bleiben
 * (Test in tests/profile.test.ts prüft die Spec strukturell gegen dieses Array).
 */

export const PROFILE_VERSION = '0.1.0';
export const NAMESPACE = 'dsov:';

export type PropertyGroup = 'Jurisdiktion' | 'Daten' | 'Abhängigkeit' | 'Exit';

export interface ProfileProperty {
  key: string;
  group: PropertyGroup;
  /** Erlaubte Werte; leer bedeutet: pattern gilt stattdessen. */
  values: readonly string[];
  /** Freitext-Muster statt Enum (nur provider:country). */
  pattern?: RegExp;
  patternHint?: string;
  /** Darf mehrfach vorkommen (nur data:classification). */
  multiple?: boolean;
  /** Deutsche Kurzbeschreibung als Ausfüllhilfe. */
  description: string;
}

export const PROFILE_PROPERTIES: readonly ProfileProperty[] = [
  {
    key: 'dsov:provider:country',
    group: 'Jurisdiktion',
    values: [],
    pattern: /^[A-Z]{2}$/,
    patternHint: 'ISO-3166-1 alpha-2, z.B. DE, US, CN',
    description: 'Sitzland der Konzernmutter des Anbieters (nicht der Vertragsgesellschaft).',
  },
  {
    key: 'dsov:provider:extraterritorial',
    group: 'Jurisdiktion',
    values: ['ja', 'nein', 'unbekannt'],
    description:
      'Unterliegt der Anbieter extraterritorialen Zugriffspflichten (z.B. US CLOUD Act)?',
  },
  {
    key: 'dsov:service:deployment',
    group: 'Jurisdiktion',
    values: [
      'cloud-anbieter',
      'cloud-eu-treuhand',
      'on-premise-lizenzpflichtig',
      'on-premise-autark',
    ],
    description:
      'Betriebsmodell. on-premise-lizenzpflichtig: läuft im Haus, stirbt aber ohne Lizenzserver.',
  },
  {
    key: 'dsov:data:location',
    group: 'Daten',
    values: ['deutschland', 'eu-ewr', 'drittland', 'unbekannt'],
    description: 'Physischer Speicherort der verarbeiteten Daten.',
  },
  {
    key: 'dsov:data:classification',
    group: 'Daten',
    values: ['betriebsgeheimnisse', 'personenbezogen', 'geschäftsdaten', 'unkritisch'],
    multiple: true,
    description: 'Art der Daten, die dort liegen. Mehrfachnennung erlaubt.',
  },
  {
    key: 'dsov:data:backup',
    group: 'Daten',
    values: ['unabhängig', 'beim-anbieter', 'keins', 'unbekannt'],
    description: 'Existiert eine Kopie außerhalb der Kontrolle des Anbieters?',
  },
  {
    key: 'dsov:dependency:criticality',
    group: 'Abhängigkeit',
    values: ['geschäftskritisch', 'wichtig', 'ersetzbar'],
    description:
      'Wie wichtig für den Betrieb. Bewusst ohne "unbekannt": diese Entscheidung muss fallen.',
  },
  {
    key: 'dsov:dependency:offlineCapability',
    group: 'Abhängigkeit',
    values: ['dauerhaft', 'tage', 'stunden', 'sofort-tot'],
    description: 'Wie lange läuft der Prozess weiter, wenn der Anbieter ab sofort wegfällt?',
  },
  {
    key: 'dsov:dependency:integrationDepth',
    group: 'Abhängigkeit',
    values: ['standalone', 'schnittstellen', 'tief-integriert'],
    description: 'Wie verwoben mit anderen Systemen.',
  },
  {
    key: 'dsov:exit:alternative',
    group: 'Exit',
    values: ['verfügbar', 'mit-abstrichen', 'keine'],
    description: 'Gibt es eine reale EU- oder Eigenbetriebs-Alternative?',
  },
  {
    key: 'dsov:exit:dataPortability',
    group: 'Exit',
    values: ['vollständig', 'teilweise', 'proprietär-gefangen'],
    description: 'Kommen die Daten in offenem Format wieder heraus?',
  },
];

const BY_KEY = new Map(PROFILE_PROPERTIES.map((p) => [p.key, p]));

function allowedList(prop: ProfileProperty): string {
  return prop.values.length > 0 ? prop.values.join(' | ') : (prop.patternHint ?? '');
}

interface BomEntryRef {
  pointer: string;
  label: string;
  properties: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sammelt alle Einträge aus components[] und services[] mit Pointer und
 * Anzeigename - inklusive verschachtelter Einträge (CycloneDX erlaubt
 * components[].components[] und services[].services[]). Ohne die Rekursion
 * rutschte ein Kind-Eintrag ganz ohne dsov-Properties unbemerkt durch.
 */
function collectEntries(bom: Record<string, unknown>): BomEntryRef[] {
  const entries: BomEntryRef[] = [];
  const walk = (node: unknown, section: 'components' | 'services', pointer: string): void => {
    if (!Array.isArray(node)) return;
    node.forEach((entry, i) => {
      const at = `${pointer}/${i}`;
      const name =
        isRecord(entry) && typeof entry.name === 'string'
          ? cleanText(entry.name)
          : `Eintrag ${i}`;
      entries.push({
        pointer: at,
        label: `"${name}" (${at.slice(1)})`,
        properties: isRecord(entry) ? entry.properties : undefined,
      });
      // In beide möglichen Kind-Listen absteigen, egal welche Sektion.
      if (isRecord(entry)) {
        walk(entry.components, section, `${at}/components`);
        walk(entry.services, section, `${at}/services`);
      }
    });
  };
  walk(bom.components, 'components', '/components');
  walk(bom.services, 'services', '/services');
  return entries;
}

/**
 * Prüft eine (schema-valide) CycloneDX-BOM gegen das dsov-Profil:
 * alle 11 Properties pro Eintrag vorhanden, Werte gültig, keine unbekannten
 * oder unzulässig doppelten dsov-Properties.
 */
export function checkProfile(bom: unknown): Finding[] {
  const findings: Finding[] = [];
  if (!isRecord(bom)) {
    return [
      {
        pointer: '',
        code: 'profil/kein-objekt',
        message: 'Dokument ist kein JSON-Objekt.',
      },
    ];
  }

  const entries = collectEntries(bom);
  if (entries.length === 0) {
    return [
      {
        pointer: '',
        code: 'profil/leer',
        message:
          'Die Stückliste enthält keine Einträge (weder components noch services). ' +
          'Eine leere Abhängigkeitsliste ist kein Befund, sondern ein Ausfüllfehler.',
      },
    ];
  }

  for (const entry of entries) {
    const props = Array.isArray(entry.properties) ? entry.properties : [];
    const seen = new Map<string, string[]>();
    let sawDsov = false; // irgendeine dsov-Property, auch eine falsch geschriebene

    props.forEach((raw, i) => {
      if (!isRecord(raw) || typeof raw.name !== 'string') return;
      const key = raw.name;
      if (!key.startsWith(NAMESPACE)) return; // fremde Namespaces gehen sov-lint nichts an
      sawDsov = true;
      const prop = BY_KEY.get(key);
      const pointer = `${entry.pointer}/properties/${i}`;

      if (!prop) {
        findings.push({
          pointer,
          code: 'profil/unbekannte-property',
          message: `${entry.label}: unbekannte Profil-Property "${cleanText(key)}". Gültige Schlüssel: siehe spec/profile.md.`,
        });
        return;
      }

      // value ist im CycloneDX-Schema optional - fehlendes Feld getrennt vom
      // leeren String melden, sonst sucht der Nutzer nach einem "" das es
      // gar nicht gibt.
      const hasValue = typeof raw.value === 'string';
      const value = hasValue ? (raw.value as string) : '';
      const list = seen.get(key) ?? [];
      list.push(value);
      seen.set(key, list);

      if (!hasValue) {
        findings.push({
          pointer,
          code: 'profil/wert-fehlt',
          message: `${entry.label}: ${key} hat kein value-Feld. Erlaubt: ${allowedList(prop)}.`,
        });
        return;
      }

      const valueOk = prop.pattern ? prop.pattern.test(value) : prop.values.includes(value);
      if (!valueOk) {
        findings.push({
          pointer,
          code: 'profil/wert-ungültig',
          message: `${entry.label}: ungültiger Wert "${cleanText(value)}" für ${key}. Erlaubt: ${allowedList(prop)}.`,
        });
      }
    });

    if (!sawDsov) {
      findings.push({
        pointer: entry.pointer,
        code: 'profil/keine-properties',
        message: `${entry.label}: keine dsov-Properties vorhanden - alle ${PROFILE_PROPERTIES.length} Pflichtfelder fehlen (siehe spec/profile.md).`,
      });
      continue;
    }

    for (const prop of PROFILE_PROPERTIES) {
      const values = seen.get(prop.key);
      if (!values) {
        findings.push({
          pointer: entry.pointer,
          code: 'profil/property-fehlt',
          message: `${entry.label}: Pflicht-Property ${prop.key} fehlt. Erlaubt: ${allowedList(prop)}.`,
        });
      } else if (values.length > 1 && !prop.multiple) {
        findings.push({
          pointer: entry.pointer,
          code: 'profil/property-doppelt',
          message: `${entry.label}: ${prop.key} kommt ${values.length}x vor, ist aber nur einmal zulässig.`,
        });
      }
    }
  }

  return findings;
}
