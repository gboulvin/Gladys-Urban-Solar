// -----------------------------------------------------------------------------
// The engine: receives the meter readings, keeps the virtual battery ledger,
// publishes the device states and fires the scene triggers.
//
// Two sources, one at a time (`data_source` in the configuration):
//   - gladys: devices already in Gladys (the meter of the energy monitoring,
//     a Shelly or a current clamp of another integration...). An external
//     integration cannot read the devices of other integrations, so a Gladys
//     scene reads their cumulative indexes and passes them to the "Record a
//     meter reading" scene action (`recordReading`).
//   - shelly: a Shelly energy meter read directly over the LAN, every
//     `poll_frequency` seconds.
// Both work on cumulative counters: the ledger accounts the difference
// between two readings, so a missed reading, a restart or an outage loses
// nothing — the next reading accounts for the whole gap. Switching sources
// starts again from the next reading of the new one, never counting twice.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import {
  BATTERY_STATES,
  addToDay,
  applyInterval,
  batteryStateOf,
  coveragePercent,
  createInitialState,
  emptyDay,
  levelPercent,
  parseReading,
  pruneCoverage,
  recordCoverage,
  restoreState,
  round,
  slotKeyOf,
} from './battery.js';
import { DATA_SOURCES, isSourceConfigured } from './config.js';
import { localDay } from './dates.js';
import {
  BATTERY_FEATURES,
  GRID_FEATURES,
  batteryFeatureId,
  buildTransportEntries,
  gridFeatureId,
} from './devices/index.js';
import { t } from './i18n.js';
import { currentPrice, priceIntervals } from './pricing.js';
import { readShelly } from './sources/shelly.js';
import { createTariffs } from './tariffs.js';

const logger = createLogger({ name: 'engine' });

// Scene trigger keys, as declared in the manifest `scene_triggers` field.
export const SCENE_TRIGGERS = {
  STATE_CHANGED: 'battery_state_changed',
  LOW_STOCK: 'low_stock',
  DAILY_SUMMARY: 'daily_summary',
};

export const SOURCES = DATA_SOURCES;

// Gladys' minute ticks drift by a few milliseconds.
const REFRESH_TOLERANCE_MS = 5000;
// Unchanged values are re-sent every 30 minutes, so they stay recently dated.
const STATES_HEARTBEAT_MS = 30 * 60 * 1000;
// Without a reading from the Gladys scene for this long, the source is
// reported as stalled (the scene is disabled, or a device stopped reporting).
export const GLADYS_READING_STALE_MS = 2 * 60 * 60 * 1000;
// The live powers a scene reported are dropped after this long.
const LIVE_POWER_TTL_MS = 15 * 60 * 1000;
export const MAX_STOCK_KWH = 1000000;

const NOT_CONFIGURED = Object.freeze({
  transport: DEVICE_TRANSPORTS.UNREACHABLE,
  source: null,
  configured: false,
  degraded: false,
  message: null,
  error: null,
});

/** Multiply a reading by this to get Wh. */
const UNIT_TO_WH = { kwh: 1000, wh: 1 };

/**
 * @param {{ gladys: any, store: ReturnType<import('./store.js').createStore>,
 *   fetchImpl?: typeof fetch, now?: () => Date,
 *   tariffs?: ReturnType<typeof createTariffs> }} options
 */
export function createEngine({
  gladys,
  store,
  fetchImpl = fetch,
  now = () => new Date(),
  tariffs = createTariffs({ gladys, now }),
}) {
  let state = createInitialState();
  let running = null;
  let lastRefreshAt = null;
  let live = { importW: 0, exportW: 0, at: null };
  let transport = NOT_CONFIGURED;
  let publishedTransportKey = null;
  let connectionKey = null;
  let pendingEvents = [];

  // --- Events ----------------------------------------------------------------

  function updateBatteryState(flows) {
    const next = batteryStateOf(state.stockKwh, flows);
    if (state.batteryState !== null && next !== state.batteryState) {
      pendingEvents.push({
        key: SCENE_TRIGGERS.STATE_CHANGED,
        data: { state: next, stock_kwh: round(state.stockKwh, 2) },
      });
    }
    state.batteryState = next;
  }

  function checkLowStock(previousStockKwh, config) {
    const threshold = config.low_stock_kwh;
    if (previousStockKwh >= threshold && state.stockKwh < threshold) {
      pendingEvents.push({
        key: SCENE_TRIGGERS.LOW_STOCK,
        data: { stock_kwh: round(state.stockKwh, 2), threshold_kwh: threshold },
      });
    }
  }

  function closeDay(day) {
    state.lastDay = {
      date: day.date,
      chargedKwh: round(day.chargedKwh),
      dischargedKwh: round(day.dischargedKwh),
      uncoveredKwh: round(day.uncoveredKwh),
    };
    pendingEvents.push({
      key: SCENE_TRIGGERS.DAILY_SUMMARY,
      data: {
        date: day.date,
        charged_kwh: round(day.chargedKwh, 2),
        discharged_kwh: round(day.dischargedKwh, 2),
        grid_import_kwh: round(day.uncoveredKwh, 2),
        stock_kwh: round(state.stockKwh, 2),
        savings_eur: round(state.savingsEur, 2),
      },
    });
  }

  async function fireEvents() {
    const events = pendingEvents;
    pendingEvents = [];
    for (const { key, data } of events) {
      logger.info(`Scene event ${key}`, data);
      await gladys.publishSceneEvent(key, data).catch((err) => {
        logger.error(`Cannot publish the scene event ${key}`, err);
      });
    }
  }

  // --- Ledger ------------------------------------------------------------------

  function useSource(source) {
    if (state.activeSource === source) return;
    logger.info(`Data source: ${state.activeSource ?? 'none'} -> ${source}`);
    // The counters moved while another source was accounting: start from
    // the next reading instead of accounting the whole gap a second time.
    const bookkeeping = source === SOURCES.SHELLY ? state.local : state.gladys;
    bookkeeping.importWh = null;
    bookkeeping.exportWh = null;
    state.activeSource = source;
  }

  /** Close the previous day when the local date changed. */
  function rollDay(config) {
    const today = localDay(now(), config.timezone);
    if (state.day !== today) {
      if (state.day !== null) {
        closeDay({ ...state.today, date: state.day });
      }
      state.day = today;
      state.today = emptyDay(today);
    }
    return today;
  }

  /**
   * Difference of a cumulative counter since its previous reading, in kWh.
   * `null` for the first reading (it only sets the baseline) and when the
   * counter went backwards (a replaced or reset meter: start over).
   */
  function counterDelta(bookkeeping, key, valueWh, label) {
    if (valueWh === null) return 0;
    const previous = bookkeeping[key];
    bookkeeping[key] = valueWh;
    if (previous === null) return null;
    if (valueWh < previous) {
      logger.warn(`The ${label} counter went backwards, starting again from this reading`);
      return null;
    }
    return (valueWh - previous) / 1000;
  }

  /** Account the energy that went through the meter since the last reading. */
  function account(config, { importKwh, exportKwh, flowedAt }) {
    const today = rollDay(config);
    const moved = applyInterval(state, { importKwh, exportKwh }, tariffs.ratesFor(today));
    addToDay(state.today, moved);
    if (state.accounting && (importKwh > 0 || exportKwh > 0)) {
      recordCoverage(state, { slotKey: slotKeyOf(flowedAt), dayKey: today }, moved);
    }
    return moved;
  }

  async function refreshShelly(config) {
    const reading = await readShelly(config, { fetchImpl });
    useSource(SOURCES.SHELLY);
    const importKwh = counterDelta(state.local, 'importWh', reading.importWh, 'Shelly import');
    const exportKwh = counterDelta(state.local, 'exportWh', reading.exportWh, 'Shelly export');
    // The energy flowed since the previous read: date it half a minute back,
    // so a read just after a slot boundary still fills the slot it belongs to.
    account(config, {
      importKwh: importKwh ?? 0,
      exportKwh: exportKwh ?? 0,
      flowedAt: new Date(now().getTime() - 30000),
    });
    live = {
      importW: Math.max(0, reading.powerW),
      exportW: Math.max(0, -reading.powerW),
      at: now().getTime(),
    };
    updateBatteryState({ importing: live.importW, exporting: live.exportW });
  }

  /** Status of the Gladys source, from the date of its last reading. */
  function checkGladysSource() {
    const last = state.gladys.lastReadingAt ? Date.parse(state.gladys.lastReadingAt) : null;
    if (last === null) {
      return { key: 'status_waiting_reading', vars: {} };
    }
    const minutes = Math.round((now().getTime() - last) / 60000);
    if (now().getTime() - last > GLADYS_READING_STALE_MS) {
      return { key: 'status_stale_reading', vars: { minutes } };
    }
    return null;
  }

  // --- Publication ---------------------------------------------------------------

  async function publishStates(config, { full = false } = {}) {
    if (full) {
      gladys.forgetPublishedStates();
    }
    const battery = (key) => batteryFeatureId(gladys, key);
    const grid = (key) => gridFeatureId(gladys, key);
    const discharging = state.stockKwh > 0 && state.accounting ? live.importW : 0;
    const states = [
      [battery(BATTERY_FEATURES.STOCK), round(state.stockKwh, 2)],
      [battery(BATTERY_FEATURES.LEVEL), levelPercent(state.stockKwh, config.capacity_kwh)],
      [battery(BATTERY_FEATURES.CHARGE_POWER), state.accounting ? round(live.exportW, 0) : 0],
      [battery(BATTERY_FEATURES.DISCHARGE_POWER), round(discharging, 0)],
      [battery(BATTERY_FEATURES.CHARGED), round(state.chargedKwh, 2)],
      [battery(BATTERY_FEATURES.DISCHARGED), round(state.dischargedKwh, 2)],
      [battery(BATTERY_FEATURES.SAVINGS), round(state.savingsEur, 2)],
      [battery(BATTERY_FEATURES.ACCOUNTING), state.accounting ? 1 : 0],
      [grid(GRID_FEATURES.IMPORT_POWER), round(live.importW, 0)],
      [grid(GRID_FEATURES.EXPORT_POWER), round(live.exportW, 0)],
      [grid(GRID_FEATURES.IMPORT_INDEX), round(state.importKwh, 2)],
      [grid(GRID_FEATURES.EXPORT_INDEX), round(state.exportKwh, 2)],
      [grid(GRID_FEATURES.UNCOVERED_INDEX), round(state.uncoveredKwh, 2)],
    ].map(([id, value]) => ({ device_feature_external_id: id, state: value }));
    try {
      await gladys.publishChangedStates(states, { heartbeat: STATES_HEARTBEAT_MS });
    } catch (err) {
      // Typically the devices are not added in Gladys yet: the ledger keeps
      // running and onDeviceCreated publishes everything once they are.
      logger.debug(`States not published: ${err.message}`);
    }
  }

  async function publishTransports({ force = false } = {}) {
    const key = JSON.stringify([transport.transport, transport.degraded]);
    if (!force && key === publishedTransportKey) return;
    try {
      await gladys.publishTransports(buildTransportEntries(gladys, transport));
      publishedTransportKey = key;
    } catch (err) {
      logger.debug(`Transports not published: ${err.message}`);
    }
  }

  async function reportConnection({ force = false } = {}) {
    let connected = true;
    let message;
    if (!transport.configured) {
      connected = false;
      message = t('status_not_configured');
    } else if (transport.error) {
      connected = false;
      message = transport.message;
    }
    const key = JSON.stringify([connected, message?.en]);
    if (!force && key === connectionKey) return;
    await gladys.setConnectionStatus(connected, message);
    connectionKey = key;
  }

  async function persist() {
    try {
      await store.save(state);
    } catch (err) {
      logger.error('Cannot save the virtual battery ledger', err);
    }
  }

  /** Drop live powers a scene reported long ago: they no longer mean anything. */
  function expireLivePowers() {
    if (live.at !== null && now().getTime() - live.at > LIVE_POWER_TTL_MS) {
      live = { importW: 0, exportW: 0, at: null };
    }
  }

  function setTransport(source, problem) {
    transport = {
      transport: problem?.unreachable ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL,
      source,
      configured: true,
      degraded: Boolean(problem && !problem.unreachable),
      // Shown in the badge tooltip and in the connection status.
      message: problem ? t(problem.key, problem.vars) : null,
      error: problem ? problem.error : null,
    };
  }

  /** Persist, publish and fire what the last change produced. */
  async function commit(config, previousStock) {
    checkLowStock(previousStock, config);
    pruneCoverage(state, now().getTime());
    await persist();
    await publishStates(config);
    await publishTransports();
    await reportConnection();
    await fireEvents();
  }

  async function doRefresh(config) {
    const previousStock = state.stockKwh;
    await tariffs.refresh();
    if (!isSourceConfigured(config)) {
      transport = NOT_CONFIGURED;
      live = { importW: 0, exportW: 0, at: null };
    } else if (config.data_source === SOURCES.SHELLY) {
      try {
        await refreshShelly(config);
        setTransport(SOURCES.SHELLY, null);
        state.lastUpdate = now().toISOString();
        state.startedAt ??= state.lastUpdate;
      } catch (err) {
        logger.warn(`The Shelly meter failed: ${err.message}`);
        live = { importW: 0, exportW: 0, at: null };
        const error = err.message.slice(0, 120);
        setTransport(SOURCES.SHELLY, {
          key: 'status_unreachable',
          vars: { error },
          error,
          unreachable: true,
        });
      }
    } else {
      // Nothing to poll: the Gladys scene pushes the readings. Only check it
      // still does, and switch the bookkeeping when the source just changed.
      useSource(SOURCES.GLADYS);
      rollDay(config);
      expireLivePowers();
      const problem = checkGladysSource();
      setTransport(
        SOURCES.GLADYS,
        problem && { ...problem, error: t(problem.key, problem.vars).en, unreachable: false },
      );
    }
    await commit(config, previousStock);
    lastRefreshAt = now().getTime();
    return { ok: transport.configured && !transport.error, error: transport.error };
  }

  return {
    async init() {
      state = restoreState(await store.load());
      logger.info(`Ledger loaded: ${round(state.stockKwh, 2)} kWh in the virtual battery`);
    },

    /**
     * Read the Shelly meter (or check the Gladys scene still reports) and
     * update the ledger, unless the last run is more recent than the refresh
     * interval (`force` bypasses it). Concurrent calls share the same run.
     */
    refresh(config, { force = false } = {}) {
      if (running) return running;
      const due =
        lastRefreshAt === null ||
        now().getTime() - lastRefreshAt >= config.poll_frequency * 1000 - REFRESH_TOLERANCE_MS;
      if (!force && !due) return Promise.resolve(null);
      running = doRefresh(config).finally(() => {
        running = null;
      });
      return running;
    },

    /**
     * Account a reading sent by a Gladys scene ("Record a meter reading"):
     * the cumulative import and/or export indexes of the meter, and
     * optionally its live powers. Indexes only: the ledger computes the
     * differences itself, so sending the same reading twice counts nothing.
     * @param {{ import_index?: unknown, export_index?: unknown, unit?: string,
     *   import_power?: unknown, export_power?: unknown }} fields
     * @throws {Error} when the data source is not "Gladys devices", or a
     *   value is not a number, or no index is given
     */
    async recordReading(fields, config) {
      if (config.data_source !== SOURCES.GLADYS) {
        throw new Error(
          'The data source of the integration is the Shelly meter, not Gladys devices',
        );
      }
      const factor = UNIT_TO_WH[fields.unit] ?? UNIT_TO_WH.kwh;
      const importIndex = parseReading(fields.import_index);
      const exportIndex = parseReading(fields.export_index);
      if (importIndex === null && exportIndex === null) {
        throw new Error('No index in the reading: give the import index, the export index or both');
      }
      for (const index of [importIndex, exportIndex]) {
        if (index !== null && index < 0) throw new RangeError('An index cannot be negative');
      }
      const importPower = parseReading(fields.import_power);
      const exportPower = parseReading(fields.export_power);
      const previousStock = state.stockKwh;
      useSource(SOURCES.GLADYS);
      const toWh = (value) => (value === null ? null : value * factor);
      const importKwh = counterDelta(state.gladys, 'importWh', toWh(importIndex), 'import');
      const exportKwh = counterDelta(state.gladys, 'exportWh', toWh(exportIndex), 'export');
      // The energy flowed between the two readings: date it at the middle,
      // within the last half-hour, for the half-hour pricing.
      const nowMs = now().getTime();
      const lastMs = state.gladys.lastReadingAt ? Date.parse(state.gladys.lastReadingAt) : nowMs;
      const flowedAt = new Date(nowMs - Math.min((nowMs - lastMs) / 2, 15 * 60 * 1000));
      const moved = account(config, {
        importKwh: importKwh ?? 0,
        exportKwh: exportKwh ?? 0,
        flowedAt,
      });
      if (importPower !== null || exportPower !== null) {
        live = {
          importW: Math.max(0, importPower ?? 0),
          exportW: Math.max(0, exportPower ?? 0),
          at: nowMs,
        };
      } else {
        expireLivePowers();
      }
      updateBatteryState(
        importPower !== null || exportPower !== null
          ? { importing: live.importW, exporting: live.exportW }
          : { importing: importKwh ?? 0, exporting: exportKwh ?? 0 },
      );
      state.gladys.lastReadingAt = now().toISOString();
      state.lastUpdate = state.gladys.lastReadingAt;
      state.startedAt ??= state.lastUpdate;
      setTransport(SOURCES.GLADYS, null);
      await commit(config, previousStock);
      const shown = (index, delta) =>
        index === null
          ? '-'
          : `${index}${delta === null ? ' (first reading)' : ` (+${round(delta, 3)} kWh)`}`;
      logger.info(
        `Meter reading: import ${shown(importIndex, importKwh)}, export ${shown(exportIndex, exportKwh)} ` +
          `[${fields.unit ?? 'kwh'}] -> stock ${round(state.stockKwh, 2)} kWh`,
      );
      return {
        accepted: true,
        imported_kwh: round(importKwh ?? 0, 3),
        exported_kwh: round(exportKwh ?? 0, 3),
        stored_kwh: round(moved.chargedKwh, 3),
        withdrawn_kwh: round(moved.dischargedKwh, 3),
        stock_kwh: round(state.stockKwh, 2),
      };
    },

    /** Set the stock to the value shown in the Urban Solar customer area. */
    async calibrate(stockKwh, config) {
      const value = Number(stockKwh);
      if (!Number.isFinite(value) || value < 0 || value > MAX_STOCK_KWH) {
        throw new RangeError('Invalid stock');
      }
      const previousStock = state.stockKwh;
      state.stockKwh = value;
      logger.info(`Virtual battery calibrated: ${previousStock} -> ${value} kWh`);
      updateBatteryState({ importing: live.importW, exporting: live.exportW });
      checkLowStock(previousStock, config);
      await persist();
      await publishStates(config);
      await fireEvents();
      return this.status(config);
    },

    /** Pause or resume the accounting of the virtual battery. */
    async setAccounting(enabled, config) {
      state.accounting = Boolean(enabled);
      logger.info(`Virtual battery accounting ${state.accounting ? 'resumed' : 'paused'}`);
      await persist();
      await publishStates(config);
      return state.accounting;
    },

    /** Re-publish everything (after a (re)connection, a device creation...). */
    async publishAll(config) {
      await publishStates(config, { full: true });
      await publishTransports({ force: true });
      await reportConnection({ force: true });
    },

    /** Price the intervals of an energy-contract.price request (see pricing.js). */
    price(request, config) {
      tariffs.remember(request.contract);
      return priceIntervals(state, request, {
        timeZone: request.contract.timezone || config.timezone,
        nowMs: now().getTime(),
      });
    },

    /** The price of a kWh drawn now (energy-contract.current). */
    currentPrice(request) {
      tariffs.remember(request.contract);
      return currentPrice(state, request);
    },

    /** Re-read the Urban Solar contracts now. */
    refreshTariffs() {
      return tariffs.refresh({ force: true });
    },

    status(config) {
      const today = state.activeSource ? state.today : null;
      return {
        stockKwh: round(state.stockKwh, 2),
        levelPercent: levelPercent(state.stockKwh, config.capacity_kwh),
        state: state.batteryState ?? 'unknown',
        accounting: state.accounting,
        savingsEur: round(state.savingsEur, 2),
        chargedKwh: round(state.chargedKwh, 2),
        dischargedKwh: round(state.dischargedKwh, 2),
        uncoveredKwh: round(state.uncoveredKwh, 2),
        coveragePercent: coveragePercent(state),
        today: today && {
          date: today.date,
          chargedKwh: round(today.chargedKwh, 2),
          dischargedKwh: round(today.dischargedKwh, 2),
          uncoveredKwh: round(today.uncoveredKwh, 2),
        },
        lastDay: state.lastDay,
        live: { ...live },
        transport: { ...transport },
        lastUpdate: state.lastUpdate,
        lastReading: {
          at: state.gladys.lastReadingAt,
          importKwh: state.gladys.importWh === null ? null : round(state.gladys.importWh / 1000, 3),
          exportKwh: state.gladys.exportWh === null ? null : round(state.gladys.exportWh / 1000, 3),
        },
        rates: tariffs.ratesFor(localDay(now(), config.timezone)),
      };
    },
  };
}

export { BATTERY_STATES };
