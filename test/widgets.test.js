import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDiscoveredDevices } from '../src/devices/index.js';
import {
  ENERGY_BALANCE_WIDGET,
  VIRTUAL_BATTERY_WIDGET,
  WIDGETS,
  refreshWidgets,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import {
  BOTH_CONFIG,
  CLOUD_CONFIG,
  LOCAL_CONFIG,
  createTestEngine,
  urbanSolarContract,
} from './helpers.js';

const getContent = (key, gladys, engine, config, settings = {}) =>
  WIDGETS[key].get(gladys, { settings, language: 'fr', units: 'metric', config, engine });

// Every multi-language text of a content carries the four languages.
function assertTranslated(node, path = 'content') {
  if (Array.isArray(node))
    return node.forEach((child, i) => assertTranslated(child, `${path}[${i}]`));
  if (!node || typeof node !== 'object') return;
  if (typeof node.en === 'string') {
    for (const lang of LANGUAGES) assert.ok(node[lang], `${path} misses ${lang}`);
    return;
  }
  for (const [key, child] of Object.entries(node)) assertTranslated(child, `${path}.${key}`);
}

test('every widget content is rendered exactly as sent, in every situation', async () => {
  const { gladys, network, engine } = await createTestEngine();
  const situations = [
    ['never refreshed', LOCAL_CONFIG, () => {}],
    ['local', LOCAL_CONFIG, () => engine.refresh(LOCAL_CONFIG, { force: true })],
    ['cloud', CLOUD_CONFIG, () => engine.refresh(CLOUD_CONFIG, { force: true })],
    [
      'degraded',
      BOTH_CONFIG,
      () => {
        network.shellyDown = true;
        return engine.refresh(BOTH_CONFIG, { force: true });
      },
    ],
    ['paused', LOCAL_CONFIG, () => engine.setAccounting(false, LOCAL_CONFIG)],
  ];
  for (const [name, config, setup] of situations) {
    await setup();
    for (const key of Object.keys(WIDGETS)) {
      for (const chart_interval of ['last-day', 'last-year', 'bogus']) {
        const content = await getContent(key, gladys, engine, config, { chart_interval });
        // [] = nothing the core would drop, truncate or trim.
        assert.deepEqual(validateWidgetContent(content), [], `${key} (${name})`);
        assertTranslated(content, `${key} (${name})`);
      }
    }
  }
});

test('the live tiles and charts reference features the integration publishes', async () => {
  const { gladys, engine } = await createTestEngine();
  const featureIds = new Set(
    buildDiscoveredDevices(gladys, LOCAL_CONFIG).flatMap((device) =>
      device.features.map((feature) => feature.external_id),
    ),
  );
  for (const key of Object.keys(WIDGETS)) {
    const { components } = await getContent(key, gladys, engine, LOCAL_CONFIG);
    const bound = components.flatMap((c) => [c.device_feature, ...(c.device_features ?? [])]);
    for (const id of bound.filter(Boolean)) {
      assert.ok(featureIds.has(id), `${key}: unknown feature ${id}`);
    }
  }
});

test('the virtual battery buttons refresh and calibrate', async () => {
  const { gladys, engine } = await createTestEngine();
  const widget = WIDGETS[VIRTUAL_BATTERY_WIDGET];
  const base = { params: {}, settings: {}, config: LOCAL_CONFIG, engine };
  const refreshed = await widget.action(gladys, { ...base, actionKey: 'refresh' });
  assert.match(refreshed.fr, /kWh/);
  const calibrated = await widget.action(gladys, {
    ...base,
    actionKey: 'calibrate',
    values: { stock_kwh: 42 },
  });
  assert.ok(calibrated.en.length <= 200, 'toasts are capped at 200 characters');
  assert.equal(engine.status(LOCAL_CONFIG).stockKwh, 42);
  await assert.rejects(
    widget.action(gladys, { ...base, actionKey: 'calibrate', values: { stock_kwh: -1 } }),
  );
  await assert.rejects(widget.action(gladys, { ...base, actionKey: 'nope' }), /Unknown/);
});

test('the energy balance button toggles the accounting', async () => {
  const { gladys, engine } = await createTestEngine();
  const widget = WIDGETS[ENERGY_BALANCE_WIDGET];
  const content = await getContent(ENERGY_BALANCE_WIDGET, gladys, engine, LOCAL_CONFIG);
  const button = content.components.find((c) => c.type === 'button');
  const toast = await widget.action(gladys, {
    actionKey: button.action.key,
    params: button.action.params,
    settings: {},
    config: LOCAL_CONFIG,
    engine,
  });
  assert.ok(toast.de);
  assert.equal(engine.status(LOCAL_CONFIG).accounting, false);
});

test('refreshWidgets nudges every widget', () => {
  const fresh = createFakeGladys();
  refreshWidgets(fresh);
  assert.deepEqual(fresh.fake.widgetRefreshes, Object.keys(WIDGETS));
});

test('the virtual battery widget shows the tariff of the Urban Solar contract', async () => {
  const withContract = await createTestEngine({ energyContracts: [urbanSolarContract()] });
  await withContract.engine.refresh(LOCAL_CONFIG);
  const without = await createTestEngine();
  for (const [{ gladys, engine }, expected] of [
    [withContract, /0\.0500 € \/ 0\.2000 €/],
    [without, /Urban Solar/],
  ]) {
    const content = await getContent(VIRTUAL_BATTERY_WIDGET, gladys, engine, LOCAL_CONFIG);
    assert.deepEqual(validateWidgetContent(content), []);
    const status = content.components.find((c) => c.type === 'status');
    const tariff = status.items.find((item) => item.label.en === 'Tariff');
    assert.match(tariff.value.fr, expected);
  }
});
