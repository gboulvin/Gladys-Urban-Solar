// Shared test doubles: a fake network (Shelly RPC + Conso API), an in-memory
// ledger store and a controllable clock. Tests never touch the network.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { createEngine } from '../src/engine.js';

export const PRM = '12345678901234';

export const LOCAL_CONFIG = normalizeConfig({ shelly_host: '192.168.1.50' });
export const CLOUD_CONFIG = normalizeConfig({ prm: PRM, conso_token: 'token' });
export const BOTH_CONFIG = normalizeConfig({
  shelly_host: '192.168.1.50',
  prm: PRM,
  conso_token: 'token',
});

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/**
 * A fake `fetch`. Mutate `network.shelly` / `network.conso` between calls to
 * simulate the meter; set `shellyDown` / `consoDown` to simulate an outage.
 */
export function createNetwork() {
  const network = {
    shelly: { importWh: 1000000, exportWh: 500000, powerW: 0 },
    shellyDown: false,
    conso: { consumption: {}, production: {} },
    consoDown: false,
    requests: [],
  };
  network.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    network.requests.push({ url, init });
    if (url.hostname === 'conso.boris.sh') {
      if (network.consoDown) throw new Error('fetch failed');
      const type = url.pathname.split('/').pop();
      const data =
        type === 'consommation_quotidienne' ? network.conso.consumption : network.conso.production;
      const from = url.searchParams.get('dateDebut');
      const to = url.searchParams.get('dateFin');
      const interval_reading = Object.entries(data)
        .filter(([date]) => date >= from && date < to)
        .map(([date, value]) => ({ date, value: String(value) }));
      return json({ reading_type: { unit: 'Wh' }, interval_reading });
    }
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

export async function createTestEngine({
  store = createMemoryStore(),
  clock = createClock(),
} = {}) {
  const gladys = createFakeGladys();
  const network = createNetwork();
  const engine = createEngine({ gladys, store, fetchImpl: network.fetch, now: clock.now });
  await engine.init();
  return { gladys, network, engine, store, clock };
}
