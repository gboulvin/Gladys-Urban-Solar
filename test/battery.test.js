import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTERY_STATES,
  applyInterval,
  batteryStateOf,
  coveragePercent,
  createInitialState,
  levelPercent,
  restoreState,
} from '../src/battery.js';

const config = { grid_price: 0.2, discharge_fee: 0.07 };

test('injected energy is stored, imported energy is withdrawn from the stock', () => {
  const state = createInitialState();
  applyInterval(state, { importKwh: 0, exportKwh: 10 }, config);
  assert.equal(state.stockKwh, 10);
  const moved = applyInterval(state, { importKwh: 4, exportKwh: 0 }, config);
  assert.deepEqual(moved, { chargedKwh: 0, dischargedKwh: 4, uncoveredKwh: 0 });
  assert.equal(state.stockKwh, 6);
  assert.ok(Math.abs(state.savingsEur - 4 * 0.13) < 1e-9, 'saving = withdrawn x (price - fee)');
});

test('once the stock is empty, the import is billed at full price', () => {
  const state = createInitialState();
  applyInterval(state, { importKwh: 0, exportKwh: 2 }, config);
  const moved = applyInterval(state, { importKwh: 5, exportKwh: 0 }, config);
  assert.deepEqual(moved, { chargedKwh: 0, dischargedKwh: 2, uncoveredKwh: 3 });
  assert.equal(state.stockKwh, 0);
  assert.equal(state.uncoveredKwh, 3);
  assert.equal(coveragePercent(state), 40);
});

test('within one interval the injection is stored before the import is withdrawn', () => {
  const state = createInitialState();
  const moved = applyInterval(state, { importKwh: 3, exportKwh: 5 }, config);
  assert.deepEqual(moved, { chargedKwh: 5, dischargedKwh: 3, uncoveredKwh: 0 });
  assert.equal(state.stockKwh, 2);
});

test('paused accounting counts the grid flows but leaves the stock alone', () => {
  const state = createInitialState();
  state.accounting = false;
  applyInterval(state, { importKwh: 1, exportKwh: 9 }, config);
  assert.equal(state.stockKwh, 0);
  assert.equal(state.importKwh, 1);
  assert.equal(state.exportKwh, 9);
});

test('batteryStateOf tells charging, discharging, empty and idle apart', () => {
  assert.equal(batteryStateOf(5, { importing: 0, exporting: 300 }), BATTERY_STATES.CHARGING);
  assert.equal(batteryStateOf(0, { importing: 0, exporting: 300 }), BATTERY_STATES.CHARGING);
  assert.equal(batteryStateOf(5, { importing: 800, exporting: 0 }), BATTERY_STATES.DISCHARGING);
  assert.equal(batteryStateOf(0, { importing: 800, exporting: 0 }), BATTERY_STATES.EMPTY);
  assert.equal(batteryStateOf(5, { importing: 0, exporting: 0 }), BATTERY_STATES.IDLE);
});

test('levelPercent is bounded to 0..100', () => {
  assert.equal(levelPercent(250, 1000), 25);
  assert.equal(levelPercent(2000, 1000), 100);
  assert.equal(levelPercent(0, 1000), 0);
});

test('restoreState fills the keys an older ledger did not have', () => {
  const state = restoreState({ stockKwh: 42, local: { importWh: 5 } });
  assert.equal(state.stockKwh, 42);
  assert.equal(state.local.importWh, 5);
  assert.equal(state.local.exportWh, null);
  assert.equal(state.cloud.lastDay, null);
  assert.equal(state.accounting, true);
});
