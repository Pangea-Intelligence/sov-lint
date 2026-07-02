import { readFileSync } from 'node:fs';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { ErrorObject, Options, ValidateFunction } from 'ajv';
import { fromRoot } from './paths.js';
import type { Finding } from './finding.js';

// ajv und ajv-formats sind CommonJS mit __esModule-Marker. Je nach Loader
// (node ESM, tsx, vitest) kommt das Callable direkt oder unter .default an,
// deshalb defensiv auspacken und strukturell typisieren.
interface AjvLike {
  compile(schema: object): ValidateFunction;
  addSchema(schema: object): unknown;
  addFormat(name: string, format: true | RegExp): unknown;
}
type AjvConstructor = new (opts?: Options) => AjvLike;
type AddFormatsFn = (ajv: AjvLike) => unknown;

function unwrapDefault<T>(mod: unknown): T {
  const maybe = mod as { default?: T };
  return maybe.default ?? (mod as T);
}

const Ajv = unwrapDefault<AjvConstructor>(AjvModule);
const addFormats = unwrapDefault<AddFormatsFn>(addFormatsModule);

export const SPEC_VERSION = '1.6';

let cachedValidator: ValidateFunction | undefined;

function loadSchemaFile(name: string): object {
  return JSON.parse(readFileSync(fromRoot('schemas', name), 'utf8')) as object;
}

/** Kompiliert (und cached) den Validator für das gevendorte CycloneDX-1.6-Schema. */
export function getBomValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const ajv = new Ajv({
    allErrors: true,
    // Das offizielle Schema nutzt draft-07-Idiome und eigene Keywords
    // (z.B. meta:enum), die im strict-Modus als Fehler gelten würden.
    strict: false,
  });
  addFormats(ajv);
  // Vom Schema verwendete Formate, die ajv-formats nicht kennt: permissiv
  // registrieren - die inhaltliche Prüfung dieser Felder ist nicht unser Job.
  ajv.addFormat('iri-reference', true);
  ajv.addFormat('idn-email', true);
  ajv.addSchema(loadSchemaFile('spdx.schema.json'));
  ajv.addSchema(loadSchemaFile('jsf-0.82.schema.json'));
  cachedValidator = ajv.compile(loadSchemaFile('bom-1.6.schema.json'));
  return cachedValidator;
}

/** Übersetzt einen Ajv-Fehler in eine deutsche Meldung. */
function translate(err: ErrorObject): string {
  const p = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case 'required':
      return `Pflichtfeld fehlt: ${String(p.missingProperty)}`;
    case 'enum': {
      const allowed = Array.isArray(p.allowedValues) ? (p.allowedValues as unknown[]) : [];
      const shown = allowed.slice(0, 6).map(String).join(' | ');
      const more = allowed.length > 6 ? ` | … (${allowed.length - 6} weitere)` : '';
      return `Wert nicht erlaubt. Erlaubt: ${shown}${more}`;
    }
    case 'type':
      return `falscher Typ: erwartet ${String(p.type)}`;
    case 'pattern':
      return `Wert passt nicht zum Muster ${String(p.pattern)}`;
    case 'additionalProperties':
      return `unbekanntes Feld: ${String(p.additionalProperty)}`;
    case 'const':
      return `Wert muss "${String(p.allowedValue)}" sein`;
    case 'format':
      return `Wert ist kein gültiges Format "${String(p.format)}"`;
    case 'minItems':
      return `zu wenige Einträge (mindestens ${String(p.limit)})`;
    case 'minLength':
      return `Wert ist zu kurz (mindestens ${String(p.limit)} Zeichen)`;
    default:
      // Fallback: Original-Meldung von Ajv (englisch), besser als nichts.
      return err.message ?? `Schema-Verstoß (${err.keyword})`;
  }
}

/**
 * Validiert eine BOM gegen das offizielle CycloneDX-1.6-Schema und liefert
 * deutsche Findings. anyOf/oneOf-Sammelknoten werden unterdrückt (ihre
 * Kind-Fehler tragen die Information), Duplikate dedupliziert.
 */
export function validateBom(data: unknown): Finding[] {
  const validator = getBomValidator();
  if (validator(data) === true) return [];

  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const err of validator.errors ?? []) {
    if (err.keyword === 'anyOf' || err.keyword === 'oneOf' || err.keyword === 'if') continue;
    const finding: Finding = {
      pointer: err.instancePath,
      code: `schema/${err.keyword}`,
      message: translate(err),
    };
    const key = `${finding.pointer}|${finding.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(finding);
  }
  // Theoretischer Randfall: Validator schlägt fehl, aber alle Fehler waren
  // Sammelknoten - dann wenigstens einen generischen Befund liefern.
  if (findings.length === 0) {
    findings.push({
      pointer: '',
      code: 'schema/ungültig',
      message: 'Datei verletzt das CycloneDX-1.6-Schema (Details nicht auflösbar).',
    });
  }
  return findings;
}
