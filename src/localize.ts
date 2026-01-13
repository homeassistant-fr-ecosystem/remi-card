/**
 * Localization helper for Rémi Card
 * Provides translation support with fallback to English
 */

import * as en from './translations/en.json';
import * as fr from './translations/fr.json';

/**
 * Supported languages
 */
const LANGUAGES: Record<string, Record<string, unknown>> = {
  en,
  fr,
};

/**
 * Get a nested value from an object using a dot-notation path
 * @param obj - The object to search
 * @param path - The dot-notation path (e.g., "common.off")
 * @returns The value or undefined if not found
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Localize a string key to the user's language
 * @param key - Translation key in dot notation (e.g., "common.off")
 * @param language - User's language code (defaults to "en")
 * @returns Localized string, or the key if translation not found
 */
export function localize(key: string, language = 'en'): string {
  // Normalize language code (handle variants like "en-US" -> "en")
  const normalizedLang = language.toLowerCase().split('-')[0];

  // Try user's language first
  if (normalizedLang in LANGUAGES) {
    const translation = getNestedValue(LANGUAGES[normalizedLang] as Record<string, unknown>, key);
    if (translation) return translation;
  }

  // Fallback to English
  if (normalizedLang !== 'en' && 'en' in LANGUAGES) {
    const translation = getNestedValue(LANGUAGES.en as Record<string, unknown>, key);
    if (translation) return translation;
  }

  // Return the key itself if no translation found (helpful for debugging)
  return key;
}

/**
 * Get the face name in the user's language
 * @param face - Face state key (e.g., "sleepyFace")
 * @param language - User's language code
 * @returns Localized face name
 */
export function localizeFace(face: string, language = 'en'): string {
  return localize(`face.${face}`, language);
}

/**
 * Get a common string in the user's language
 * @param key - Common string key (e.g., "off", "on")
 * @param language - User's language code
 * @returns Localized common string
 */
export function localizeCommon(key: string, language = 'en'): string {
  return localize(`common.${key}`, language);
}
