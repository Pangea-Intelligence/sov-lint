/**
 * Entschärft Text aus fremden Stücklisten, bevor er in Terminal- oder
 * CI-Log-Ausgaben landet. Ohne das könnte ein Eintragsname wie
 * `acme<ESC>[2K<CR>OK` per ANSI-Escape die eigene FEHLER-Zeile überschreiben
 * und ein sauberes Ergebnis vortäuschen.
 *
 * Entfernt werden C0/C1-Steuerzeichen (inkl. ESC, CR, Backspace) außer Tab.
 * Tabs werden zu einem Leerzeichen normalisiert. Sichtbarer Inhalt und
 * Umlaute bleiben unangetastet.
 */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]', 'g');

export function cleanText(value: unknown): string {
  const s = typeof value === 'string' ? value : String(value ?? '');
  return s.replace(/\t/g, ' ').replace(CONTROL_CHARS, '');
}
