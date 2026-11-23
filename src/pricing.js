// -----------------------------------------------------------------------------
// Delegated pricing of the Urban Solar contract (onEnergyPrice /
// onEnergyCurrent).
//
// Gladys sends the half-hour consumption intervals of the meter linked to the
// contract; each one is priced with the share of the import the virtual
// battery covered at that time, read from the coverage history of the ledger:
//
//   cost = kWh x (covered x withdrawal fee + (1 - covered) x grid price)
//
// The answer must be deterministic (Gladys retries a request with the same
// state), so it only depends on the recorded history, never on the stock of
// the moment. The half-hour slot is used when the local meter recorded it,
// the day otherwise (the Linky readings are daily). A recent interval the
// ledger has not accounted yet (the Linky readings arrive the next day) fails
// the request, which Gladys retries later; an older unknown one, or one from
// before the ledger started, is billed at the full grid price.
// -----------------------------------------------------------------------------

import { slotKeyOf } from './battery.js';
import { localDay } from './dates.js';
import { ratesFromInputs } from './tariffs.js';

// How long an unaccounted interval is waited for before being given up.
const WAIT_FOR_DATA_MS = 3 * 86400000;

export class DataNotReadyError extends Error {}

/** `[withdrawn, full-price]` share of the import, from one history entry. */
function ratioOf(entry) {
  if (!entry) return null;
  const total = entry[0] + entry[1];
  // Nothing imported in that slot or day according to the ledger's own
  // meter: nothing was billed at full price, the battery covered it all.
  return total > 0 ? entry[0] / total : 1;
}

/**
 * Covered share (0..1) of an import at `startsAt`.
 * @param {{ slots: object, days: object, startedAt: string | null }} state
 */
export function coveredShare(state, startsAt, { timeZone, nowMs }) {
  const date = new Date(startsAt);
  const slot = state.slots[slotKeyOf(date)];
  // A slot with no import recorded falls back to its day.
  if (slot && slot[0] + slot[1] > 0) return ratioOf(slot);
  const day = ratioOf(state.days[localDay(date, timeZone)]);
  if (day !== null) return day;
  if (!state.startedAt || date.toISOString() < state.startedAt) return 0;
  if (nowMs - date.getTime() < WAIT_FOR_DATA_MS) {
    throw new DataNotReadyError(`No meter reading accounted yet for ${date.toISOString()}`);
  }
  return 0;
}

const LABELS = {
  battery: 'Urban Solar virtual battery',
  grid: 'Grid (full price)',
  mixed: 'Virtual battery + grid',
};

function labelOf(share) {
  if (share >= 0.999) return LABELS.battery;
  if (share <= 0.001) return LABELS.grid;
  return LABELS.mixed;
}

const money = (value) => Math.round(value * 1e6) / 1e6;

/**
 * Answer an energy-contract.price request: one cost per interval.
 * @param {import('@gladysassistant/integration-sdk').EnergyPriceRequest} request
 */
export function priceIntervals(state, request, { timeZone, nowMs }) {
  const rates = ratesFromInputs(request.contract.inputs);
  if (!rates) {
    throw new Error('The contract has no valid grid price or withdrawal fee');
  }
  return request.intervals.map(({ starts_at: startsAt, kwh }) => {
    const share = coveredShare(state, startsAt, { timeZone, nowMs });
    const battery = money(kwh * share * rates.discharge_fee);
    const grid = money(kwh * (1 - share) * rates.grid_price);
    return {
      starts_at: startsAt,
      cost: money(battery + grid),
      components: { battery, grid },
      label: labelOf(share),
    };
  });
}

/**
 * Answer an energy-contract.current request: a kWh drawn now comes out of the
 * virtual battery while it holds energy, from the grid at full price once it
 * is empty (or while the accounting is paused).
 */
export function currentPrice({ stockKwh, accounting }, request) {
  const rates = ratesFromInputs(request.contract.inputs);
  if (!rates) return { price: null };
  const fromBattery = accounting && stockKwh > 0;
  return {
    price: fromBattery ? rates.discharge_fee : rates.grid_price,
    label: fromBattery ? LABELS.battery : LABELS.grid,
    valid_until: null,
  };
}
