// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object (forms send strings, users paste URLs), so
// the rest of the code never deals with `undefined` or a malformed value.
// -----------------------------------------------------------------------------

export const SHELLY_MODELS = {
  // Three-phase meters (Pro 3EM, 3EM Gen3): EM + EMData components.
  EM3: 'em3',
  // Single-phase meters (Pro EM, EM Gen3, EM Mini): EM1 + EM1Data components.
  EM1: 'em1',
};

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Local source: a Shelly energy meter on the grid connection.
  shelly_host: '',
  shelly_model: SHELLY_MODELS.EM3,
  // Cloud source: the Linky daily readings, through the free Conso API.
  prm: '',
  conso_token: '',
  // Virtual battery.
  capacity_kwh: 1000,
  grid_price: 0.1952,
  discharge_fee: 0.07,
  low_stock_kwh: 10,
  // Seconds between two reads of the local meter (the cloud readings are
  // daily: they are fetched every few hours whatever this value).
  poll_frequency: 60,
  timezone: 'Europe/Paris',
  // Reserved key (NOT in config_schema): the manifest declares both 'local'
  // and 'cloud' in its `transports` field, so Gladys shows a standard "Prefer
  // the local connection" toggle and sends the user's choice here. When both
  // sources are configured it picks the one used. Read-only, defaults to true.
  GLADYS_PREFER_LOCAL: true,
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
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    shelly_host: normalizeShellyHost(raw.shelly_host ?? ''),
    shelly_model: model,
    // The PRM (point de référence mesure) is the 14-digit Linky meter number.
    prm: String(raw.prm ?? '').replace(/\D/g, ''),
    conso_token: typeof raw.conso_token === 'string' ? raw.conso_token.trim() : '',
    capacity_kwh: toNumber(raw.capacity_kwh, DEFAULT_CONFIG.capacity_kwh, { min: 1 }),
    grid_price: toNumber(raw.grid_price, DEFAULT_CONFIG.grid_price, { min: 0 }),
    discharge_fee: toNumber(raw.discharge_fee, DEFAULT_CONFIG.discharge_fee, { min: 0 }),
    low_stock_kwh: toNumber(raw.low_stock_kwh, DEFAULT_CONFIG.low_stock_kwh, { min: 0 }),
    poll_frequency: toNumber(raw.poll_frequency, DEFAULT_CONFIG.poll_frequency, {
      min: 60,
      max: 3600,
    }),
    timezone: toTimezone(raw.timezone),
    // The preference is a boolean; anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

export function hasLocalSource(config) {
  return config.shelly_host !== '';
}

export function hasCloudSource(config) {
  return config.prm.length === 14 && config.conso_token !== '';
}

/**
 * The sources to try, in order: the preferred one first, the other one as a
 * fallback. Empty when nothing is configured.
 * @returns {Array<'local' | 'cloud'>}
 */
export function sourceOrder(config) {
  const local = hasLocalSource(config);
  const cloud = hasCloudSource(config);
  if (local && cloud) {
    return config.GLADYS_PREFER_LOCAL ? ['local', 'cloud'] : ['cloud', 'local'];
  }
  if (local) return ['local'];
  if (cloud) return ['cloud'];
  return [];
}
