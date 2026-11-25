// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Operations a scene author places in a scene. Each handler receives the
// RESOLVED `fields` and returns the declared scalar `outputs`, readable by the
// following actions of the scene ({{<column>.<row>.<key>}}). The scene
// TRIGGERS are fired by the engine (src/engine.js, SCENE_TRIGGERS).
//
// A scene action is never a condition: `get_status` returns the figures and
// the scene author gates the following actions on them ("if the stock is
// above 50 kWh, start the water heater").
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

function statusOutputs(status) {
  return {
    stock_kwh: status.stockKwh,
    level_percent: status.levelPercent,
    state: status.state,
    accounting: status.accounting,
    savings_eur: status.savingsEur,
    charged_today_kwh: status.today?.chargedKwh ?? status.lastDay?.chargedKwh ?? 0,
    discharged_today_kwh: status.today?.dischargedKwh ?? status.lastDay?.dischargedKwh ?? 0,
    import_power_w: Math.round(status.live.importW),
    export_power_w: Math.round(status.live.exportW),
    source: status.transport.source ?? 'none',
  };
}

export const SCENE_ACTIONS = {
  // The bridge to the devices of other integrations: a Gladys scene reads
  // the cumulative indexes of the meter (energy monitoring, Shelly, current
  // clamp...) and passes them here, as text fields where the scene variables
  // ({{...}}) are substituted by the core.
  async record_meter_reading({ fields, config, engine }) {
    logger.debug('Scene action record_meter_reading', fields);
    return engine.recordReading(fields, config);
  },

  async get_status({ config, engine }) {
    return statusOutputs(engine.status(config));
  },

  async refresh_data({ config, engine }) {
    logger.info('Scene action refresh_data');
    const result = await engine.refresh(config, { force: true });
    return { success: Boolean(result?.ok), stock_kwh: engine.status(config).stockKwh };
  },

  async calibrate_stock({ fields, config, engine }) {
    logger.info(`Scene action calibrate_stock <- ${fields.stock_kwh}`);
    // An invalid stock throws: it fails this action only, and the scene logs it.
    const status = await engine.calibrate(fields.stock_kwh, config);
    return { stock_kwh: status.stockKwh, level_percent: status.levelPercent };
  },

  async set_accounting({ fields, config, engine }) {
    logger.info(`Scene action set_accounting <- ${fields.enabled}`);
    const enabled = await engine.setAccounting(fields.enabled !== false, config);
    return { accounting: enabled };
  },
};
