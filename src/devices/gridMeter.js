// -----------------------------------------------------------------------------
// Device: the GRID CONNECTION seen by the virtual battery.
//
// A `grid-sensor` device: the instant import / export powers (when the
// readings carry them), the energies imported from and injected into the grid since the integration started counting, and the
// share of the import the battery could not cover — billed at the full price.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

const DEVICE_TYPE = 'grid-meter';
const PLATFORM_ID = 'urban-solar';

export const GRID_FEATURES = {
  IMPORT_POWER: 'import-power',
  EXPORT_POWER: 'export-power',
  IMPORT_INDEX: 'import-index',
  EXPORT_INDEX: 'export-index',
  UNCOVERED_INDEX: 'uncovered-index',
};

const MAX_POWER_W = 36000;
const MAX_ENERGY_KWH = 10000000;

export const gridMeter = {
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
      name: 'Urban Solar grid connection',
      external_id: ids.device,
      features: [
        sensor(
          GRID_FEATURES.IMPORT_POWER,
          'Grid import power',
          CATEGORIES.GRID_SENSOR,
          TYPES.GRID_SENSOR.INPUT_POWER,
          UNITS.WATT,
          MAX_POWER_W,
        ),
        sensor(
          GRID_FEATURES.EXPORT_POWER,
          'Grid export power',
          CATEGORIES.GRID_SENSOR,
          TYPES.GRID_SENSOR.OUTPUT_POWER,
          UNITS.WATT,
          MAX_POWER_W,
        ),
        sensor(
          GRID_FEATURES.IMPORT_INDEX,
          'Grid import',
          CATEGORIES.GRID_SENSOR,
          TYPES.GRID_SENSOR.INPUT_INDEX,
          UNITS.KILOWATT_HOUR,
          MAX_ENERGY_KWH,
        ),
        sensor(
          GRID_FEATURES.EXPORT_INDEX,
          'Grid export',
          CATEGORIES.GRID_SENSOR,
          TYPES.GRID_SENSOR.OUTPUT_INDEX,
          UNITS.KILOWATT_HOUR,
          MAX_ENERGY_KWH,
        ),
        sensor(
          GRID_FEATURES.UNCOVERED_INDEX,
          'Grid import at full price',
          CATEGORIES.ENERGY_SENSOR,
          TYPES.ENERGY_SENSOR.INDEX,
          UNITS.KILOWATT_HOUR,
          MAX_ENERGY_KWH,
        ),
      ],
    };
  },
};
