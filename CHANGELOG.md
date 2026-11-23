# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/gboulvin/Gladys-Urban-Solar/commits/main
