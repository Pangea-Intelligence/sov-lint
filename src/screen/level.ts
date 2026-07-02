/**
 * Bewertungslogik für das Klumpenrisiko-Level 0-4.
 *
 * Menschenlesbare Fassung der Regeln: docs/bewertung.md - beide müssen
 * synchron bleiben. Die Bewertung ist bewusst NICHT Teil von spec/profile.md:
 * die Datei beschreibt, das Werkzeug bewertet.
 *
 * Voraussetzung aller Funktionen hier: Die BOM hat `lint` bestanden. Auf
 * unvalidierten Daten sind die Ergebnisse undefiniert.
 */

export const LEVEL_NAMES = [
  'vollständig exponiert',
  'stark abhängig',
  'teilweise abgesichert',
  'weitgehend souverän',
  'souverän handlungsfähig',
] as const;

export type AxisName = 'Kontrolle' | 'Daten' | 'Kontinuität' | 'Exit';
export type Criticality = 'geschäftskritisch' | 'wichtig' | 'ersetzbar';

/** Jurisdiktionen mit extraterritorialen Zugriffsgesetzen (US CLOUD Act, chinesisches Nachrichtendienstgesetz). */
export const EXTRATERRITORIAL_COUNTRIES: ReadonlySet<string> = new Set(['US', 'CN']);

export interface EntryInput {
  pointer: string;
  name: string;
  /** dsov-Property-Werte: Schlüssel -> Werte (nur classification hat mehrere). */
  values: ReadonlyMap<string, readonly string[]>;
}

export interface EntryAssessment {
  pointer: string;
  name: string;
  criticality: Criticality;
  /** 0-4, Minimum über die vier Achsen. */
  level: number;
  axes: Record<AxisName, number>;
  weakestAxis: AxisName;
  /** Property-Schlüssel, deren Wert "unbekannt" ist. */
  unknowns: string[];
  /** Konzernmutter in US/CN, aber extraterritorial=nein deklariert. */
  contradiction: boolean;
}

export interface ScreenAssessment {
  /** null, wenn kein Eintrag als geschäftskritisch markiert ist. */
  companyLevel: number | null;
  levelName: string | null;
  /** Namen der geschäftskritischen Einträge, die das Level bestimmen. */
  cappedBy: string[];
  entries: EntryAssessment[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extrahiert Einträge und ihre dsov-Werte aus einer lint-sauberen BOM. */
export function extractEntries(bom: unknown): EntryInput[] {
  if (!isRecord(bom)) return [];
  const entries: EntryInput[] = [];
  for (const section of ['components', 'services'] as const) {
    const list = bom[section];
    if (!Array.isArray(list)) continue;
    list.forEach((entry, i) => {
      if (!isRecord(entry)) return;
      const values = new Map<string, string[]>();
      const props = Array.isArray(entry.properties) ? entry.properties : [];
      for (const raw of props) {
        if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.value !== 'string') {
          continue;
        }
        if (!raw.name.startsWith('dsov:')) continue;
        const list = values.get(raw.name) ?? [];
        list.push(raw.value);
        values.set(raw.name, list);
      }
      entries.push({
        pointer: `/${section}/${i}`,
        name: typeof entry.name === 'string' ? entry.name : `Eintrag ${i}`,
        values,
      });
    });
  }
  return entries;
}

function score(table: Record<string, number>, value: string, fallback: number): number {
  return table[value] ?? fallback;
}

/** Bewertet einen einzelnen Eintrag über die vier Achsen. */
export function assessEntry(entry: EntryInput): EntryAssessment {
  const one = (key: string): string => entry.values.get(key)?.[0] ?? '';
  const country = one('dsov:provider:country');
  const extRaw = one('dsov:provider:extraterritorial');
  const deployment = one('dsov:service:deployment');
  const location = one('dsov:data:location');
  const classification = entry.values.get('dsov:data:classification') ?? [];
  const backup = one('dsov:data:backup');
  const criticality = one('dsov:dependency:criticality') as Criticality;
  const offline = one('dsov:dependency:offlineCapability');
  const integration = one('dsov:dependency:integrationDepth');
  const alternative = one('dsov:exit:alternative');
  const portability = one('dsov:exit:dataPortability');

  const unknowns = [...entry.values.entries()]
    .filter(([, vals]) => vals.includes('unbekannt'))
    .map(([key]) => key);

  // Widerspruchsregel: Sitzland sticht Selbstauskunft. Wer die Konzernmutter
  // in einer extraterritorialen Jurisdiktion angibt, wird konservativ
  // bewertet - der Widerspruch selbst wird als Befund gemeldet.
  const contradiction = extRaw === 'nein' && EXTRATERRITORIAL_COUNTRIES.has(country);
  // unbekannt wird ebenfalls konservativ wie "ja" behandelt.
  const ext = extRaw === 'ja' || extRaw === 'unbekannt' || contradiction;

  // Achse 1: Kontrolle - wer kann den Betrieb beenden?
  let kontrolle: number;
  switch (deployment) {
    case 'on-premise-autark':
      kontrolle = 4;
      break;
    case 'on-premise-lizenzpflichtig':
      kontrolle = ext ? 2 : 3;
      break;
    case 'cloud-eu-treuhand':
      kontrolle = ext ? 3 : 4;
      break;
    default: // cloud-anbieter
      kontrolle = ext ? 1 : 3;
  }

  // Achse 2: Daten - Zugriff (location) und Verlust (backup), das
  // schwächere von beiden zählt.
  const locScore = score({ deutschland: 4, 'eu-ewr': 3, drittland: 1, unbekannt: 1 }, location, 1);
  const backupScore = score(
    { unabhängig: 4, 'beim-anbieter': 2, keins: 1, unbekannt: 1 },
    backup,
    1
  );
  let daten = Math.min(locScore, backupScore);
  const onlyUnkritisch =
    classification.length > 0 && classification.every((c) => c === 'unkritisch');
  if (onlyUnkritisch) {
    // Wo nichts Schützenswertes liegt, misst die Daten-Achse nichts.
    daten = 4;
  } else if (
    classification.includes('betriebsgeheimnisse') &&
    (location === 'drittland' || location === 'unbekannt')
  ) {
    // Verschärfung: Betriebsgeheimnisse ausserhalb von EU/EWR (oder an
    // unbekanntem Ort) sind die härteste Einzelexposition im Profil.
    daten = 0;
  }

  // Achse 3: Kontinuität - wie schnell steht der Prozess?
  const kontinuität = score(
    { dauerhaft: 4, tage: 3, stunden: 2, 'sofort-tot': 1 },
    offline,
    1
  );

  // Achse 4: Exit - kommt man wieder raus?
  const altScore = score({ verfügbar: 4, 'mit-abstrichen': 2, keine: 1 }, alternative, 1);
  const portScore = score(
    { vollständig: 4, teilweise: 2, 'proprietär-gefangen': 1 },
    portability,
    1
  );
  const intScore = score(
    { standalone: 4, schnittstellen: 3, 'tief-integriert': 2 },
    integration,
    2
  );
  let exit = Math.min(altScore, portScore, intScore);
  // Anhebung: Wer autark und dauerhaft lauffähig ist, hat Zeit für den
  // Ausstieg - Exit-Druck entsteht erst, wenn Kontrolle oder Kontinuität
  // wackeln.
  if (kontrolle >= 3 && kontinuität >= 3) {
    exit = Math.min(4, exit + 1);
  }

  const axes: Record<AxisName, number> = {
    Kontrolle: kontrolle,
    Daten: daten,
    Kontinuität: kontinuität,
    Exit: exit,
  };
  const level = Math.min(...Object.values(axes));
  const weakestAxis = (Object.keys(axes) as AxisName[]).find((a) => axes[a] === level) ?? 'Kontrolle';

  return {
    pointer: entry.pointer,
    name: entry.name,
    criticality,
    level,
    axes,
    weakestAxis,
    unknowns,
    contradiction,
  };
}

/**
 * Bewertet die ganze Stückliste. Deckel-Regel aus dem Profil-Design:
 * Das Firmen-Level ist das Minimum über die GESCHÄFTSKRITISCHEN Einträge.
 * Nicht-kritische Einträge erzeugen Befunde, deckeln aber nie - sonst
 * drückt das ersetzbare Newsletter-Tool die ganze Firma auf Stufe 0.
 */
export function assessBom(bom: unknown): ScreenAssessment {
  const entries = extractEntries(bom).map(assessEntry);
  const critical = entries.filter((e) => e.criticality === 'geschäftskritisch');
  if (critical.length === 0) {
    return { companyLevel: null, levelName: null, cappedBy: [], entries };
  }
  const companyLevel = Math.min(...critical.map((e) => e.level));
  const cappedBy = critical.filter((e) => e.level === companyLevel).map((e) => e.name);
  return { companyLevel, levelName: LEVEL_NAMES[companyLevel], cappedBy, entries };
}
