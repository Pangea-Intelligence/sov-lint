/** Ein einzelner Befund aus Schema- oder Profilprüfung. */
export interface Finding {
  /** JSON-Pointer auf die betroffene Stelle, '' = Dokumentwurzel. */
  pointer: string;
  /** Stabiler Code der Prüfregel (für --json und Tests). */
  code: string;
  /** Deutsche, menschenlesbare Meldung. */
  message: string;
}
