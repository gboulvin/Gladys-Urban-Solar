// -----------------------------------------------------------------------------
// User-facing messages of the integration, in the four languages of the Gladys
// UI: English (the mandatory fallback), French, German and Spanish.
//
// Gladys picks the user's language out of every multi-language object
// `{ en, fr, de, es }` (action messages, connection status, widget texts,
// toasts), so the code never formats a message for one language only.
// `test/i18n.test.js` checks that every message carries the four languages.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const MESSAGES = {
  // --- Battery states (scene trigger values, widget status) ----------------
  state_charging: { en: 'Charging', fr: 'En charge', de: 'Lädt', es: 'Cargando' },
  state_discharging: {
    en: 'Discharging',
    fr: 'En décharge',
    de: 'Entlädt',
    es: 'Descargando',
  },
  state_empty: { en: 'Empty', fr: 'Vide', de: 'Leer', es: 'Vacía' },
  state_idle: { en: 'Idle', fr: 'Au repos', de: 'Ruhezustand', es: 'En reposo' },
  state_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },

  // --- Data sources ---------------------------------------------------------
  source_local: {
    en: 'Shelly meter (local)',
    fr: 'Compteur Shelly (local)',
    de: 'Shelly-Zähler (lokal)',
    es: 'Medidor Shelly (local)',
  },
  source_gladys: {
    en: 'Gladys devices',
    fr: 'Appareils Gladys',
    de: 'Gladys-Geräte',
    es: 'Dispositivos Gladys',
  },
  source_waiting: {
    en: 'Waiting for a reading',
    fr: "En attente d'un relevé",
    de: 'Warte auf Messwert',
    es: 'Esperando una lectura',
  },
  source_none: {
    en: 'Not configured',
    fr: 'Non configurée',
    de: 'Nicht konfiguriert',
    es: 'No configurada',
  },
  source_unreachable: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },

  // --- Connection status ----------------------------------------------------
  status_not_configured: {
    en: 'The Shelly meter is the chosen data source, but its address is missing.',
    fr: "Le compteur Shelly est la source de données choisie, mais son adresse n'est pas renseignée.",
    de: 'Der Shelly-Zähler ist als Datenquelle gewählt, aber seine Adresse fehlt.',
    es: 'El medidor Shelly es la fuente de datos elegida, pero falta su dirección.',
  },
  status_waiting_reading: {
    en: 'Waiting for the first meter reading: your scene must use the "Urban Solar: record a meter reading" action (see the documentation).',
    fr: 'En attente du premier relevé du compteur : votre scène doit utiliser l’action « Urban Solar : enregistrer un relevé du compteur » (voir la documentation).',
    de: 'Warte auf den ersten Zählerstand: Ihre Szene muss die Aktion „Urban Solar: Zählerstand erfassen“ verwenden (siehe Dokumentation).',
    es: 'Esperando la primera lectura del contador: su escena debe usar la acción «Urban Solar: registrar una lectura del contador» (ver la documentación).',
  },
  refresh_gladys_hint: {
    en: 'Nothing to read here: the readings come from your scene, with the "Record a meter reading" action.',
    fr: 'Rien à lire ici : les relevés viennent de votre scène, avec l’action « Enregistrer un relevé du compteur ».',
    de: 'Hier gibt es nichts zu lesen: Die Messwerte kommen aus Ihrer Szene, mit der Aktion „Zählerstand erfassen“.',
    es: 'Nada que leer aquí: las lecturas vienen de su escena, con la acción «Registrar una lectura del contador».',
  },
  status_stale_reading: {
    en: 'No meter reading received for {minutes} minutes: check the Gladys scene and its devices.',
    fr: 'Aucun relevé du compteur reçu depuis {minutes} minutes : vérifiez la scène Gladys et ses appareils.',
    de: 'Seit {minutes} Minuten kein Zählerstand empfangen: Prüfen Sie die Gladys-Szene und ihre Geräte.',
    es: 'No se ha recibido ninguna lectura desde hace {minutes} minutos: revise la escena de Gladys y sus dispositivos.',
  },
  status_unreachable: {
    en: 'The data source does not answer: {error}',
    fr: 'La source de données ne répond pas : {error}',
    de: 'Die Datenquelle antwortet nicht: {error}',
    es: 'La fuente de datos no responde: {error}',
  },
  status_init_failed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, prüfen Sie die Logs der Integration.',
    es: 'La inicialización falló, consulte los registros de la integración.',
  },

  // --- Degraded transports --------------------------------------------------

  // --- Configuration screen actions -----------------------------------------
  test_local_ok: {
    en: 'Shelly OK: import {import} kWh, export {export} kWh, {power} W now.',
    fr: 'Shelly OK : soutirage {import} kWh, injection {export} kWh, {power} W actuellement.',
    de: 'Shelly OK: Bezug {import} kWh, Einspeisung {export} kWh, aktuell {power} W.',
    es: 'Shelly OK: consumo {import} kWh, inyección {export} kWh, {power} W ahora.',
  },
  test_gladys_ok: {
    en: 'Last reading received {at}: import index {import} kWh, export index {export} kWh.',
    fr: 'Dernier relevé reçu le {at} : index soutirage {import} kWh, index injection {export} kWh.',
    de: 'Letzter Messwert vom {at}: Bezugsstand {import} kWh, Einspeisestand {export} kWh.',
    es: 'Última lectura recibida el {at}: índice de consumo {import} kWh, índice de inyección {export} kWh.',
  },
  test_failed: {
    en: '{source}: failed ({error}).',
    fr: '{source} : échec ({error}).',
    de: '{source}: fehlgeschlagen ({error}).',
    es: '{source}: error ({error}).',
  },
  calibrated: {
    en: 'Virtual battery set to {stock} kWh.',
    fr: 'Batterie virtuelle réglée à {stock} kWh.',
    de: 'Virtuelle Batterie auf {stock} kWh gesetzt.',
    es: 'Batería virtual ajustada a {stock} kWh.',
  },
  invalid_stock: {
    en: 'Enter a stock between 0 and 1,000,000 kWh.',
    fr: 'Saisissez un stock entre 0 et 1 000 000 kWh.',
    de: 'Geben Sie einen Bestand zwischen 0 und 1.000.000 kWh ein.',
    es: 'Introduzca un saldo entre 0 y 1.000.000 kWh.',
  },
  accounting_on: {
    en: 'Virtual battery accounting resumed.',
    fr: 'Comptabilisation de la batterie virtuelle reprise.',
    de: 'Abrechnung der virtuellen Batterie fortgesetzt.',
    es: 'Contabilización de la batería virtual reanudada.',
  },
  accounting_off: {
    en: 'Virtual battery accounting paused.',
    fr: 'Comptabilisation de la batterie virtuelle en pause.',
    de: 'Abrechnung der virtuellen Batterie pausiert.',
    es: 'Contabilización de la batería virtual en pausa.',
  },
  refreshed: {
    en: 'Data refreshed: {stock} kWh in the virtual battery.',
    fr: 'Données actualisées : {stock} kWh dans la batterie virtuelle.',
    de: 'Daten aktualisiert: {stock} kWh in der virtuellen Batterie.',
    es: 'Datos actualizados: {stock} kWh en la batería virtual.',
  },
  refresh_failed: {
    en: 'Refresh failed: {error}',
    fr: "L'actualisation a échoué : {error}",
    de: 'Aktualisierung fehlgeschlagen: {error}',
    es: 'La actualización falló: {error}',
  },

  // --- Widgets ---------------------------------------------------------------
  w_level: { en: 'Level', fr: 'Niveau', de: 'Füllstand', es: 'Nivel' },
  w_stock: { en: 'Stock', fr: 'Stock', de: 'Bestand', es: 'Saldo' },
  w_charge_power: { en: 'Charging', fr: 'Charge', de: 'Laden', es: 'Carga' },
  w_discharge_power: { en: 'Discharging', fr: 'Décharge', de: 'Entladen', es: 'Descarga' },
  w_state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  w_source: {
    en: 'Data source',
    fr: 'Source des données',
    de: 'Datenquelle',
    es: 'Fuente de datos',
  },
  w_savings: {
    en: 'Savings',
    fr: 'Économies',
    de: 'Ersparnis',
    es: 'Ahorro',
  },
  w_last_update: {
    en: 'Last update',
    fr: 'Dernière mise à jour',
    de: 'Letzte Aktualisierung',
    es: 'Última actualización',
  },
  w_tariff: { en: 'Tariff', fr: 'Tarif', de: 'Tarif', es: 'Tarifa' },
  w_tariff_value: {
    en: '{fee} € / {grid} € per kWh',
    fr: '{fee} € / {grid} € le kWh',
    de: '{fee} € / {grid} € je kWh',
    es: '{fee} € / {grid} € por kWh',
  },
  w_tariff_missing: {
    en: 'No Urban Solar contract',
    fr: 'Aucun contrat Urban Solar',
    de: 'Kein Urban-Solar-Vertrag',
    es: 'Sin contrato Urban Solar',
  },
  w_never: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
  w_accounting: {
    en: 'Accounting',
    fr: 'Comptabilisation',
    de: 'Abrechnung',
    es: 'Contabilización',
  },
  w_on: { en: 'Active', fr: 'Active', de: 'Aktiv', es: 'Activa' },
  w_off: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  w_stock_history: {
    en: 'Virtual battery stock',
    fr: 'Stock de la batterie virtuelle',
    de: 'Bestand der virtuellen Batterie',
    es: 'Saldo de la batería virtual',
  },
  w_refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  w_calibrate: {
    en: 'Set the stock',
    fr: 'Régler le stock',
    de: 'Bestand setzen',
    es: 'Ajustar saldo',
  },
  w_calibrate_field: {
    en: 'Stock shown by Urban Solar (kWh)',
    fr: 'Stock affiché par Urban Solar (kWh)',
    de: 'Bestand laut Urban Solar (kWh)',
    es: 'Saldo según Urban Solar (kWh)',
  },
  w_pause: { en: 'Pause', fr: 'Mettre en pause', de: 'Pausieren', es: 'Pausar' },
  w_resume: { en: 'Resume', fr: 'Reprendre', de: 'Fortsetzen', es: 'Reanudar' },
  w_today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  w_last_day: { en: 'Day {date}', fr: 'Journée du {date}', de: 'Tag {date}', es: 'Día {date}' },
  w_charged: { en: 'Stored', fr: 'Stocké', de: 'Gespeichert', es: 'Almacenado' },
  w_discharged: { en: 'Withdrawn', fr: 'Déstocké', de: 'Entnommen', es: 'Retirado' },
  w_grid_import: {
    en: 'Full-price grid',
    fr: 'Réseau plein tarif',
    de: 'Netz Volltarif',
    es: 'Red tarifa plena',
  },
  w_total_charged: {
    en: 'Total stored',
    fr: 'Total stocké',
    de: 'Insgesamt gespeichert',
    es: 'Total almacenado',
  },
  w_total_discharged: {
    en: 'Total withdrawn',
    fr: 'Total déstocké',
    de: 'Insgesamt entnommen',
    es: 'Total retirado',
  },
  w_total_grid: {
    en: 'Total full-price grid',
    fr: 'Total réseau plein tarif',
    de: 'Netz Volltarif gesamt',
    es: 'Total red tarifa plena',
  },
  w_coverage: {
    en: 'Covered by the battery',
    fr: 'Couvert par la batterie',
    de: 'Durch die Batterie gedeckt',
    es: 'Cubierto por la batería',
  },
  w_indexes: {
    en: 'Stored and withdrawn energy',
    fr: 'Énergie stockée et déstockée',
    de: 'Gespeicherte und entnommene Energie',
    es: 'Energía almacenada y retirada',
  },
  w_unknown_action: {
    en: 'Unknown widget action.',
    fr: 'Action de widget inconnue.',
    de: 'Unbekannte Widget-Aktion.',
    es: 'Acción de widget desconocida.',
  },
};

/**
 * Multi-language message `{ en, fr, de, es }` for `key`, with every `{name}`
 * placeholder replaced by `vars[name]`.
 * @param {keyof typeof MESSAGES} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message key: ${key}`);
  }
  const result = {};
  for (const lang of LANGUAGES) {
    result[lang] = message[lang].replace(/\{(\w+)\}/g, (match, name) =>
      vars[name] === undefined ? match : String(vars[name]),
    );
  }
  return result;
}
