import { describe, it, expect } from 'vitest';
import { RemiCard } from './remi-card';

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
