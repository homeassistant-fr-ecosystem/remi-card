/**
 * Format helpers for the Rémi Card.
 *
 * Provides safe, locale-aware formatting and state-inspection utilities so the
 * card never renders "undefined", "NaN" or raw unknown/unavailable states.
 * Inspired by the open-firenet-card format module.
 */

/** Minimal Home Assistant entity state shape used by the card. */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

/**
 * Numeric value of an entity state, or null when the entity is missing or its
 * state is unknown/unavailable/not-a-number.
 */
export function stateNumber(entity?: HassEntity | null): number | null {
  if (!entity) {
    return null;
  }
  const raw = entity.state;
  if (raw === '' || raw === 'unknown' || raw === 'unavailable') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Whether an entity exists and carries a usable state. */
export function isAvailable(entity?: HassEntity | null): boolean {
  return !!entity && entity.state !== 'unknown' && entity.state !== 'unavailable';
}

/** Whether a binary-ish entity is on. */
export function isOn(entity?: HassEntity | null): boolean {
  return entity?.state === 'on';
}

/**
 * Format a number for display, following the user's locale. Returns an em dash
 * for null/NaN so a missing value never shows as "NaN" or "0".
 */
export function formatNumber(
  value: number | null,
  digits = 1,
  lang?: string,
): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString(lang, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
