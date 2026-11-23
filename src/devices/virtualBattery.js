// -----------------------------------------------------------------------------
// Device: the Urban Solar VIRTUAL BATTERY.
//
// A `battery-storage` device whose features mirror the ledger of src/engine.js:
// the stock (energy remaining), the fill level against the reference capacity,
// the live charge / discharge powers, the cumulative stored / withdrawn
// energies and the money saved. One feature is controllable: the accounting
// switch, to pause the ledger (meter swap, maintenance, test injections).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

const DEVICE_TYPE = 'virtual-battery';

// There is one virtual battery per Urban Solar contract, and one contract per
// integration: a fixed platform id keeps the external ids stable for ever,
// even when the user switches between the local and the cloud source.
const PLATFORM_ID = 'urban-solar';

export const BATTERY_FEATURES = {
  STOCK: 'stock',
  LEVEL: 'level',
  CHARGE_POWER: 'charge-power',
  DISCHARGE_POWER: 'discharge-power',
  CHARGED: 'charged',
  DISCHARGED: 'discharged',
  SAVINGS: 'savings',
  ACCOUNTING: 'accounting',
};

// A single-phase 12 kVA or three-phase 36 kVA connection is the residential
// ceiling: the powers cannot exceed it.
const MAX_POWER_W = 36000;
const MAX_ENERGY_KWH = 10000000;

export const virtualBattery = {
  key: DEVICE_TYPE,

  ids(gladys) {
    return gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);
  },

  deviceExternalId(gladys) {
    return this.ids(gladys).device;
  },

  buildDevice(gladys) {
    const ids = this.ids(gladys);
    const sensor = (key, name, category, type, unit, max) => ({
      name,
      external_id: ids.feature(key),
      category,
      type,
      unit,
      min: 0,
      max,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    });
    return {
      name: 'Urban Solar virtual battery',
      external_id: ids.device,
      features: [
        sensor(
          BATTERY_FEATURES.STOCK,
          'Stock',
          CATEGORIES.BATTERY_STORAGE,
          TYPES.BATTERY_STORAGE.BATTERY_ENERGY_REMAINING,
          UNITS.KILOWATT_HOUR,
          MAX_ENERGY_KWH,
        ),
        sensor(
          BATTERY_FEATURES.LEVEL,
          'Level',
          CATEGORIES.BATTERY_STORAGE,
          TYPES.BATTERY_STORAGE.BATTERY_LEVEL,
          UNITS.PERCENT,
          100,
        ),
        sensor(
          BATTERY_FEATURES.CHARGE_POWER,
          'Charge power',
          CATEGORIES.BATTERY_STORAGE,
          TYPES.BATTERY_STORAGE.CHARGE_POWER,
          UNITS.WATT,
          MAX_POWER_W,
        ),
        sensor(
          BATTERY_FEATURES.DISCHARGE_POWER,
          'Discharge power',
          CATEGORIES.BATTERY_STORAGE,
          TYPES.BATTERY_STORAGE.DISCHARGE_POWER,
          UNITS.WATT,
          MAX_POWER_W,
        ),
        sensor(
          BATTERY_FEATURES.CHARGED,
          'Total stored',
          CATEGORIES.BATTERY_STORAGE,
          TYPES.BATTERY_STORAGE.CHARGE_INDEX,
          UNITS.KILOWATT_HOUR,
          MAX_ENERGY_KWH,
        ),
        sensor(
          BATTERY_FEATURES.DISCHARGED,
          'Total withdrawn',
          CATEGORIES.BATTERY_STORAGE,
          TYPES.BATTERY_STORAGE.DISCHARGE_INDEX,
          UNITS.KILOWATT_HOUR,
          MAX_ENERGY_KWH,
        ),
        sensor(
          BATTERY_FEATURES.SAVINGS,
          'Savings',
          CATEGORIES.CURRENCY,
          TYPES.CURRENCY.DECIMAL,
          UNITS.EURO,
          MAX_ENERGY_KWH,
        ),
        {
          name: 'Accounting',
          external_id: ids.feature(BATTERY_FEATURES.ACCOUNTING),
          category: CATEGORIES.SWITCH,
          type: TYPES.SWITCH.BINARY,
          min: 0,
          max: 1,
          read_only: false, // the one control of the battery
          has_feedback: true,
          keep_history: true,
        },
      ],
    };
  },
};
