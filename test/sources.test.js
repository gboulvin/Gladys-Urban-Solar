import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { readShelly } from '../src/sources/shelly.js';
import { LOCAL_CONFIG, createNetwork } from './helpers.js';

test('readShelly reads the three-phase counters and power', async () => {
  const network = createNetwork();
  network.shelly = { importWh: 1234, exportWh: 567, powerW: -890 };
  const reading = await readShelly(LOCAL_CONFIG, { fetchImpl: network.fetch });
  assert.deepEqual(reading, { importWh: 1234, exportWh: 567, powerW: -890 });
  assert.ok(network.requests.every(({ url }) => url.href.startsWith('http://192.168.1.50/rpc/')));
});

test('readShelly reads the single-phase components with the em1 model', async () => {
  const network = createNetwork();
  network.shelly = { importWh: 10, exportWh: 20, powerW: 30 };
  const config = normalizeConfig({ shelly_host: '192.168.1.50', shelly_model: 'em1' });
  assert.deepEqual(await readShelly(config, { fetchImpl: network.fetch }), {
    importWh: 10,
    exportWh: 20,
    powerW: 30,
  });
  assert.ok(network.requests.some(({ url }) => url.pathname === '/rpc/EM1Data.GetStatus'));
});

test('readShelly refuses an answer without the expected counters', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ id: 0 }) });
  await assert.rejects(readShelly(LOCAL_CONFIG, { fetchImpl }), /wrong meter model/);
});
