/**
 * Configuration editor for the Rémi Card
 * Provides a UI to configure the card settings in the Lovelace editor
 */

import { LitElement, html, css, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant } from 'custom-card-helpers';
import { localize } from './localize';

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
 * Editor component for configuring Rémi Card settings
 */
@customElement('remi-card-editor')
export class RemiCardEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: RemiCardConfig;

  /**
   * Set the configuration for the card
   * @param config - The card configuration object
   */
  public setConfig(config: RemiCardConfig): void {
    this._config = config;
  }

  /**
   * Get the user's language from Home Assistant
   * @returns The language code (e.g., "en", "fr")
   */
  private _getLanguage(): string {
    return this.hass?.locale?.language || this.hass?.language || 'en';
  }

  /**
   * Handle value changes from form inputs
   * Dispatches a 'config-changed' event with the updated configuration
   * @param ev - The custom event containing the changed value
   */
  private _valueChanged(ev: CustomEvent): void {
    if (!this._config || !this.hass) {
      return;
    }

    const target = ev.target as HTMLInputElement & {
      configValue?: string;
      checked?: boolean;
    };
    const value = target.value;

    if (target.configValue) {
      const newConfig = {
        ...this._config,
        [target.configValue]: target.checked !== undefined ? target.checked : value,
      };

      const event = new CustomEvent('config-changed', {
        detail: { config: newConfig },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
    }
  }

  /**
   * Render the configuration editor UI
   * @returns Template result containing the editor form
   */
  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    const lang = this._getLanguage();

    return html`
      <div class="card-config">
        <div class="option">
          <ha-textfield
            label="${localize('editor.device_id', lang)}"
            .value=${this._config.device_id || ''}
            .configValue=${'device_id'}
            @input=${this._valueChanged}
          ></ha-textfield>
        </div>

        <div class="option">
          <ha-textfield
            label="${localize('editor.device_name', lang)}"
            .value=${this._config.device_name || ''}
            .configValue=${'device_name'}
            @input=${this._valueChanged}
          ></ha-textfield>
        </div>

        <div class="option">
          <ha-formfield label="${localize('editor.show_face_selector', lang)}">
            <ha-switch
              .checked=${this._config.show_face_selector !== false}
              .configValue=${'show_face_selector'}
              @change=${this._valueChanged}
            ></ha-switch>
          </ha-formfield>
        </div>

        <div class="option">
          <ha-formfield label="${localize('editor.show_controls', lang)}">
            <ha-switch
              .checked=${this._config.show_controls !== false}
              .configValue=${'show_controls'}
              @change=${this._valueChanged}
            ></ha-switch>
          </ha-formfield>
        </div>

        <div class="option">
          <ha-formfield label="${localize('editor.show_temperature_graph', lang)}">
            <ha-switch
              .checked=${this._config.show_temperature_graph !== false}
              .configValue=${'show_temperature_graph'}
              @change=${this._valueChanged}
            ></ha-switch>
          </ha-formfield>
        </div>

        <div class="option">
          <ha-formfield label="${localize('editor.show_connectivity', lang)}">
            <ha-switch
              .checked=${this._config.show_connectivity !== false}
              .configValue=${'show_connectivity'}
              @change=${this._valueChanged}
            ></ha-switch>
          </ha-formfield>
        </div>

        <div class="option">
          <ha-formfield label="${localize('editor.show_alarm_clocks', lang)}">
            <ha-switch
              .checked=${this._config.show_alarm_clocks !== false}
              .configValue=${'show_alarm_clocks'}
              @change=${this._valueChanged}
            ></ha-switch>
          </ha-formfield>
        </div>

        <div class="option">
          <ha-textfield
            label="${localize('editor.hours_to_show', lang)}"
            type="number"
            .value=${this._config.hours_to_show || 24}
            .configValue=${'hours_to_show'}
            @input=${this._valueChanged}
          ></ha-textfield>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      .card-config {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .option {
        display: flex;
        flex-direction: column;
      }

      ha-textfield {
        width: 100%;
      }

      ha-formfield {
        display: flex;
        align-items: center;
        padding: 8px 0;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'remi-card-editor': RemiCardEditor;
  }
}
