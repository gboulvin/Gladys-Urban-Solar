// -----------------------------------------------------------------------------
// Calendar days in the user's time zone. Urban Solar accounts by local day
// (Europe/Paris), whereas the container clock runs in UTC: a day boundary
// computed in UTC would close the day at 1 or 2 a.m.
// -----------------------------------------------------------------------------

/** `YYYY-MM-DD` of `date` in `timeZone`. */
export function localDay(date, timeZone) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** `day` (`YYYY-MM-DD`) shifted by `count` days. */
export function addDays(day, count) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

/** Number of days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
