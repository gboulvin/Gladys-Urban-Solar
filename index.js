// -----------------------------------------------------------------------------
// Entry point of the Urban Solar integration for Gladys Assistant.
//
// This file only wires the SDK to the engine (src/engine.js), which reads the
// meter, keeps the virtual battery ledger and publishes the states:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the handlers BEFORE connect();
//   3. connects, publishes the devices and starts the refresh timer.
//
// Environment variables provided by the Gladys supervisor to the container:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR
// (read by the SDK). DATA_DIR (default /data) is where the ledger is saved.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { CONFIG_ACTIONS } from './src/actions.js';
import { normalizeConfig } from './src/config.js';
import {
  BATTERY_FEATURES,
  batteryFeatureId,
  buildDiscoveredDevices,
  findBlueprintByDevice,
} from './src/devices/index.js';
import { createEngine } from './src/engine.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { createStore } from './src/store.js';
import { t } from './src/i18n.js';
import { WIDGETS, refreshWidgets } from './src/widgets.js';

const gladys = new GladysIntegration();
const engine = createEngine({ gladys, store: createStore() });

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();
let ready = false;

// The engine decides by itself whether a run is due (refresh interval: read
// the Shelly meter, or check the Gladys scene still reports): the timer only
// gives it a chance every 15 seconds.
const TICK_MS = 15000;
let timer = null;

async function tick({ force = false } = {}) {
  if (!ready) return;
  try {
    const result = await engine.refresh(config, { force });
    if (result) refreshWidgets(gladys);
  } catch (err) {
    logger.error('Refresh failed', err);
  }
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => tick(), TICK_MS);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

// A failing action is acked as failed to Gladys, which shows it in the
// scene log or as a toast; without this the integration logs would show
// nothing, and a refused meter reading would be invisible.
function logFailure(kind, key, run) {
  return async (...args) => {
    try {
      return await run(...args);
    } catch (err) {
      logger.warn(`${kind} ${key} failed: ${err.message}`);
      throw err;
    }
  };
}

// --- Discovery ---------------------------------------------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the devices');
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
});

// A device just added in Gladys gets every value at once, not only the next
// changes.
gladys.onDeviceCreated(async (device) => {
  if (findBlueprintByDevice(gladys, device)) {
    await engine.publishAll(config);
  }
});

// --- Command: the accounting switch of the virtual battery ------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  if (feature.external_id !== batteryFeatureId(gladys, BATTERY_FEATURES.ACCOUNTING)) {
    // Throw: the SDK sends a success:false acknowledgement to Gladys.
    throw new Error(`${feature.external_id} is read-only`);
  }
  await engine.setAccounting(Number(value) === 1, config);
  refreshWidgets(gladys);
});

// --- Configuration screen actions --------------------------------------------
for (const [key, handler] of Object.entries(CONFIG_ACTIONS)) {
  gladys.onAction(
    key,
    logFailure('Action', key, async (fields) => {
      const message = await handler({ fields, config, engine });
      refreshWidgets(gladys);
      return message;
    }),
  );
}

// --- Scene actions -----------------------------------------------------------
// The scene TRIGGERS need no handler: the engine fires them with
// publishSceneEvent.
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(
    key,
    logFailure('Scene action', key, async (fields) => {
      const outputs = await handler({ fields, config, engine });
      refreshWidgets(gladys);
      return outputs;
    }),
  );
}

// --- Dashboard widgets -------------------------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(gladys, { ...request, config, engine }));
  gladys.onWidgetAction(key, (actionKey, params, { settings, values }) =>
    logFailure(`Widget action ${key}.`, actionKey, () =>
      widget.action(gladys, { actionKey, params, settings, values, config, engine }),
    )(),
  );
}

// --- Energy contract: delegated pricing of the Urban Solar contract ---------
// The user's "Urban Solar — virtual battery" contract (manifest
// `energy_contracts`) carries the prices; Gladys asks the integration to
// price the energy of the meter linked to it (see src/pricing.js).
gladys.onEnergyPrice((request) => engine.price(request, config));
gladys.onEnergyCurrent((request) => engine.currentPrice(request));

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await tick({ force: true });
  refreshWidgets(gladys);
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
    await engine.refreshTariffs();
    await engine.publishAll(config);
    ready = true;
    await tick({ force: true });
    refreshWidgets(gladys);
    startTimer();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys.setConnectionStatus(false, t('status_init_failed')).catch(() => {});
  }
});

gladys.on('disconnected', () => {
  stopTimer();
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  stopTimer();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Urban Solar integration...');
engine
  .init()
  .then(() => gladys.connect())
  .catch((err) => {
    logger.error('Initial connection failed', err);
    process.exit(1);
  });
