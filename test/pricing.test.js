import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/battery.js';
import { DataNotReadyError, coveredShare, currentPrice, priceIntervals } from '../src/pricing.js';
import { LOCAL_CONFIG, createTestEngine, urbanSolarContract } from './helpers.js';

const timeZone = 'Europe/Paris';
const nowMs = Date.parse('2026-06-20T12:00:00Z');
const contract = urbanSolarContract();
const request = (intervals) => ({
  contract,
  billing_period: { starts_at: '2026-06-01T00:00:00Z', ends_at: '2026-07-01T00:00:00Z' },
  cumulative_before: { day: 0, month: 0, billing_period: 0 },
  intervals,
});

function stateWithHistory() {
  const state = createInitialState();
  state.startedAt = '2026-06-10T00:00:00.000Z';
  state.slots['2026-06-15T10:00:00.000Z'] = [1, 0]; // fully covered
  state.slots['2026-06-15T10:30:00.000Z'] = [0.25, 0.75]; // a quarter covered
  state.days['2026-06-15'] = [3, 1];
  state.days['2026-06-16'] = [0, 4]; // empty all day (Linky reading)
  return state;
}

test('each half-hour is priced with the share the battery covered', () => {
  const costs = priceIntervals(
    stateWithHistory(),
    request([
      { starts_at: '2026-06-15T10:00:00.000Z', kwh: 2, max_power_kw: 4 },
      { starts_at: '2026-06-15T10:30:00.000Z', kwh: 2, max_power_kw: 4 },
    ]),
    { timeZone, nowMs },
  );
  assert.deepEqual(costs[0], {
    starts_at: '2026-06-15T10:00:00.000Z',
    cost: 0.1,
    components: { battery: 0.1, grid: 0 },
    label: 'Urban Solar virtual battery',
  });
  // 0.5 kWh x 0.05 + 1.5 kWh x 0.20
  assert.equal(costs[1].cost, 0.325);
  assert.equal(costs[1].label, 'Virtual battery + grid');
});

test('without a half-hour record the day ratio applies (Linky readings)', () => {
  const state = stateWithHistory();
  const opts = { timeZone, nowMs };
  assert.equal(coveredShare(state, '2026-06-15T15:00:00.000Z', opts), 0.75);
  assert.equal(coveredShare(state, '2026-06-16T15:00:00.000Z', opts), 0);
});

test('a recent interval not accounted yet is retried, an old or earlier one is full price', () => {
  const state = stateWithHistory();
  assert.throws(
    () => coveredShare(state, '2026-06-19T15:00:00.000Z', { timeZone, nowMs }),
    DataNotReadyError,
  );
  assert.equal(coveredShare(state, '2026-06-12T15:00:00.000Z', { timeZone, nowMs }), 0);
  assert.equal(coveredShare(state, '2026-06-01T15:00:00.000Z', { timeZone, nowMs }), 0);
});

test('the same request always gets the same answer', () => {
  const state = stateWithHistory();
  const intervals = [{ starts_at: '2026-06-15T10:30:00.000Z', kwh: 1.7, max_power_kw: 3 }];
  assert.deepEqual(
    priceIntervals(state, request(intervals), { timeZone, nowMs }),
    priceIntervals(state, request(intervals), { timeZone, nowMs }),
  );
});

test('a contract without valid prices fails the pricing', () => {
  const broken = { ...request([]), contract: { ...contract, inputs: {} } };
  assert.throws(() => priceIntervals(createInitialState(), broken, { timeZone, nowMs }));
});

test('the current price is the withdrawal fee while the battery holds energy', () => {
  assert.equal(currentPrice({ stockKwh: 10, accounting: true }, { contract }).price, 0.05);
  assert.equal(currentPrice({ stockKwh: 0, accounting: true }, { contract }).price, 0.2);
  assert.equal(currentPrice({ stockKwh: 10, accounting: false }, { contract }).price, 0.2);
});

test('the engine records the coverage of every read and prices with it', async () => {
  const { network, engine, clock } = await createTestEngine({
    energyContracts: [urbanSolarContract()],
  });
  await engine.calibrate(1, LOCAL_CONFIG);
  await engine.refresh(LOCAL_CONFIG);
  network.shelly.importWh += 4000; // 1 kWh covered, 3 kWh at full price
  clock.advance(60000);
  await engine.refresh(LOCAL_CONFIG);
  const status = engine.status(LOCAL_CONFIG);
  assert.deepEqual(status.rates, { grid_price: 0.2, discharge_fee: 0.05 });
  assert.equal(status.savingsEur, 0.15, '1 kWh x (0.20 - 0.05)');
  const [cost] = engine.price(
    request([{ starts_at: '2026-06-15T10:00:00.000Z', kwh: 4, max_power_kw: 8 }]),
    LOCAL_CONFIG,
  );
  // 1 kWh x 0.05 + 3 kWh x 0.20
  assert.equal(cost.cost, 0.65);
  assert.equal(engine.currentPrice({ contract }).price, 0.2, 'the battery is empty now');
});

test('without an Urban Solar contract the ledger runs but saves nothing', async () => {
  const { network, engine, clock } = await createTestEngine();
  await engine.calibrate(5, LOCAL_CONFIG);
  await engine.refresh(LOCAL_CONFIG);
  network.shelly.importWh += 2000;
  clock.advance(60000);
  await engine.refresh(LOCAL_CONFIG);
  const status = engine.status(LOCAL_CONFIG);
  assert.equal(status.stockKwh, 3);
  assert.equal(status.savingsEur, 0);
  assert.equal(status.rates, null);
});
