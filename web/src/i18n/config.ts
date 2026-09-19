/**
 * Multilingual NAVIGATION, not just multilingual tutoring — language is the
 * primary adoption barrier for this workforce, not a preference.
 *
 * A working subset ships; the full scheduled-language set is roadmap.
 */
export const LOCALES = ['en', 'hi', 'mr'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
};

/** Maps a UI locale to the BCP-47 code the voice pipeline expects. */
export const VOICE_LANGUAGE: Record<Locale, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
};

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);
