import { describe, it, expect } from 'vitest';
import { RemiCard } from './remi-card';
import { normalizeDeviceId, configBase, slugify } from './entities';

describe('RemiCard', () => {
  it('should be defined as a custom element', () => {
    expect(customElements.get('remi-card')).toBeDefined();
  });

  it('getStubConfig should return a valid config', () => {
    const config = RemiCard.getStubConfig();
    expect(config.type).toBe('custom:remi-card');
    expect(config.device_id).toBeDefined();
    expect(config.show_controls).toBe(true);
  });

  it('setConfig should throw when device_id is missing', () => {
    const card = new RemiCard();
    expect(() => card.setConfig({} as never)).toThrow(/device_id/);
  });
});

describe('entities', () => {
  describe('normalizeDeviceId', () => {
    it('returns a bare slug unchanged', () => {
      expect(normalizeDeviceId('garance')).toBe('garance');
    });

    it('extracts object_id from a full entity_id', () => {
      expect(normalizeDeviceId('device_tracker.remi_garance')).toBe('remi_garance');
      expect(normalizeDeviceId('light.garance_night_light')).toBe('garance_night_light');
    });

    it('slugifies spaces and uppercase', () => {
      expect(normalizeDeviceId('Device Tracker.Remi Garance')).toBe('remi_garance');
    });
  });

  describe('configBase', () => {
    const baseConfig = { type: 'custom:remi-card' } as unknown as import('./types').RemiCardConfig;

    it('uses device_id when set', () => {
      expect(configBase({ ...baseConfig, device_id: 'garance' })).toBe('garance');
    });

    it('extracts object_id from a full entity_id device_id', () => {
      expect(configBase({ ...baseConfig, device_id: 'device_tracker.remi_garance' })).toBe('remi_garance');
    });

    it('prefers device_prefix over device_id', () => {
      expect(configBase({ ...baseConfig, device_prefix: 'Garance', device_id: 'device_tracker.remi_garance' })).toBe('garance');
    });

    it('prefers device_name over device_id', () => {
      expect(configBase({ ...baseConfig, device_name: 'Garance', device_id: 'device_tracker.remi_garance' })).toBe('garance');
    });
  });

  describe('slugify', () => {
    it('slugifies a device name', () => {
      expect(slugify('Garance')).toBe('garance');
      expect(slugify('My Device')).toBe('my_device');
    });
  });
});
