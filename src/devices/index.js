// -----------------------------------------------------------------------------
// Device registry: the virtual battery and the grid connection it is fed by.
//
// The devices are descriptive only (discovery payload, external ids): their
// states all come from the ledger of src/engine.js, which reads the meter once
// for both devices.
// -----------------------------------------------------------------------------

import { virtualBattery, BATTERY_FEATURES } from './virtualBattery.js';
import { gridMeter, GRID_FEATURES } from './gridMeter.js';

export { virtualBattery, gridMeter, BATTERY_FEATURES, GRID_FEATURES };

export const DEVICE_BLUEPRINTS = [virtualBattery, gridMeter];

export function buildDiscoveredDevices(gladys, config) {
  return DEVICE_BLUEPRINTS.map((bp) => bp.buildDevice(gladys, config));
}

export function findBlueprintByDevice(gladys, device) {
  return DEVICE_BLUEPRINTS.find((bp) => bp.deviceExternalId(gladys) === device.external_id);
}

/** External id of a virtual battery feature. */
export function batteryFeatureId(gladys, key) {
  return virtualBattery.ids(gladys).feature(key);
}

/** External id of a grid connection feature. */
export function gridFeatureId(gladys, key) {
  return gridMeter.ids(gladys).feature(key);
}

/**
 * The `publishTransports` payload: both devices are fed by the same source,
 * so they share its transport badge (local, or unreachable), with the
 * degraded flag while the Gladys scene does not report.
 */
export function buildTransportEntries(gladys, transport) {
  const entry = transport.degraded
    ? { transport: transport.transport, degraded: true, message: transport.message }
    : { transport: transport.transport };
  return DEVICE_BLUEPRINTS.map((bp) => ({ external_id: bp.deviceExternalId(gladys), ...entry }));
}
