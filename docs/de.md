# Urban Solar

Überwachen und steuern Sie Ihre **virtuelle Batterie von Urban Solar** in
Gladys: den verfügbaren kWh-Bestand, die täglich gespeicherte und entnommene
Energie, die erzielte Ersparnis, Szenen, die auf die Batterie reagieren, und
zwei Dashboard-Widgets.

## Funktionsweise

Beim Angebot von Urban Solar wird der nicht selbst verbrauchte Solarstrom ins
Netz eingespeist und in kWh einer virtuellen Batterie gutgeschrieben. Bezieht
Ihr Haushalt später Strom aus dem Netz, wird er zuerst diesem Bestand
entnommen; ist der Bestand leer, wird der Strom zum vollen Netzpreis
abgerechnet. Jede entnommene kWh kostet weiterhin eine Entnahmegebühr
(Netzentgelt, Steuern).

Urban Solar bietet keine öffentliche API: Die Integration rekonstruiert das
Konto daher aus Ihren Zählerständen, mit einer oder beiden Quellen:

- **Lokal — Shelly-Zähler**: ein Shelly Pro 3EM, 3EM Gen3, Pro EM oder EM
  Gen3 am Netzanschluss, in jedem Aktualisierungsintervall über Ihr lokales
  Netz gelesen. Live-Leistungen, ohne Cloud, bei einem Ausfall geht nichts
  verloren (der Zähler führt kumulierte Zählerstände).
- **Cloud — Linky-Daten**: die Tageswerte Ihres Linky-Zählers, von Enedis
  am Folgetag veröffentlicht, über die kostenlose
  [Conso-API](https://conso.boris.sh/). Nur Tageswerte, keine Live-Leistung.

Mit beiden Quellen wählt der Schalter **Lokale Verbindung bevorzugen** im
Konfigurationsbildschirm die bevorzugte Quelle; die andere übernimmt bei einem
Ausfall, und die Geräte zeigen dann einen orangen Punkt am Transport-Badge.
Ein vom Shelly (auch teilweise) erfasster Tag wird nie erneut aus den
Linky-Daten gezählt.

## Voraussetzungen

- Gladys Assistant 5.1 oder neuer.
- Für die lokale Quelle: ein Shelly-Energiezähler (Gen2 oder neuer) am
  Netzanschluss, vom Gladys-Host erreichbar, **ohne Authentifizierung** an
  seiner lokalen API. Vergeben Sie ihm eine feste IP-Adresse im Router.
- Für die Cloud-Quelle: die 14-stellige Nummer Ihres Linky-Zählers (PRM, auf
  der Rechnung) und ein Conso-API-Token, erstellt auf
  <https://conso.boris.sh/> mit Ihrem Enedis-Konto. Die Erzeugung muss auf
  derselben PRM gemessen werden.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Geben Sie die **Shelly-Adresse** (und das Modell), die **Linky-Nummer und
   das Token** oder beides ein.
3. Prüfen Sie die Preise Ihres Vertrags: **Netzpreis** und
   **Entnahmegebühr**. Sie dienen der Berechnung Ihrer Ersparnis.
4. Legen Sie bei Bedarf die **Referenzkapazität** (als 100 % angezeigter
   Bestand), die **Warnschwelle** und das **Aktualisierungsintervall** fest.
5. Speichern Sie und klicken Sie auf **Datenquellen testen**: Die Antwort
   jeder Quelle erscheint unter der Schaltfläche.
6. Klicken Sie auf **Bestand setzen** und geben Sie den in Ihrem
   Urban-Solar-Kundenbereich angezeigten Bestand ein.
7. Fügen Sie die beiden Geräte im Reiter **Erkennung** hinzu.

## Geräte

- **Urban Solar virtual battery**: Bestand (kWh), Füllstand (%), Lade- und
  Entladeleistung (W), insgesamt gespeichert und entnommen (kWh), Ersparnis
  (€) und ein Schalter **Abrechnung**, um die Erfassung zu pausieren.
- **Urban Solar grid connection**: Bezugs- und Einspeiseleistung (W),
  bezogene und eingespeiste Energie seit Beginn (kWh) und zum Volltarif
  gekaufte Energie.

## Szenen

Auslöser: **Zustand der virtuellen Batterie geändert** (Variablen `state`,
`stock_kwh`), **Niedriger Bestand der virtuellen Batterie** (`stock_kwh`,
`threshold_kwh`), **Tagesbilanz der virtuellen Batterie** (`date`,
`charged_kwh`, `discharged_kwh`, `grid_import_kwh`, `stock_kwh`,
`savings_eur`).

Aktionen: **Virtuelle Batterie auslesen** (Bestand, Füllstand, Zustand,
Ersparnis, Tageswerte, Live-Leistungen für die folgenden Aktionen),
**Virtuelle Batterie aktualisieren**, **Bestand der virtuellen Batterie
setzen**, **Abrechnung pausieren oder fortsetzen**.

## Dashboard

- **Virtuelle Batterie**: Füllstandsanzeige, Live-Bestand und -Leistungen,
  Zustand, Datenquelle, Ersparnis, Bestandsverlauf, mit den Schaltflächen
  **Aktualisieren** und **Bestand setzen**.
- **Energiebilanz**: gespeicherte, entnommene und voll bezahlte Energie des
  Tages, Summen, Deckungsanteil, Ersparnis und eine Schaltfläche zum
  Pausieren oder Fortsetzen der Abrechnung.

## Fehlerbehebung

- _„Die Datenquelle antwortet nicht“_: Prüfen Sie, ob der Shelly unter
  `http://<Adresse>/rpc/EMData.GetStatus?id=0` (dreiphasig) bzw.
  `/rpc/EM1Data.GetStatus?id=0` (einphasig) antwortet und das richtige
  Modell gewählt ist.
- _Linky HTTP 401/403_: Das Conso-API-Token ist ungültig oder abgelaufen.
- Die Cloud-Werte erscheinen am Folgetag.
- Weicht der Bestand von Urban Solar ab, nutzen Sie erneut **Bestand
  setzen**: Die Werte von Urban Solar sind maßgeblich.
- Starten Sie die Integration mit `LOG_LEVEL=debug` und prüfen Sie die Logs.
