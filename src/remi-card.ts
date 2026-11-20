/**
 * Rémi Card - A custom Home Assistant Lovelace card for Rémi UrbanHello baby sleep trainer devices
 * Provides controls for face selection, night light, temperature monitoring, and connectivity status
 */

import { LitElement, html, css, PropertyValues, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import { getFaceIcon, FACE_STATES } from './face-images';
import { localize, localizeFace, localizeCommon } from './localize';

/**
 * Base interface for Home Assistant entity state
 */
interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

/**
 * Light entity state with brightness attribute
 */
interface LightEntity extends HassEntity {
  attributes: {
    brightness?: number;
    friendly_name?: string;
    supported_features?: number;
    [key: string]: unknown;
  };
}

/**
 * Sensor entity state
 */
interface SensorEntity extends HassEntity {
  attributes: {
    unit_of_measurement?: string;
    device_class?: string;
    friendly_name?: string;
    [key: string]: unknown;
  };
}

/**
 * Binary sensor entity state
 */
interface BinarySensorEntity extends HassEntity {
  attributes: {
    device_class?: string;
    friendly_name?: string;
    [key: string]: unknown;
  };
}

/**
 * Select entity state
 */
interface SelectEntity extends HassEntity {
  attributes: {
    options?: string[];
    friendly_name?: string;
    [key: string]: unknown;
  };
}

/**
 * Time entity state for alarm clocks
 */
interface TimeEntity extends HassEntity {
  attributes: {
    name?: string;
    alarm_id?: string;
    brightness?: number;
    volume?: number;
    face?: string;
    lightnight?: boolean;
    days?: string[];
    days_indices?: number[];
    recurrence?: unknown[];
    friendly_name?: string;
    [key: string]: unknown;
  };
}

/**
 * Configuration interface for the Rémi Card
 */
interface RemiCardConfig {
  type: string;
  device_id: string;
  device_name?: string;
  title?: string;
  show_controls?: boolean;
  show_face_selector?: boolean;
  show_temperature_graph?: boolean;
  show_connectivity?: boolean;
  show_alarm_clocks?: boolean;
  hours_to_show?: number;
}

/**
 * Entity identifiers for Rémi device sensors and controls
 */
interface RemiEntity {
  face: string | null;
  faceSelect: string | null;
  light: string | null;
  temperature: string | null;
  connectivity: string | null;
  rssi: string | null;
  alarms: string[];
  luminosity: string | null;
  firmwareVersion: string | null;
  clockFormat: string | null;
  musicMode: string | null;
}

/**
 * Custom event detail for hass-more-info
 */
interface HassMoreInfoDetail {
  entityId: string;
}

/**
 * Window interface extension for custom cards
 */
interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  preview: boolean;
  documentationURL: string;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
  }
}

/**
 * Mapping of HA select option (snake_case) to API face key (camelCase)
 * Used to convert the face select entity state back to the card's face keys
 */
const FACE_HA_TO_API: Record<string, string> = {
  sleepy_face: 'sleepyFace',
  awake_face: 'awakeFace',
  blank_face: 'blankFace',
  semi_awake_face: 'semiAwakeFace',
  smily_face: 'smilyFace',
};

/**
 * Custom Lovelace card for Rémi UrbanHello devices
 */
@customElement('remi-card')
export class RemiCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: RemiCardConfig;
  @state() private _entities: RemiEntity = {
    face: null,
    faceSelect: null,
    light: null,
    temperature: null,
    connectivity: null,
    rssi: null,
    alarms: [],
    luminosity: null,
    firmwareVersion: null,
    clockFormat: null,
    musicMode: null,
  };
  @state() private _alarmsExpanded = false;
  @state() private _addAlarmDialog = false;
  @state() private _deleteAlarmId: string | null = null;
  @state() private _deleteAlarmName = '';

  /**
   * Get a default stub configuration for the card
   * Used when adding the card to Lovelace for the first time
   * @returns Default configuration object
   */
  public static getStubConfig(): RemiCardConfig {
    return {
      type: 'custom:remi-card',
      device_id: 'garance',
      device_name: 'Garance',
      show_controls: true,
      show_face_selector: true,
      show_temperature_graph: true,
      show_connectivity: true,
      show_alarm_clocks: true,
      hours_to_show: 24,
    };
  }

  /**
   * Get the configuration editor element
   * Dynamically imports and creates the editor component
   * @returns Promise resolving to the editor element
   */
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./remi-card-editor');
    return document.createElement('remi-card-editor');
  }

  /**
   * Set the card configuration
   * Validates and applies the configuration with defaults
   * @param config - The card configuration object
   * @throws Error if device_id is not specified
   */
  public setConfig(config: RemiCardConfig): void {
    if (!config.device_id) {
      throw new Error('You must specify a device_id');
    }

    this._config = {
      show_controls: true,
      show_face_selector: true,
      show_temperature_graph: true,
      show_connectivity: true,
      show_alarm_clocks: true,
      hours_to_show: 24,
      ...config,
    };

    this._updateEntities();
  }

  /**
   * Get the card size for layout purposes
   * @returns Card height in grid rows
   */
  public getCardSize(): number {
    return 5;
  }

  /**
   * Determine if the card should update based on changed properties
   * Optimizes rendering by only updating when relevant entities change
   * @param changedProps - Map of changed properties
   * @returns True if the card should re-render
   */
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (changedProps.has('_config')) {
      return true;
    }

    if (changedProps.has('hass')) {
      const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
      if (!oldHass || !this._entities) {
        return true;
      }

      // Check if any of our entities changed
      const entities = Object.values(this._entities).filter((e) => e !== null);
      return entities.some((entityId) => {
        return oldHass.states[entityId] !== this.hass.states[entityId];
      });
    }

    return true;
  }

  /**
   * Lifecycle method called after the element updates
   * Updates entity references when config or hass changes
   * @param changedProps - Map of changed properties
   */
  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (changedProps.has('hass') || changedProps.has('_config')) {
      this._updateEntities();
    }
  }

  /**
   * Slugify a device name to build entity IDs
   * Matches Home Assistant entity_id generation from the device name
   * @param name - The device name
   * @returns A slugified string safe for entity IDs
   */
  private _slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Update entity identifiers based on the device name
   * Constructs entity IDs for all Rémi device sensors and controls.
   *
   * The integration generates entity_ids from the device name slugified
   * (e.g. ``select.baby_room_face``), not from the device id. We therefore
   * derive the entity base from ``device_name`` (falling back to ``device_id``).
   */
  private _updateEntities(): void {
    if (!this.hass || !this._config) return;

    const deviceId = this._config.device_id;

    const base = this._config.device_name
      ? this._slugify(this._config.device_name)
      : deviceId;

    // Find all alarm time entities for this device.
    // The integration exposes them as ``time.<device_name_slug>_<alarm_name_slug>``
    // (e.g. ``time.garance_week_night``), without a ``remi_`` prefix or ``_time``
    // suffix. We therefore match on the device name slug only, consistently
    // with the other entities (face, light, temperature, etc.).
    const alarmEntities = Object.keys(this.hass.states)
      .filter(entityId => entityId.startsWith(`time.${base}_`));

    // The face is exposed by the integration via a select entity, not a
    // dedicated sensor, so there is no ``sensor.*_face`` to read.
    this._entities = {
      face: null,
      faceSelect: `select.${base}_face`,
      light: `light.${base}_night_light`,
      temperature: `sensor.${base}_temperature`,
      connectivity: `binary_sensor.${base}_connectivity`,
      rssi: `sensor.${base}_rssi`,
      alarms: alarmEntities,
      luminosity: `sensor.${base}_luminosity`,
      firmwareVersion: `sensor.${base}_firmware_version`,
      clockFormat: `select.${base}_clock_format`,
      musicMode: `select.${base}_music_mode`,
    };
  }

  /**
   * Get the state object for an entity
   * @param entityId - The entity ID to retrieve
   * @returns The entity state object or undefined if not found
   */
  private _getState(entityId: string | null): HassEntity | undefined {
    if (!entityId || !this.hass) return undefined;
    return this.hass.states[entityId] as HassEntity | undefined;
  }

  /**
   * Get the current face state
   * The face is exposed by the integration via a select entity (snake_case),
   * not a dedicated sensor.
   * @returns The face state in snake_case (e.g. 'sleepy_face') or null if unavailable
   */
  private _getFaceState(): string | null {
    const faceSelectEntity = this._getState(this._entities.faceSelect) as SelectEntity | undefined;
    if (!faceSelectEntity || faceSelectEntity.state === 'unavailable') return null;
    return faceSelectEntity.state;
  }

  /**
   * Get the night light state
   * @returns The light entity state object or undefined if not found
   */
  private _getLightState(): LightEntity | undefined {
    return this._getState(this._entities.light) as LightEntity | undefined;
  }

  /**
   * Get the temperature sensor state
   * @returns The temperature entity state object or undefined if not found
   */
  private _getTemperatureState(): SensorEntity | undefined {
    return this._getState(this._entities.temperature) as SensorEntity | undefined;
  }

  /**
   * Get the face selector state
   * @returns The select entity state object or undefined if not found
   */
  private _getFaceSelectState(): SelectEntity | undefined {
    return this._getState(this._entities.faceSelect) as SelectEntity | undefined;
  }

  /**
   * Get the connectivity state
   * @returns The binary sensor entity state object or undefined if not found
   */
  private _getConnectivityState(): BinarySensorEntity | undefined {
    return this._getState(this._entities.connectivity) as BinarySensorEntity | undefined;
  }

  /**
   * Get the RSSI sensor state
   * @returns The sensor entity state object or undefined if not found
   */
  private _getRssiState(): SensorEntity | undefined {
    return this._getState(this._entities.rssi) as SensorEntity | undefined;
  }

  /**
   * Get the ambient luminosity sensor state
   * @returns The sensor entity state object or undefined if not found
   */
  private _getLuminosityState(): SensorEntity | undefined {
    return this._getState(this._entities.luminosity) as SensorEntity | undefined;
  }

  /**
   * Get the firmware version sensor state
   * @returns The sensor entity state object or undefined if not found
   */
  private _getFirmwareVersionState(): SensorEntity | undefined {
    return this._getState(this._entities.firmwareVersion) as SensorEntity | undefined;
  }

  /**
   * Get the clock format select state
   * @returns The select entity state object or undefined if not found
   */
  private _getClockFormatState(): SelectEntity | undefined {
    return this._getState(this._entities.clockFormat) as SelectEntity | undefined;
  }

  /**
   * Get the music mode select state
   * @returns The select entity state object or undefined if not found
   */
  private _getMusicModeState(): SelectEntity | undefined {
    return this._getState(this._entities.musicMode) as SelectEntity | undefined;
  }

  /**
   * Change the selected option of a select entity
   * @param entityId - The select entity ID
   * @param option - The option to select
   */
  private _handleSelectOption(entityId: string | null, option: string): void {
    if (!entityId) return;
    this.hass.callService('select', 'select_option', {
      entity_id: entityId,
      option,
    });
  }

  /**
   * Get the user's language from Home Assistant
   * @returns The language code (e.g., "en", "fr")
   */
  private _getLanguage(): string {
    return this.hass?.locale?.language || this.hass?.language || 'en';
  }

  /**
   * Control the night light brightness
   * Turns the light on/off or adjusts brightness
   * @param brightness - Brightness percentage (0-100), 0 turns off the light
   */
  private _handleLightControl(brightness: number): void {
    if (!this._entities.light) return;

    if (brightness === 0) {
      this.hass.callService('light', 'turn_off', {
        entity_id: this._entities.light,
      });
    } else {
      this.hass.callService('light', 'turn_on', {
        entity_id: this._entities.light,
        brightness_pct: brightness,
      });
    }
  }

  /**
   * Change the displayed face on the Rémi device
   * @param face - The face state to select (e.g., 'sleepyFace', 'awakeFace')
   */
  private _handleFaceSelect(face: string): void {
    if (!this._entities.faceSelect) return;

    // HA select entity expects snake_case options, API uses camelCase
    const FACE_API_TO_HA: Record<string, string> = {
      sleepyFace: 'sleepy_face',
      awakeFace: 'awake_face',
      blankFace: 'blank_face',
      semiAwakeFace: 'semi_awake_face',
      smilyFace: 'smily_face',
    };
    const option = FACE_API_TO_HA[face] ?? face;

    this.hass.callService('select', 'select_option', {
      entity_id: this._entities.faceSelect,
      option,
    });
  }

  /**
   * Handle brightness slider input changes
   * Provides immediate UI feedback without calling the service
   * @param _e - The input event (unused)
   */
  private _handleSliderChange(_e: Event): void {
    // Update UI immediately for smooth interaction
    // Visual feedback only, don't call service yet
    this.requestUpdate();
  }

  /**
   * Handle brightness slider release
   * Calls the light service when user finishes dragging
   * @param e - The change event containing the final brightness value
   */
  private _handleSliderRelease(e: Event): void {
    // Call service when slider is released
    const target = e.target as HTMLInputElement;
    const brightness = parseInt(target.value);

    if (brightness === 0) {
      this._handleLightControl(0);
    } else {
      this._handleLightControl(brightness);
    }
  }

  /**
   * Open the more-info dialog for an entity
   * @param entityId - The entity ID to show details for
   */
  private _handleMoreInfo(entityId: string | null): void {
    if (!entityId) return;

    const event = new CustomEvent<HassMoreInfoDetail>('hass-more-info', {
      detail: { entityId },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  /**
   * Render the card header with face icon and status information
   * @returns Template result for the header section
   */
  private _renderHeader(): TemplateResult {
    const faceStateHA = this._getFaceState(); // snake_case (e.g. 'sleepy_face') or null
    const lightState = this._getLightState();
    const tempState = this._getTemperatureState();
    const luminosityState = this._getLuminosityState();
    const lang = this._getLanguage();

    // Convert HA snake_case face to API camelCase for icon and localization
    const faceState = faceStateHA ? (FACE_HA_TO_API[faceStateHA] ?? faceStateHA) : null;

    const deviceName = this._config.device_name || this._config.device_id;
    const faceImage = faceState ? getFaceIcon(faceState) : getFaceIcon('blankFace');
    const faceName = faceState ? localizeFace(faceState, lang) : localizeCommon('unknown', lang);

    let statusText = '';
    if (tempState && tempState.state !== 'unavailable') {
      statusText += `${tempState.state}°C`;
    }
    if (luminosityState && luminosityState.state !== 'unavailable') {
      statusText += ` • ${luminosityState.state} lx`;
    }
    statusText += ` • ${faceName}`;

    if (lightState?.state === 'on') {
      const brightness = lightState.attributes.brightness;
      if (brightness !== undefined) {
        const percent = Math.round((brightness / 255) * 100);
        statusText += ` • ${percent}%`;
      }
    } else {
      statusText += ` • ${localizeCommon('off', lang)}`;
    }

    const isLightOn = lightState?.state === 'on';

    return html`
      <div class="header ${isLightOn ? 'light-on' : ''}">
        <div class="face-container">
          <img src="${faceImage}" alt="${faceName}" class="face-icon" />
        </div>
        <div class="info">
          <div class="title">${localizeCommon('remi', lang)} ${deviceName}</div>
          <div class="status">${statusText}</div>
        </div>
      </div>
    `;
  }

  /**
   * Render the night light controls with brightness slider
   * @returns Template result for the light control section
   */
  private _renderLightControls(): TemplateResult {
    const lightState = this._getLightState();
    const isOn = lightState?.state === 'on';
    const lang = this._getLanguage();
    // Keep the brightness value even when light is off
    const currentBrightness = lightState?.attributes.brightness
      ? Math.round((lightState.attributes.brightness / 255) * 100)
      : 50; // Default to 50% if no brightness attribute exists

    return html`
      <div class="section">
        <div class="light-slider-container">
          <button
            class="light-toggle-btn ${isOn ? 'on' : 'off'}"
            @click=${() => this._handleLightControl(isOn ? 0 : currentBrightness)}
            title="${isOn ? localizeCommon('turn_off', lang) : localizeCommon('turn_on', lang)}"
          >
            <ha-icon icon="${isOn ? 'mdi:lightbulb' : 'mdi:lightbulb-outline'}"></ha-icon>
          </button>
          <div class="slider-wrapper">
            <input
              type="range"
              class="brightness-slider ${isOn ? 'active' : 'inactive'}"
              min="0"
              max="100"
              .value=${currentBrightness.toString()}
              @input=${(e: Event) => this._handleSliderChange(e)}
              @change=${(e: Event) => this._handleSliderRelease(e)}
              ?disabled=${!isOn}
            />
            <div class="brightness-value">${currentBrightness}%</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render the face selector buttons
   * @returns Template result for the face selector section
   */
  private _renderFaceSelector(): TemplateResult {
    const faceSelectEntity = this._getFaceSelectState();
    if (!faceSelectEntity) return html``;

    // The select entity state is snake_case (e.g. 'sleepy_face'), convert to
    // camelCase to match FACE_STATES used for icons and labels
    const currentFaceHA = faceSelectEntity.state;
    const currentFace = FACE_HA_TO_API[currentFaceHA] ?? currentFaceHA;
    const lang = this._getLanguage();

    const faceOptions = FACE_STATES.map((face) => ({
      value: face,
      icon: getFaceIcon(face),
      label: localizeFace(face, lang),
    }));

    return html`
      <div class="section">
        <div class="face-selector">
          ${faceOptions.map(
            (option) => html`
              <button
                class="face-btn ${currentFace === option.value ? 'active' : ''}"
                @click=${() => this._handleFaceSelect(option.value)}
                title="${option.label}"
              >
                <img src="${option.icon}" alt="${option.label}" class="face-icon-small" />
                <span>${option.label}</span>
              </button>
            `
          )}
        </div>
      </div>
    `;
  }

  /**
   * Render the device settings section
   * Shows clock format and music mode select controls
   * @returns Template result for the device settings section
   */
  private _renderDeviceSettings(): TemplateResult {
    const clockFormatState = this._getClockFormatState();
    const musicModeState = this._getMusicModeState();
    const lang = this._getLanguage();

    if (!clockFormatState && !musicModeState) return html``;

    return html`
      <div class="section">
        <div class="section-title">${localize('settings.title', lang)}</div>
        ${clockFormatState
          ? html`
              <div class="select-control">
                <label>${localize('clock_format.title', lang)}</label>
                <select
                  .value=${clockFormatState.state || ''}
                  @change=${(e: Event) => {
                    const target = e.target as HTMLSelectElement;
                    this._handleSelectOption(this._entities.clockFormat, target.value);
                  }}
                >
                  <option value="12h">${localize('clock_format.12h', lang)}</option>
                  <option value="24h">${localize('clock_format.24h', lang)}</option>
                </select>
              </div>
            `
          : ''}
        ${musicModeState
          ? html`
              <div class="select-control">
                <label>${localize('music_mode.title', lang)}</label>
                <select
                  .value=${musicModeState.state || ''}
                  @change=${(e: Event) => {
                    const target = e.target as HTMLSelectElement;
                    this._handleSelectOption(this._entities.musicMode, target.value);
                  }}
                >
                  <option value="off">${localize('music_mode.off', lang)}</option>
                  <option value="music">${localize('music_mode.music', lang)}</option>
                  <option value="white_noise">${localize('music_mode.white_noise', lang)}</option>
                </select>
              </div>
            `
          : ''}
      </div>
    `;
  }

  /**
   * Render the temperature graph placeholder
   * Clicking opens the entity's history dialog
   * @returns Template result for the temperature section
   */
  private _renderTemperatureGraph(): TemplateResult {
    const tempEntity = this._entities.temperature;
    if (!tempEntity) return html``;

    const lang = this._getLanguage();
    const tempState = this._getState(tempEntity);

    return html`
      <div class="section">
        <div class="section-title">📊 ${localize('temperature.title', lang)} (${this._config.hours_to_show}h)</div>
        <div class="graph-placeholder" @click=${() => this._handleMoreInfo(tempEntity)}>
          <div class="entity-state">${tempState?.state}°C</div>
          <div class="entity-info">${localize('temperature.click_for_history', lang)}</div>
        </div>
      </div>
    `;
  }

  /**
   * Render the connectivity status section
   * Shows WiFi connection status and signal strength
   * @returns Template result for the connectivity section
   */
  private _renderConnectivity(): TemplateResult {
    const connectivityState = this._getConnectivityState();
    const rssiState = this._getRssiState();
    const firmwareState = this._getFirmwareVersionState();

    if (!connectivityState || connectivityState.state === 'unavailable') {
      const lang = this._getLanguage();
      return html`
        <div class="section">
          <div class="connectivity">
            <div class="connectivity-item disconnected">
              <ha-icon icon="mdi:wifi-off"></ha-icon>
              <span>${localize('connectivity.not_available', lang)}</span>
            </div>
          </div>
        </div>
      `;
    }

    const isConnected = connectivityState.state === 'on';
    const lang = this._getLanguage();

    return html`
      <div class="section">
        <div class="connectivity">
          <div class="connectivity-item ${isConnected ? 'connected' : 'disconnected'}">
            <ha-icon icon="mdi:wifi"></ha-icon>
            <span>${localize(`connectivity.${isConnected ? 'connected' : 'disconnected'}`, lang)}</span>
          </div>
          ${rssiState && rssiState.state !== 'unavailable'
            ? html`
                <div class="connectivity-item">
                  <ha-icon icon="mdi:wifi-strength-3"></ha-icon>
                  <span>${rssiState.state} dBm</span>
                </div>
              `
            : ''}
          ${firmwareState && firmwareState.state !== 'unavailable'
            ? html`
                <div class="connectivity-item">
                  <ha-icon icon="mdi:chip"></ha-icon>
                  <span>${localize('firmware.version', lang)}: ${firmwareState.state}</span>
                </div>
              `
            : ''}
        </div>
      </div>
    `;
  }

  /**
   * Toggle the alarms panel visibility
   */
  private _toggleAlarmsPanel(): void {
    this._alarmsExpanded = !this._alarmsExpanded;
  }

  /**
   * Toggle an alarm switch
   * @param switchEntityId - The switch entity ID to toggle
   * @param event - The click event
   */
  private _handleAlarmToggle(switchEntityId: string, event: Event): void {
    event.stopPropagation(); // Prevent opening more-info dialog

    const switchState = this._getState(switchEntityId);
    if (!switchState) return;

    const service = switchState.state === 'on' ? 'turn_off' : 'turn_on';
    this.hass.callService('switch', service, {
      entity_id: switchEntityId,
    });
  }

  /**
   * Open the add alarm dialog
   */
  private _handleAddAlarmOpen(): void {
    this._addAlarmDialog = true;
  }

  /**
   * Close the add alarm dialog
   */
  private _handleAddAlarmClose(): void {
    this._addAlarmDialog = false;
  }

  /**
   * Submit the add alarm form
   * Calls the urbanhello_remi.create_alarm service
   * @param e - The form submit event
   */
  private _handleAddAlarmSubmit(e: Event): void {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const time = (formData.get('time') as string) || '';
    if (!time) return;

    const name = (formData.get('name') as string) || undefined;
    const enabled = formData.get('enabled') === 'on';
    const days = Array.from(formData.getAll('days')).map(Number);

    this.hass.callService('urbanhello_remi', 'create_alarm', {
      time,
      name,
      enabled,
      days,
    }, {
      device_id: this._config.device_id,
    });

    this._addAlarmDialog = false;
    form.reset();
  }

  /**
   * Trigger (test) an alarm
   * Calls the urbanhello_remi.trigger_alarm service
   * @param alarmId - The alarm ID to trigger
   */
  private _handleTriggerAlarm(alarmId: string): void {
    this.hass.callService('urbanhello_remi', 'trigger_alarm', {
      alarm_id: alarmId,
    }, {
      device_id: this._config.device_id,
    });
  }

  /**
   * Prepare the deletion of an alarm (opens confirmation dialog)
   * @param alarmId - The alarm ID to delete
   * @param alarmName - The alarm name for the confirmation message
   */
  private _handleDeleteAlarmPrepare(alarmId: string, alarmName: string): void {
    this._deleteAlarmId = alarmId;
    this._deleteAlarmName = alarmName;
  }

  /**
   * Cancel the deletion of an alarm
   */
  private _handleDeleteAlarmCancel(): void {
    this._deleteAlarmId = null;
    this._deleteAlarmName = '';
  }

  /**
   * Confirm the deletion of an alarm
   * Calls the urbanhello_remi.delete_alarm service
   */
  private _handleDeleteAlarmConfirm(): void {
    if (!this._deleteAlarmId) return;

    this.hass.callService('urbanhello_remi', 'delete_alarm', {
      alarm_id: this._deleteAlarmId,
    }, {
      device_id: this._config.device_id,
    });

    this._deleteAlarmId = null;
    this._deleteAlarmName = '';
  }

  /**
   * Render the alarm clocks section
   * Shows all configured alarm clocks for this device
   * @returns Template result for the alarm clocks section
   */
  private _renderAlarmClocks(): TemplateResult {
    if (!this._entities.alarms || this._entities.alarms.length === 0) {
      return html``;
    }

    const lang = this._getLanguage();
    const alarmsCount = this._entities.alarms.length;

    return html`
      <div class="section">
        <div class="alarms-section-header" @click=${this._toggleAlarmsPanel}>
          <div class="alarms-section-title">
            <ha-icon icon="mdi:alarm-multiple"></ha-icon>
            <span>⏰ ${localize('alarm.title', lang)} (${alarmsCount})</span>
          </div>
          <ha-icon-button
            icon="mdi:plus"
            @click=${(e: Event) => { e.stopPropagation(); this._handleAddAlarmOpen(); }}
            title="${localize('alarm.add_alarm', lang)}"
          ></ha-icon-button>
          <ha-icon icon=${this._alarmsExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
        </div>
        ${this._alarmsExpanded ? html`
        <div class="alarms-container">
          ${this._entities.alarms.map((alarmId) => {
            const alarmState = this._getState(alarmId) as TimeEntity | undefined;
            if (!alarmState || alarmState.state === 'unavailable') {
              return html``;
            }

            // Extract alarm name from entity ID
            // time.garance_week_night_time -> garance_week_night -> switch.garance_week_night
            const alarmEntityName = alarmId.replace('time.', '').replace('_time', '');
            const switchEntityId = `switch.${alarmEntityName}`;
            const switchState = this._getState(switchEntityId);
            const isAlarmEnabled = switchState?.state === 'on';

            const alarmName = alarmState.attributes.name || 'Alarm';
            const alarmTime = alarmState.state;
            const days = alarmState.attributes.days || [];
            const face = alarmState.attributes.face;
            const brightness = alarmState.attributes.brightness;
            const volume = alarmState.attributes.volume;

            // Format days for display
            const daysShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const selectedDaysIndices = alarmState.attributes.days_indices || [];
            const daysDisplay = selectedDaysIndices.length > 0
              ? selectedDaysIndices.map(i => daysShort[i]).join(', ')
              : localize('alarm.no_repeat', lang);

            return html`
              <div class="alarm-card ${isAlarmEnabled ? 'enabled' : 'disabled'}" @click=${() => this._handleMoreInfo(alarmId)}>
                <div class="alarm-header">
                  <div class="alarm-time-container">
                    <div class="alarm-time">${alarmTime}</div>
                    <div class="alarm-name">${alarmName}</div>
                  </div>
                  <div class="alarm-actions">
                    ${switchState
                      ? html`
                          <ha-switch
                            .checked=${isAlarmEnabled}
                            @click=${(e: Event) => this._handleAlarmToggle(switchEntityId, e)}
                          ></ha-switch>
                        `
                      : ''}
                    <ha-icon-button
                      icon="mdi:alarm"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this._handleTriggerAlarm(alarmId);
                      }}
                      title="${localize('alarm.trigger_alarm', lang)}"
                    ></ha-icon-button>
                    <ha-icon-button
                      icon="mdi:delete-outline"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this._handleDeleteAlarmPrepare(alarmId, alarmName);
                      }}
                      title="${localize('alarm.delete_alarm', lang)}"
                    ></ha-icon-button>
                  </div>
                </div>
                <div class="alarm-details">
                  ${days.length > 0
                    ? html`
                        <div class="alarm-detail-item">
                          <ha-icon icon="mdi:calendar-repeat"></ha-icon>
                          <span>${daysDisplay}</span>
                        </div>
                      `
                    : html`
                        <div class="alarm-detail-item">
                          <ha-icon icon="mdi:calendar-blank"></ha-icon>
                          <span>${daysDisplay}</span>
                        </div>
                      `}
                  ${face
                    ? html`
                        <div class="alarm-detail-item">
                          <ha-icon icon="mdi:emoticon"></ha-icon>
                          <span>${localizeFace(face, lang)}</span>
                        </div>
                      `
                    : ''}
                  ${brightness !== undefined
                    ? html`
                        <div class="alarm-detail-item">
                          <ha-icon icon="mdi:brightness-6"></ha-icon>
                          <span>${brightness}%</span>
                        </div>
                      `
                    : ''}
                  ${volume !== undefined
                    ? html`
                        <div class="alarm-detail-item">
                          <ha-icon icon="mdi:volume-high"></ha-icon>
                          <span>${volume}%</span>
                        </div>
                      `
                    : ''}
                </div>
              </div>
            `;
          })}
        </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render the add alarm dialog
   * Opens a form to create a new alarm via the urbanhello_remi.create_alarm service
   * @returns Template result for the dialog, or empty if closed
   */
  private _renderAddAlarmDialog(): TemplateResult {
    if (!this._addAlarmDialog) return html``;
    const lang = this._getLanguage();

    return html`
      <div class="modal-backdrop" @click=${this._handleAddAlarmClose}></div>
      <dialog class="modal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-content">
          <h3>${localize('alarm.add_alarm', lang)}</h3>
          <form @submit=${this._handleAddAlarmSubmit}>
            <div class="form-field">
              <label>${localize('alarm.new_alarm_name', lang)}</label>
              <input type="text" name="name" placeholder="${localize('alarm.new_alarm_name', lang)}" />
            </div>
            <div class="form-field">
              <label>${localize('alarm.time', lang)}</label>
              <input type="time" name="time" required />
            </div>
            <div class="form-field">
              <label>${localize('alarm.enabled', lang)}</label>
              <input type="checkbox" name="enabled" checked />
            </div>
            <div class="form-field days">
              <label>${localize('alarm.days.title', lang)}</label>
              <div class="day-checkboxes">
                ${[0, 1, 2, 3, 4, 5, 6].map(
                  (i) => html`
                    <label class="day-checkbox">
                      <input type="checkbox" name="days" value="${i}" />
                      <span>${localize(`alarm.days.${i}`, lang)}</span>
                    </label>
                  `
                )}
              </div>
            </div>
            <div class="form-actions">
              <button type="button" @click=${this._handleAddAlarmClose}>
                ${localize('alarm.confirm_delete_no', lang)}
              </button>
              <button type="submit">${localize('alarm.add_alarm', lang)}</button>
            </div>
          </form>
        </div>
      </dialog>
    `;
  }

  /**
   * Render the delete confirmation dialog
   * Asks for confirmation before calling urbanhello_remi.delete_alarm
   * @returns Template result for the dialog, or empty if closed
   */
  private _renderDeleteConfirmationDialog(): TemplateResult {
    if (!this._deleteAlarmId) return html``;
    const lang = this._getLanguage();

    return html`
      <div class="modal-backdrop" @click=${this._handleDeleteAlarmCancel}></div>
      <dialog class="modal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-content">
          <h3>${localize('alarm.delete_alarm', lang)}</h3>
          <p>
            ${localize('alarm.confirm_delete', lang)} "${this._deleteAlarmName}"?
          </p>
          <div class="form-actions">
            <button type="button" @click=${this._handleDeleteAlarmCancel}>
              ${localize('alarm.confirm_delete_no', lang)}
            </button>
            <button type="button" @click=${this._handleDeleteAlarmConfirm} class="delete">
              ${localize('alarm.confirm_delete_yes', lang)}
            </button>
          </div>
        </div>
      </dialog>
    `;
  }

  /**
   * Render the complete card
   * Combines all sections based on configuration
   * @returns Template result for the entire card
   */
  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    return html`
      <ha-card>
        ${this._renderHeader()}
        ${this._config.show_face_selector ? this._renderFaceSelector() : ''}
        ${this._config.show_controls ? this._renderLightControls() : ''}
        ${this._config.show_alarm_clocks ? this._renderAlarmClocks() : ''}
        ${this._config.show_controls ? this._renderDeviceSettings() : ''}
        ${this._config.show_temperature_graph ? this._renderTemperatureGraph() : ''}
        ${this._config.show_connectivity ? this._renderConnectivity() : ''}
        ${this._renderAddAlarmDialog()}
        ${this._renderDeleteConfirmationDialog()}
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      :host {
        display: block;
      }

      ha-card {
        padding: 16px;
      }

      .header {
        display: grid;
        grid-template-areas: 'face info';
        grid-template-columns: 60px 1fr;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        background: rgba(var(--rgb-grey), 0.1);
        border: 1px solid rgba(var(--rgb-grey), 0.3);
        margin-bottom: 16px;
        transition: all 0.25s ease;
      }

      .header.light-on {
        background: rgba(var(--rgb-amber), 0.2);
        border: 2px solid var(--amber-color, #ffc107);
      }

      .face-container {
        grid-area: face;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .face-icon {
        width: 50px;
        height: 50px;
        object-fit: contain;
      }

      .info {
        grid-area: info;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .title {
        font-size: 1.2em;
        font-weight: bold;
        margin-bottom: 4px;
      }

      .status {
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }

      .section {
        margin-bottom: 16px;
      }

      .section:last-child {
        margin-bottom: 0;
      }

      .section-title {
        font-weight: bold;
        margin-bottom: 8px;
        font-size: 1em;
      }

      .light-slider-container {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        border-radius: 8px;
        background: var(--secondary-background-color);
      }

      .light-toggle-btn {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 2px solid var(--divider-color);
        background: var(--card-background-color);
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .light-toggle-btn.on {
        background: rgba(var(--rgb-amber), 0.2);
        border-color: var(--amber-color, #ffc107);
      }

      .light-toggle-btn.on ha-icon {
        color: var(--amber-color, #ffc107);
      }

      .light-toggle-btn.off ha-icon {
        color: var(--secondary-text-color);
      }

      .light-toggle-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .light-toggle-btn:active {
        transform: scale(1.0);
      }

      .light-toggle-btn ha-icon {
        --mdc-icon-size: 28px;
      }

      .slider-wrapper {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .brightness-slider {
        flex: 1;
        height: 6px;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        outline: none;
        border-radius: 3px;
        cursor: pointer;
      }

      .brightness-slider::-webkit-slider-track {
        height: 6px;
        background: linear-gradient(to right,
          var(--divider-color) 0%,
          rgba(var(--rgb-amber), 0.3) 50%,
          var(--amber-color, #ffc107) 100%);
        border-radius: 3px;
      }

      .brightness-slider::-moz-range-track {
        height: 6px;
        background: linear-gradient(to right,
          var(--divider-color) 0%,
          rgba(var(--rgb-amber), 0.3) 50%,
          var(--amber-color, #ffc107) 100%);
        border-radius: 3px;
      }

      .brightness-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        background: var(--amber-color, #ffc107);
        border: 3px solid var(--card-background-color);
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.15s ease;
      }

      .brightness-slider::-moz-range-thumb {
        width: 20px;
        height: 20px;
        background: var(--amber-color, #ffc107);
        border: 3px solid var(--card-background-color);
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.15s ease;
      }

      .brightness-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
      }

      .brightness-slider::-moz-range-thumb:hover {
        transform: scale(1.2);
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
      }

      .brightness-slider.inactive {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .brightness-slider.inactive::-webkit-slider-thumb {
        background: var(--divider-color);
        cursor: not-allowed;
      }

      .brightness-slider.inactive::-moz-range-thumb {
        background: var(--divider-color);
        cursor: not-allowed;
      }

      .brightness-value {
        min-width: 45px;
        text-align: right;
        font-weight: 600;
        font-size: 0.95em;
        color: var(--primary-text-color);
      }

      .face-selector {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
      }

      .face-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 4px;
        border: 2px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .face-btn:hover {
        background: var(--secondary-background-color);
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .face-btn:active {
        transform: translateY(0);
      }

      .face-btn.active {
        border-color: var(--primary-color);
        background: rgba(var(--rgb-primary-color), 0.1);
      }

      .face-icon-small {
        width: 36px;
        height: 36px;
        object-fit: contain;
        margin-bottom: 4px;
      }

      .face-btn span {
        font-size: 0.75em;
        text-align: center;
        line-height: 1.2;
      }

      @media (max-width: 600px) {
        .face-selector {
          grid-template-columns: repeat(3, 1fr);
        }

        .face-btn {
          padding: 8px 4px;
        }

        .face-icon-small {
          width: 30px;
          height: 30px;
        }
      }

      .select-control {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--secondary-background-color);
        margin-bottom: 8px;
      }

      .select-control:last-child {
        margin-bottom: 0;
      }

      .select-control label {
        font-size: 0.9em;
        color: var(--primary-text-color);
        min-width: 120px;
      }

      .select-control select {
        flex: 1;
        padding: 6px 10px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.9em;
        cursor: pointer;
      }

      .select-control select:focus {
        outline: none;
        border-color: var(--primary-color);
      }

      .graph-placeholder {
        padding: 24px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        text-align: center;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .graph-placeholder:hover {
        background: var(--secondary-background-color);
      }

      .entity-state {
        font-size: 2em;
        font-weight: bold;
        margin-bottom: 8px;
      }

      .entity-info {
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }

      .connectivity {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .connectivity-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--secondary-background-color);
      }

      .connectivity-item.connected ha-icon {
        color: var(--success-color, #4caf50);
      }

      .connectivity-item.disconnected ha-icon {
        color: var(--error-color, #f44336);
      }

      .connectivity-item ha-icon {
        --mdc-icon-size: 20px;
      }

      .alarms-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        margin-bottom: 8px;
        border-radius: 8px;
        background: var(--secondary-background-color);
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .alarms-section-header:hover {
        background: var(--divider-color);
      }

      .alarms-section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: bold;
        font-size: 1em;
      }

      .alarms-section-title ha-icon {
        --mdc-icon-size: 20px;
      }

      .alarms-section-header > ha-icon {
        --mdc-icon-size: 24px;
        color: var(--secondary-text-color);
      }

      .alarms-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 8px;
      }

      .alarm-card {
        padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .alarm-card.disabled {
        opacity: 0.6;
      }

      .alarm-card:hover {
        background: var(--secondary-background-color);
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .alarm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }

      .alarm-time-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .alarm-time {
        font-size: 1.8em;
        font-weight: bold;
        color: var(--primary-text-color);
        line-height: 1;
      }

      .alarm-name {
        font-size: 1em;
        color: var(--secondary-text-color);
      }

      .alarm-card ha-switch {
        flex-shrink: 0;
      }

      .alarm-details {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .alarm-detail-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 4px;
        background: var(--secondary-background-color);
        font-size: 0.85em;
      }

      .alarm-detail-item ha-icon {
        --mdc-icon-size: 16px;
        color: var(--primary-color);
      }

      .alarm-detail-item span {
        color: var(--secondary-text-color);
      }

      .alarm-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .alarm-actions ha-icon-button {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }

      .alarm-actions ha-icon-button:hover {
        color: var(--primary-color);
      }

      .alarm-actions ha-icon-button.delete:hover,
      .alarm-actions ha-icon-button[icon="mdi:delete-outline"]:hover {
        color: var(--error-color, #f44336);
      }

      /* --- Add alarm / delete confirmation dialogs --- */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 100;
        backdrop-filter: blur(2px);
      }

      .modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 20px;
        min-width: 320px;
        max-width: 480px;
        max-height: 90vh;
        overflow-y: auto;
        z-index: 101;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .modal h3 {
        margin: 0 0 16px 0;
        font-size: 1.25em;
        font-weight: bold;
        color: var(--primary-text-color);
      }

      .modal p {
        margin: 0 0 16px 0;
        color: var(--primary-text-color);
      }

      .form-field {
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-field label {
        font-size: 0.9em;
        font-weight: 500;
        color: var(--primary-text-color);
      }

      .form-field input[type="text"],
      .form-field input[type="time"] {
        padding: 8px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.95em;
      }

      .form-field input[type="checkbox"] {
        width: 18px;
        height: 18px;
      }

      .form-field.days label {
        align-items: center;
        flex-direction: row;
        gap: 8px;
        margin-bottom: 0;
      }

      .day-checkboxes {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .day-checkbox {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85em;
        cursor: pointer;
      }

      .day-checkbox input[type="checkbox"] {
        width: 16px;
        height: 16px;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--divider-color);
      }

      .form-actions button {
        padding: 8px 16px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.9em;
        cursor: pointer;
      }

      .form-actions button:hover {
        background: var(--secondary-background-color);
      }

      .form-actions button.delete {
        border-color: var(--error-color, #f44336);
        color: var(--error-color, #f44336);
      }

      .form-actions button.delete:hover {
        background: var(--error-color, #f44336);
        color: var(--card-background-color);
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'remi-card': RemiCard;
  }
}

// Register card in Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'remi-card',
  name: 'Rémi Card',
  description: 'A card for displaying and controlling Rémi UrbanHello baby sleep trainer devices',
  preview: false,
  documentationURL: 'https://github.com/yourusername/remi-card',
});
