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
from the **cumulative indexes** of your meter (import and export), with one of
these two sources, chosen in the configuration:

- **Gladys devices** (default): any device already in Gladys that measures
  the imported and exported energy — the meter created by the **energy
  monitoring**, a Shelly or a current clamp of another integration… A Gladys
  scene reads their indexes and passes them to the integration (see below).
- **Shelly meter**: a Shelly Pro 3EM, 3EM Gen3, Pro EM or EM Gen3 clamped on
  the grid connection, read directly by the integration over your local
  network. Live powers, no scene to create.

Either way, the integration computes the difference between two readings
itself: a missed reading, a restart or an outage loses nothing, the next
reading accounts for the whole gap. Everything stays local: no cloud service
is used.

## Prerequisites

- Gladys Assistant 5.2 or later.
- "Gladys devices" source: one or two devices exposing a **cumulative
  index** (in kWh or Wh) of the imported and of the exported energy. A power
  (W) or a daily consumption will not do.
- "Shelly meter" source: a Shelly energy meter (Gen2 or later) on the grid
  connection, reachable from the Gladys host, **without authentication** on
  its local API. Give it a fixed IP address in your router.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Choose the **data source**. For the Shelly, also fill in its address and
   model.
3. Create your **energy contract** in Gladys (see below): the prices are
   entered there, once, not in the integration.
4. Optionally set the **reference capacity** (the stock displayed as 100 %),
   the **low stock alert** threshold and the **refresh interval**.
5. Save. With the "Gladys devices" source, create the reading scene
   described below.
6. Click **Test the data sources**: the Shelly reading, or the last reading
   the scene sent, is shown under the button.
7. Click **Set the stock** and enter the stock displayed in your Urban Solar
   customer area: the integration starts counting from there.
8. Add the two devices from the **Discovery** tab.

## The reading scene ("Gladys devices" source)

An external integration cannot read the devices of other integrations
itself: a Gladys scene passes their values to it.

1. Create a scene triggered **every 5 minutes** (scheduled trigger). Shorter
   gives finer half-hour figures; longer loses nothing.
2. Add the **"Get the last value of a device"** action on the feature giving
   the **import index** (for example the meter of the energy monitoring).
3. Add the same action on the feature giving the **export index** (the same
   meter, or another device: Shelly, clamp…).
4. Add the **"Urban Solar: record a meter reading"** action and fill its
   fields with the variables the scene editor offers for these two values
   (for example `{{0.0.last_value}}` and `{{0.1.last_value}}`, depending on
   where the actions sit in the scene). Choose the **unit** of the indexes:
   kWh or Wh.
5. Optional: also fill in the **import and export powers** (W) for the live
   values.

Good to know:

- Sending the same reading twice counts nothing. An index going backwards (a
  replaced meter) simply starts over from that reading.
- The import and export indexes may come in separate actions, or even
  separate scenes.
- Without a reading for 2 hours, the Configuration screen says so and the
  devices' badge turns orange.

## Energy contract

The prices are not part of the integration's configuration: they come from
your energy contract in Gladys. In the energy contract wizard of Gladys, create a contract
from the **Urban Solar — virtual battery** template, link it to your
electricity meter and fill in:

- **Grid price**: the price of a kWh bought from the grid once the virtual
  battery is empty;
- **Withdrawal fee**: what a kWh taken from the virtual battery still costs;
- the monthly **electricity subscription** and **virtual battery
  subscription**.

The integration reads these prices to compute your savings, and Gladys asks
it to price your consumption: each half-hour, the energy the virtual battery
covered is billed at the withdrawal fee and the rest at the grid price, so
the Gladys energy dashboard shows what Urban Solar actually bills. When the
tariff changes, close the contract and create a new one from the change date:
the past keeps its old prices. Without an Urban Solar contract, the battery
is still tracked, but no saving is computed.

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

- **Urban Solar: record a meter reading** — passes the meter indexes read
  from Gladys devices (see the reading scene).
- **Read the virtual battery** — returns the stock, level, state, savings,
  today's figures and live powers, for the following actions (for example:
  start the water heater only when the stock is above 50 kWh).
- **Refresh the virtual battery** — reads the Shelly now ("Shelly meter"
  source).
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
- _"Waiting for the first meter reading"_ or _"No meter reading received
  for…"_: check that the reading scene is enabled and runs, and that its
  variables point to the right values.
- _"Not a number"_ in the scene log: the variable does not return a number;
  check the feature you picked.
- The Linky cloud readings (Conso API) are no longer supported since
  version 3.
- The stock drifts from Urban Solar's figure: use **Set the stock** again.
  Urban Solar's own figures are authoritative.
- Run the integration with `LOG_LEVEL=debug` and check its logs.
