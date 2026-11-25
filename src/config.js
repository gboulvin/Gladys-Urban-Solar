// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object (forms send strings, users paste URLs), so
// the rest of the code never deals with `undefined` or a malformed value.
// -----------------------------------------------------------------------------

// Where the meter readings come from: one source at a time, so the same
// energy is never counted twice.
export const DATA_SOURCES = {
  // Devices already in Gladys (the meter of the energy monitoring, a Shelly
  // or a current clamp of another integration...): a Gladys scene reads their
  // values and passes them to the "Record a meter reading" scene action. An
  // external integration cannot read the devices of other integrations
  // itself.
  GLADYS: 'gladys',
  // A Shelly energy meter, read directly by the integration over the LAN.
  SHELLY: 'shelly',
};

export const SHELLY_MODELS = {
  // Three-phase meters (Pro 3EM, 3EM Gen3): EM + EMData components.
  EM3: 'em3',
  // Single-phase meters (Pro EM, EM Gen3, EM Mini): EM1 + EM1Data components.
  EM1: 'em1',
};

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  data_source: DATA_SOURCES.GLADYS,
  // Shelly source: a Shelly energy meter on the grid connection.
  shelly_host: '',
  shelly_model: SHELLY_MODELS.EM3,
  // Virtual battery. The prices are NOT here: they come from the Urban Solar
  // energy contract the user creates in Gladys (src/tariffs.js).
  capacity_kwh: 1000,
  low_stock_kwh: 10,
  // Seconds between two reads of the Shelly meter.
  poll_frequency: 60,
  timezone: 'Europe/Paris',
};

const SHELLY_HOST_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?(:\d{1,5})?$/;

function toNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function toTimezone(value) {
  const zone = typeof value === 'string' ? value.trim() : '';
  if (!zone) {
    return DEFAULT_CONFIG.timezone;
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_CONFIG.timezone;
  }
}

/**
 * Keep only a host name or IP address with an optional port: users often paste
 * `http://192.168.1.50/` from their browser. Anything else is dropped, so the
 * integration never requests an arbitrary URL.
 */
export function normalizeShellyHost(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const host = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
  return SHELLY_HOST_PATTERN.test(host) ? host : '';
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const model = Object.values(SHELLY_MODELS).includes(raw.shelly_model)
    ? raw.shelly_model
    : DEFAULT_CONFIG.shelly_model;
  const source = Object.values(DATA_SOURCES).includes(raw.data_source)
    ? raw.data_source
    : DEFAULT_CONFIG.data_source;
  // Keys of the removed Linky cloud source (version 2), still stored by older
  // installations: dropped, so they never reach the logs or the code.
  const { prm: _prm, conso_token: _token, GLADYS_PREFER_LOCAL: _prefer, ...rest } = raw;
  return {
    ...DEFAULT_CONFIG,
    ...rest,
    data_source: source,
    shelly_host: normalizeShellyHost(raw.shelly_host ?? ''),
    shelly_model: model,
    capacity_kwh: toNumber(raw.capacity_kwh, DEFAULT_CONFIG.capacity_kwh, { min: 1 }),
    low_stock_kwh: toNumber(raw.low_stock_kwh, DEFAULT_CONFIG.low_stock_kwh, { min: 0 }),
    poll_frequency: toNumber(raw.poll_frequency, DEFAULT_CONFIG.poll_frequency, {
      min: 60,
      max: 3600,
    }),
    timezone: toTimezone(raw.timezone),
  };
}

/** Whether the chosen source has what it needs to run. */
export function isSourceConfigured(config) {
  return config.data_source === DATA_SOURCES.GLADYS || config.shelly_host !== '';
}
