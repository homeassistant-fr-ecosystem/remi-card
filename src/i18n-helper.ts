/**
 * Helpers i18n partagés entre la carte et son éditeur.
 * Évite la duplication de _getLanguage() / _t() dans les deux composants.
 */

import type { HomeAssistant } from 'custom-card-helpers';
import { localize } from './localize';

/**
 * Get the user's language from Home Assistant
 * @returns The language code (e.g., "en", "fr")
 */
export function getLanguage(hass: HomeAssistant): string {
  return hass?.locale?.language || hass?.language || 'en';
}

/**
 * Localize a string key for the given Home Assistant instance
 * @param key - Translation key in dot notation (e.g., "common.off")
 * @param hass - Home Assistant instance
 * @returns Localized string, or the key if translation not found
 */
export function t(key: string, hass: HomeAssistant): string {
  return localize(key, getLanguage(hass));
}
