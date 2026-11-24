# Changelog

All notable changes to the Rémi Card are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1-b12] - 2026-11-24

### Changed
- Refactored duplicated brightness percentage calculation into `_brightnessToPercent()` helper.
- Replaced 7 duplicated `_get*State()` accessors with a single generic `_getTypedState<T>()` helper.

## [1.0.1-b11] - 2026-11-23

### Changed
- Initial public release of the Rémi Card for Home Assistant.
