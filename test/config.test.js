import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  hasCloudSource,
  hasLocalSource,
  normalizeConfig,
  normalizeShellyHost,
  sourceOrder,
} from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig coerces numeric strings and bounds them', () => {
  const config = normalizeConfig({ grid_price: '0.25', poll_frequency: '10', capacity_kwh: 'x' });
  assert.equal(config.grid_price, 0.25);
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

test('the PRM keeps its digits only, and the cloud source needs 14 of them and a token', () => {
  assert.equal(normalizeConfig({ prm: '123 456 789 012 34' }).prm, '12345678901234');
  assert.equal(hasCloudSource(normalizeConfig({ prm: '12345678901234' })), false);
  assert.equal(hasCloudSource(normalizeConfig({ prm: '1234', conso_token: 't' })), false);
  assert.equal(hasCloudSource(normalizeConfig({ prm: '12345678901234', conso_token: 't' })), true);
});

test('an unknown model or time zone falls back to the default', () => {
  const config = normalizeConfig({ shelly_model: 'gen1', timezone: 'Mars/Olympus' });
  assert.equal(config.shelly_model, 'em3');
  assert.equal(config.timezone, 'Europe/Paris');
  assert.equal(normalizeConfig({ timezone: 'America/Montreal' }).timezone, 'America/Montreal');
});

test('sourceOrder follows the "Prefer the local connection" toggle', () => {
  const both = { shelly_host: '10.0.0.2', prm: '12345678901234', conso_token: 't' };
  assert.deepEqual(sourceOrder(normalizeConfig(both)), ['local', 'cloud']);
  assert.deepEqual(sourceOrder(normalizeConfig({ ...both, GLADYS_PREFER_LOCAL: false })), [
    'cloud',
    'local',
  ]);
  assert.deepEqual(sourceOrder(normalizeConfig({ shelly_host: '10.0.0.2' })), ['local']);
  assert.deepEqual(sourceOrder(normalizeConfig()), []);
  assert.equal(hasLocalSource(normalizeConfig()), false);
});
