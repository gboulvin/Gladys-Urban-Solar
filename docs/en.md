# Urban Solar

Track and control your **Urban Solar virtual battery** from Gladys: the stock
of kWh available, the energy stored and withdrawn every day, the money saved,
scenes that react to the battery, and two dashboard widgets.

## How it works

With the Urban Solar offer, the solar energy you do not consume is injected
into the grid and credited, in kWh, to a virtual battery. When your home
later draws energy from the grid, it is taken from that stock first; once
the stock is empty, the energy is billed at the full grid price. Each kWh
taken from the stock still pays a withdrawal fee (grid transport, taxes).

Urban Solar offers no public API, so the integration rebuilds that ledger
from the readings of your meter, with one or both of these sources:

- **Local — Shelly meter**: a Shelly Pro 3EM, 3EM Gen3, Pro EM or EM Gen3
  clamped on the grid connection, read over your local network every
  refresh interval. Live powers, no cloud, nothing lost during an outage
  (the meter keeps cumulative counters).
- **Cloud — Linky readings**: the daily readings of your Linky meter,
  published by Enedis the next day, through the free
  [Conso API](https://conso.boris.sh/). Daily figures only, no live power.

With both, the **Prefer the local connection** toggle of the Configuration
screen picks the preferred source; the other one takes over when it fails,
and the devices then show an orange dot on their transport badge. A day the
Shelly meter accounted, even partly, is never counted again from the Linky
readings.

## Prerequisites

- Gladys Assistant 5.1 or later.
- For the local source: a Shelly energy meter (Gen2 or later) on the grid
  connection, reachable from the Gladys host, **without authentication**
  on its local API. Give it a fixed IP address in your router.
- For the cloud source: your 14-digit Linky meter number (PRM, on your
  bill) and a Conso API token, created on <https://conso.boris.sh/> with
  your Enedis account. Your production must be measured on the same PRM
  (the usual "autoconsommation avec vente du surplus" setup).

## Configuration

1. Open the **Configuration** tab of the integration.
2. Fill in the **Shelly address** (and its model), the **Linky meter number
   and token**, or both.
3. Check the prices of your contract: **grid price** (price of a kWh bought
   from the grid) and **withdrawal fee** (what a kWh taken from the virtual
   battery still costs). They are used to compute your savings.
4. Optionally set the **reference capacity** (the stock displayed as 100 %),
   the **low stock alert** threshold and the **refresh interval**.
5. Save, then click **Test the data sources**: the answer of each source is
   shown under the button.
6. Click **Set the stock** and enter the stock displayed in your Urban Solar
   customer area: the integration starts counting from there.
7. Add the two devices from the **Discovery** tab.

## Devices

- **Urban Solar virtual battery**: stock (kWh), level (%), charge and
  discharge powers (W), total stored and withdrawn (kWh), savings (€), and
  an **Accounting** switch to pause the ledger (meter replacement, works).
- **Urban Solar grid connection**: grid import and export powers (W), the
  energy imported and injected since the start (kWh), and the energy bought
  at full price because the battery was empty.

## Scenes

Triggers:

- **Virtual battery state changed** — charging, discharging, empty or idle
  (filter on the new state). Variables: `state`, `stock_kwh`.
- **Low virtual battery stock** — the stock fell below the alert threshold.
  Variables: `stock_kwh`, `threshold_kwh`.
- **Virtual battery daily summary** — a day is closed. Variables: `date`,
  `charged_kwh`, `discharged_kwh`, `grid_import_kwh`, `stock_kwh`,
  `savings_eur`.

Actions:

- **Read the virtual battery** — returns the stock, level, state, savings,
  today's figures and live powers, for the following actions (for example:
  start the water heater only when the stock is above 50 kWh).
- **Refresh the virtual battery** — reads the meter now.
- **Set the virtual battery stock** — aligns the stock with Urban Solar.
- **Pause or resume the accounting**.

## Dashboard

- **Virtual battery**: level gauge, live stock and powers, state, data
  source, savings, stock history (period chosen in the widget settings),
  with a **Refresh** button and a **Set the stock** button.
- **Energy balance**: energy stored, withdrawn and bought at full price for
  the day, totals, share of the import covered by the battery, savings, and
  a button to pause or resume the accounting.

## Troubleshooting

- _"The data source does not answer"_: check that the Shelly answers at
  `http://<address>/rpc/EMData.GetStatus?id=0` (three-phase) or
  `/rpc/EM1Data.GetStatus?id=0` (single-phase) from your network, and that
  the right model is selected.
- _Linky HTTP 401/403_: the Conso API token is invalid or expired, or the
  PRM does not match it.
- The cloud figures appear the day after, once Enedis has published them.
- The stock drifts from Urban Solar's figure: use **Set the stock** again.
  Urban Solar's own figures are authoritative.
- Run the integration with `LOG_LEVEL=debug` and check its logs.
