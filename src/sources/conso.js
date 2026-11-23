// -----------------------------------------------------------------------------
// CLOUD source: the daily readings of the Linky meter, published by Enedis
// and served by the free Conso API (https://conso.boris.sh), with a personal
// token the user creates once with their Enedis account.
//
//   consommation_quotidienne -> energy imported from the grid, per day (Wh)
//   production_quotidienne   -> energy injected into the grid, per day (Wh)
//
// The readings of a day are published the following morning (D+1): the cloud
// source credits and debits the virtual battery one whole day at a time.
// -----------------------------------------------------------------------------

export const CONSO_API_URL = 'https://conso.boris.sh/api';

// The API operator asks public-facing clients to identify themselves.
const USER_AGENT = 'Gladys-Urban-Solar (Gladys Assistant integration)';

const TIMEOUT_MS = 20000;

async function fetchDaily(fetchImpl, config, type, from, to) {
  const url = new URL(`${CONSO_API_URL}/${type}`);
  url.searchParams.set('pointId', config.prm);
  url.searchParams.set('dateDebut', from);
  url.searchParams.set('dateFin', to);
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${config.conso_token}`,
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    // Never echo the response body: it may repeat the token.
    throw new Error(`Conso API ${type} answered HTTP ${response.status}`);
  }
  const body = await response.json();
  const readings = new Map();
  for (const reading of body?.interval_reading ?? []) {
    const wh = Number(reading.value);
    const day = String(reading.date ?? '').slice(0, 10);
    if (Number.isFinite(wh) && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      readings.set(day, wh);
    }
  }
  return readings;
}

/**
 * Daily imported and exported energy from `from` (included) to `to`
 * (excluded), both `YYYY-MM-DD`. Only the days both readings are published
 * for are returned, oldest first: a half-published day is retried later.
 * @returns {Promise<Array<{ date: string, importWh: number, exportWh: number }>>}
 */
export async function readDailyEnergy(config, { from, to, fetchImpl = fetch }) {
  const [consumption, production] = await Promise.all([
    fetchDaily(fetchImpl, config, 'consommation_quotidienne', from, to),
    fetchDaily(fetchImpl, config, 'production_quotidienne', from, to),
  ]);
  return [...consumption.keys()]
    .filter((day) => production.has(day))
    .sort()
    .map((date) => ({ date, importWh: consumption.get(date), exportWh: production.get(date) }));
}
