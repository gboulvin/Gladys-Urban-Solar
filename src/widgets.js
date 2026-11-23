// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
//   virtual_battery — the battery at a glance: level gauge, live stock and
//     powers, state, source, savings, the stock history, and two controls:
//     refresh now, and set the stock to the value of the Urban Solar
//     customer area (a button opening a one-field form).
//   energy_balance  — the energy stored and withdrawn today (or on the last
//     Linky day), the totals, the share of the import the battery covered,
//     and a button to pause / resume the accounting.
//
// The content is declarative: the core renders it with its own theme, dark
// mode and translations, and picks the user's language out of every
// `{ en, fr, de, es }` object. test/widgets.test.js checks every content with
// the SDK's `validateWidgetContent`.
// -----------------------------------------------------------------------------

import {
  createLogger,
  WIDGET_BUTTON_STYLES,
  WIDGET_CHART_INTERVALS,
  WIDGET_CHART_TYPES,
  WIDGET_COLORS,
  WIDGET_TEXT_VARIANTS,
} from '@gladysassistant/integration-sdk';
import { BATTERY_STATES } from './battery.js';
import { BATTERY_FEATURES, batteryFeatureId } from './devices/index.js';
import { MAX_STOCK_KWH } from './engine.js';
import { t } from './i18n.js';

const logger = createLogger({ name: 'widgets' });

export const VIRTUAL_BATTERY_WIDGET = 'virtual_battery';
export const ENERGY_BALANCE_WIDGET = 'energy_balance';

export const WIDGET_ACTIONS = {
  REFRESH: 'refresh',
  CALIBRATE: 'calibrate',
  TOGGLE_ACCOUNTING: 'toggle_accounting',
};

const CHART_INTERVALS = [
  WIDGET_CHART_INTERVALS.LAST_DAY,
  WIDGET_CHART_INTERVALS.LAST_WEEK,
  WIDGET_CHART_INTERVALS.LAST_MONTH,
  WIDGET_CHART_INTERVALS.LAST_YEAR,
];

const STATE_DISPLAY = {
  [BATTERY_STATES.CHARGING]: { key: 'state_charging', color: WIDGET_COLORS.SUCCESS },
  [BATTERY_STATES.DISCHARGING]: { key: 'state_discharging', color: WIDGET_COLORS.INFO },
  [BATTERY_STATES.EMPTY]: { key: 'state_empty', color: WIDGET_COLORS.DANGER },
  [BATTERY_STATES.IDLE]: { key: 'state_idle', color: WIDGET_COLORS.NEUTRAL },
};

function levelColor(level) {
  if (level < 10) return WIDGET_COLORS.DANGER;
  if (level < 25) return WIDGET_COLORS.WARNING;
  return WIDGET_COLORS.SUCCESS;
}

function sourceRow(transport) {
  if (!transport.configured) {
    return { value: t('source_none'), color: WIDGET_COLORS.WARNING };
  }
  if (transport.error || !transport.source) {
    return { value: t('source_unreachable'), color: WIDGET_COLORS.DANGER };
  }
  return {
    value: t(transport.source === 'local' ? 'source_local' : 'source_cloud'),
    color: transport.degraded ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
  };
}

/** `2026-11-23 14:05` in the user's time zone: readable in every language. */
function formatDateTime(iso, timeZone) {
  if (!iso) return t('w_never');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const euros = (value) => `${value.toFixed(2)} €`;
const kwh = (value) => `${value.toFixed(1)} kWh`;

export const WIDGETS = {
  [VIRTUAL_BATTERY_WIDGET]: {
    async get(gladys, { settings = {}, config, engine }) {
      logger.debug(`onWidgetGet <- ${VIRTUAL_BATTERY_WIDGET}`);
      const status = engine.status(config);
      const feature = (key) => batteryFeatureId(gladys, key);
      const display = STATE_DISPLAY[status.state];
      const interval = CHART_INTERVALS.includes(settings.chart_interval)
        ? settings.chart_interval
        : WIDGET_CHART_INTERVALS.LAST_WEEK;
      return {
        // The live tiles and the chart follow the published states by
        // themselves; the computed rows move with each meter read.
        ttl_seconds: 60,
        components: [
          {
            type: 'chart',
            title: t('w_stock_history'),
            device_features: [feature(BATTERY_FEATURES.STOCK)],
            interval,
            chart_type: WIDGET_CHART_TYPES.AREA,
            unit: 'kWh',
          },
          {
            type: 'gauge',
            label: t('w_level'),
            value: status.levelPercent,
            min: 0,
            max: 100,
            unit: '%',
            color: levelColor(status.levelPercent),
          },
          {
            type: 'value',
            label: t('w_stock'),
            icon: 'battery',
            device_feature: feature(BATTERY_FEATURES.STOCK),
          },
          {
            type: 'value',
            label: t('w_charge_power'),
            icon: 'battery-charging',
            device_feature: feature(BATTERY_FEATURES.CHARGE_POWER),
            color: WIDGET_COLORS.SUCCESS,
          },
          {
            type: 'value',
            label: t('w_discharge_power'),
            icon: 'zap',
            device_feature: feature(BATTERY_FEATURES.DISCHARGE_POWER),
            color: WIDGET_COLORS.INFO,
          },
          {
            type: 'status',
            items: [
              {
                label: t('w_state'),
                icon: 'activity',
                value: display ? t(display.key) : t('state_unknown'),
                color: display ? display.color : WIDGET_COLORS.NEUTRAL,
              },
              { label: t('w_source'), icon: 'wifi', ...sourceRow(status.transport) },
              {
                label: t('w_savings'),
                icon: 'trending-up',
                value: euros(status.savingsEur),
                color: WIDGET_COLORS.SUCCESS,
              },
              {
                label: t('w_last_update'),
                icon: 'clock',
                value: formatDateTime(status.lastUpdate, config.timezone),
                color: WIDGET_COLORS.NEUTRAL,
              },
            ],
          },
          {
            type: 'button',
            label: t('w_refresh'),
            icon: 'refresh-cw',
            style: WIDGET_BUTTON_STYLES.SECONDARY,
            action: { key: WIDGET_ACTIONS.REFRESH },
          },
          {
            type: 'button',
            label: t('w_calibrate'),
            icon: 'edit-2',
            style: WIDGET_BUTTON_STYLES.SECONDARY,
            action: {
              key: WIDGET_ACTIONS.CALIBRATE,
              fields: [
                {
                  key: 'stock_kwh',
                  type: 'number',
                  label: t('w_calibrate_field'),
                  required: true,
                  default: status.stockKwh,
                  min: 0,
                  max: MAX_STOCK_KWH,
                },
              ],
            },
          },
        ],
      };
    },

    async action(gladys, { actionKey, values = {}, config, engine }) {
      logger.info(`onWidgetAction <- ${VIRTUAL_BATTERY_WIDGET}.${actionKey}`);
      if (actionKey === WIDGET_ACTIONS.REFRESH) {
        const result = await engine.refresh(config, { force: true });
        if (!result?.ok) {
          throw new Error(t('refresh_failed', { error: result?.error ?? '?' }).en);
        }
        return t('refreshed', { stock: engine.status(config).stockKwh });
      }
      if (actionKey === WIDGET_ACTIONS.CALIBRATE) {
        try {
          const status = await engine.calibrate(values.stock_kwh, config);
          return t('calibrated', { stock: status.stockKwh });
        } catch (err) {
          if (err instanceof RangeError) throw new Error(t('invalid_stock').en, { cause: err });
          throw err;
        }
      }
      // Throwing acks the action as failed: the message reaches the user.
      throw new Error(t('w_unknown_action').en);
    },
  },

  [ENERGY_BALANCE_WIDGET]: {
    async get(gladys, { config, engine }) {
      logger.debug(`onWidgetGet <- ${ENERGY_BALANCE_WIDGET}`);
      const status = engine.status(config);
      const feature = (key) => batteryFeatureId(gladys, key);
      const day = status.today ?? status.lastDay;
      const caption = status.today
        ? t('w_today')
        : day
          ? t('w_last_day', { date: day.date })
          : t('w_today');
      const dayValue = (key) => Math.round((day?.[key] ?? 0) * 10) / 10;
      return {
        ttl_seconds: 120,
        components: [
          {
            type: 'chart',
            title: t('w_indexes'),
            device_features: [
              feature(BATTERY_FEATURES.CHARGED),
              feature(BATTERY_FEATURES.DISCHARGED),
            ],
            interval: WIDGET_CHART_INTERVALS.LAST_MONTH,
            chart_type: WIDGET_CHART_TYPES.LINE,
            unit: 'kWh',
          },
          { type: 'text', text: caption, variant: WIDGET_TEXT_VARIANTS.CAPTION },
          {
            type: 'value',
            label: t('w_charged'),
            icon: 'arrow-down-circle',
            value: dayValue('chargedKwh'),
            unit: 'kWh',
            color: WIDGET_COLORS.SUCCESS,
          },
          {
            type: 'value',
            label: t('w_discharged'),
            icon: 'arrow-up-circle',
            value: dayValue('dischargedKwh'),
            unit: 'kWh',
            color: WIDGET_COLORS.INFO,
          },
          {
            type: 'value',
            label: t('w_grid_import'),
            icon: 'alert-circle',
            value: dayValue('uncoveredKwh'),
            unit: 'kWh',
            color: WIDGET_COLORS.WARNING,
          },
          {
            type: 'value',
            label: t('w_savings'),
            icon: 'trending-up',
            value: status.savingsEur,
            unit: '€',
            color: WIDGET_COLORS.SUCCESS,
          },
          {
            type: 'status',
            items: [
              { label: t('w_total_charged'), icon: 'download', value: kwh(status.chargedKwh) },
              { label: t('w_total_discharged'), icon: 'upload', value: kwh(status.dischargedKwh) },
              {
                label: t('w_total_grid'),
                icon: 'alert-circle',
                value: kwh(status.uncoveredKwh),
                color: WIDGET_COLORS.WARNING,
              },
              {
                label: t('w_coverage'),
                icon: 'pie-chart',
                value: `${status.coveragePercent} %`,
                color: WIDGET_COLORS.SUCCESS,
              },
              {
                label: t('w_accounting'),
                icon: status.accounting ? 'play-circle' : 'pause-circle',
                value: t(status.accounting ? 'w_on' : 'w_off'),
                color: status.accounting ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
              },
            ],
          },
          {
            type: 'button',
            label: t(status.accounting ? 'w_pause' : 'w_resume'),
            icon: status.accounting ? 'pause' : 'play',
            style: status.accounting ? WIDGET_BUTTON_STYLES.DANGER : WIDGET_BUTTON_STYLES.PRIMARY,
            action: {
              key: WIDGET_ACTIONS.TOGGLE_ACCOUNTING,
              params: { enabled: !status.accounting },
              confirm: true,
            },
          },
        ],
      };
    },

    async action(gladys, { actionKey, params = {}, config, engine }) {
      logger.info(`onWidgetAction <- ${ENERGY_BALANCE_WIDGET}.${actionKey}`);
      if (actionKey === WIDGET_ACTIONS.TOGGLE_ACCOUNTING) {
        const enabled = await engine.setAccounting(params.enabled === true, config);
        return t(enabled ? 'accounting_on' : 'accounting_off');
      }
      throw new Error(t('w_unknown_action').en);
    },
  },
};

/**
 * Freshness nudge: ask the core to re-pull every widget now instead of
 * waiting for the content TTL (after a (re)connection, a config update, a
 * calibration...). Fire-and-forget, rate-limited core-side.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
