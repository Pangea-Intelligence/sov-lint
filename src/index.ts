/** Library-Einstieg: dieselbe Prüf-Engine, die das CLI nutzt. */
export type { Finding } from './core/finding.js';
export {
  PROFILE_PROPERTIES,
  PROFILE_VERSION,
  NAMESPACE,
  checkProfile,
  type ProfileProperty,
  type PropertyGroup,
} from './core/profile.js';
export { validateBom, getBomValidator, SPEC_VERSION } from './core/cyclonedx.js';
export { readPayload, decodeJsonBuffer, parseJsonText, ReadError } from './core/read.js';
export { runLint, type LintOptions, type FileResult } from './commands/lint.js';
