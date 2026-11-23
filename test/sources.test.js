import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { readDailyEnergy } from '../src/sources/conso.js';
import { readShelly } from '../src/sources/shelly.js';
import { CLOUD_CONFIG, LOCAL_CONFIG, createNetwork } from './helpers.js';

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

test('readDailyEnergy pairs the daily consumption and production readings', async () => {
  const network = createNetwork();
  network.conso = {
    consumption: { '2026-06-12': 8000, '2026-06-13': 9000, '2026-06-14': 7000 },
    production: { '2026-06-12': 12000, '2026-06-13': 3000 },
  };
  const days = await readDailyEnergy(CLOUD_CONFIG, {
    from: '2026-06-12',
    to: '2026-06-15',
    fetchImpl: network.fetch,
  });
  assert.deepEqual(days, [
    { date: '2026-06-12', importWh: 8000, exportWh: 12000 },
    { date: '2026-06-13', importWh: 9000, exportWh: 3000 },
  ]);
  const [{ url, init }] = network.requests;
  assert.equal(url.searchParams.get('pointId'), CLOUD_CONFIG.prm);
  assert.equal(init.headers.Authorization, 'Bearer token');
  assert.ok(init.headers['User-Agent'], 'the API asks clients to identify themselves');
});

test('readDailyEnergy reports an HTTP error without leaking the body', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ token: 'x' }) });
  await assert.rejects(
    readDailyEnergy(CLOUD_CONFIG, { from: '2026-06-01', to: '2026-06-02', fetchImpl }),
    (err) => err.message === 'Conso API consommation_quotidienne answered HTTP 401',
  );
});
