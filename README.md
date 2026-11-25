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

| Source (`data_source`)   | Data                                                                                           | Refresh                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| Gladys devices (default) | cumulative import / export indexes of devices already in Gladys, sent by a scene               | at each run of the user's scene |
| Shelly meter             | cumulative import / export counters + instant power, read directly over the LAN (Shelly Gen2+) | every `poll_frequency`          |

An external integration cannot read the devices of other integrations (the
host API only serves its own devices), so the "Gladys devices" source is a
bridge: a Gladys scene reads the indexes of the chosen devices — the meter of
the energy monitoring, a Shelly or a current clamp of another integration —
with "Get the last value of a device", and passes them to the
`record_meter_reading` scene action (text fields, so the `{{...}}` variables
reach it). Both sources work on cumulative counters: the ledger accounts the
difference between two readings, so a duplicate reading counts nothing and a
missed one loses nothing. One source at a time, and switching starts over from
the next reading: no energy is counted twice. Everything stays local (manifest
`transports: ["local"]`): the Linky cloud source (Conso API) was removed in
version 3. The ledger is saved in `/data/virtual-battery.json`.

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

Requires **Gladys ≥ 5.2.0** (energy contract template).

## Tariffs: the Urban Solar energy contract

The prices are not in the integration's configuration. The manifest declares
an `energy_contracts` template, **Urban Solar — virtual battery**
(`urban-solar-virtual-battery`, `delegated` pricing): the user creates the
contract once in the Gladys wizard (grid price, withdrawal fee, monthly
subscriptions). The integration reads it with `getEnergyContracts()` (picking
the contract in force at each date) to compute the savings, and answers
`onEnergyPrice` / `onEnergyCurrent`: each half-hour of the linked meter is
priced with the share the virtual battery covered, recorded by the ledger
(per half-hour, from the readings).

## Project structure

```
index.js                          SDK wiring only (handlers, timer, lifecycle)
src/engine.js                     reads the sources, keeps the ledger, publishes states, fires triggers
src/battery.js                    the virtual battery model (pure)
src/sources/shelly.js             local source: Shelly Gen2+ RPC (EMData / EM1Data)
src/devices/                      discovery payloads of the two devices
src/actions.js                    Configuration screen actions
src/scenes.js                     scene actions
src/widgets.js                    dashboard widgets
src/tariffs.js                    prices read from the Urban Solar energy contract
src/pricing.js                    delegated pricing of that contract (onEnergyPrice / onEnergyCurrent)
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

Not affiliated with Urban Solar Energy, Enedis or Shelly. The
figures are an estimate rebuilt from meter readings: the Urban Solar customer
area is authoritative (use the "Set the stock" action to realign).

## License

Apache-2.0
