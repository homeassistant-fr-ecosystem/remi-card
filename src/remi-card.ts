/**
 * Rémi Card - A custom Home Assistant Lovelace card for Rémi UrbanHello baby sleep trainer devices
 * Provides controls for face selection, night light, temperature monitoring, and connectivity status
 */

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import { getFaceIcon, FACE_STATES, FACE_HA_TO_API, FACE_API_TO_HA } from './face-images';
import { localize, localizeFace, localizeCommon } from './localize';
import { getLanguage, t } from './i18n-helper';
import { RemiCardConfig, type SectionId } from './types';
import {
  discoverEntities,
  discoverAlarms,
  alarmSwitchEntityId,
  configBase,
  type DiscoveredEntities,
} from './entities';
import {
  formatNumber,
  isAvailable,
  isOn,
  stateNumber,
  type HassEntity,
} from './format';
import { VERSION } from './version.generated';

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
  getEntitySuggestion?: (
    hass: HomeAssistant,
    entityId: string,
  ) => { config: Record<string, unknown> } | null;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
  }
}

/** Collapsible section identifiers. `status` (header) is always visible. */
export const SECTION_IDS = [
  'face_selector',
  'light_controls',
  'alarms',
  'device_settings',
  'device_info',
  'temperature_graph',
  'connectivity',
] as const;

/** Sections expanded by default when the config does not set `expanded_sections`. */
export const DEFAULT_EXPANDED_SECTIONS: readonly SectionId[] = [
  'face_selector',
  'light_controls',
  'alarms',
  'device_settings',
  'device_info',
  'temperature_graph',
  'connectivity',
];

/** Section titles, used by the collapsible headers. */
const SECTION_TITLE_KEYS: Record<SectionId, string> = {
  face_selector: 'face_selector.title',
  light_controls: 'light_controls.title',
  alarms: 'alarm.title',
  device_settings: 'settings.title',
  device_info: 'device_info.title',
  temperature_graph: 'temperature.title',
  connectivity: 'connectivity.title',
};

/** Section summary shown in the header while collapsed. */
interface SectionSummary {
  text: string;
  entityId?: string;
}

/** Interface for device info connectivity items. */
interface DeviceInfoItem {
  entityId: string | null | undefined;
  translationKey?: string;
  icon?: string;
  labelKey?: string;
  isBinary?: boolean;
}

/**
 * Custom Lovelace card for Rémi UrbanHello devices
 */
@customElement('remi-card')
export class RemiCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: RemiCardConfig;
  @state() private _entities: DiscoveredEntities = {};
  @state() private _alarms: string[] = [];
  @state() private _alarmsExpanded = false;
  @state() private _addAlarmDialog = false;
  @state() private _deleteAlarmId: string | null = null;
  @state() private _deleteAlarmName = '';

  /** User toggles on the collapsible section headers: `true` = expanded. */
  @state() private _sectionOverrides = new Map<string, boolean>();

  /** Last service-call error shown to the user (null when none). */
  @state() private _serviceError: string | null = null;

  private _unsubscribe?: () => void;

  /** Entity states pushed by the `states` context; falls back to `hass.states`. */
  @state() private _states?: HomeAssistant['states'];

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

    this._refreshEntities();
  }

  /**
   * Get the card size for layout purposes
   * @returns Card height in grid rows
   */
  public getCardSize(): number {
    // Estimate grid rows: header (2) + one row per active section, min 5, max 12.
    const sectionCount = this._config ? this._sections.length : 0;
    return Math.min(12, Math.max(5, 2 + sectionCount));
  }

  public override connectedCallback(): void {
    super.connectedCallback();
    this._requestStatesContext();
  }

  public override disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    super.disconnectedCallback();
  }

  /**
   * Ask for the `states` context so Home Assistant pushes state changes
   * without us re-rendering on every unrelated change of the `hass` object.
   * If no provider answers (older frontend), we keep using `hass.states`.
   */
  private _requestStatesContext(): void {
    const event = new CustomEvent('context-request', {
      bubbles: true,
      composed: true,
    }) as CustomEvent & {
      context?: unknown;
      subscribe?: boolean;
      callback?: (
        states: HomeAssistant['states'],
        unsubscribe: () => void,
      ) => void;
    };
    event.context = 'states';
    event.subscribe = true;
    event.callback = (states, unsubscribe) => {
      this._unsubscribe = unsubscribe;
      this._states = states;
    };
    this.dispatchEvent(event);
  }

  /**
   * Determine if the card should update based on changed properties
   * Optimizes rendering by only updating when relevant entities change
   * @param changedProps - Map of changed properties
   * @returns True if the card should re-render
   */
  protected override shouldUpdate(changedProps: PropertyValues): boolean {
    if (changedProps.has('_config') || changedProps.has('_sectionOverrides')) {
      return true;
    }
    if (!this.hass) {
      return false;
    }
    // No context provider answered: fall back to the normal hass-driven updates.
    if (!this._states) {
      return changedProps.has('hass') || changedProps.has('_states');
    }
    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
    // Check if any of our watched entities changed via the pushed states context.
    const watchedEntities = Object.values(this._entities).filter(
      (e): e is string => e !== null,
    );
    for (const alarmId of this._alarms) {
      const switchId = alarmSwitchEntityId(alarmId);
      watchedEntities.push(switchId);
    }
    return watchedEntities.some((entityId) => {
      const oldState = oldHass ? oldHass.states[entityId] : undefined;
      return oldState !== this._states?.[entityId];
    });
  }

  /**
   * Lifecycle method called after the element updates
   * Updates entity references when config or hass changes
   * @param changedProps - Map of changed properties
   */
  protected override updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (changedProps.has('hass') || changedProps.has('_config')) {
      this._refreshEntities();
    }
    if (changedProps.has('hass')) {
      const newHass = changedProps.get('hass') as HomeAssistant | undefined;
      if (newHass && newHass.locale !== this.hass.locale) {
        // Language changed: refresh localized strings.
        this.requestUpdate();
      }
    }
  }

  /**
   * Update entity references based on config and hass state.
   * Uses translation-key-based discovery (stable across renames) with
   * entity-id suffix fallback, then alarm entities by prefix.
   */
  private _refreshEntities(): void {
    if (!this.hass || !this._config) return;

    const base = configBase(this._config);
    this._entities = discoverEntities(this.hass, this._config);
    this._alarms = discoverAlarms(this.hass, base);
  }

  /** Sections to render, from config or defaults. */
  private get _sections(): SectionId[] {
    const configured = this._config.sections;
    if (configured && configured.length) {
      return configured.filter((s) => SECTION_IDS.includes(s));
    }
    return [...SECTION_IDS];
  }

  /** Sections that start expanded; the others start collapsed. */
  private get _expandedDefaults(): SectionId[] {
    const configured = this._config.expanded_sections;
    if (configured && configured.length) {
      return configured.filter((s) => SECTION_IDS.includes(s));
    }
    return [...DEFAULT_EXPANDED_SECTIONS];
  }

  /** A section is expanded unless the user toggled it or the config collapsed it. */
  private _isExpanded(section: SectionId): boolean {
    return this._sectionOverrides.get(section) ?? this._expandedDefaults.includes(section);
  }

  private _toggleSection(section: SectionId): void {
    const next = new Map(this._sectionOverrides);
    next.set(section, !this._isExpanded(section));
    this._sectionOverrides = next;
  }

  /** Cache the user's language to avoid repeated lookups. */
  private _lang: string | null = null;

  private _getLang(): string {
    if (!this._lang) {
      this._lang = getLanguage(this.hass);
    }
    return this._lang;
  }

  /** A key value kept visible in the header of a collapsed section. */
  private _sectionSummary(section: SectionId): SectionSummary | null {
    const lang = this._getLang();

    switch (section) {
      case 'light_controls': {
        const lightState = this._getLightState();
        if (!lightState) return null;
        const isOnLight = lightState.state === 'on';
        const brightness = lightState.attributes.brightness;
        if (isOnLight && brightness !== undefined) {
          return { text: `${Math.round((brightness / 255) * 100)}%` };
        }
        return { text: localize(isOnLight ? 'common.on' : 'common.off', lang) };
      }
      case 'temperature_graph': {
        const tempState = this._getTemperatureState();
        if (!isAvailable(tempState)) return null;
        return {
          text: `${formatNumber(stateNumber(tempState), 1, lang)}°C`,
          entityId: this._entities.temperature,
        };
      }
      case 'connectivity': {
        const connectivityState = this._getConnectivityState();
        if (!connectivityState) return null;
        const isConnected = connectivityState.state === 'on';
        return {
          text: localize(`connectivity.${isConnected ? 'connected' : 'disconnected'}`, lang),
          entityId: this._entities.connectivity,
        };
      }
      case 'alarms': {
        if (this._alarms.length === 0) return null;
        const enabled = this._alarms.filter((id) => {
          const switchId = alarmSwitchEntityId(id);
          const s = this._getState(switchId);
          return s?.state === 'on';
        }).length;
        return { text: `${enabled}/${this._alarms.length}` };
      }
      case 'face_selector': {
        const faceState = this._getFaceState();
        if (!faceState) return null;
        return { text: localizeFace(faceState, lang) };
      }
      case 'device_settings':
      case 'device_info':
        return null;
      default:
        return null;
    }
  }

  /**
   * Render a collapsible section.
   * @param section - The section id
   * @param body - The section body template
   */
  private _renderSection(
    section: SectionId,
    body: TemplateResult | typeof nothing,
  ): TemplateResult | typeof nothing {
    if (body === nothing) {
      return nothing;
    }
    const expanded = this._isExpanded(section);
    const summary = expanded ? null : this._sectionSummary(section);
    return html`
      <div class="section collapsible ${expanded ? 'expanded' : 'collapsed'}">
        <div class="section-header">
          <button
            class="section-toggle"
            aria-expanded=${String(expanded)}
            @click=${() => this._toggleSection(section)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._toggleSection(section);
              }
            }}
          >
            <ha-icon
              class="chevron"
              icon=${expanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}
            ></ha-icon>
            <span class="section-title">${t(SECTION_TITLE_KEYS[section], this.hass)}</span>
          </button>
          ${summary
            ? html`<span
                class="section-summary ${summary.entityId ? 'clickable' : ''}"
                role=${summary.entityId ? 'button' : nothing}
                tabindex=${summary.entityId ? '0' : nothing}
                @click=${summary.entityId
                  ? () => this._handleMoreInfo(summary.entityId!)
                  : nothing}
                @keydown=${summary.entityId
                  ? (e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this._handleMoreInfo(summary.entityId!);
                      }
                    }
                  : nothing}
              >${summary.text}</span>`
            : nothing}
        </div>
        ${expanded ? body : nothing}
      </div>
    `;
  }

  /**
   * Render the section body for a given section id.
   */
  private _renderSectionBody(section: SectionId): TemplateResult | typeof nothing {
    switch (section) {
      case 'face_selector':
        return this._config.show_face_selector ? this._renderFaceSelector() : nothing;
      case 'light_controls':
        return this._config.show_controls ? this._renderLightControls() : nothing;
      case 'alarms':
        return this._config.show_alarm_clocks ? this._renderAlarmClocks() : nothing;
      case 'device_settings':
        return this._config.show_controls ? this._renderDeviceSettings() : nothing;
      case 'device_info':
        return this._renderDeviceInfo();
      case 'temperature_graph':
        return this._config.show_temperature_graph ? this._renderTemperatureGraph() : nothing;
      case 'connectivity':
        return this._config.show_connectivity ? this._renderConnectivity() : nothing;
      default:
        return nothing;
    }
  }

  /**
   * Get the state object for an entity
   * @param entityId - The entity ID to retrieve
   * @returns The entity state object or undefined if not found
   */
  private _getState(entityId: string | null | undefined): HassEntity | undefined {
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
    const faceSelectEntity = this._getState(this._entities.face) as SelectEntity | undefined;
    if (!faceSelectEntity || faceSelectEntity.state === 'unavailable') return null;
    return faceSelectEntity.state;
  }

  /**
   * Get the night light state
   * @returns The light entity state object or undefined if not found
   */
  private _getLightState(): LightEntity | undefined {
    return this._getState(this._entities.night_light) as LightEntity | undefined;
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
    return this._getState(this._entities.face) as SelectEntity | undefined;
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
    return this._getState(this._entities.firmware_version) as SensorEntity | undefined;
  }

  /**
   * Get the clock format select state
   * @returns The select entity state object or undefined if not found
   */
  private _getClockFormatState(): SelectEntity | undefined {
    return this._getState(this._entities.clock_format) as SelectEntity | undefined;
  }

  /**
   * Get the music mode select state
   * @returns The select entity state object or undefined if not found
   */
  private _getMusicModeState(): SelectEntity | undefined {
    return this._getState(this._entities.music_mode) as SelectEntity | undefined;
  }

  /**
   * Get the noise threshold number state
   * @returns The number entity state object or undefined if not found
   */
  private _getNoiseThresholdState(): SensorEntity | undefined {
    return this._getState(this._entities.noise_threshold) as SensorEntity | undefined;
  }

  /**
   * Get the night face level number state
   * @returns The number entity state object or undefined if not found
   */
  private _getNightFaceLevelState(): SensorEntity | undefined {
    return this._getState(this._entities.night_face_level) as SensorEntity | undefined;
  }

  /**
   * Change the selected option of a select entity
   * @param entityId - The select entity ID
   * @param option - The option to select
   */
  private _handleSelectOption(entityId: string | null | undefined, option: string): void {
    if (!entityId) return;
    this._callService('select', 'select_option', {
      entity_id: entityId,
      option,
    });
  }

  /**
   * Control the night light brightness
   * Turns the light on/off or adjusts brightness
   * @param brightness - Brightness percentage (0-100), 0 turns off the light
   */
  private _handleLightControl(brightness: number): void {
    if (!this._entities.night_light) return;

    if (brightness === 0) {
      this._callService('light', 'turn_off', {
        entity_id: this._entities.night_light,
      });
    } else {
      this._callService('light', 'turn_on', {
        entity_id: this._entities.night_light,
        brightness_pct: brightness,
      });
    }
  }

  /**
   * Call a Home Assistant service with error handling.
   * Wraps `hass.callService` in a try/catch and surfaces errors to the user
   * via a temporary in-card error banner.
   * @param domain - Service domain (e.g. 'light', 'select')
   * @param service - Service name (e.g. 'turn_on', 'select_option')
   * @param serviceData - Service call data
   * @param target - Optional service target (e.g. { device_id })
   */
  private _callService(
    domain: string,
    service: string,
    serviceData: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): void {
    if (!this.hass) {
      this._showError('Home Assistant n\'est pas disponible.');
      return;
    }
    try {
      this.hass.callService(domain, service, serviceData, target);
    } catch (err) {
      this._showError(
        err instanceof Error ? err.message : 'Erreur lors de l\'appel de service.',
      );
    }
  }

  /**
   * Display a temporary error message to the user.
   * The banner auto-hides after 5 seconds.
   * @param message - Error message to show
   */
  private _showError(message: string): void {
    this._serviceError = message;
    window.setTimeout(() => {
      this._serviceError = null;
    }, 5000);
  }

  /**
   * Change the displayed face on the Rémi device
   * @param face - The face state to select (e.g., 'sleepyFace', 'awakeFace')
   */
  private _handleFaceSelect(face: string): void {
    if (!this._entities.face) return;

    // HA select entity expects snake_case options, API uses camelCase
    const option = FACE_API_TO_HA[face] ?? face;

    this._callService('select', 'select_option', {
      entity_id: this._entities.face,
      option,
    });
  }

  /**
   * Handle brightness slider release
   * Calls the light service when user finishes dragging
   * @param e - The change event containing the final brightness value
   */
  private _handleSliderRelease(e: Event): void {
    // Call service when slider is released
    const target = e.target as HTMLInputElement;
    const brightness = parseInt(target.value, 10);

    // Ignore invalid values (NaN, out of range)
    if (!Number.isFinite(brightness) || brightness < 0 || brightness > 100) {
      return;
    }

    this._handleLightControl(brightness);
  }

  /**
   * Open the more-info dialog for an entity
   * @param entityId - The entity ID to show details for
   */
  private _handleMoreInfo(entityId: string | null | undefined): void {
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
    const lang = getLanguage(this.hass);

    // Convert HA snake_case face to API camelCase for localization only.
    // getFaceIcon() expects snake_case keys (see face-images.ts FACE_ICONS).
    const faceState = faceStateHA ? (FACE_HA_TO_API[faceStateHA] ?? faceStateHA) : null;

    const deviceName = this._config.device_name || this._config.device_id;
    const displayTitle = this._config.title ?? `${localizeCommon('remi', lang)} ${deviceName}`;
    const faceImage = faceStateHA ? getFaceIcon(faceStateHA) : getFaceIcon('blankFace');
    const faceName = faceState ? localizeFace(faceState, lang) : localizeCommon('unknown', lang);

    const parts: string[] = [];
    if (isAvailable(tempState)) {
      parts.push(`${formatNumber(stateNumber(tempState), 1, lang)}°C`);
    }
    if (isAvailable(luminosityState)) {
      parts.push(`${formatNumber(stateNumber(luminosityState), 0, lang)} lx`);
    }
    parts.push(faceName);

    if (lightState && isOn(lightState)) {
      const brightness = lightState.attributes.brightness;
      if (brightness !== undefined) {
        const percent = Math.round((brightness / 255) * 100);
        parts.push(`${percent}%`);
      }
    } else {
      parts.push(localizeCommon('off', lang));
    }
    const statusText = parts.join(' • ');

    const isLightOn = lightState?.state === 'on';

    return html`
      <div class="header ${isLightOn ? 'light-on' : ''}">
        <div class="face-container">
          <img src="${faceImage}" alt="${faceName}" class="face-icon" />
        </div>
        <div class="info">
          <div class="title">${displayTitle}</div>
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
    const lang = getLanguage(this.hass);
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
    const lang = getLanguage(this.hass);

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
    const lang = getLanguage(this.hass);

    if (!clockFormatState && !musicModeState) return html``;

    return html`
      <div class="section">
        <div class="section-title">${localize('settings.title', lang)}</div>
        ${this._renderSelectControl(
          'clock_format.title',
          clockFormatState,
          this._entities.clock_format,
          [
            { value: '12h', labelKey: 'clock_format.12h' },
            { value: '24h', labelKey: 'clock_format.24h' },
          ],
        )}
        ${this._renderSelectControl(
          'music_mode.title',
          musicModeState,
          this._entities.music_mode,
          [
            { value: 'off', labelKey: 'music_mode.off' },
            { value: 'music', labelKey: 'music_mode.music' },
            { value: 'white_noise', labelKey: 'music_mode.white_noise' },
          ],
        )}
      </div>
    `;
  }

  /**
   * Render a select control (label + <select> with options).
   * Factorise le template commun entre clock_format et music_mode.
   */
  private _renderSelectControl(
    labelKey: string,
    entity: SelectEntity | undefined,
    entityId: string | undefined,
    options: Array<{ value: string; labelKey: string }>,
  ): TemplateResult | typeof nothing {
    if (!entity) return html``;
    const lang = getLanguage(this.hass);
    return html`
      <div class="select-control">
        <label>${localize(labelKey, lang)}</label>
        <select
          .value=${entity.state || ''}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            this._handleSelectOption(entityId, target.value);
          }}
        >
          ${options.map(
            (opt) => html`
              <option value=${opt.value}>${localize(opt.labelKey, lang)}</option>
            `,
          )}
        </select>
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

    const lang = getLanguage(this.hass);
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
   * Render a single connectivity item.
   * @param entityId - The entity ID
   * @param translationKey - The translation key for the value
   * @param icon - The HA icon to display
   * @param lang - The language code
   * @returns Template result for the connectivity item
   */
  private _renderConnectivityItem(
    entityId: string | null | undefined,
    translationKey: string,
    icon: string,
    lang: string,
  ): TemplateResult | typeof nothing {
    const state = this._getState(entityId);
    if (!state || state.state === 'unavailable') return nothing;

    return html`
      <div class="connectivity-item">
        <ha-icon icon=${icon}></ha-icon>
        <span>${localize(translationKey, lang)}: ${state.state}</span>
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
      const lang = getLanguage(this.hass);
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
    const lang = getLanguage(this.hass);

    // Build connectivity items from config
    const connectivityItems = [
      {
        entityId: this._entities.rssi,
        translationKey: 'rssi',
        icon: 'mdi:wifi-strength-3',
        lang,
      },
      {
        entityId: this._entities.firmware_version,
        translationKey: 'firmware.version',
        icon: 'mdi:chip',
        lang,
      },
    ];

    // Filter out items where state is unavailable
    const activeItems = connectivityItems.filter(
      (item) => item.entityId && this._getState(item.entityId)?.state !== 'unavailable',
    );

    return html`
      <div class="section">
        <div class="connectivity">
          <div class="connectivity-item ${isConnected ? 'connected' : 'disconnected'}">
            <ha-icon icon="mdi:wifi"></ha-icon>
            <span>${localize(
              `connectivity.${isConnected ? 'connected' : 'disconnected'}`,
              lang,
            )}</span>
          </div>
          ${activeItems.map(
            (item) => this._renderConnectivityItem(
              item.entityId!,
              item.translationKey,
              item.icon,
              item.lang,
            ),
          )}
        </div>
      </div>
    `;
  }

  /**
 * Render config for a device info connectivity item.
 */
/**
 * Render a single device info connectivity item.
   * @param item - The item configuration
   * @param lang - The language code
   * @returns Template result for the connectivity item
   */
  private _renderDeviceInfoItem(
    item: DeviceInfoItem,
    lang: string,
  ): TemplateResult | typeof nothing {
    const state = this._getState(item.entityId);
    if (!state || state.state === 'unavailable') return nothing;

    if (item.isBinary) {
      return html`
        <div class="connectivity-item ${isOn(state) ? 'connected' : 'disconnected'}">
          <ha-icon icon="${isOn(state) ? item.icon : 'mdi:lan-disconnect'}"></ha-icon>
          <span>${localizeCommon(isOn(state) ? 'on' : 'off', lang)}</span>
        </div>
      `;
    }

    const value = formatNumber(stateNumber(state), item.labelKey ? 0 : undefined, lang);
    return html`
      <div class="connectivity-item">
        <ha-icon icon=${item.icon}></ha-icon>
        <span>${value}</span>
      </div>
    `;
  }

  /**
   * Render the device info section
   * Shows IP address, alive status, firmware update, volume, noise threshold,
   * and night face level when available.
   * @returns Template result for the device info section
   */
  private _renderDeviceInfo(): TemplateResult {
    const lang = getLanguage(this.hass);

    // Define all possible device info items
    const deviceInfoItems: DeviceInfoItem[] = [
      {
        entityId: this._entities.ip_address,
        translationKey: undefined,
        icon: 'mdi:ip-network',
        labelKey: undefined,
        isBinary: false,
      },
      {
        entityId: this._entities.alive,
        translationKey: undefined,
        icon: undefined,
        labelKey: undefined,
        isBinary: true,
      },
      {
        entityId: this._entities.firmware_update,
        translationKey: undefined,
        icon: undefined,
        labelKey: undefined,
        isBinary: true,
      },
      {
        entityId: this._entities.volume_control,
        translationKey: undefined,
        icon: 'mdi:volume-high',
        labelKey: undefined,
        isBinary: false,
      },
      {
        entityId: this._entities.noise_threshold,
        translationKey: undefined,
        icon: 'mdi:bell',
        labelKey: undefined,
        isBinary: false,
      },
      {
        entityId: this._entities.night_face_level,
        translationKey: undefined,
        icon: 'mdi:brightness-6',
        labelKey: undefined,
        isBinary: false,
      },
    ];

    // Filter items with available states
    const activeItems = deviceInfoItems.filter(
      (item) => item.entityId && this._getState(item.entityId)?.state !== 'unavailable',
    );

    if (activeItems.length === 0) {
      return html``;
    }

    return html`
      <div class="section">
        <div class="section-title">${localize('device_info.title', lang)}</div>
        <div class="connectivity">
          ${activeItems.map(
            (item) => this._renderDeviceInfoItem(item, lang),
          )}
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
    // Default to turning on when the current state is not yet known.
    const isCurrentlyOn = switchState?.state === 'on';
    const service = isCurrentlyOn ? 'turn_off' : 'turn_on';
    this._callService('switch', service, {
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

    this._callService('urbanhello_remi', 'create_alarm', {
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
    this._callService('urbanhello_remi', 'trigger_alarm', {
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

    this._callService('urbanhello_remi', 'delete_alarm', {
      alarm_id: this._deleteAlarmId,
    }, {
      device_id: this._config.device_id,
    });

    this._deleteAlarmId = null;
    this._deleteAlarmName = '';
  }

  /**
   * Update an existing alarm
   * Calls the urbanhello_remi.update_alarm service
   * @param alarmId - The alarm ID to update
   * @param updates - Fields to update (time, enabled, name, days, face, brightness)
   */
  private _handleUpdateAlarm(alarmId: string, updates: Record<string, unknown>): void {
    if (!alarmId) return;

    this._callService('urbanhello_remi', 'update_alarm', {
      alarm_id: alarmId,
      ...updates,
    }, {
      device_id: this._config.device_id,
    });
  }

  /**
   * Snooze a currently active alarm
   * Calls the urbanhello_remi.snooze_alarm service
   * @param alarmId - The alarm ID to snooze
   * @param duration - Snooze duration in minutes (1-60)
   */
  private _handleSnoozeAlarm(alarmId: string, duration = 9): void {
    if (!alarmId) return;

    this._callService('urbanhello_remi', 'snooze_alarm', {
      alarm_id: alarmId,
      duration,
    }, {
      device_id: this._config.device_id,
    });
  }

  /**
   * Render the alarm clocks section
   * Shows all configured alarm clocks for this device
   * @returns Template result for the alarm clocks section
   */
  private _renderAlarmClocks(): TemplateResult {
    if (!this._alarms || this._alarms.length === 0) {
      return html``;
    }

    const lang = getLanguage(this.hass);
    const alarmsCount = this._alarms.length;

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
          ${this._alarms.map((alarmId) => {
            const alarmState = this._getState(alarmId) as TimeEntity | undefined;
            if (!alarmState || alarmState.state === 'unavailable') {
              return html``;
            }

            const switchEntityId = alarmSwitchEntityId(alarmId);
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
                    <ha-switch
                      .checked=${isAlarmEnabled}
                      @click=${(e: Event) => this._handleAlarmToggle(switchEntityId, e)}
                    ></ha-switch>
                    <ha-icon-button
                      icon="mdi:alarm"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this._handleTriggerAlarm(alarmId);
                      }}
                      title="${localize('alarm.trigger_alarm', lang)}"
                    ></ha-icon-button>
                    ${isAlarmEnabled
                      ? html`<ha-icon-button
                          icon="mdi:pause"
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this._handleSnoozeAlarm(alarmId);
                          }}
                          title="${localize('alarm.snooze_alarm', lang)}"
                        ></ha-icon-button>`
                      : nothing}
                    <ha-icon-button
                      icon="mdi:pencil"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this._handleUpdateAlarm(alarmId, { enabled: !isAlarmEnabled });
                      }}
                      title="${localize('alarm.update_alarm', lang)}"
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
                          <span>${localizeFace(FACE_API_TO_HA[face] ?? face, lang)}</span>
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
   * Render a modal dialog (backdrop + dialog + content + actions).
   * Factorise la structure commune des modals (ajout / suppression alarme).
   */
  private _renderModal(
    backdropClick: () => void,
    title: string,
    content: TemplateResult,
    actions: TemplateResult,
  ): TemplateResult {
    return html`
      <div class="modal-backdrop" @click=${backdropClick}></div>
      <dialog class="modal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-content">
          <h3>${title}</h3>
          ${content}
          ${actions}
        </div>
      </dialog>
    `;
  }

  /**
   * Render the add alarm dialog
   * Opens a form to create a new alarm via the urbanhello_remi.create_alarm service
   * @returns Template result for the dialog, or empty if closed
   */
  private _renderAddAlarmDialog(): TemplateResult {
    if (!this._addAlarmDialog) return html``;
    const lang = getLanguage(this.hass);

    return this._renderModal(
      this._handleAddAlarmClose,
      localize('alarm.add_alarm', lang),
      html`
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
      `,
      html`
        <div class="form-actions">
          <button type="button" @click=${this._handleAddAlarmClose}>
            ${localize('alarm.confirm_delete_no', lang)}
          </button>
          <button type="submit">${localize('alarm.add_alarm', lang)}</button>
        </div>
      `,
    );
  }

  /**
   * Render the delete confirmation dialog
   * Asks for confirmation before calling urbanhello_remi.delete_alarm
   * @returns Template result for the dialog, or empty if closed
   */
  private _renderDeleteConfirmationDialog(): TemplateResult {
    if (!this._deleteAlarmId) return html``;
    const lang = getLanguage(this.hass);

    return this._renderModal(
      this._handleDeleteAlarmCancel,
      localize('alarm.delete_alarm', lang),
      html`
        <p>
          ${localize('alarm.confirm_delete', lang)} "${this._deleteAlarmName}"?
        </p>
      `,
      html`
        <div class="form-actions">
          <button type="button" @click=${this._handleDeleteAlarmCancel}>
            ${localize('alarm.confirm_delete_no', lang)}
          </button>
          <button type="button" @click=${this._handleDeleteAlarmConfirm} class="delete">
            ${localize('alarm.confirm_delete_yes', lang)}
          </button>
        </div>
      `,
    );
  }

  /**
   * Render the complete card
   * Combines all sections based on configuration
   * @returns Template result for the entire card
   */
  protected override render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    const hasAnyEntity = Object.values(this._entities).some(
      (v): v is string => v !== undefined,
    );
    const hasAlarms = this._alarms.length > 0;
    if (!hasAnyEntity && !hasAlarms) {
      const lang = getLanguage(this.hass);
      return html`
        <ha-card>
          <div class="error">
            <ha-icon icon="mdi:alert-outline"></ha-icon>
            <div>${localize('error.no_entities', lang)}</div>
          </div>
        </ha-card>
      `;
    }

    return html`
      <ha-card>
        ${this._serviceError
          ? html`
              <div class="service-error">
                <ha-icon icon="mdi:alert-circle"></ha-icon>
                <span>${this._serviceError}</span>
              </div>
            `
          : nothing}
        ${this._renderHeader()}
        ${this._sections.map((section) =>
          this._renderSection(section, this._renderSectionBody(section)),
        )}
        ${this._renderAddAlarmDialog()}
        ${this._renderDeleteConfirmationDialog()}
      </ha-card>
    `;
  }

  static override get styles() {
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

      /* Collapsible sections */
      .section.collapsible {
        margin-bottom: 12px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 14px;
        background: var(--secondary-background-color);
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .section-header:hover {
        background: var(--divider-color);
      }

      .section-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        color: var(--primary-text-color);
        cursor: pointer;
      }

      .section-toggle ha-icon {
        --mdc-icon-size: 20px;
      }

      .section-title {
        font-weight: bold;
        font-size: 0.95em;
        margin: 0;
      }

      .section-summary {
        font-size: 0.85em;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }

      .section-summary.clickable {
        cursor: pointer;
      }

      .section-summary.clickable:hover {
        text-decoration: underline;
      }

      .chevron {
        transition: transform 0.2s ease;
      }

      .section.collapsed .chevron {
        transform: rotate(-90deg);
      }

      .section-title {
        margin-bottom: 0;
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

      .service-error {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        margin-bottom: 12px;
        background: rgba(var(--rgb-error), 0.1);
        border: 1px solid var(--error-color, #f44336);
        border-radius: 8px;
        color: var(--error-color, #f44336);
        font-size: 0.9em;
      }

      .service-error ha-icon {
        --mdc-icon-size: 20px;
      }

      .error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 24px;
        text-align: center;
        color: var(--secondary-text-color);
      }

      .error ha-icon {
        --mdc-icon-size: 48px;
        color: var(--error-color, #f44336);
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
  documentationURL: 'https://github.com/homeassistant-fr-ecosystem/remi-card',
  getEntitySuggestion: (hass: HomeAssistant, entityId: string) => {
    if (!hass?.entities?.[entityId]) {
      return null;
    }
    const platform = hass.entities[entityId].platform;
    if (platform !== 'urbanhello_remi') {
      return null;
    }
    // Suggest the card for the main device entities.
    const prefixes = ['select.', 'light.', 'sensor.', 'binary_sensor.', 'time.'];
    if (!prefixes.some((p) => entityId.startsWith(p))) {
      return null;
    }
    return { config: { type: 'custom:remi-card', device_id: entityId.split('.')[1] } };
  },
});

// Version banner: makes it obvious in the browser console which build is loaded
// when a user reports an issue. The version is read from package.json at build
// time via scripts/generate-version.js (see vigieau-card for the same pattern).
// eslint-disable-next-line no-console
console.info(
  `%c REMI-CARD %c v${VERSION} `,
  'color:#fff;background:#ff6d00;font-weight:700;border-radius:4px 0 0 4px;',
  'color:#ff6d00;background:transparent;font-weight:700;border-radius:0 4px 4px 0;',
);
