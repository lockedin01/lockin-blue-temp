/**
 * Sarvam request/response half — translation (`mayura:v1`) and batch synthesis
 * (`bulbul:v3`), used by the non-streaming fallback path.
 *
 * Synthesis scales with length, so one long request is the worst possible shape:
 * split into sentences and render them CONCURRENTLY, then stitch. The win is
 * concurrency, not batching — passing several `inputs` on one request is slower
 * than either.
 *
 * Sentence splitting must handle the Devanagari danda `।` or Hindi never splits.
 * A decimal point is not a sentence end — "2.5 bar" must stay one clause.
 */

export const LANGUAGES = [
  { code: 'en-IN', label: 'English', native: 'English' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { code: 'bn-IN', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr-IN', label: 'Marathi', native: 'मराठी' },
  { code: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa-IN', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'od-IN', label: 'Odia', native: 'ଓଡ଼ିଆ' },
] as const;

export const isLanguage = (code: string): boolean =>
  LANGUAGES.some((l) => l.code === code);

/**
 * Technical terms must survive translation as English. Every Indian technician
 * says "hydraulic pump", not a calque — a translated term reads as wrong to the
 * people who actually speak the language. Terms are masked before translation
 * and restored after, so the EXPLANATION is translated and the TERM is not.
 *
 * Scoped to the engineering-maintenance vertical (FEATURES.md vertical focus).
 * Sourced per-org from the KB where the org has its own equipment vocabulary.
 */
export const GLOSSARY: readonly string[] = [
  'hydraulic pump',
  'solenoid valve',
  'pressure relief valve',
  'directional control valve',
  'actuator',
  'cylinder',
  'accumulator',
  'flow meter',
  'pressure gauge',
  'multimeter',
  'motor starter',
  'contactor',
  'overload relay',
  'circuit breaker',
  'busbar',
  'VFD',
  'PLC',
  'lockout-tagout',
  'LOTO',
  'PPE',
  'torque',
  'bearing',
  'coupling',
  'gearbox',
];

export async function translate(
  _text: string,
  _target: string,
  _source = 'en-IN'
): Promise<string> {
  throw new Error('not implemented');
}

/** Batch synthesis — fallback only; the live path streams (see tts.ts). */
export async function textToSpeech(
  _text: string,
  _options: { language: string; speaker?: string }
): Promise<string | null> {
  throw new Error('not implemented');
}
