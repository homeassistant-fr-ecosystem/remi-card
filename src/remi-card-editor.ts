import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant } from 'custom-card-helpers';
import { localize } from './localize';
import { getLanguage, t } from './i18n-helper';
import { normalizeDeviceId } from './entities';
import { RemiCardConfig, type SectionId } from './types';
import { SECTION_IDS } from './remi-card';

const SECTION_LABEL_KEYS: Record<SectionId, string> = {
  face_selector: 'editor.section.face_selector',
  light_controls: 'editor.section.light_controls',
  alarms: 'editor.section.alarms',
  device_settings: 'editor.section.device_settings',
  device_info: 'editor.section.device_info',
  temperature_graph: 'editor.section.temperature_graph',
  connectivity: 'editor.section.connectivity',
};

interface AnchorOption {
  id: string;
  name: string;
}

@customElement('remi-card-editor')
export class RemiCardEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: RemiCardConfig;

  private readonly _datalistId = `remi-entities-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  public setConfig(config: RemiCardConfig): void {
    this._config = config;
  }

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
        [target.configValue]: target.checked !== undefined
          ? target.checked
          : value,
      };

      const event = new CustomEvent('config-changed', {
        detail: { config: newConfig },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
    }
  }

  /** Anchor candidates: every urbanhello_remi entity the frontend knows about. */
  private get _anchorOptions(): AnchorOption[] {
    const hass = this.hass;
    const entities = hass?.entities ?? {};
    if (!entities) {
      return [];
    }
    return Object.keys(entities)
      .filter(
        (id) =>
          entities[id]?.platform === 'urbanhello_remi' &&
          hass?.states[id],
      )
      .map((id) => ({ id, name: this._nameFor(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private _nameFor(id: string): string {
    const state = this.hass?.states[id];
    if (state && this.hass && typeof this.hass.formatEntityName === 'function') {
      const formatted = this.hass.formatEntityName(state);
      if (formatted) {
        return formatted;
      }
    }
    return state?.attributes.friendly_name ?? id;
  }

  private _update(patch: Partial<RemiCardConfig>): void {
    if (!this._config) {
      return;
    }
    const config: RemiCardConfig = { ...this._config, ...patch };
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private get _selectedSections(): SectionId[] {
    const configured = this._config.sections;
    return configured && configured.length
      ? configured
      : [...SECTION_IDS];
  }

  private _toggleSection(id: SectionId, checked: boolean): void {
    const current = this._selectedSections;
    const next = checked
      ? [...new Set([...current, id])]
      : current.filter((section) => section !== id);
    this._update({ sections: next });
  }

  private get _expandedSections(): SectionId[] {
    const configured = this._config.expanded_sections;
    return configured ? configured : [...SECTION_IDS];
  }

  private _toggleExpanded(id: SectionId, checked: boolean): void {
    const current = this._expandedSections;
    const next = checked
      ? [...new Set([...current, id])]
      : current.filter((section) => section !== id);
    this._update({ expanded_sections: next });
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const options = this._anchorOptions;
    const lang = getLanguage(this.hass);

    return html`
      <div class="card-config">
        <div class="field">
          <label class="title">${t('editor.anchor', this.hass)}</label>
          <input
            type="text"
            list=${this._datalistId}
            .value=${this._config.device_id ?? ''}
            placeholder="garance"
            @change=${(ev: Event) =>
              this._update({
                device_id: normalizeDeviceId((ev.target as HTMLInputElement).value) || undefined,
              })}
          />
          <datalist id=${this._datalistId}>
            ${options.map(
              (o) => html`<option value=${o.id}>${o.name}</option>`,
            )}
          </datalist>
          <span class="hint">${t('editor.anchor_hint', this.hass)}</span>
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
          <ha-textfield
            label="${localize('editor.device_prefix', lang)}"
            .value=${this._config.device_prefix || ''}
            .configValue=${'device_prefix'}
            @input=${this._valueChanged}
          ></ha-textfield>
        </div>

        <div class="option">
          <ha-textfield
            label="${localize('editor.title', lang)}"
            .value=${this._config.title || ''}
            .configValue=${'title'}
            @input=${this._valueChanged}
          ></ha-textfield>
        </div>

        <div class="field">
          <label class="title">${t('editor.sections', this.hass)}</label>
          ${SECTION_IDS.map(
            (id) => html`<div class="checkbox-row">
              <input
                id=${`section-${id}`}
                type="checkbox"
                .checked=${this._selectedSections.includes(id)}
                @change=${(ev: Event) =>
                  this._toggleSection(
                    id,
                    (ev.target as HTMLInputElement).checked,
                  )}
              />
              <label for=${`section-${id}`}>${t(SECTION_LABEL_KEYS[id], this.hass)}</label>
            </div>`,
          )}
        </div>

        <div class="field">
          <label class="title">${t('editor.expanded_sections', this.hass)}</label>
          ${SECTION_IDS.map(
            (id) => html`<div class="checkbox-row">
              <input
                id=${`expanded-${id}`}
                type="checkbox"
                .checked=${this._expandedSections.includes(id)}
                @change=${(ev: Event) =>
                  this._toggleExpanded(
                    id,
                    (ev.target as HTMLInputElement).checked,
                  )}
              />
              <label for=${`expanded-${id}`}>${t(SECTION_LABEL_KEYS[id], this.hass)}</label>
            </div>`,
          )}
          <span class="hint">${t('editor.expanded_sections_hint', this.hass)}</span>
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

  static override get styles() {
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

      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      label.title {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--secondary-text-color);
      }

      input[type='text'] {
        font: inherit;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.2));
        background: var(--card-background-color);
        color: var(--primary-text-color);
      }

      .switch-row,
      .checkbox-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
      }

      .checkbox-row input {
        accent-color: var(--primary-color);
        width: 18px;
        height: 18px;
      }

      .hint {
        font-size: 0.78rem;
        color: var(--secondary-text-color);
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
