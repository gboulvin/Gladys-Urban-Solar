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

- `local` transport: a Shelly Gen2+ energy meter on the LAN (cumulative
  counters, instant power);
- `cloud` transport: the Linky daily readings through the Conso API
  (`conso.boris.sh`, published at D+1).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/engine.test.js           # one file
node --test --test-name-pattern "cloud"   # tests whose name matches
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
src/sources/*.js       shelly.js (local), conso.js (cloud): readings only
src/devices/*.js       discovery payloads: virtual battery + grid connection
src/actions.js         manifest `actions` handlers
src/scenes.js          manifest `scene_actions` handlers
src/widgets.js         manifest `widgets` handlers
src/i18n.js            every user-facing message, en/fr/de/es
src/config.js          DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/store.js           ledger persistence (/data/virtual-battery.json, atomic writes)
test/helpers.js        fake network (Shelly + Conso), memory store, clock
```

## Rules

- **The ledger is the product.** Never account the same energy twice: the
  local source works on counter deltas (a backwards counter re-baselines), the
  cloud source on whole days strictly after `state.local.lastDay` and
  `state.cloud.lastDay`. Changing that logic needs a test in
  `test/engine.test.js`. Keep `restoreState` able to read older ledgers.
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
- **Secrets.** Never log the Conso token or echo an HTTP response body that
  could contain it. The Shelly address is normalized to a host[:port] so the
  integration never requests an arbitrary URL.
- **The container rootfs is read-only.** Write only under `/data` (`DATA_DIR`).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md`. Never write a version heading: the Release workflow does.
- **Manifest.** Texts are multi-language objects, the catalog `description`
  holds 10 to 100 characters per language, widget labels 3 to 30.
  `gladys_version` stays `>=5.1.0` (capability fields).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
