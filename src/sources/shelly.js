// -----------------------------------------------------------------------------
// LOCAL source: a Shelly energy meter (Gen2+ RPC API) clamped on the grid
// connection, read over the LAN.
//
// The meter keeps two cumulative counters, in Wh: the energy imported from
// the grid and the energy returned (injected) to it. The difference between
// two reads is exactly what went through the Linky meter in between, which is
// what Urban Solar credits to and debits from the virtual battery. The instant
// power (positive when importing, negative when exporting) drives the live
// charge / discharge power features.
//
//   em3 (Pro 3EM, 3EM Gen3): EMData.GetStatus  -> total_act, total_act_ret
//                            EM.GetStatus      -> total_act_power
//   em1 (Pro EM, EM Gen3):   EM1Data.GetStatus -> total_act_energy, total_act_ret_energy
//                            EM1.GetStatus     -> act_power
//
// The RPC API must be reachable without authentication from the Gladys host.
// -----------------------------------------------------------------------------

import { SHELLY_MODELS } from '../config.js';

const TIMEOUT_MS = 5000;

const ENDPOINTS = {
  [SHELLY_MODELS.EM3]: {
    energy: 'EMData.GetStatus',
    power: 'EM.GetStatus',
    read: (energy, power) => ({
      importWh: energy.total_act,
      exportWh: energy.total_act_ret,
      powerW: power.total_act_power,
    }),
  },
  [SHELLY_MODELS.EM1]: {
    energy: 'EM1Data.GetStatus',
    power: 'EM1.GetStatus',
    read: (energy, power) => ({
      importWh: energy.total_act_energy,
      exportWh: energy.total_act_ret_energy,
      powerW: power.act_power,
    }),
  },
};

async function rpc(fetchImpl, host, method) {
  const response = await fetchImpl(`http://${host}/rpc/${method}?id=0`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Shelly ${method} answered HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Read the cumulative counters and the instant power of the meter.
 * @returns {Promise<{ importWh: number, exportWh: number, powerW: number }>}
 */
export async function readShelly(config, { fetchImpl = fetch } = {}) {
  const endpoints = ENDPOINTS[config.shelly_model];
  const [energy, power] = await Promise.all([
    rpc(fetchImpl, config.shelly_host, endpoints.energy),
    rpc(fetchImpl, config.shelly_host, endpoints.power),
  ]);
  const reading = endpoints.read(energy, power);
  for (const [key, value] of Object.entries(reading)) {
    if (!Number.isFinite(value)) {
      throw new Error(`Unexpected Shelly answer: ${key} is missing (wrong meter model?)`);
    }
  }
  return reading;
}
