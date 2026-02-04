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
  device_prefix: string;
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
  };
  @state() private _alarmsExpanded = false;

  /**
   * Get a default stub configuration for the card
   * Used when adding the card to Lovelace for the first time
   * @returns Default configuration object
   */
  public static getStubConfig(): RemiCardConfig {
    return {
      type: 'custom:remi-card',
      device_id: 'garance',
      device_prefix: 'garance',
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
      const entities = Object.values(this._entities).filter((e) => e !== null && !Array.isArray(e)) as string[];
      const alarmEntities = this._entities.alarms;
      const allEntities = [...entities, ...alarmEntities];

      return allEntities.some((entityId) => {
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
   * Update entity identifiers based on the device ID
   * Constructs entity IDs for all Rémi device sensors and controls
   */
  private async _updateEntities(): Promise<void> {
    if (!this.hass || !this._config) return;

    const deviceId = this._config.device_id;
    const devicePrefix = this._config.device_prefix;

    // Get entities from the entity registry filtered by device_id
    let alarmEntities: string[] = [];

    try {
      // Try to get entities from the entity registry via WebSocket
      const entities = await this.hass.callWS<Array<{
        entity_id: string;
        device_id: string | null;
      }>>({
        type: 'config/entity_registry/list',
      });

      alarmEntities = entities
        .filter(entity =>
          entity.device_id === deviceId &&
          entity.entity_id.startsWith('time.')
        )
        .map(entity => entity.entity_id);

    } catch (error) {
      console.warn('[Remi Card] Could not access entity registry, falling back to name-based filtering:', error);

      alarmEntities = Object.keys(this.hass.states)
        .filter(entityId =>
          entityId.startsWith(`time.${devicePrefix}_`)
        );
    }

    this._entities = {
      face: `sensor.remi_${devicePrefix}_face`,
      faceSelect: `select.remi_${devicePrefix}_face`,
      light: `light.remi_${devicePrefix}_night_light`,
      temperature: `sensor.remi_${devicePrefix}_temperature`,
      connectivity: `binary_sensor.remi_${devicePrefix}_connectivity`,
      rssi: `sensor.remi_${devicePrefix}_rssi`,
      alarms: alarmEntities,
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
   * @returns The face state string or null if unavailable
   */
  private _getFaceState(): string | null {
    const faceEntity = this._getState(this._entities.face) as SensorEntity | undefined;
    if (!faceEntity || faceEntity.state === 'unavailable') return null;
    return faceEntity.state;
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

    this.hass.callService('select', 'select_option', {
      entity_id: this._entities.faceSelect,
      option: face,
    });
  }

  /**
   * Handle brightness slider input changes
   * Provides immediate UI feedback without calling the service
   * @param _e - The input event (unused)
   */
  private _handleSliderChange(_e: Event): void {
    this.requestUpdate();
  }

  /**
   * Handle brightness slider release
   * Calls the light service when user finishes dragging
   * @param e - The change event containing the final brightness value
   */
  private _handleSliderRelease(e: Event): void {
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
   * Toggle an alarm switch
   * @param switchEntityId - The switch entity ID to toggle
   * @param event - The click event
   */
  private _handleAlarmToggle(switchEntityId: string, event: Event): void {
    event.stopPropagation();

    const switchState = this._getState(switchEntityId);
    if (!switchState) return;

    const service = switchState.state === 'on' ? 'turn_off' : 'turn_on';
    this.hass.callService('switch', service, {
      entity_id: switchEntityId,
    });
  }

  /**
   * Trigger an alarm manually
   */
  private _handleAlarmTrigger(alarmId: string, event: Event): void {
    event.stopPropagation();
    const alarmState = this._getState(alarmId) as TimeEntity | undefined;
    const alarmObjectId = alarmState?.attributes.alarm_id;
    if (!alarmObjectId) return;

    this.hass.callService('urbanhello_remi_hass', 'trigger_alarm', {
      device_id: this._config.device_id,
      alarm_id: alarmObjectId,
    });
  }

  /**
   * Delete an alarm
   */
  private _handleAlarmDelete(alarmId: string, event: Event): void {
    event.stopPropagation();
    const lang = this._getLanguage();
    if (!confirm(localize('alarm.confirm_delete', lang))) return;

    const alarmState = this._getState(alarmId) as TimeEntity | undefined;
    const alarmObjectId = alarmState?.attributes.alarm_id;
    if (!alarmObjectId) return;

    this.hass.callService('urbanhello_remi_hass', 'delete_alarm', {
      device_id: this._config.device_id,
      alarm_id: alarmObjectId,
    });
  }

  /**
   * Create a new alarm
   */
  private _handleAlarmCreate(): void {
    this.hass.callService('urbanhello_remi_hass', 'create_alarm', {
      device_id: this._config.device_id,
      time: '07:00',
      name: 'New Alarm',
      enabled: true,
      days: [0, 1, 2, 3, 4],
    });
  }

  /**
   * Toggle the alarms panel visibility
   */
  private _toggleAlarmsPanel(): void {
    this._alarmsExpanded = !this._alarmsExpanded;
  }

  /**
   * Render the card header
   */
  private _renderHeader(): TemplateResult {
    const faceState = this._getFaceState();
    const lightState = this._getLightState();
    const tempState = this._getTemperatureState();
    const lang = this._getLanguage();

    const deviceName = this._config.device_name || this._config.device_id;
    const faceImage = faceState ? getFaceIcon(faceState) : getFaceIcon('blankFace');
    const faceName = faceState ? localizeFace(faceState, lang) : localizeCommon('unknown', lang);

    let statusText = '';
    if (tempState && tempState.state !== 'unavailable') {
      statusText += `${tempState.state}°C`;
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
   * Render the night light controls
   */
  private _renderLightControls(): TemplateResult {
    const lightState = this._getLightState();
    const isOn = lightState?.state === 'on';
    const lang = this._getLanguage();
    const currentBrightness = lightState?.attributes.brightness
      ? Math.round((lightState.attributes.brightness / 255) * 100)
      : 50;

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
   */
  private _renderFaceSelector(): TemplateResult {
    const faceSelectEntity = this._getFaceSelectState();
    if (!faceSelectEntity) return html``;

    const currentFace = faceSelectEntity.state;
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
   * Render the temperature graph placeholder
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
   */
  private _renderConnectivity(): TemplateResult {
    const connectivityState = this._getConnectivityState();
    const rssiState = this._getRssiState();

    if (!connectivityState || connectivityState.state === 'unavailable') {
      return html``;
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
        </div>
      </div>
    `;
  }

  /**
   * Render the alarm clocks section
   */
  private _renderAlarmClocks(): TemplateResult {
    if (!this._entities.alarms) {
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
          <div class="alarms-section-actions">
            <button class="icon-btn add-btn" @click=${(e: Event) => { e.stopPropagation(); this._handleAlarmCreate(); }} title="${localize('alarm.add_alarm', lang)}">
              <ha-icon icon="mdi:plus"></ha-icon>
            </button>
            <ha-icon icon=${this._alarmsExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
          </div>
        </div>
        ${this._alarmsExpanded ? html`
        <div class="alarms-container">
          ${this._entities.alarms.map((alarmId) => {
            const alarmState = this._getState(alarmId) as TimeEntity | undefined;
            if (!alarmState || alarmState.state === 'unavailable') {
              return html``;
            }

            const alarmEntityName = alarmId.replace('time.', '');
            const switchEntityId = `switch.${alarmEntityName}`;
            const switchState = this._getState(switchEntityId);
            const isAlarmEnabled = switchState?.state === 'on';

            const alarmName = alarmState.attributes.name || 'Alarm';
            const alarmTime = alarmState.state;
            const face = alarmState.attributes.face;
            const brightness = alarmState.attributes.brightness;
            const volume = alarmState.attributes.volume;

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
                    <button class="icon-btn trigger-btn" @click=${(e: Event) => this._handleAlarmTrigger(alarmId, e)} title="${localize('alarm.trigger_alarm', lang)}">
                      <ha-icon icon="mdi:play"></ha-icon>
                    </button>
                    <button class="icon-btn delete-btn" @click=${(e: Event) => this._handleAlarmDelete(alarmId, e)} title="${localize('alarm.delete_alarm', lang)}">
                      <ha-icon icon="mdi:delete"></ha-icon>
                    </button>
                    ${switchState
                      ? html`
                          <ha-switch
                            .checked=${isAlarmEnabled}
                            @click=${(e: Event) => this._handleAlarmToggle(switchEntityId, e)}
                          ></ha-switch>
                        `
                      : ''}
                  </div>
                </div>
                <div class="alarm-details">
                  <div class="alarm-detail-item">
                    <ha-icon icon="mdi:calendar-repeat"></ha-icon>
                    <span>${daysDisplay}</span>
                  </div>
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
   * Render the complete card
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
        ${this._config.show_temperature_graph ? this._renderTemperatureGraph() : ''}
        ${this._config.show_connectivity ? this._renderConnectivity() : ''}
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

      .brightness-slider.inactive {
        opacity: 0.5;
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

      .graph-placeholder {
        padding: 24px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        text-align: center;
        cursor: pointer;
        transition: background 0.15s ease;
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

      .alarms-section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: bold;
        font-size: 1em;
      }

      .alarms-section-actions {
        display: flex;
        align-items: center;
        gap: 8px;
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

      .alarm-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .icon-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        color: var(--secondary-text-color);
      }

      .icon-btn:hover {
        background: rgba(var(--rgb-primary-text-color), 0.1);
      }

      .add-btn {
        color: var(--primary-color);
      }

      .trigger-btn:hover {
        color: var(--success-color, #4caf50);
      }

       .alarm-actions ha-icon {
        --mdc-icon-size: 24px;
      }

      .delete-btn:hover {
        color: var(--error-color, #f44336);
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'remi-card': RemiCard;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'remi-card',
  name: 'Rémi Card',
  description: 'A card for displaying and controlling Rémi UrbanHello baby sleep trainer devices',
  preview: false,
  documentationURL: 'https://github.com/yourusername/remi-card',
});
