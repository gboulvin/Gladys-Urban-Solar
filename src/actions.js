// -----------------------------------------------------------------------------
// Configuration screen actions (manifest `actions` field): buttons whose
// handler resolves the multi-language message displayed under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasCloudSource, hasLocalSource } from './config.js';
import { addDays, localDay } from './dates.js';
import { LANGUAGES, t } from './i18n.js';
import { readDailyEnergy } from './sources/conso.js';
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

/** Test every configured source and say what each one answers. */
export async function testConnection(config, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const messages = [];
  if (hasLocalSource(config)) {
    try {
      const reading = await readShelly(config, { fetchImpl });
      messages.push(
        t('test_local_ok', {
          import: kwh(reading.importWh),
          export: kwh(reading.exportWh),
          power: Math.round(reading.powerW),
        }),
      );
    } catch (err) {
      logger.warn(`Shelly test failed: ${err.message}`);
      messages.push(t('test_failed', { source: 'Shelly', error: err.message }));
    }
  }
  if (hasCloudSource(config)) {
    try {
      const today = localDay(now(), config.timezone);
      const days = await readDailyEnergy(config, {
        from: addDays(today, -7),
        to: today,
        fetchImpl,
      });
      const last = days.at(-1);
      messages.push(
        last
          ? t('test_cloud_ok', {
              date: last.date,
              import: kwh(last.importWh),
              export: kwh(last.exportWh),
            })
          : t('test_cloud_empty'),
      );
    } catch (err) {
      logger.warn(`Linky test failed: ${err.message}`);
      messages.push(t('test_failed', { source: 'Linky', error: err.message }));
    }
  }
  return messages.length > 0 ? joinMessages(messages) : t('status_not_configured');
}

/**
 * Handlers of the manifest `actions`, keyed by action `key`.
 * Each one receives `{ fields, config, engine }`.
 */
export const CONFIG_ACTIONS = {
  test_connection: ({ config }) => testConnection(config),

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
