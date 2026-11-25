import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { GLADYS_CONFIG, LOCAL_CONFIG, createTestEngine } from './helpers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declaredOutputs = (key) =>
  manifest.scene_actions.find((action) => action.key === key).outputs.map((output) => output.key);

function assertDeclared(key, outputs) {
  const declared = declaredOutputs(key);
  for (const [name, value] of Object.entries(outputs)) {
    assert.ok(declared.includes(name), `${key}: output "${name}" is not declared`);
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), `${key}.${name} is scalar`);
  }
}

test('get_status returns every declared output', async () => {
  const { engine } = await createTestEngine();
  await engine.calibrate(250, LOCAL_CONFIG);
  const outputs = await SCENE_ACTIONS.get_status({ fields: {}, config: LOCAL_CONFIG, engine });
  assertDeclared('get_status', outputs);
  assert.deepEqual(Object.keys(outputs).sort(), declaredOutputs('get_status').sort());
  assert.equal(outputs.stock_kwh, 250);
  assert.equal(outputs.level_percent, 25);
});

test('refresh_data reads the meter now', async () => {
  const { engine } = await createTestEngine();
  const outputs = await SCENE_ACTIONS.refresh_data({ fields: {}, config: LOCAL_CONFIG, engine });
  assertDeclared('refresh_data', outputs);
  assert.equal(outputs.success, true);
});

test('calibrate_stock sets the stock, and an invalid value fails the action', async () => {
  const { engine } = await createTestEngine();
  const outputs = await SCENE_ACTIONS.calibrate_stock({
    fields: { stock_kwh: 80 },
    config: LOCAL_CONFIG,
    engine,
  });
  assertDeclared('calibrate_stock', outputs);
  assert.deepEqual(outputs, { stock_kwh: 80, level_percent: 8 });
  await assert.rejects(
    SCENE_ACTIONS.calibrate_stock({ fields: { stock_kwh: -5 }, config: LOCAL_CONFIG, engine }),
  );
});

test('set_accounting pauses and resumes the accounting', async () => {
  const { engine } = await createTestEngine();
  const paused = await SCENE_ACTIONS.set_accounting({
    fields: { enabled: false },
    config: LOCAL_CONFIG,
    engine,
  });
  assertDeclared('set_accounting', paused);
  assert.deepEqual(paused, { accounting: false });
  assert.deepEqual(
    await SCENE_ACTIONS.set_accounting({ fields: { enabled: true }, config: LOCAL_CONFIG, engine }),
    { accounting: true },
  );
});

test('record_meter_reading returns every declared output', async () => {
  const { engine } = await createTestEngine();
  const outputs = await SCENE_ACTIONS.record_meter_reading({
    fields: { import_index: '1500.2', export_index: '900', unit: 'kwh' },
    config: GLADYS_CONFIG,
    engine,
  });
  assertDeclared('record_meter_reading', outputs);
  assert.deepEqual(Object.keys(outputs).sort(), declaredOutputs('record_meter_reading').sort());
  assert.equal(outputs.accepted, true);
});
