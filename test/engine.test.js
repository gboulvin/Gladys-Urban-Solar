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
  GLADYS_CONFIG,
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

test('the Gladys source accounts the indexes a scene sends', async () => {
  const { gladys, engine, clock } = await createTestEngine();
  await engine.calibrate(100, GLADYS_CONFIG);
  const first = await engine.recordReading(
    { import_index: '12000.5', export_index: '8000', unit: 'kwh' },
    GLADYS_CONFIG,
  );
  assert.deepEqual(first, {
    accepted: true,
    imported_kwh: 0,
    exported_kwh: 0,
    stored_kwh: 0,
    withdrawn_kwh: 0,
    stock_kwh: 100,
  });

  clock.advance(5 * 60000);
  const second = await engine.recordReading(
    { import_index: '12001,5', export_index: '8003', unit: 'kwh', export_power: '2400' },
    GLADYS_CONFIG,
  );
  assert.equal(second.imported_kwh, 1);
  assert.equal(second.exported_kwh, 3);
  assert.equal(second.stock_kwh, 102);
  const status = engine.status(GLADYS_CONFIG);
  assert.equal(status.transport.source, 'gladys');
  assert.equal(status.transport.transport, 'local');
  assert.equal(status.state, 'charging');
  assert.equal(stockOf(gladys), 102);
  assert.equal(gladys.fake.lastState(gridFeatureId(gladys, GRID_FEATURES.EXPORT_POWER)), 2400);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('the same reading sent twice counts nothing, and Wh indexes are converted', async () => {
  const { engine, clock } = await createTestEngine();
  await engine.calibrate(10, GLADYS_CONFIG);
  const reading = { import_index: '5000000', unit: 'wh' };
  await engine.recordReading(reading, GLADYS_CONFIG);
  clock.advance(60000);
  await engine.recordReading({ import_index: '5002000', unit: 'wh' }, GLADYS_CONFIG);
  clock.advance(60000);
  const again = await engine.recordReading({ import_index: '5002000', unit: 'wh' }, GLADYS_CONFIG);
  assert.equal(again.imported_kwh, 0);
  assert.equal(engine.status(GLADYS_CONFIG).stockKwh, 8);
});

test('the import and the export may come from different devices, in separate readings', async () => {
  const { engine, clock } = await createTestEngine();
  await engine.recordReading({ import_index: '100' }, GLADYS_CONFIG);
  await engine.recordReading({ export_index: '50' }, GLADYS_CONFIG);
  clock.advance(60000);
  await engine.recordReading({ export_index: '56' }, GLADYS_CONFIG);
  await engine.recordReading({ import_index: '102' }, GLADYS_CONFIG);
  assert.equal(engine.status(GLADYS_CONFIG).stockKwh, 4);
});

test('a reading is refused when it carries no index, a bad number, or the source is the Shelly', async () => {
  const { engine } = await createTestEngine();
  await assert.rejects(engine.recordReading({ import_index: '' }, GLADYS_CONFIG), /No index/);
  await assert.rejects(
    engine.recordReading({ import_index: '{{0.0.last_value}}' }, GLADYS_CONFIG),
    /No index/,
  );
  await assert.rejects(engine.recordReading({ import_index: 'abc' }, GLADYS_CONFIG), RangeError);
  await assert.rejects(engine.recordReading({ import_index: '-3' }, GLADYS_CONFIG), RangeError);
  await assert.rejects(engine.recordReading({ import_index: '1' }, LOCAL_CONFIG), /Shelly/);
});

test('the Gladys source reports a scene that has not sent anything, or stopped', async () => {
  const { gladys, engine, clock } = await createTestEngine();
  let result = await engine.refresh(GLADYS_CONFIG);
  assert.equal(result.ok, false);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /premier relevé/);

  await engine.recordReading({ import_index: '1' }, GLADYS_CONFIG);
  assert.equal(gladys.fake.connectionStatus.connected, true);

  clock.advance(3 * 60 * 60 * 1000);
  result = await engine.refresh(GLADYS_CONFIG);
  assert.equal(result.ok, false);
  assert.match(gladys.fake.connectionStatus.message.en, /180 minutes/);
  assert.equal(engine.status(GLADYS_CONFIG).transport.degraded, true);
  assert.equal(gladys.fake.transports.at(-1).degraded, true);
});

test('switching sources starts over from the next reading of the new one', async () => {
  const { network, engine, clock } = await createTestEngine();
  await engine.calibrate(50, GLADYS_CONFIG);
  await engine.recordReading({ import_index: '100' }, GLADYS_CONFIG);
  await engine.refresh(LOCAL_CONFIG, { force: true }); // Shelly baseline
  network.shelly.importWh += 2000;
  clock.advance(60000);
  await engine.refresh(LOCAL_CONFIG, { force: true });
  assert.equal(engine.status(LOCAL_CONFIG).stockKwh, 48);
  // Back to the scene: its previous index is no baseline any more.
  await engine.recordReading({ import_index: '130' }, GLADYS_CONFIG);
  assert.equal(engine.status(GLADYS_CONFIG).stockKwh, 48, 'the gap is not counted twice');
  await engine.recordReading({ import_index: '131' }, GLADYS_CONFIG);
  assert.equal(engine.status(GLADYS_CONFIG).stockKwh, 47);
});

test('the Shelly source without an address reports it is not configured', async () => {
  const { gladys, engine } = await createTestEngine();
  const result = await engine.refresh(normalizeConfig({ data_source: 'shelly' }));
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
