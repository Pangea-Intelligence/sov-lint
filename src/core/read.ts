import { readFileSync, statSync } from 'node:fs';

/** Maximal akzeptierte Dateigröße in Bytes (10 MB). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximale Zahl an Einträgen (components + services, auch verschachtelt), die
 * am Stück validiert werden. Das Byte-Limit allein schützt nicht: die
 * Schema-Validierung skaliert mit der Eintragszahl, nicht mit der Dateigröße,
 * und eine Datei knapp unter 10 MB mit Zehntausenden Einträgen kann einen
 * CI-Lauf minutenlang blockieren. Realistische Abhängigkeits-Stücklisten
 * haben Dutzende, nicht Tausende Einträge - 2000 ist großzügig.
 */
export const MAX_ENTRIES = 2000;

export type DetectedEncoding =
  'utf-8' | 'utf-8 (BOM)' | 'utf-16le (BOM)' | 'utf-16be (BOM)' | 'utf-16le' | 'utf-16be';

export interface PayloadFile {
  /** Geparster JSON-Wert. */
  data: unknown;
  /** Erkanntes und dekodiertes Encoding. */
  encoding: DetectedEncoding;
}

/** Fehler mit stabilem Code, damit Aufrufer Fehlerarten unterscheiden können. */
export class ReadError extends Error {
  constructor(
    public readonly code:
      'NOT_FOUND' | 'NOT_A_FILE' | 'TOO_LARGE' | 'UNREADABLE' | 'BAD_ENCODING' | 'BAD_JSON',
    message: string
  ) {
    super(message);
    this.name = 'ReadError';
  }
}

/**
 * Trennt Bedienfehler (falscher Pfad, zu große/unlesbare Datei) von
 * inhaltlichen Befunden. NOT_FOUND & Co. sind Exit 2 (der Nutzer hat das
 * Werkzeug falsch aufgerufen); BAD_JSON/BAD_ENCODING sind Exit 1, denn die
 * Datei existiert, ist aber keine gültige Eingabe - ein legitimer Befund.
 */
export function isUsageError(code: ReadError['code']): boolean {
  return (
    code === 'NOT_FOUND' || code === 'NOT_A_FILE' || code === 'TOO_LARGE' || code === 'UNREADABLE'
  );
}

function swapBytes(buf: Buffer): Buffer {
  const out = Buffer.from(buf); // Kopie, Eingabe nicht mutieren
  out.swap16();
  return out;
}

/**
 * Erkennt das Encoding eines JSON-Buffers und dekodiert ihn zu einem String.
 *
 * Unterstützt UTF-8 (mit und ohne BOM) und UTF-16 LE/BE (mit und ohne BOM).
 * Windows-Werkzeuge (PowerShell-Redirects, Excel-Exporte) liefern JSON
 * gelegentlich als UTF-16 aus. BOM-loses UTF-16 wird heuristisch über das
 * Nullbyte-Muster der ersten beiden Bytes erkannt - für JSON zuverlässig,
 * weil ein JSON-Dokument mit einem ASCII-Zeichen beginnen muss.
 */
export function decodeJsonBuffer(
  buf: Buffer,
  context: string
): { text: string; encoding: DetectedEncoding } {
  let encoding: DetectedEncoding;
  let body: Buffer;
  let needsSwap = false; // Big-Endian muss für TextDecoder('utf-16le') geswappt werden

  // UTF-32-BOMs zuerst abfangen: FF FE 00 00 (LE) würde sonst als UTF-16LE
  // (FF FE) fehlerkannt und als kryptischer JSON-Fehler statt als klarer
  // Encoding-Hinweis enden. UTF-32 wird nicht unterstützt.
  if (
    buf.length >= 4 &&
    ((buf[0] === 0xff && buf[1] === 0xfe && buf[2] === 0x00 && buf[3] === 0x00) ||
      (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0xfe && buf[3] === 0xff))
  ) {
    throw new ReadError(
      'BAD_ENCODING',
      `${context}: Datei ist UTF-32 (BOM erkannt). Unterstützt werden nur UTF-8 und UTF-16 LE/BE. ` +
        `Bitte als UTF-8 exportieren.`
    );
  }

  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    encoding = 'utf-8 (BOM)';
    body = buf.subarray(3);
  } else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    encoding = 'utf-16le (BOM)';
    body = buf.subarray(2);
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    encoding = 'utf-16be (BOM)';
    body = buf.subarray(2);
    needsSwap = true;
  } else if (buf.length >= 2 && buf[0] !== 0x00 && buf[1] === 0x00) {
    // ASCII-Zeichen gefolgt von Nullbyte: BOM-loses UTF-16 Little-Endian.
    encoding = 'utf-16le';
    body = buf;
  } else if (buf.length >= 2 && buf[0] === 0x00 && buf[1] !== 0x00) {
    // Nullbyte gefolgt von ASCII-Zeichen: BOM-loses UTF-16 Big-Endian.
    encoding = 'utf-16be';
    body = buf;
    needsSwap = true;
  } else {
    encoding = 'utf-8';
    body = buf;
  }

  // Ungerade Länge VOR dem Byte-Swap prüfen: Buffer.swap16() wirft sonst
  // einen rohen RangeError an der ReadError-Vertragslinie vorbei.
  const isUtf16 = encoding.startsWith('utf-16');
  if (isUtf16 && body.length % 2 !== 0) {
    throw new ReadError(
      'BAD_ENCODING',
      `${context}: Datei sieht nach UTF-16 aus (${encoding}), hat aber eine ungerade Byte-Anzahl`
    );
  }
  if (needsSwap) {
    body = swapBytes(body);
  }

  try {
    const decoder = new TextDecoder(isUtf16 ? 'utf-16le' : 'utf-8', { fatal: true });
    return { text: decoder.decode(body), encoding };
  } catch {
    throw new ReadError(
      'BAD_ENCODING',
      `${context}: Datei ist kein gültiges ${isUtf16 ? 'UTF-16' : 'UTF-8'} ` +
        `(erkanntes Encoding: ${encoding}). Unterstützt: UTF-8 und UTF-16 LE/BE, mit oder ohne BOM.`
    );
  }
}

/** Parst JSON mit einer Fehlermeldung, die den Dateikontext enthält. */
export function parseJsonText(text: string, context: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    // V8-SyntaxError-Meldungen enthalten "at position N (line L column C)".
    const detail = err instanceof Error ? err.message : String(err);
    throw new ReadError('BAD_JSON', `${context}: ungültiges JSON: ${detail}`);
  }
}

/**
 * Liest und parst eine JSON-Datei mit Encoding-Erkennung.
 * Wirft ReadError mit klarer, pfadtragender Meldung bei jedem Fehler.
 * Verweigert Dateien über 10 MB.
 */
export function readPayload(filePath: string): PayloadFile {
  let size: number;
  try {
    const st = statSync(filePath);
    if (!st.isFile()) {
      throw new ReadError('NOT_A_FILE', `${filePath}: keine reguläre Datei`);
    }
    size = st.size;
  } catch (err) {
    if (err instanceof ReadError) throw err;
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new ReadError('NOT_FOUND', `${filePath}: Datei nicht gefunden`);
    }
    throw new ReadError('UNREADABLE', `${filePath}: Datei nicht zugreifbar (${e.message})`);
  }

  if (size > MAX_FILE_SIZE) {
    throw new ReadError(
      'TOO_LARGE',
      `${filePath}: Datei ist ${(size / (1024 * 1024)).toFixed(1)} MB, ` +
        `Dateien über 10 MB werden nicht gelesen`
    );
  }

  let buf: Buffer;
  try {
    buf = readFileSync(filePath);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    throw new ReadError('UNREADABLE', `${filePath}: Datei nicht lesbar (${e.message})`);
  }

  const { text, encoding } = decodeJsonBuffer(buf, filePath);
  const data = parseJsonText(text, filePath);
  return { data, encoding };
}
