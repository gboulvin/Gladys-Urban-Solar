// Shared test doubles: a fake network (Shelly RPC), an in-memory
// ledger store and a controllable clock. Tests never touch the network.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { createEngine } from '../src/engine.js';

// The Shelly meter, read directly over the LAN.
export const LOCAL_CONFIG = normalizeConfig({ data_source: 'shelly', shelly_host: '192.168.1.50' });
// Gladys devices, the readings sent by a scene (the default source).
export const GLADYS_CONFIG = normalizeConfig({});

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/**
 * A fake `fetch`. Mutate `network.shelly` between calls to simulate the
 * meter; set `shellyDown` to simulate an outage.
 */
export function createNetwork() {
  const network = {
    shelly: { importWh: 1000000, exportWh: 500000, powerW: 0 },
    shellyDown: false,
    requests: [],
  };
  network.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    network.requests.push({ url, init });
    if (network.shellyDown) throw new Error('connect EHOSTUNREACH');
    const method = url.pathname.replace('/rpc/', '');
    const { importWh, exportWh, powerW } = network.shelly;
    switch (method) {
      case 'EMData.GetStatus':
        return json({ id: 0, total_act: importWh, total_act_ret: exportWh });
      case 'EM.GetStatus':
        return json({ id: 0, total_act_power: powerW });
      case 'EM1Data.GetStatus':
        return json({ id: 0, total_act_energy: importWh, total_act_ret_energy: exportWh });
      case 'EM1.GetStatus':
        return json({ id: 0, act_power: powerW });
      default:
        return json({ code: 404, message: 'No handler' }, 404);
    }
  };
  return network;
}

export function createMemoryStore(initial = null) {
  const store = {
    saved: initial,
    async load() {
      return store.saved && structuredClone(store.saved);
    },
    async save(state) {
      store.saved = structuredClone(state);
    },
  };
  return store;
}

export function createClock(iso = '2026-06-15T10:00:00Z') {
  const clock = {
    time: Date.parse(iso),
    now: () => new Date(clock.time),
    advance(ms) {
      clock.time += ms;
    },
    set(value) {
      clock.time = Date.parse(value);
    },
  };
  return clock;
}

/** An "Urban Solar — virtual battery" contract, as getEnergyContracts() returns it. */
export function urbanSolarContract(overrides = {}) {
  return {
    id: 'contract-1',
    template_key: 'urban-solar-virtual-battery',
    template_version: '2026-11-23',
    pricing_mode: 'delegated',
    inputs: { grid_price: 0.2, discharge_fee: 0.05, subscription_monthly: 15, battery_monthly: 3 },
    valid_from: '2026-01-01',
    valid_to: null,
    timezone: 'Europe/Paris',
    currency: 'EUR',
    billing_period_start_day: 1,
    status: 'active',
    ...overrides,
  };
}

export async function createTestEngine({
  store = createMemoryStore(),
  clock = createClock(),
  energyContracts = [],
} = {}) {
  const gladys = createFakeGladys({ energyContracts });
  const network = createNetwork();
  const engine = createEngine({ gladys, store, fetchImpl: network.fetch, now: clock.now });
  await engine.init();
  return { gladys, network, engine, store, clock };
}
