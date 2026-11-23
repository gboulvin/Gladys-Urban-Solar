# Urban Solar for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that
tracks and controls the **Urban Solar virtual battery**: the kWh stock, the
energy stored and withdrawn every day, the money saved, scene triggers and
actions, and dashboard widgets. Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
on [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## How it works

Urban Solar credits the solar energy injected into the grid to a virtual
battery and takes the energy drawn from the grid out of it; once the stock is
empty, the grid price applies. Urban Solar has no public API, so the
integration rebuilds that ledger from meter readings:

| Source    | Transport | Data                                                      | Refresh                 |
| --------- | --------- | --------------------------------------------------------- | ----------------------- |
| Shelly EM | `local`   | cumulative import / export counters + instant power (LAN) | every `poll_frequency`  |
| Linky     | `cloud`   | daily import / export readings, via the Conso API         | every 3 h, day D+1 data |

The manifest declares both transports: with both sources configured, the
standard "Prefer the local connection" toggle picks the preferred one, the
other one is a fallback reported as a degraded transport badge. A day the
local meter accounted is never accounted again from the cloud readings. The
ledger is saved in `/data/virtual-battery.json`.

## Capabilities

| Surface           | Keys                                                                 | Code                               |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Devices           | virtual battery (`battery-storage`), grid connection (`grid-sensor`) | [`src/devices/`](src/devices)      |
| Device control    | accounting switch (pause / resume the ledger)                        | [`index.js`](index.js)             |
| Config actions    | `test_connection`, `calibrate_stock`                                 | [`src/actions.js`](src/actions.js) |
| Scene triggers    | `battery_state_changed`, `low_stock`, `daily_summary`                | [`src/engine.js`](src/engine.js)   |
| Scene actions     | `get_status`, `refresh_data`, `calibrate_stock`, `set_accounting`    | [`src/scenes.js`](src/scenes.js)   |
| Dashboard widgets | `virtual_battery`, `energy_balance`                                  | [`src/widgets.js`](src/widgets.js) |
| Languages         | English, French, German, Spanish (manifest, messages, widgets, docs) | [`src/i18n.js`](src/i18n.js)       |

Requires **Gladys ≥ 5.1.0** (scene and widget capability fields).

## Project structure

```
index.js                          SDK wiring only (handlers, timer, lifecycle)
src/engine.js                     reads the sources, keeps the ledger, publishes states, fires triggers
src/battery.js                    the virtual battery model (pure)
src/sources/shelly.js             local source: Shelly Gen2+ RPC (EMData / EM1Data)
src/sources/conso.js              cloud source: Linky daily readings (Conso API)
src/devices/                      discovery payloads of the two devices
src/actions.js                    Configuration screen actions
src/scenes.js                     scene actions
src/widgets.js                    dashboard widgets
src/i18n.js                       user-facing messages, 4 languages
src/config.js                     defaults (mirror the manifest) + normalization
src/store.js                      ledger persistence under /data
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys
test/                             node --test, against the SDK's fake Gladys, no network
```

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="urban-solar" \
DATA_DIR=./data LOG_LEVEL=debug \
npm start
```

## Release

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then run **Actions → Release → Run workflow** (`patch`, `minor` or `major`).
The workflow bumps `package.json` and the manifest, rolls the changelog, tags,
builds the `linux/amd64` + `linux/arm64` image to
`ghcr.io/gboulvin/gladys-urban-solar` and publishes the GitHub Release.

For the store to list it, the repository must be public with the
`gladys-assistant-integration` topic, and the GHCR package must be public.

## Disclaimer

Not affiliated with Urban Solar Energy, Enedis, Shelly or the Conso API. The
figures are an estimate rebuilt from meter readings: the Urban Solar customer
area is authoritative (use the "Set the stock" action to realign).

## License

Apache-2.0
