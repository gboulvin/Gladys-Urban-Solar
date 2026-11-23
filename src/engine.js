// -----------------------------------------------------------------------------
// The engine: reads the meter, keeps the virtual battery ledger, publishes the
// device states and fires the scene triggers.
//
// Sources (see src/config.js `sourceOrder`):
//   - local: a Shelly meter, read every `poll_frequency` seconds. The ledger
//     follows its cumulative counters, so a restart or a network outage loses
//     nothing: the next read accounts for the whole gap.
//   - cloud: the Linky daily readings (Conso API), fetched every few hours and
//     accounted one whole day at a time, the day after.
// With both configured, the "Prefer the local connection" toggle picks the
// preferred one and the other one is a fallback, shown as a degraded badge.
// A day the local meter accounted, even partly, is never accounted again from
// the cloud readings, so a fallback never counts the same energy twice.
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
  pruneCoverage,
  recordCoverage,
  restoreState,
  round,
  slotKeyOf,
} from './battery.js';
import { sourceOrder } from './config.js';
import { addDays, daysBetween, localDay } from './dates.js';
import {
  BATTERY_FEATURES,
  GRID_FEATURES,
  batteryFeatureId,
  buildTransportEntries,
  gridFeatureId,
} from './devices/index.js';
import { t } from './i18n.js';
import { currentPrice, priceIntervals } from './pricing.js';
import { readDailyEnergy } from './sources/conso.js';
import { readShelly } from './sources/shelly.js';
import { createTariffs } from './tariffs.js';

const logger = createLogger({ name: 'engine' });

// Scene trigger keys, as declared in the manifest `scene_triggers` field.
export const SCENE_TRIGGERS = {
  STATE_CHANGED: 'battery_state_changed',
  LOW_STOCK: 'low_stock',
  DAILY_SUMMARY: 'daily_summary',
};

export const SOURCES = { LOCAL: 'local', CLOUD: 'cloud' };

// The Linky readings of a day are published once, the next morning: there is
// no point asking more often than every few hours.
const CLOUD_FETCH_INTERVAL_MS = 3 * 60 * 60 * 1000;
// How far back the cloud source catches up after a long outage.
const CLOUD_MAX_CATCH_UP_DAYS = 30;
// A missing day younger than this is waited for (Enedis publishes late
// sometimes); an older one is given up, so the ledger never stalls.
const CLOUD_GAP_WAIT_DAYS = 7;
// Gladys' minute ticks drift by a few milliseconds.
const REFRESH_TOLERANCE_MS = 5000;
// Unchanged values are re-sent every 30 minutes, so they stay recently dated.
const STATES_HEARTBEAT_MS = 30 * 60 * 1000;
export const MAX_STOCK_KWH = 1000000;

const NOT_CONFIGURED = Object.freeze({
  transport: DEVICE_TRANSPORTS.UNREACHABLE,
  source: null,
  configured: false,
  degraded: false,
  message: null,
  error: null,
});

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
  let live = { importW: 0, exportW: 0 };
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

  // --- Sources -----------------------------------------------------------------

  function useSource(source) {
    if (state.activeSource === source) return;
    logger.info(`Data source: ${state.activeSource ?? 'none'} -> ${source}`);
    if (source === SOURCES.LOCAL) {
      // The counters moved while another source was accounting: start from
      // the next read instead of accounting the whole gap a second time.
      state.local.importWh = null;
      state.local.exportWh = null;
    }
    state.activeSource = source;
  }

  async function refreshLocal(config) {
    const reading = await readShelly(config, { fetchImpl });
    useSource(SOURCES.LOCAL);
    const today = localDay(now(), config.timezone);
    if (state.day !== today) {
      if (state.day !== null) {
        closeDay({ ...state.today, date: state.day });
      }
      state.day = today;
      state.today = emptyDay(today);
    }
    const previous = state.local;
    if (previous.importWh !== null) {
      const importWh = reading.importWh - previous.importWh;
      const exportWh = reading.exportWh - previous.exportWh;
      if (importWh >= 0 && exportWh >= 0) {
        const moved = applyInterval(
          state,
          { importKwh: importWh / 1000, exportKwh: exportWh / 1000 },
          tariffs.ratesFor(today),
        );
        addToDay(state.today, moved);
        if (state.accounting) {
          // The energy flowed since the previous read: date it half a
          // minute back, so a read just after a slot boundary still fills
          // the slot it belongs to.
          const slotKey = slotKeyOf(new Date(now().getTime() - 30000));
          recordCoverage(state, { slotKey, dayKey: today }, moved);
        }
        state.local.lastDay = today;
      } else {
        // A replaced or reset meter: its counters went backwards.
        logger.warn('The Shelly counters went backwards, starting again from this read');
      }
    }
    state.local.importWh = reading.importWh;
    state.local.exportWh = reading.exportWh;
    live = { importW: Math.max(0, reading.powerW), exportW: Math.max(0, -reading.powerW) };
    updateBatteryState({ importing: live.importW, exporting: live.exportW });
  }

  async function refreshCloud(config, { force }) {
    useSource(SOURCES.CLOUD);
    live = { importW: 0, exportW: 0 };
    const nowDate = now();
    const lastFetch = state.cloud.lastFetch ? Date.parse(state.cloud.lastFetch) : null;
    if (!force && lastFetch !== null && nowDate.getTime() - lastFetch < CLOUD_FETCH_INTERVAL_MS) {
      return;
    }
    const today = localDay(nowDate, config.timezone);
    // First start: only the last day. The past is the stock the user enters
    // once with the calibration, as shown in the Urban Solar customer area.
    let from = state.cloud.lastDay ? addDays(state.cloud.lastDay, 1) : addDays(today, -1);
    if (state.local.lastDay && from <= state.local.lastDay) {
      from = addDays(state.local.lastDay, 1);
    }
    if (daysBetween(from, today) > CLOUD_MAX_CATCH_UP_DAYS) {
      from = addDays(today, -CLOUD_MAX_CATCH_UP_DAYS);
    }
    if (from < today) {
      const days = await readDailyEnergy(config, { from, to: today, fetchImpl });
      let expected = from;
      for (const day of days) {
        if (day.date < expected) continue;
        if (day.date !== expected && daysBetween(expected, today) <= CLOUD_GAP_WAIT_DAYS) {
          break; // wait for the missing day
        }
        const moved = applyInterval(
          state,
          { importKwh: day.importWh / 1000, exportKwh: day.exportWh / 1000 },
          tariffs.ratesFor(day.date),
        );
        if (state.accounting) {
          recordCoverage(state, { dayKey: day.date }, moved);
        }
        closeDay({ date: day.date, ...moved });
        updateBatteryState({ importing: day.importWh, exporting: day.exportWh });
        state.cloud.lastDay = day.date;
        expected = addDays(day.date, 1);
      }
    }
    state.cloud.lastFetch = nowDate.toISOString();
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
      message = t('status_unreachable', { error: transport.error });
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

  async function doRefresh(config, { force }) {
    const previousStock = state.stockKwh;
    await tariffs.refresh();
    const order = sourceOrder(config);
    if (order.length === 0) {
      transport = NOT_CONFIGURED;
      live = { importW: 0, exportW: 0 };
    } else {
      let lastError = null;
      for (const [index, source] of order.entries()) {
        try {
          if (source === SOURCES.LOCAL) {
            await refreshLocal(config);
          } else {
            await refreshCloud(config, { force });
          }
          const degraded = index > 0;
          transport = {
            transport: source === SOURCES.LOCAL ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.CLOUD,
            source,
            configured: true,
            degraded,
            message: degraded
              ? t(
                  order[0] === SOURCES.LOCAL
                    ? 'degraded_local_fallback'
                    : 'degraded_cloud_fallback',
                )
              : null,
            error: null,
          };
          lastError = null;
          state.lastUpdate = now().toISOString();
          state.startedAt ??= state.lastUpdate;
          break;
        } catch (err) {
          logger.warn(`The ${source} source failed: ${err.message}`);
          lastError = err;
        }
      }
      if (lastError) {
        live = { importW: 0, exportW: 0 };
        transport = {
          ...NOT_CONFIGURED,
          configured: true,
          error: lastError.message.slice(0, 120),
        };
      }
    }
    checkLowStock(previousStock, config);
    pruneCoverage(state, now().getTime());
    await persist();
    await publishStates(config);
    await publishTransports();
    await reportConnection();
    await fireEvents();
    lastRefreshAt = now().getTime();
    return { ok: transport.configured && !transport.error, error: transport.error };
  }

  return {
    async init() {
      state = restoreState(await store.load());
      logger.info(`Ledger loaded: ${round(state.stockKwh, 2)} kWh in the virtual battery`);
    },

    /**
     * Read the meter and update the ledger, unless the last read is more
     * recent than the refresh interval (`force` bypasses it, and the cloud
     * fetch throttling too). Concurrent calls share the same run.
     */
    refresh(config, { force = false } = {}) {
      if (running) return running;
      const due =
        lastRefreshAt === null ||
        now().getTime() - lastRefreshAt >= config.poll_frequency * 1000 - REFRESH_TOLERANCE_MS;
      if (!force && !due) return Promise.resolve(null);
      running = doRefresh(config, { force }).finally(() => {
        running = null;
      });
      return running;
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
      const today = state.activeSource === SOURCES.LOCAL ? state.today : null;
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
        rates: tariffs.ratesFor(localDay(now(), config.timezone)),
      };
    },
  };
}

export { BATTERY_STATES };
