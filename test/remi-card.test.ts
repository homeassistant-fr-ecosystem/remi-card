import { describe, it, expect, vi } from 'vitest';
import { RemiCard } from '../src/remi-card';
import { normalizeDeviceId, configBase, slugify } from '../src/entities';
import en from '../src/translations/en.json';
import fr from '../src/translations/fr.json';

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
    const baseConfig = { type: 'custom:remi-card' } as unknown as import('../src/types').RemiCardConfig;

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

describe('face-images', () => {
  it('getFaceIcon returns a non-empty string for a known face', async () => {
    const { getFaceIcon } = await import('../src/face-images');
    expect(typeof getFaceIcon('sleepy_face')).toBe('string');
    expect(getFaceIcon('sleepy_face').length).toBeGreaterThan(0);
  });

  it('getFaceIcon defaults to blank face for unknown state', async () => {
    const { getFaceIcon } = await import('../src/face-images');
    expect(getFaceIcon('unknown_face')).toBe(getFaceIcon('blank_face'));
  });

  it('FACE_HA_TO_API and FACE_API_TO_HA are inverse mappings', async () => {
    const { FACE_HA_TO_API, FACE_API_TO_HA } = await import('../src/face-images');
    for (const [ha, api] of Object.entries(FACE_HA_TO_API)) {
      expect(FACE_API_TO_HA[api]).toBe(ha);
    }
  });
});

describe('localize', () => {
  it('returns the translation for an existing key', () => {
    import('../src/localize').then(({ localize }) => {
      expect(localize('common.on', 'en')).toBe('On');
      expect(localize('common.on', 'fr')).toBe('Allumé');
    });
  });

  it('falls back to English when the language is missing', () => {
    import('../src/localize').then(({ localize }) => {
      expect(localize('common.on', 'xx')).toBe('On');
    });
  });

  it('returns the key itself when no translation exists', () => {
    import('../src/localize').then(({ localize }) => {
      expect(localize('does.not.exist', 'en')).toBe('does.not.exist');
    });
  });
});

describe('format', () => {
  it('formatNumber formats a number with given digits', () => {
    import('../src/format').then(({ formatNumber }) => {
      expect(formatNumber(21.5, 1, 'en')).toBe('21.5');
      expect(formatNumber(21, 0, 'en')).toBe('21');
    });
  });

  it('formatNumber returns em dash for null', () => {
    import('../src/format').then(({ formatNumber }) => {
      expect(formatNumber(null, 1, 'en')).toBe('—');
    });
  });

  it('stateNumber returns null for unavailable/unknown', () => {
    import('../src/format').then(({ stateNumber }) => {
      expect(stateNumber({ state: 'unavailable' } as never)).toBeNull();
      expect(stateNumber({ state: 'unknown' } as never)).toBeNull();
      expect(stateNumber(undefined)).toBeNull();
    });
  });
});

describe('entities alarms', () => {
  it('discoverAlarms finds time entities by prefix', () => {
    import('../src/entities').then(({ discoverAlarms }) => {
      const hass = {
        states: {
          'time.garance_alarm_1': { state: '07:00' },
          'time.garance_alarm_2': { state: '08:00' },
          'time.other_alarm': { state: '09:00' },
          'switch.garance_alarm_1': { state: 'on' },
        },
      } as never;
      expect(discoverAlarms(hass, 'garance')).toHaveLength(2);
    });
  });

  it('alarmSwitchEntityId converts time to switch', () => {
    import('../src/entities').then(({ alarmSwitchEntityId }) => {
      expect(alarmSwitchEntityId('time.garance_alarm_1')).toBe('switch.garance_alarm_1');
    });
  });
});

describe('i18n key consistency', () => {
  /** Recursively collect all leaf [key, value] pairs from a translation object.
   * Keys that contain dots (e.g. "section.face_selector") are preserved as-is. */
  const collectLeaves = (
    obj: Record<string, unknown>,
    prefix = '',
  ): Array<{ key: string; value: string }> => {
    const leaves: Array<{ key: string; value: string }> = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        leaves.push(...collectLeaves(value as Record<string, unknown>, fullKey));
      } else if (typeof value === 'string') {
        leaves.push({ key: fullKey, value });
      }
    }
    return leaves;
  };

  const enLeaves = collectLeaves(en);
  const frLeaves = collectLeaves(fr);
  const enKeys = enLeaves.map((l) => l.key).sort();
  const frKeys = frLeaves.map((l) => l.key).sort();

  it('en.json and fr.json share the same top-level keys', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('en.json and fr.json share the same leaf keys (recursive)', () => {
    expect(frKeys).toEqual(enKeys);
  });

  it('every translation value is a non-empty string', () => {
    for (const leaf of [...enLeaves, ...frLeaves]) {
      expect(typeof leaf.value === 'string' && leaf.value.length > 0).toBe(
        true,
      );
    }
  });

  it('every en key has a matching fr key with same key path', () => {
    const frKeySet = new Set(frKeys);
    for (const key of enKeys) {
      expect(frKeySet.has(key)).toBe(true);
    }
  });
});

describe('RemiCard service calls', () => {
  it('_callService should call hass.callService with correct args', () => {
    const card = new RemiCard();
    const hass = { callService: vi.fn() };
    (card as any).hass = hass;
    (card as any)._callService('light', 'turn_on', { entity_id: 'light.test' });
    expect(hass.callService).toHaveBeenCalledWith(
      'light',
      'turn_on',
      { entity_id: 'light.test' },
      undefined,
    );
  });

  it('_callService should store error when hass.callService throws', () => {
    const card = new RemiCard();
    const hass = { callService: vi.fn(() => { throw new Error('boom'); }) };
    (card as any).hass = hass;
    (card as any)._callService('light', 'turn_on', { entity_id: 'light.test' });
    expect((card as any)._serviceError).toBe('boom');
  });

  it('_callService should show unavailable message when hass is missing', () => {
    const card = new RemiCard();
    (card as any).hass = undefined;
    (card as any)._callService('light', 'turn_on', { entity_id: 'light.test' });
    expect((card as any)._serviceError).toContain('Home Assistant');
  });

  it('_handleLightControl should call turn_off when brightness is 0', () => {
    const card = new RemiCard();
    const hass = { callService: vi.fn() };
    (card as any).hass = hass;
    (card as any)._entities = { night_light: 'light.test' };
    (card as any)._handleLightControl(0);
    expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', {
      entity_id: 'light.test',
    }, undefined);
  });

  it('_handleLightControl should call turn_on with brightness_pct when brightness > 0', () => {
    const card = new RemiCard();
    const hass = { callService: vi.fn() };
    (card as any).hass = hass;
    (card as any)._entities = { night_light: 'light.test' };
    (card as any)._handleLightControl(50);
    expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
      entity_id: 'light.test',
      brightness_pct: 50,
    }, undefined);
  });

  it('_handleFaceSelect should convert API camelCase face to HA snake_case', () => {
    const card = new RemiCard();
    const hass = { callService: vi.fn() };
    (card as any).hass = hass;
    (card as any)._entities = { face: 'select.test' };
    (card as any)._handleFaceSelect('sleepyFace');
    expect(hass.callService).toHaveBeenCalledWith('select', 'select_option', {
      entity_id: 'select.test',
      option: 'sleepy_face',
    }, undefined);
  });

  it('_handleFaceSelect should pass through unknown face unchanged', () => {
    const card = new RemiCard();
    const hass = { callService: vi.fn() };
    (card as any).hass = hass;
    (card as any)._entities = { face: 'select.test' };
    (card as any)._handleFaceSelect('customFace');
    expect(hass.callService).toHaveBeenCalledWith('select', 'select_option', {
      entity_id: 'select.test',
      option: 'customFace',
    }, undefined);
  });

  it('_brightnessToPercent should convert 0-255 to 0-100', () => {
    const card = new RemiCard();
    expect((card as any)._brightnessToPercent(255)).toBe(100);
    expect((card as any)._brightnessToPercent(0)).toBe(0);
    expect((card as any)._brightnessToPercent(128)).toBe(50);
    expect((card as any)._brightnessToPercent(1)).toBe(0);
  });

  it('_getTypedState should return typed entity state', () => {
    const card = new RemiCard();
    const hass = {
      states: { 'light.test': { state: 'on', attributes: { brightness: 128 } } },
    };
    (card as any).hass = hass;
    const result = (card as any)._getTypedState('light.test');
    expect(result?.state).toBe('on');
    expect(result?.attributes.brightness).toBe(128);
  });

  it('_getTypedState should return undefined for missing entity', () => {
    const card = new RemiCard();
    const hass = { states: {} };
    (card as any).hass = hass;
    const result = (card as any)._getTypedState('light.missing');
    expect(result).toBeUndefined();
  });

  it('_handleSliderRelease should ignore invalid values', () => {
    const card = new RemiCard();
    const hass = { callService: vi.fn() };
    (card as any).hass = hass;
    (card as any)._entities = { night_light: 'light.test' };
    const mockEvent = {
      target: { value: 'not-a-number' },
    } as unknown as Event;
    (card as any)._handleSliderRelease(mockEvent);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it('_handleSliderRelease should call light control with parsed value', () => {
    const card = new RemiCard();
    const hass = { callService: vi.fn() };
    (card as any).hass = hass;
    (card as any)._entities = { night_light: 'light.test' };
    const mockEvent = {
      target: { value: '75' },
    } as unknown as Event;
    (card as any)._handleSliderRelease(mockEvent);
    expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
      entity_id: 'light.test',
      brightness_pct: 75,
    }, undefined);
  });
});
