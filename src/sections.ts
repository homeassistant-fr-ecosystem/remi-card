/**
 * Shared section keys used by both the card and its editor.
 *
 * Centralises the mapping between `SectionId` values and their translation
 * keys so the card header and the configuration editor stay in sync.
 */

import type { SectionId } from './types';

/** Section titles, used by the card's collapsible headers. */
export const SECTION_TITLE_KEYS: Record<SectionId, string> = {
  face_selector: 'face_selector.title',
  light_controls: 'light_controls.title',
  alarms: 'alarm.title',
  device_settings: 'settings.title',
  device_info: 'device_info.title',
  temperature_graph: 'temperature.title',
  connectivity: 'connectivity.title',
};

/** Section labels, used by the configuration editor's checkboxes. */
export const SECTION_LABEL_KEYS: Record<SectionId, string> = {
  face_selector: 'editor.section.face_selector',
  light_controls: 'editor.section.light_controls',
  alarms: 'editor.section.alarms',
  device_settings: 'editor.section.device_settings',
  device_info: 'editor.section.device_info',
  temperature_graph: 'editor.section.temperature_graph',
  connectivity: 'editor.section.connectivity',
};
