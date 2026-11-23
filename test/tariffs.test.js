import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { CONTRACT_TEMPLATE_KEY, createTariffs, ratesFromInputs } from '../src/tariffs.js';
import { createClock, urbanSolarContract } from './helpers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

test('the code reads the contracts of the template the manifest declares', () => {
  const [template] = manifest.energy_contracts.templates;
  assert.equal(template.key, CONTRACT_TEMPLATE_KEY);
  assert.equal(template.pricing_mode, 'delegated');
  const inputs = template.inputs.map((input) => input.key);
  for (const key of ['grid_price', 'discharge_fee']) {
    assert.ok(inputs.includes(key), `the template must declare the "${key}" input`);
  }
  // The template defaults are a valid tariff for the code too.
  const defaults = Object.fromEntries(template.inputs.map((input) => [input.key, input.default]));
  assert.ok(ratesFromInputs(defaults));
});

test('ratesFromInputs refuses missing or negative prices', () => {
  assert.deepEqual(ratesFromInputs({ grid_price: '0.2', discharge_fee: 0.05 }), {
    grid_price: 0.2,
    discharge_fee: 0.05,
  });
  assert.equal(ratesFromInputs({ grid_price: 0.2 }), null);
  assert.equal(ratesFromInputs({ grid_price: -1, discharge_fee: 0 }), null);
});

test('the contract in force is picked by date, the most recent one first', async () => {
  const gladys = createFakeGladys({
    energyContracts: [
      urbanSolarContract({ id: 'old', valid_from: '2025-01-01', valid_to: '2026-07-31' }),
      urbanSolarContract({
        id: 'new',
        valid_from: '2026-08-01',
        inputs: { grid_price: 0.25, discharge_fee: 0.06 },
      }),
      urbanSolarContract({ id: 'gone', valid_from: '2026-09-01', status: 'orphaned' }),
    ],
  });
  const tariffs = createTariffs({ gladys });
  await tariffs.refresh();
  assert.equal(tariffs.count, 2, 'an orphaned contract is ignored');
  assert.equal(tariffs.contractFor('2026-06-15').id, 'old');
  assert.deepEqual(tariffs.ratesFor('2026-10-01'), { grid_price: 0.25, discharge_fee: 0.06 });
  assert.equal(tariffs.ratesFor('2024-12-31'), null, 'no contract before the first one');
});

test('the contracts are re-read every 15 minutes, and a pricing request refreshes the inputs', async () => {
  const clock = createClock();
  const gladys = createFakeGladys({ energyContracts: [urbanSolarContract()] });
  const tariffs = createTariffs({ gladys, now: clock.now });
  await tariffs.refresh();
  gladys.fake.energyContracts = [];
  clock.advance(60000);
  await tariffs.refresh();
  assert.equal(tariffs.count, 1, 'not due yet');
  tariffs.remember({ id: 'contract-1', inputs: { grid_price: 0.3, discharge_fee: 0.1 } });
  assert.deepEqual(tariffs.ratesFor('2026-06-15'), { grid_price: 0.3, discharge_fee: 0.1 });
  clock.advance(15 * 60000);
  await tariffs.refresh();
  assert.equal(tariffs.count, 0);
});
