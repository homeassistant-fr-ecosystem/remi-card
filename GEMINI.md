# Project Rules: Rémi Lovelace Card

## 1. Project Context
Custom Home Assistant Lovelace frontend card for the [urbanhello_remi_hass](../urbanhello_remi_hass/) integration — visual face display/selector, brightness, temperature, and connectivity status for Rémi UrbanHello devices.

## 2. Standards
@../.gemini/rules/shared_ts.md

## 3. Project-Specific Notes
- **Card type**: `custom:remi-card`, registered via `@customElement('remi-card')` in `src/remi-card.ts`; editor is `remi-card-editor` in `src/remi-card-editor.ts`.
- **Entity naming**: this card expects entity IDs following `urbanhello_remi_hass`'s conventions (e.g. `switch.{device_name}_*`, `time.{device_name}_*` for alarms) — keep the two projects' naming in sync if either changes.
- **Assets**: face images live in `src/face/` and are inlined as data URIs via rollup's `@rollup/plugin-url` (see `src/face-images.ts`).
- **i18n scope**: currently English + French only, in `src/translations/`.
