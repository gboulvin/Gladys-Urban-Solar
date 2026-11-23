import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_BLUEPRINTS,
  buildDiscoveredDevices,
  buildTransportEntries,
  findBlueprintByDevice,
} from '../src/devices/index.js';
import { normalizeConfig } from '../src/config.js';

const gladys = createFakeGladys();
const config = normalizeConfig();

test('Gladys accepts the discovery payload', async () => {
  // The SDK fake checks the payload like the host API does (external_id
  // prefix, known category/type/unit...): a refusal is a 400 for the whole
  // list, and no device would show up in the Discovery tab.
  const fresh = createFakeGladys();
  await fresh.publishDiscoveredDevices(buildDiscoveredDevices(fresh, config));
  assert.equal(fresh.fake.discoveredDevices.length, DEVICE_BLUEPRINTS.length);
});

test('every feature carries the columns Gladys needs to create it', () => {
  for (const device of buildDiscoveredDevices(gladys, config)) {
    for (const feature of device.features) {
      const where = `${device.name} / ${feature.name ?? feature.external_id}`;
      for (const column of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[column], undefined, `${where}: missing ${column}`);
      }
      assert.ok(feature.min <= feature.max, `${where}: min > max`);
    }
  }
});

test('external ids are unique and stable', () => {
  const ids = buildDiscoveredDevices(gladys, config).flatMap((device) => [
    device.external_id,
    ...device.features.map((feature) => feature.external_id),
  ]);
  assert.equal(new Set(ids).size, ids.length);
  // Changing an external id orphans the device, its history and its scenes.
  const again = buildDiscoveredDevices(gladys, normalizeConfig({ shelly_host: '10.0.0.9' }));
  assert.deepEqual(
    again.map((device) => device.external_id),
    buildDiscoveredDevices(gladys, config).map((device) => device.external_id),
  );
});

test('only the accounting switch is controllable', () => {
  const controllable = buildDiscoveredDevices(gladys, config)
    .flatMap((device) => device.features)
    .filter((feature) => !feature.read_only);
  assert.deepEqual(
    controllable.map((feature) => feature.external_id),
    [gladys.externalIds('virtual-battery', 'urban-solar').feature('accounting')],
  );
});

test('findBlueprintByDevice routes by external id', () => {
  for (const bp of DEVICE_BLUEPRINTS) {
    assert.equal(findBlueprintByDevice(gladys, { external_id: bp.deviceExternalId(gladys) }), bp);
  }
  assert.equal(findBlueprintByDevice(gladys, { external_id: 'ext:other:x' }), undefined);
});

test('both devices share the transport badge of the source', async () => {
  const fresh = createFakeGladys();
  const entries = buildTransportEntries(fresh, {
    transport: 'cloud',
    degraded: true,
    message: { en: 'Fallback', fr: 'Repli' },
  });
  assert.equal(entries.length, DEVICE_BLUEPRINTS.length);
  await fresh.publishTransports(entries);
  assert.ok(fresh.fake.transports.every((entry) => entry.degraded === true));
  const nominal = buildTransportEntries(fresh, { transport: 'local', degraded: false });
  assert.ok(nominal.every((entry) => entry.degraded === undefined));
});
