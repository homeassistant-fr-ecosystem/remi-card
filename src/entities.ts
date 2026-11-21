/**
 * Entity discovery for the Rémi Card.
 *
 * Resolves each logical role to an entity id. Resolution order:
 *  1. explicit config override (e.g. `temperature: sensor.foo_temperature`)
 *  2. `translation_key` match on `hass.entities` (stable across renames)
 *  3. entity-id suffix fallback (e.g. `sensor.<slug>_temperature`)
 *
 * Alarm entities (`time.<base>_*` / `switch.<base>_*`) are discovered separately
 * by prefix, since there can be several per device.
 */

import type { HomeAssistant } from 'custom-card-helpers';
import type { RemiCardConfig } from './types';

export type Role =
  | 'face'
  | 'night_light'
  | 'temperature'
  | 'luminosity'
  | 'connectivity'
  | 'rssi'
  | 'firmware_version'
  | 'ip_address'
  | 'clock_format'
  | 'music_mode'
  | 'volume_control'
  | 'noise_threshold'
  | 'night_face_level'
  | 'alive'
  | 'firmware_update';

interface RoleSpec {
  domain: string;
  /** `translation_key` set by the urbanhello_remi integration. */
  key: string;
}

export const ROLES: Record<Role, RoleSpec> = {
  face: { domain: 'select', key: 'face' },
  night_light: { domain: 'light', key: 'night_light' },
  temperature: { domain: 'sensor', key: 'temperature' },
  luminosity: { domain: 'sensor', key: 'luminosity' },
  connectivity: { domain: 'binary_sensor', key: 'connectivity' },
  rssi: { domain: 'sensor', key: 'rssi' },
  firmware_version: { domain: 'sensor', key: 'firmware_version' },
  ip_address: { domain: 'sensor', key: 'ip_address' },
  clock_format: { domain: 'select', key: 'clock_format' },
  music_mode: { domain: 'select', key: 'music_mode' },
  volume_control: { domain: 'number', key: 'volume' },
  noise_threshold: { domain: 'number', key: 'noise_threshold' },
  night_face_level: { domain: 'number', key: 'night_face_level' },
  alive: { domain: 'binary_sensor', key: 'alive' },
  firmware_update: { domain: 'binary_sensor', key: 'firmware_update' },
};

export type DiscoveredEntities = Partial<Record<Role, string>>;

/** Slugify a device name to build entity ids (matches HA slugification). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Extract the object_id portion of a device identifier.
 *
 * Accepts either a bare slug (`garance`) or a full entity_id
 * (`device_tracker.remi_garance`, `light.garance_night_light`) and returns the
 * part after the first dot. A value without a dot is returned unchanged.
 */
export function objectIdOf(value: string): string {
  return value.includes('.') ? value.split('.').slice(1).join('.') : value;
}

/** Normalize a user-entered device identifier to a bare slug. */
export function normalizeDeviceId(value: string): string {
  return slugify(objectIdOf(value));
}

/** Build the base entity slug from config (device_prefix > device_name > device_id).
 * A full entity_id (e.g. `device_tracker.remi_garance`) is accepted and reduced
 * to its object_id (`remi_garance`) before slugification. */
export function configBase(config: RemiCardConfig): string {
  const raw =
    config.device_prefix ??
    config.device_name ??
    config.device_id ??
    '';
  return normalizeDeviceId(raw);
}

/** Candidate entity ids belonging to the same device, or to the integration. */
function collectCandidates(hass: HomeAssistant, base?: string): string[] {
  const registry = hass.entities ?? {};

  if (base) {
    const byObjectId = Object.keys(registry).filter((id) => {
      const objectId = id.split('.')[1] ?? '';
      return objectId === base || objectId.startsWith(`${base}_`);
    });
    if (byObjectId.length) {
      return byObjectId;
    }
  }

  const byPlatform = Object.keys(registry).filter(
    (id) => registry[id]?.platform === 'urbanhello_remi',
  );
  if (byPlatform.length) {
    return byPlatform;
  }

  return Object.keys(hass.states ?? {});
}

/** Resolve every role to an entity id for this device. */
export function discoverEntities(
  hass: HomeAssistant,
  config: RemiCardConfig,
): DiscoveredEntities {
  const result: DiscoveredEntities = {};
  const registry = hass.entities ?? {};
  const base = configBase(config);
  const candidates = collectCandidates(hass, base);
  const candidateSet = new Set(candidates);

  const byTranslationKey = new Map<string, string>();
  for (const id of candidates) {
    const entry = registry[id];
    const key = entry?.translation_key;
    if (key) {
      byTranslationKey.set(`${id.split('.')[0]}.${key}`, id);
    }
  }

  for (const [role, spec] of Object.entries(ROLES) as [Role, RoleSpec][]) {
    const override = config[role];
    if (typeof override === 'string' && override) {
      result[role] = override;
      continue;
    }
    const byKey = byTranslationKey.get(`${spec.domain}.${spec.key}`);
    if (byKey) {
      result[role] = byKey;
      continue;
    }
    const suffix = `.${base}_${spec.key}`;
    const match = candidates.find(
      (id) => candidateSet.has(id) && id.endsWith(suffix),
    );
    if (match) {
      result[role] = match;
    }
  }

  return result;
}

/** Find all alarm time entities for this device. */
export function discoverAlarms(hass: HomeAssistant, base: string): string[] {
  return Object.keys(hass.states ?? {}).filter((entityId) =>
    entityId.startsWith(`time.${base}_`),
  );
}

/** Build the matching switch entity id for an alarm time entity. */
export function alarmSwitchEntityId(alarmTimeEntityId: string): string {
  return alarmTimeEntityId.replace('time.', 'switch.').replace('_time', '');
}
