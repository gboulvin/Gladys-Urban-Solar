import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  isSourceConfigured,
  normalizeConfig,
  normalizeShellyHost,
} from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig coerces numeric strings and bounds them', () => {
  const config = normalizeConfig({ low_stock_kwh: '25', poll_frequency: '10', capacity_kwh: 'x' });
  assert.equal(config.low_stock_kwh, 25);
  assert.equal(config.poll_frequency, 60, 'one minute minimum');
  assert.equal(config.capacity_kwh, DEFAULT_CONFIG.capacity_kwh, 'garbage falls back');
});

test('the Shelly address keeps only a host and an optional port', () => {
  assert.equal(normalizeShellyHost('http://192.168.1.50/'), '192.168.1.50');
  assert.equal(normalizeShellyHost(' shelly-pro3em.local:8080 '), 'shelly-pro3em.local:8080');
  assert.equal(normalizeShellyHost('evil.com/@x?y'), 'evil.com');
  assert.equal(normalizeShellyHost('a b'), '');
  assert.equal(normalizeShellyHost(undefined), '');
});

test('the keys of the removed Linky cloud source are dropped', () => {
  const config = normalizeConfig({ prm: '12345678901234', conso_token: 'secret' });
  assert.equal(config.prm, undefined);
  assert.equal(config.conso_token, undefined, 'a stored token never reaches the code');
  assert.equal(config.GLADYS_PREFER_LOCAL, undefined);
});

test('an unknown model or time zone falls back to the default', () => {
  const config = normalizeConfig({ shelly_model: 'gen1', timezone: 'Mars/Olympus' });
  assert.equal(config.shelly_model, 'em3');
  assert.equal(config.timezone, 'Europe/Paris');
  assert.equal(normalizeConfig({ timezone: 'America/Montreal' }).timezone, 'America/Montreal');
});

test('the Gladys devices are the default source, the Shelly needs its address', () => {
  assert.equal(normalizeConfig().data_source, 'gladys');
  assert.equal(normalizeConfig({ data_source: 'cloud' }).data_source, 'gladys');
  assert.equal(isSourceConfigured(normalizeConfig()), true);
  assert.equal(isSourceConfigured(normalizeConfig({ data_source: 'shelly' })), false);
  assert.equal(
    isSourceConfigured(normalizeConfig({ data_source: 'shelly', shelly_host: '10.0.0.2' })),
    true,
  );
});
