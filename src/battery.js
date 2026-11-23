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
// Within one interval (a local meter read, or one Linky day) the injected
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

export const STATE_VERSION = 1;

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
    // Source bookkeeping.
    activeSource: null,
    local: { importWh: null, exportWh: null, lastDay: null },
    cloud: { lastDay: null, lastFetch: null },
    lastUpdate: null,
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
  return {
    ...initial,
    ...saved,
    today: { ...initial.today, ...saved.today },
    local: { ...initial.local, ...saved.local },
    cloud: { ...initial.cloud, ...saved.cloud },
    version: STATE_VERSION,
  };
}

/**
 * Account one interval of meter readings. Mutates `state` and returns what
 * moved in the battery during the interval.
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{ importKwh: number, exportKwh: number }} interval
 * @param {{ grid_price: number, discharge_fee: number }} config
 */
export function applyInterval(state, { importKwh, exportKwh }, config) {
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
  state.savingsEur += dischargedKwh * Math.max(0, config.grid_price - config.discharge_fee);
  return { chargedKwh, dischargedKwh, uncoveredKwh };
}

/** Add an interval's movements to a day summary. */
export function addToDay(day, moved) {
  day.chargedKwh += moved.chargedKwh;
  day.dischargedKwh += moved.dischargedKwh;
  day.uncoveredKwh += moved.uncoveredKwh;
}

/**
 * State of the battery given the flows of the last interval (instant powers
 * from the local meter, or the energies of the last Linky day).
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
