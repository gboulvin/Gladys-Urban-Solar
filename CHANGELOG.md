# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [3.1.0] - 2026-11-25

## [3.0.0] - 2026-11-25

### Added

- "Gladys devices" data source, the new default: use any device already in
  Gladys — the meter of the energy monitoring, a Shelly or a current clamp of
  another integration. A Gladys scene reads their cumulative import and export
  indexes and passes them to the new "Urban Solar: record a meter reading"
  scene action (indexes in kWh or Wh, optional live powers).
- "Data source" choice in the configuration: Gladys devices or a Shelly meter
  read directly.
- The Configuration screen reports a scene that has not sent a reading yet,
  or none for 2 hours.

### Removed

- The Linky cloud source (Conso API) and its fields (meter number, token):
  everything is now local. The stored token is ignored. The "Prefer the local
  connection" toggle goes with it.

## [2.0.0] - 2026-11-23

### Added

- An "Urban Solar — virtual battery" energy contract template: the prices are
  entered once, in the Gladys contract wizard (grid price, withdrawal fee,
  monthly subscriptions), and the contract in force at each date is used.
- Gladys prices the consumption of the meter linked to the contract through
  the integration: each half-hour, the energy the virtual battery covered at
  the withdrawal fee, the rest at the grid price. The current price follows
  the stock (withdrawal fee while the battery holds energy).
- The "Virtual battery" widget shows the tariff in force.

### Changed

- Gladys 5.2.0 or later is required (energy contracts).

### Removed

- The "Grid price" and "Withdrawal fee" configuration fields: the prices now
  come from the Urban Solar energy contract. Without one, the battery is still
  tracked but no saving is computed.

## [1.0.0] - 2026-11-23

### Added

- Urban Solar virtual battery ledger, rebuilt from meter readings: injected
  energy is stored, imported energy is withdrawn, the grid price applies once
  the stock is empty. Savings computed from the grid price and the withdrawal
  fee of the contract.
- Local source: Shelly Pro 3EM, 3EM Gen3, Pro EM and EM Gen3 energy meters,
  read over the LAN, with live charge and discharge powers.
- Cloud source: Linky daily readings through the Conso API.
- Both transports declared: the "Prefer the local connection" toggle picks
  the preferred source, the other one takes over as a degraded fallback,
  without ever counting a day twice.
- Devices: the virtual battery (stock, level, powers, totals, savings and an
  accounting switch) and the grid connection (powers, imported, injected and
  full-price energy).
- Scene triggers: battery state changed, low stock, daily summary.
- Scene actions: read the virtual battery, refresh it, set its stock, pause
  or resume the accounting.
- Dashboard widgets: "Virtual battery" (gauge, live values, history, refresh
  and set-the-stock buttons) and "Energy balance" (daily and total figures,
  coverage, pause / resume button).
- Configuration actions: test the data sources, set the stock from the Urban
  Solar customer area.
- English, French, German and Spanish everywhere: manifest, messages, widgets
  and user documentation.
- `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/gboulvin/Gladys-Urban-Solar/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/gboulvin/Gladys-Urban-Solar/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/gboulvin/Gladys-Urban-Solar/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/gboulvin/Gladys-Urban-Solar/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/gboulvin/Gladys-Urban-Solar/releases/tag/v1.0.0
