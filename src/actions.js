// -----------------------------------------------------------------------------
// Configuration screen actions (manifest `actions` field): buttons whose
// handler resolves the multi-language message displayed under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DATA_SOURCES, isSourceConfigured } from './config.js';
import { LANGUAGES, t } from './i18n.js';
import { readShelly } from './sources/shelly.js';

const logger = createLogger({ name: 'actions' });

const kwh = (wh) => (wh / 1000).toFixed(1);

/** Join multi-language messages language by language. */
export function joinMessages(messages) {
  const result = {};
  for (const lang of LANGUAGES) {
    result[lang] = messages.map((message) => message[lang]).join(' ');
  }
  return result;
}

/** `2026-11-25 14:05` in `timeZone`: readable in every language. */
function formatDateTime(iso, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * Test the chosen data source: read the Shelly meter, or say what the Gladys
 * scene sent last.
 */
export async function testConnection(config, { engine, fetchImpl = fetch } = {}) {
  if (!isSourceConfigured(config)) {
    return t('status_not_configured');
  }
  if (config.data_source === DATA_SOURCES.SHELLY) {
    try {
      const reading = await readShelly(config, { fetchImpl });
      return t('test_local_ok', {
        import: kwh(reading.importWh),
        export: kwh(reading.exportWh),
        power: Math.round(reading.powerW),
      });
    } catch (err) {
      logger.warn(`Shelly test failed: ${err.message}`);
      return t('test_failed', { source: 'Shelly', error: err.message });
    }
  }
  const { lastReading } = engine.status(config);
  if (!lastReading.at) {
    return t('status_waiting_reading');
  }
  const value = (index) => (index === null ? '–' : index.toFixed(1));
  return t('test_gladys_ok', {
    at: formatDateTime(lastReading.at, config.timezone),
    import: value(lastReading.importKwh),
    export: value(lastReading.exportKwh),
  });
}

/**
 * Handlers of the manifest `actions`, keyed by action `key`.
 * Each one receives `{ fields, config, engine }`.
 */
export const CONFIG_ACTIONS = {
  test_connection: ({ config, engine }) => testConnection(config, { engine }),

  async calibrate_stock({ fields, config, engine }) {
    try {
      const status = await engine.calibrate(fields.stock_kwh, config);
      return t('calibrated', { stock: status.stockKwh });
    } catch (err) {
      if (err instanceof RangeError) return t('invalid_stock');
      throw err;
    }
  },
};
