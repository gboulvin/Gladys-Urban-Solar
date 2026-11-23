import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeConfig } from '../src/config.js';
import {
  BATTERY_FEATURES,
  GRID_FEATURES,
  batteryFeatureId,
  gridFeatureId,
} from '../src/devices/index.js';
import { SCENE_TRIGGERS } from '../src/engine.js';
import {
  BOTH_CONFIG,
  CLOUD_CONFIG,
  LOCAL_CONFIG,
  createClock,
  createMemoryStore,
  createTestEngine,
} from './helpers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const stockOf = (gladys) => gladys.fake.lastState(batteryFeatureId(gladys, BATTERY_FEATURES.STOCK));
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('the local source follows the Shelly counters between two reads', async () => {
  const { gladys, network, engine, clock } = await createTestEngine();
  await engine.calibrate(100, LOCAL_CONFIG);

  await engine.refresh(LOCAL_CONFIG); // baseline read: nothing accounted
  assert.equal(engine.status(LOCAL_CONFIG).stockKwh, 100);

  network.shelly.exportWh += 3000; // 3 kWh injected
  network.shelly.importWh += 1000; // 1 kWh imported
  network.shelly.powerW = -1500;
  clock.advance(60000);
  await engine.refresh(LOCAL_CONFIG);

  const status = engine.status(LOCAL_CONFIG);
  assert.equal(status.stockKwh, 102);
  assert.equal(status.state, 'charging');
  assert.deepEqual(status.transport.transport, 'local');
  assert.equal(stockOf(gladys), 102);
  assert.equal(
    gladys.fake.lastState(batteryFeatureId(gladys, BATTERY_FEATURES.CHARGE_POWER)),
    1500,
  );
  assert.equal(gladys.fake.lastState(gridFeatureId(gladys, GRID_FEATURES.EXPORT_POWER)), 1500);
  assert.equal(gladys.fake.lastState(gridFeatureId(gladys, GRID_FEATURES.IMPORT_INDEX)), 1);
});

test('a read is skipped until the refresh interval is over, unless forced', async () => {
  const { network, engine, clock } = await createTestEngine();
  assert.ok(await engine.refresh(LOCAL_CONFIG));
  const requests = network.requests.length;
  clock.advance(10000);
  assert.equal(await engine.refresh(LOCAL_CONFIG), null);
  assert.equal(network.requests.length, requests);
  assert.ok(await engine.refresh(LOCAL_CONFIG, { force: true }));
});

test('emptying the battery fires the state change and the low stock triggers', async () => {
  const { gladys, network, engine, clock } = await createTestEngine();
  const config = normalizeConfig({ ...LOCAL_CONFIG, low_stock_kwh: 10 });
  await engine.calibrate(12, config);
  network.shelly.powerW = 500;
  await engine.refresh(config);
  assert.equal(engine.status(config).state, 'discharging');

  network.shelly.importWh += 5000; // 12 -> 7 kWh: below the threshold
  clock.advance(60000);
  await engine.refresh(config);
  const [low] = eventsOf(gladys, SCENE_TRIGGERS.LOW_STOCK);
  assert.deepEqual(low.data, { stock_kwh: 7, threshold_kwh: 10 });

  network.shelly.importWh += 10000; // 7 kWh left, 10 kWh imported
  clock.advance(60000);
  await engine.refresh(config);
  const status = engine.status(config);
  assert.equal(status.stockKwh, 0);
  assert.equal(status.uncoveredKwh, 3);
  assert.equal(status.state, 'empty');
  const changes = eventsOf(gladys, SCENE_TRIGGERS.STATE_CHANGED).map((event) => event.data.state);
  assert.deepEqual(changes, ['discharging', 'empty']);
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.LOW_STOCK).length, 1, 'one event per crossing');
});

test('the local source closes each day with a daily summary', async () => {
  const clock = createClock('2026-06-15T20:00:00Z'); // 22:00 in Paris
  const { gladys, network, engine } = await createTestEngine({ clock });
  await engine.refresh(LOCAL_CONFIG);
  network.shelly.exportWh += 4000;
  clock.advance(60000);
  await engine.refresh(LOCAL_CONFIG);
  clock.set('2026-06-15T22:30:00Z'); // 00:30 in Paris, the next day
  await engine.refresh(LOCAL_CONFIG);
  const [summary] = eventsOf(gladys, SCENE_TRIGGERS.DAILY_SUMMARY);
  assert.equal(summary.data.date, '2026-06-15');
  assert.equal(summary.data.charged_kwh, 4);
  assert.equal(engine.status(LOCAL_CONFIG).today.date, '2026-06-16');
});

test('counters going backwards (meter replaced) start over without a negative delta', async () => {
  const { network, engine, clock } = await createTestEngine();
  await engine.calibrate(50, LOCAL_CONFIG);
  await engine.refresh(LOCAL_CONFIG);
  network.shelly.importWh = 10;
  clock.advance(60000);
  await engine.refresh(LOCAL_CONFIG);
  assert.equal(engine.status(LOCAL_CONFIG).stockKwh, 50);
  network.shelly.importWh = 1010;
  clock.advance(60000);
  await engine.refresh(LOCAL_CONFIG);
  assert.equal(engine.status(LOCAL_CONFIG).stockKwh, 49);
});

test('the cloud source accounts one Linky day at a time, and only once', async () => {
  const { gladys, network, engine, clock } = await createTestEngine();
  network.conso = {
    consumption: { '2026-06-14': 6000 },
    production: { '2026-06-14': 15000 },
  };
  await engine.calibrate(20, CLOUD_CONFIG);
  await engine.refresh(CLOUD_CONFIG);
  let status = engine.status(CLOUD_CONFIG);
  assert.equal(status.stockKwh, 29);
  assert.equal(status.transport.transport, 'cloud');
  assert.equal(status.lastDay.date, '2026-06-14');
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.DAILY_SUMMARY).length, 1);

  // An hour later: not due yet (the readings are daily).
  clock.advance(60 * 60 * 1000);
  const requests = network.requests.length;
  await engine.refresh(CLOUD_CONFIG);
  assert.equal(network.requests.length, requests);

  // The next day: the new reading only.
  network.conso.consumption['2026-06-15'] = 30000;
  network.conso.production['2026-06-15'] = 1000;
  clock.advance(24 * 60 * 60 * 1000);
  await engine.refresh(CLOUD_CONFIG);
  status = engine.status(CLOUD_CONFIG);
  assert.equal(status.stockKwh, 0);
  assert.equal(status.dischargedKwh, 36);
  assert.equal(status.uncoveredKwh, 0);
  assert.equal(status.lastDay.uncoveredKwh, 0);
});

test('the cloud source waits for a missing recent day instead of skipping it', async () => {
  const clock = createClock('2026-06-15T10:00:00Z');
  const store = createMemoryStore();
  const first = await createTestEngine({ clock, store });
  first.network.conso = { consumption: { '2026-06-14': 1000 }, production: { '2026-06-14': 2000 } };
  await first.engine.refresh(CLOUD_CONFIG);

  clock.set('2026-06-18T10:00:00Z');
  const { network, engine } = await createTestEngine({ clock, store });
  network.conso = {
    consumption: { '2026-06-16': 1000, '2026-06-17': 1000 },
    production: { '2026-06-16': 5000, '2026-06-17': 5000 },
  };
  await engine.refresh(CLOUD_CONFIG);
  assert.equal(engine.status(CLOUD_CONFIG).lastDay.date, '2026-06-14', '06-15 is still missing');
});

test('a failing preferred source falls back to the other one, flagged degraded', async () => {
  const { gladys, network, engine } = await createTestEngine();
  network.shellyDown = true;
  network.conso = { consumption: { '2026-06-14': 1000 }, production: { '2026-06-14': 3000 } };
  await engine.refresh(BOTH_CONFIG);
  const { transport } = engine.status(BOTH_CONFIG);
  assert.equal(transport.transport, 'cloud');
  assert.equal(transport.degraded, true);
  assert.ok(transport.message.fr);
  const entry = gladys.fake.transports.at(-1);
  assert.equal(entry.transport, 'cloud');
  assert.equal(entry.degraded, true);
});

test('a day accounted by the local meter is never accounted again from the cloud', async () => {
  const { network, engine, clock } = await createTestEngine();
  await engine.refresh(BOTH_CONFIG); // local baseline, 2026-06-15
  network.shelly.exportWh += 2000;
  clock.advance(60000);
  await engine.refresh(BOTH_CONFIG);
  assert.equal(engine.status(BOTH_CONFIG).stockKwh, 2);

  // The next day the Shelly goes down: the 15th is published in the cloud.
  network.shellyDown = true;
  network.conso = { consumption: { '2026-06-15': 0 }, production: { '2026-06-15': 9000 } };
  clock.advance(24 * 60 * 60 * 1000);
  await engine.refresh(BOTH_CONFIG);
  assert.equal(engine.status(BOTH_CONFIG).transport.source, 'cloud');
  assert.equal(engine.status(BOTH_CONFIG).stockKwh, 2, 'the 15th is not counted twice');
});

test('without any source the integration reports it is not configured', async () => {
  const { gladys, engine } = await createTestEngine();
  const result = await engine.refresh(normalizeConfig());
  assert.equal(result.ok, false);
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('an unreachable source is reported in the connection status', async () => {
  const { gladys, network, engine } = await createTestEngine();
  network.shellyDown = true;
  const result = await engine.refresh(LOCAL_CONFIG);
  assert.equal(result.ok, false);
  assert.match(result.error, /EHOSTUNREACH/);
  assert.equal(engine.status(LOCAL_CONFIG).transport.transport, 'unreachable');
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('the ledger survives a restart', async () => {
  const store = createMemoryStore();
  const first = await createTestEngine({ store });
  await first.engine.calibrate(321.5, LOCAL_CONFIG);
  const second = await createTestEngine({ store });
  assert.equal(second.engine.status(LOCAL_CONFIG).stockKwh, 321.5);
});

test('pausing the accounting freezes the stock and publishes the switch', async () => {
  const { gladys, network, engine, clock } = await createTestEngine();
  await engine.calibrate(10, LOCAL_CONFIG);
  await engine.refresh(LOCAL_CONFIG);
  await engine.setAccounting(false, LOCAL_CONFIG);
  network.shelly.importWh += 4000;
  clock.advance(60000);
  await engine.refresh(LOCAL_CONFIG);
  assert.equal(engine.status(LOCAL_CONFIG).stockKwh, 10);
  assert.equal(gladys.fake.lastState(batteryFeatureId(gladys, BATTERY_FEATURES.ACCOUNTING)), 0);
});

test('calibrate refuses a stock out of range', async () => {
  const { engine } = await createTestEngine();
  await assert.rejects(engine.calibrate(-1, LOCAL_CONFIG), RangeError);
  await assert.rejects(engine.calibrate('abc', LOCAL_CONFIG), RangeError);
});

test('every event only carries keys its trigger declares', async () => {
  const { gladys, network, engine, clock } = await createTestEngine({
    clock: createClock('2026-06-15T21:58:00Z'),
  });
  const config = normalizeConfig({ ...LOCAL_CONFIG, low_stock_kwh: 5 });
  await engine.calibrate(6, config);
  network.shelly.powerW = 2000;
  await engine.refresh(config);
  network.shelly.importWh += 6000;
  network.shelly.powerW = 300;
  clock.set('2026-06-15T22:01:00Z');
  await engine.refresh(config);
  const keys = new Set(gladys.fake.sceneEvents.map((event) => event.key));
  assert.deepEqual(keys, new Set(Object.values(SCENE_TRIGGERS)), 'every trigger fired');
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
    const declared = [...(trigger.fields ?? []), ...(trigger.variables ?? [])].map((f) => f.key);
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}.${name} is not declared, the core would drop it`);
      assert.ok(value === null || typeof value !== 'object', `${key}.${name} must be a primitive`);
    }
  }
});
