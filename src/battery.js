// -----------------------------------------------------------------------------
// The Urban Solar virtual battery, as a pure model.
//
// How the offer works: the solar energy the house does not consume is
// injected into the grid and credited, in kWh, to a virtual battery. When the
// house later draws energy from the grid, it is taken from that stock first,
// and only billed at the full grid price once the stock is empty. Each kWh
// withdrawn from the stock still pays a withdrawal fee (grid transport and
// taxes), so the saving of a withdrawn kWh is `grid_price - discharge_fee`.
//
// Within one interval (between two meter readings) the injected
// energy is stored first, then the imported energy is withdrawn from the
// stock. No I/O here: src/engine.js feeds the readings and persists the state.
// -----------------------------------------------------------------------------

export const BATTERY_STATES = {
  CHARGING: 'charging',
  DISCHARGING: 'discharging',
  EMPTY: 'empty',
  IDLE: 'idle',
};

// Below this stock (1 Wh) the battery is considered empty: float sums never
// land exactly on zero.
const EMPTY_EPSILON_KWH = 0.001;

export const STATE_VERSION = 2;

export function createInitialState() {
  return {
    version: STATE_VERSION,
    stockKwh: 0,
    // Cumulative counters since the integration started counting.
    chargedKwh: 0,
    dischargedKwh: 0,
    importKwh: 0,
    exportKwh: 0,
    uncoveredKwh: 0, // imported while the battery was empty: full price
    savingsEur: 0,
    accounting: true,
    batteryState: null,
    // The day in progress (local source) and the last closed day.
    day: null,
    today: emptyDay(),
    lastDay: null,
    // Source bookkeeping: the last counters seen, the baseline of the next
    // difference. `local` is the Shelly meter (key kept from version 1),
    // `gladys` the readings a Gladys scene sends.
    activeSource: null,
    local: { importWh: null, exportWh: null },
    gladys: { importWh: null, exportWh: null, lastReadingAt: null },
    lastUpdate: null,
    // When the ledger started counting: Gladys asks the integration to price
    // the energy of the Urban Solar contract, and what came before is billed
    // at the full grid price.
    startedAt: null,
    // Coverage history, `[withdrawn kWh, full-price kWh]` per half-hour slot
    // (`slots`, local source, recent weeks) and per day (`days`, every
    // source): which share of the imported energy the battery covered, the
    // basis of the price of the Urban Solar contract.
    slots: {},
    days: {},
  };
}

export function emptyDay(date = null) {
  return { date, chargedKwh: 0, dischargedKwh: 0, uncoveredKwh: 0 };
}

/** Restore a saved state, filling the keys a former version did not have. */
export function restoreState(saved) {
  const initial = createInitialState();
  if (!saved || typeof saved !== 'object') {
    return initial;
  }
  // Version 1: 'local' was the Shelly meter, 'cloud' the removed Linky
  // source (its bookkeeping is dropped).
  const { cloud: _cloud, ...kept } = saved;
  const MIGRATED_SOURCES = { local: 'shelly', cloud: null };
  const activeSource =
    saved.activeSource in MIGRATED_SOURCES
      ? MIGRATED_SOURCES[saved.activeSource]
      : saved.activeSource;
  return {
    ...initial,
    ...kept,
    activeSource: activeSource ?? null,
    today: { ...initial.today, ...saved.today },
    local: { ...initial.local, ...saved.local },
    gladys: { ...initial.gladys, ...saved.gladys },
    slots: { ...saved.slots },
    days: { ...saved.days },
    version: STATE_VERSION,
  };
}

/**
 * Account one interval of meter readings. Mutates `state` and returns what
 * moved in the battery during the interval.
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{ importKwh: number, exportKwh: number }} interval
 * @param {{ grid_price: number, discharge_fee: number } | null} rates the
 *   tariff of the Urban Solar contract in force, null when there is none (the
 *   ledger runs, but no saving can be computed)
 */
export function applyInterval(state, { importKwh, exportKwh }, rates) {
  const imported = Math.max(0, importKwh || 0);
  const exported = Math.max(0, exportKwh || 0);
  state.importKwh += imported;
  state.exportKwh += exported;
  if (!state.accounting) {
    return { chargedKwh: 0, dischargedKwh: 0, uncoveredKwh: 0 };
  }
  const chargedKwh = exported;
  state.stockKwh += chargedKwh;
  const dischargedKwh = Math.min(state.stockKwh, imported);
  state.stockKwh -= dischargedKwh;
  if (state.stockKwh < EMPTY_EPSILON_KWH) {
    state.stockKwh = 0;
  }
  const uncoveredKwh = imported - dischargedKwh;
  state.chargedKwh += chargedKwh;
  state.dischargedKwh += dischargedKwh;
  state.uncoveredKwh += uncoveredKwh;
  if (rates) {
    state.savingsEur += dischargedKwh * Math.max(0, rates.grid_price - rates.discharge_fee);
  }
  return { chargedKwh, dischargedKwh, uncoveredKwh };
}

/**
 * Record which share of an import the battery covered, in the half-hour slot
 * (`slotKey`, optional) and the day (`dayKey`) it happened in.
 */
export function recordCoverage(state, { slotKey = null, dayKey }, moved) {
  const add = (bucket, key) => {
    const entry = bucket[key] ?? [0, 0];
    entry[0] = round(entry[0] + moved.dischargedKwh, 4);
    entry[1] = round(entry[1] + moved.uncoveredKwh, 4);
    bucket[key] = entry;
  };
  if (slotKey) add(state.slots, slotKey);
  add(state.days, dayKey);
}

// Slots kept for the half-hour pricing (beyond, the day ratio is used) and
// days kept at all: the ledger file stays small, and Gladys only recomputes
// recent costs.
export const SLOT_RETENTION_DAYS = 62;
export const DAY_RETENTION_DAYS = 5 * 366;

/** Drop the coverage history older than the retention windows. */
export function pruneCoverage(state, nowMs) {
  const slotLimit = new Date(nowMs - SLOT_RETENTION_DAYS * 86400000).toISOString();
  for (const key of Object.keys(state.slots)) {
    if (key < slotLimit) delete state.slots[key];
  }
  const dayLimit = new Date(nowMs - DAY_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  for (const key of Object.keys(state.days)) {
    if (key < dayLimit) delete state.days[key];
  }
}

/** Start (UTC ISO) of the half-hour slot containing `date`. */
export function slotKeyOf(date) {
  const ms = date.getTime();
  return new Date(ms - (ms % 1800000)).toISOString();
}

/** Add an interval's movements to a day summary. */
export function addToDay(day, moved) {
  day.chargedKwh += moved.chargedKwh;
  day.dischargedKwh += moved.dischargedKwh;
  day.uncoveredKwh += moved.uncoveredKwh;
}

/**
 * State of the battery given the flows of the last interval (instant powers
 * reported with the readings, or the energies of the last interval).
 */
export function batteryStateOf(stockKwh, { importing, exporting }) {
  if (exporting > importing && exporting > 0) {
    return BATTERY_STATES.CHARGING;
  }
  if (stockKwh < EMPTY_EPSILON_KWH) {
    return BATTERY_STATES.EMPTY;
  }
  if (importing > 0) {
    return BATTERY_STATES.DISCHARGING;
  }
  return BATTERY_STATES.IDLE;
}

/** Fill level, in percent of the reference capacity chosen by the user. */
export function levelPercent(stockKwh, capacityKwh) {
  if (!(capacityKwh > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((stockKwh / capacityKwh) * 1000) / 10));
}

/** Share of the imported energy the battery covered, in percent. */
export function coveragePercent(state) {
  const imported = state.dischargedKwh + state.uncoveredKwh;
  if (imported <= 0) return 0;
  return Math.round((state.dischargedKwh / imported) * 1000) / 10;
}

export function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * A number typed in a scene field: the core substitutes the scene variables
 * ({{...}}) into text, so `"12345.6"`, `"12345,6"` or an empty string arrive
 * here. `null` when there is nothing usable (empty, unresolved variable).
 * @throws {RangeError} a value that is there but is not a number
 */
export function parseReading(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Not a number: ${value}`);
    return value;
  }
  const text = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (text === '' || text === 'null' || text === 'undefined' || text.includes('{{')) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new RangeError(`Not a number: ${String(value).slice(0, 40)}`);
  return number;
}
