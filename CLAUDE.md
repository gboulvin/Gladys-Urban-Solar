# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **Urban Solar** external integration for Gladys Assistant: a Node.js
service (Node 22+, ESM, no build step) running in its own sandboxed Docker
container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.

It rebuilds the Urban Solar **virtual battery** ledger (injected energy
credited, imported energy debited, full price once empty) from meter
readings — Urban Solar has no public API:

- `gladys` source (default): devices already in Gladys (energy monitoring
  meter, Shelly or current clamp of another integration). An external
  integration cannot read other integrations' devices, so a Gladys scene
  reads their cumulative indexes and calls the `record_meter_reading` scene
  action;
- `shelly` source: a Shelly Gen2+ energy meter read directly on the LAN
  (cumulative counters, instant power).

Everything is local (`transports: ["local"]`). The Linky cloud source (Conso
API) was removed in version 3: do not bring a cloud API back without asking;
cloud users are pointed to the native Enedis integration of Gladys.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/engine.test.js           # one file
node --test --test-name-pattern "Gladys"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
```

The CI runs `format:check`, `lint` and `test` on Node 22 and 24 and builds the
Docker image: run the three commands before pushing.

## Architecture

```
index.js               SDK wiring only: handlers registered before connect(), 15 s timer
src/engine.js          source selection + fallback, ledger updates, publication, scene triggers
src/battery.js         pure model of the virtual battery (no I/O)
src/sources/shelly.js  Shelly RPC reader (the gladys source is pushed: engine.recordReading)
src/devices/*.js       discovery payloads: virtual battery + grid connection
src/actions.js         manifest `actions` handlers
src/scenes.js          manifest `scene_actions` handlers
src/widgets.js         manifest `widgets` handlers
src/tariffs.js         prices from the user's Urban Solar energy contract (getEnergyContracts)
src/pricing.js         delegated pricing of that contract (onEnergyPrice / onEnergyCurrent)
src/i18n.js            every user-facing message, en/fr/de/es
src/config.js          DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/store.js           ledger persistence (/data/virtual-battery.json, atomic writes)
test/helpers.js        fake network (Shelly), memory store, clock
```

## Rules

- **The ledger is the product.** Never account the same energy twice: both
  sources work on cumulative counter deltas (a backwards counter
  re-baselines, a duplicate reading counts nothing), one source at a time, and
  switching sources resets the new one's baseline. Changing that logic needs a
  test in `test/engine.test.js`. Keep `restoreState` able to read older
  ledgers (version 1: `activeSource: 'local'` is the Shelly, `cloud` dropped).
- **Scene readings are text.** The `record_meter_reading` fields are `string`
  (only text fields receive the `{{...}}` scene variables): parse them with
  `parseReading` (comma decimals, unresolved variables).
- **Prices live in the energy contract.** Never add a price to `config_schema`:
  they are inputs of the `urban-solar-virtual-battery` template, read with
  `getEnergyContracts()`, picked by date. The pricing answer must stay
  deterministic: it only reads the recorded coverage history
  (`state.slots`, `state.days`), never the current stock. The template key
  and its input keys are stored by the users' contracts: never rename them.
- **External ids are forever.** Built with `gladys.externalIds(type, 'urban-solar')`;
  never rename a device type, a feature key, a manifest `config_schema`,
  `actions`, `scene_triggers`, `scene_actions` or `widgets` key.
- **Every feature carries `name`, `min`, `max`, `read_only` and
  `has_feedback`** (Gladys stores them NOT NULL). `test/devices.test.js`
  checks it.
- **Four languages everywhere.** Every user-facing text — manifest texts,
  `src/i18n.js` messages, widget contents, `docs/{en,fr,de,es}.md` — exists in
  English, French, German and Spanish. Add messages to `src/i18n.js` and use
  `t(key, vars)`; `test/i18n.test.js` and `test/widgets.test.js` fail on a
  missing language.
- **Scene events** only carry keys declared in the trigger `fields` /
  `variables`, as primitives; scene action outputs only declared keys.
- **Secrets.** Never log a token or echo an HTTP response body that could
  contain one. The Shelly address is normalized to a host[:port] so the
  integration never requests an arbitrary URL.
- **The container rootfs is read-only.** Write only under `/data` (`DATA_DIR`).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md`. Never write a version heading: the Release workflow does.
- **Manifest.** Texts are multi-language objects, the catalog `description`
  holds 10 to 100 characters per language, widget labels 3 to 30.
  `gladys_version` stays `>=5.2.0` (`energy_contracts`).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
